/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::{HashMap, HashSet, VecDeque};

use base64::prelude::*;
use ews::{
    create_item::{self, CreateItem, MessageDisposition},
    get_folder::GetFolder,
    get_item::GetItem,
    soap,
    sync_folder_hierarchy::{self, SyncFolderHierarchy},
    sync_folder_items::{self, SyncFolderItems},
    ArrayOfRecipients, BaseFolderId, BaseItemId, BaseShape, Folder, FolderShape, Importance,
    ItemShape, Message, MimeContent, Operation, PathToElement, RealItem, Recipient, ResponseClass,
    ResponseCode,
};
use fxhash::FxHashMap;
use moz_http::StatusCode;
use nserror::{nsresult, NS_ERROR_FAILURE};
use nsstring::{nsCString, nsString};
use thiserror::Error;
use url::Url;
use uuid::Uuid;
use xpcom::{
    getter_addrefs,
    interfaces::{
        nsIMsgDBHdr, nsIRequestObserver, nsMsgFolderFlagType, nsMsgFolderFlags, nsMsgMessageFlags,
        nsMsgPriority, IEwsClient, IEwsFolderCallbacks, IEwsMessageCallbacks,
    },
    RefPtr,
};

use crate::{authentication::credentials::Credentials, cancellable_request::CancellableRequest};

pub(crate) struct XpComEwsClient {
    pub endpoint: Url,
    pub credentials: Credentials,
    pub client: moz_http::Client,
}

impl XpComEwsClient {
    /// Performs a [`SyncFolderHierarchy`] operation via EWS.
    ///
    /// This will fetch a list of remote changes since the specified sync state,
    /// fetch any folder details needed for creating or updating local folders,
    /// and notify the Thunderbird protocol implementation of these changes via
    /// the provided callbacks.
    ///
    /// [`SyncFolderHierarchy`] https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy-operation
    pub(crate) async fn sync_folder_hierarchy(
        self,
        callbacks: RefPtr<IEwsFolderCallbacks>,
        sync_state_token: Option<String>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        self.sync_folder_hierarchy_inner(&callbacks, sync_state_token)
            .await
            .unwrap_or_else(process_error_with_cb(move |client_err, desc| unsafe {
                callbacks.OnError(client_err, &*desc);
            }));
    }

    async fn sync_folder_hierarchy_inner(
        self,
        callbacks: &IEwsFolderCallbacks,
        mut sync_state_token: Option<String>,
    ) -> Result<(), XpComEwsError> {
        // If we have received no sync state, assume that this is the first time
        // syncing this account. In that case, we need to determine which
        // folders are "well-known" (e.g., inbox, trash, etc.) so we can flag
        // them.
        let well_known = if sync_state_token.is_none() {
            Some(self.get_well_known_folder_map(callbacks).await?)
        } else {
            None
        };

        loop {
            // Folder sync returns results in batches, with sync state providing
            // the mechanism by which we can specify the next batch to receive.
            let op = SyncFolderHierarchy {
                folder_shape: FolderShape {
                    base_shape: BaseShape::IdOnly,
                },
                sync_folder_id: Some(BaseFolderId::DistinguishedFolderId {
                    // Folder sync can happen starting with any folder, but we
                    // always choose "msgfolderroot" as sync is recursive and
                    // this simplifies managing sync state. There is a "root"
                    // folder one level up as well, but it includes calendars,
                    // contacts, etc., which we aren't trying to support yet.
                    id: "msgfolderroot".to_string(),
                    change_key: None,
                }),
                sync_state: sync_state_token,
            };

            let response = self.make_operation_request(op).await?;
            let message = response
                .response_messages
                .sync_folder_hierarchy_response_message
                .into_iter()
                .next()
                .unwrap();

            let mut create_ids = Vec::new();
            let mut update_ids = Vec::new();
            let mut delete_ids = Vec::new();

            // Build lists of all of the changed folder IDs. We'll need to fetch
            // further details when creating or updating folders as well.
            for change in message.changes.inner {
                match change {
                    sync_folder_hierarchy::Change::Create { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            create_ids.push(folder_id.id)
                        }
                    }
                    sync_folder_hierarchy::Change::Update { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            update_ids.push(folder_id.id)
                        }
                    }
                    sync_folder_hierarchy::Change::Delete(folder_id) => {
                        delete_ids.push(folder_id.id)
                    }
                }
            }

            self.push_sync_state_to_ui(
                callbacks,
                create_ids,
                update_ids,
                delete_ids,
                &message.sync_state,
                &well_known,
            )
            .await?;

            if message.includes_last_folder_in_range {
                // EWS has signaled to us that there are no more changes at this
                // time.
                break;
            }

            sync_state_token = Some(message.sync_state);
        }

        Ok(())
    }

    pub(crate) async fn sync_messages_for_folder(
        self,
        callbacks: RefPtr<IEwsMessageCallbacks>,
        folder_id: String,
        sync_state_token: Option<String>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        self.sync_messages_for_folder_inner(&callbacks, folder_id, sync_state_token)
            .await
            .unwrap_or_else(process_error_with_cb(move |client_err, desc| unsafe {
                callbacks.OnError(client_err, &*desc);
            }));
    }

    async fn sync_messages_for_folder_inner(
        self,
        callbacks: &IEwsMessageCallbacks,
        folder_id: String,
        mut sync_state_token: Option<String>,
    ) -> Result<(), XpComEwsError> {
        // We may need to call the SyncFolderItems operation multiple times to
        // ensure that all changes are returned, as EWS caps the number of
        // results. Loop until we have no more changes.
        loop {
            let op = SyncFolderItems {
                item_shape: ItemShape {
                    // Microsoft's guidance is that the sync call should only
                    // fetch IDs for server load reasons.
                    // See <https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/how-to-synchronize-items-by-using-ews-in-exchange>
                    base_shape: BaseShape::IdOnly,
                    ..Default::default()
                },
                sync_folder_id: BaseFolderId::FolderId {
                    id: folder_id.clone(),
                    change_key: None,
                },
                sync_state: sync_state_token,
                ignore: None,
                max_changes_returned: 100,
                sync_scope: None,
            };

            let response = self.make_operation_request(op).await?;
            let message = response
                .response_messages
                .sync_folder_items_response_message
                .into_iter()
                .next()
                .unwrap();

            // We only fetch unique messages, as we ignore the `ChangeKey` and
            // simply fetch the latest version.
            let message_ids_to_fetch: HashSet<_> = message
                .changes
                .inner
                .iter()
                .filter_map(|change| match change {
                    sync_folder_items::Change::Create {
                        item: RealItem::Message(message),
                    } => Some(message.item_id.id.clone()),
                    sync_folder_items::Change::Update {
                        item: RealItem::Message(message),
                    } => Some(message.item_id.id.clone()),

                    // We don't fetch items for anything other than messages,
                    // since we don't have support for other items, and we don't
                    // need to fetch for other types of changes since the ID is
                    // sufficient to do the necessary work.
                    _ => None,
                })
                .collect();

            let messages_by_id: HashMap<_, _> = self
                .get_items(
                    message_ids_to_fetch,
                    &[
                        "message:IsRead",
                        "message:InternetMessageId",
                        "item:InternetMessageHeaders",
                        "item:DateTimeSent",
                        "message:From",
                        "message:ReplyTo",
                        "message:Sender",
                        "item:Subject",
                        "item:DisplayTo",
                        "item:DisplayCc",
                        "item:HasAttachments",
                        "item:Importance",
                    ],
                )
                .await?
                .into_iter()
                .map(|item| match item {
                    RealItem::Message(message) => (message.item_id.id.to_owned(), message),

                    // We should have filtered above for only Message-related
                    // changes.
                    #[allow(unreachable_patterns)]
                    _ => panic!("Encountered non-Message item in response"),
                })
                .collect();

            for change in message.changes.inner {
                match change {
                    sync_folder_items::Change::Create { item } => {
                        let item_id = match item {
                            RealItem::Message(message) => message.item_id.id,

                            // We don't currently handle anything other than
                            // messages, so skip this change.
                            #[allow(unreachable_patterns)]
                            _ => continue,
                        };

                        let msg = messages_by_id.get(&item_id).ok_or_else(|| {
                            XpComEwsError::Processing {
                                message: format!("Unable to fetch message with ID {item_id}"),
                            }
                        })?;

                        // Have the database create a new header instance for
                        // us. We don't create it ourselves so that the database
                        // can fill out any fields it wants beforehand.
                        let header =
                            getter_addrefs(|hdr| unsafe { callbacks.CreateNewHeader(hdr) })?;

                        populate_message_header_from_item(&header, &msg)?;

                        unsafe { callbacks.CommitHeader(&*header) }.to_result()?;
                    }

                    sync_folder_items::Change::Update { item } => {
                        let item_id = match item {
                            RealItem::Message(message) => message.item_id.id,

                            // We don't currently handle anything other than
                            // messages, so skip this change.
                            #[allow(unreachable_patterns)]
                            _ => continue,
                        };

                        let _msg = messages_by_id.get(&item_id).ok_or_else(|| {
                            XpComEwsError::Processing {
                                message: format!("Unable to fetch message with ID {item_id}"),
                            }
                        })?;

                        // TODO: We probably want to ask for a different item
                        // body for these, since the message itself shouldn't
                        // change. We just want to know when read state or other
                        // user-settable properties change. We also need to
                        // implement those changes.
                    }

                    sync_folder_items::Change::Delete { item_id: _item_id } => todo!(),
                    sync_folder_items::Change::ReadFlagChange {
                        item_id: _item_id,
                        is_read: _is_read,
                    } => todo!(),
                }
            }

            // Update sync state after pushing each batch of messages so that,
            // if we're interrupted, we resume from roughly the same place.
            let new_sync_state = nsCString::from(&message.sync_state);
            unsafe { callbacks.UpdateSyncState(&*new_sync_state) }.to_result()?;

            if message.includes_last_item_in_range {
                // EWS has signaled to us that there are no more changes at this
                // time.
                break;
            }

            sync_state_token = Some(message.sync_state);
        }

        Ok(())
    }

    /// Builds a map from remote folder ID to distinguished folder ID.
    ///
    /// This allows translating from the folder ID returned by `GetFolder`
    /// calls and well-known IDs associated with special folders.
    async fn get_well_known_folder_map(
        &self,
        callbacks: &IEwsFolderCallbacks,
    ) -> Result<FxHashMap<String, &str>, XpComEwsError> {
        const DISTINGUISHED_IDS: &[&str] = &[
            "msgfolderroot",
            "inbox",
            "deleteditems",
            "drafts",
            "outbox",
            "sentitems",
            "junkemail",
        ];

        let ids = DISTINGUISHED_IDS
            .iter()
            .map(|id| BaseFolderId::DistinguishedFolderId {
                id: id.to_string(),
                change_key: None,
            })
            .collect();

        // Fetch all distinguished folder IDs at once, since we have few enough
        // that they fit within Microsoft's recommended batch size of ten.
        let op = GetFolder {
            folder_shape: FolderShape {
                base_shape: BaseShape::IdOnly,
            },
            folder_ids: ids,
        };

        let response = self.make_operation_request(op).await?;
        let messages = response.response_messages.get_folder_response_message;

        let map = DISTINGUISHED_IDS
            .iter()
            .zip(messages)
            .filter_map(|(&distinguished_id, message)| {
                let folder_id = if matches!(message.response_class, ResponseClass::Success) {
                    match message.folders.inner.into_iter().next() {
                        Some(Folder::Folder { folder_id, .. }) => folder_id,

                        _ => return None,
                    }
                } else {
                    return None;
                };

                if distinguished_id == "msgfolderroot" {
                    // This is the folder under which all mail folders can be
                    // found and corresponds nicely with Thunderbird's root
                    // folder concept.
                    let folder_id = nsCString::from(folder_id.id);
                    unsafe { callbacks.RecordRootFolder(&*folder_id) }
                        .to_result()
                        .ok()?;

                    // We don't need to add the root folder to the map; since
                    // it's the root of our sync operation, it won't be returned
                    // as a result.
                    return None;
                }

                Some((folder_id.id, distinguished_id))
            })
            .collect();

        Ok(map)
    }

    async fn push_sync_state_to_ui(
        &self,
        callbacks: &IEwsFolderCallbacks,
        create_ids: Vec<String>,
        update_ids: Vec<String>,
        delete_ids: Vec<String>,
        sync_state: &str,
        well_known_map: &Option<FxHashMap<String, &str>>,
    ) -> Result<(), XpComEwsError> {
        if !create_ids.is_empty() {
            let created = self.batch_get_folders(create_ids).await?;
            for folder in created {
                match folder {
                    Folder::Folder {
                        folder_id,
                        parent_folder_id,
                        display_name,
                        ..
                    } => {
                        let id = folder_id.id;
                        let display_name = display_name.ok_or(NS_ERROR_FAILURE)?;

                        let well_known_folder_flag = well_known_map
                            .as_ref()
                            .and_then(|map| map.get(&id))
                            .map(distinguished_id_to_flag)
                            .unwrap_or_default();

                        let id = nsCString::from(id);
                        let parent_struct = parent_folder_id.ok_or(NS_ERROR_FAILURE)?;
                        let parent_folder_id = nsCString::from(parent_struct.id);

                        let display_name = {
                            let mut string = nsString::new();
                            string.assign_str(&display_name);

                            string
                        };

                        let flags = nsMsgFolderFlags::Mail | well_known_folder_flag;

                        unsafe {
                            callbacks.Create(&*id, &*parent_folder_id, &*display_name, flags)
                        }
                        .to_result()?;
                    }

                    _ => return Err(NS_ERROR_FAILURE.into()),
                }
            }
        }

        if !update_ids.is_empty() {
            let updated = self.batch_get_folders(update_ids).await?;
            for folder in updated {
                match folder {
                    Folder::Folder {
                        folder_id,
                        display_name,
                        ..
                    } => {
                        let id = folder_id.id;
                        let display_name = display_name.ok_or(NS_ERROR_FAILURE)?;

                        let id = nsCString::from(id);
                        let display_name = nsCString::from(display_name);

                        unsafe { callbacks.Update(&*id, &*display_name) }.to_result()?;
                    }

                    _ => return Err(NS_ERROR_FAILURE.into()),
                }
            }
        }

        for id in delete_ids {
            let id = nsCString::from(id);
            unsafe { callbacks.Delete(&*id) }.to_result()?;
        }

        let sync_state = nsCString::from(sync_state);
        unsafe { callbacks.UpdateSyncState(&*sync_state) }.to_result()?;

        Ok(())
    }

    async fn batch_get_folders(&self, ids: Vec<String>) -> Result<Vec<Folder>, XpComEwsError> {
        let mut folders = Vec::with_capacity(ids.len());
        let mut ids = ids.into_iter().peekable();
        let mut buf = Vec::with_capacity(10);

        loop {
            // Per Microsoft's recommendation, we batch `GetFolder` operations
            // in chunks of 10 to avoid throttling.
            //
            // https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/mailbox-synchronization-and-ews-in-exchange
            for _ in 0..10 {
                // This is sort of a terrible way to do this, but
                // `array_chunks()`, `next_chunk()`, etc. are still nightly
                // features on `Iterator` as of this writing and we want to take
                // ownership rather than cloning.
                match ids.next() {
                    Some(value) => buf.push(value),
                    None => break,
                }
            }

            let to_fetch = buf
                .drain(..)
                .map(|id| BaseFolderId::FolderId {
                    id,
                    change_key: None,
                })
                .collect();

            // Execute the request and collect all mail folders found in the
            // response.
            let op = GetFolder {
                folder_shape: FolderShape {
                    base_shape: BaseShape::AllProperties,
                },
                folder_ids: to_fetch,
            };

            let response = self.make_operation_request(op).await?;
            let messages = response.response_messages.get_folder_response_message;

            let mut fetched = messages
                .into_iter()
                .filter_map(|message| {
                    message
                        .folders
                        .inner
                        .into_iter()
                        // We're making a big assumption right here, which is
                        // that each GetFolderResponseMessage will include
                        // either zero or one folders. This assumption is based
                        // on testing, but the EWS API definition does allow it
                        // to _not_ be true.
                        .next()
                        .and_then(|folder| match &folder {
                            Folder::Folder { folder_class, .. } => {
                                // Filter out non-mail folders, which will have
                                // a class value other than "IPF.Note".
                                if let Some("IPF.Note") =
                                    folder_class.as_ref().map(|string| string.as_str())
                                {
                                    Some(folder)
                                } else {
                                    None
                                }
                            }

                            _ => None,
                        })
                })
                .collect();

            folders.append(&mut fetched);

            if ids.peek().is_none() {
                break;
            }
        }

        Ok(folders)
    }

    /// Fetches items from the remote Exchange server.
    async fn get_items<IdColl>(
        &self,
        ids: IdColl,
        fields: &[&str],
    ) -> Result<Vec<RealItem>, XpComEwsError>
    where
        IdColl: IntoIterator<Item = String>,
    {
        // Build a `VecDeque` so that we can drain it from the front. It would
        // be better to do this with `array_chunks()` once we have a suitable
        // MSRV.
        // https://github.com/rust-lang/rust/issues/74985
        let mut ids: VecDeque<_> = ids.into_iter().collect();
        let mut items = Vec::with_capacity(ids.len());

        while !ids.is_empty() {
            let batch_ids: Vec<_> = {
                let range_end = usize::min(10, ids.len());
                ids.drain(0..range_end)
            }
            .map(|id| BaseItemId::ItemId {
                id,
                change_key: None,
            })
            .collect();

            let additional_properties: Vec<_> = fields
                .into_iter()
                .map(|&field| PathToElement::FieldURI {
                    field_URI: String::from(field),
                })
                .collect();

            let additional_properties = if additional_properties.is_empty() {
                None
            } else {
                Some(additional_properties)
            };

            let op = GetItem {
                item_shape: ItemShape {
                    // We use `IdOnly` with the `AdditionalProperties` field to
                    // get finer control over what we request. `Default`
                    // includes the message body, which we would discard if we
                    // are only getting the message header.
                    base_shape: BaseShape::IdOnly,
                    additional_properties,
                    ..Default::default()
                },
                item_ids: batch_ids,
            };

            let response = self.make_operation_request(op).await?;
            for response_message in response.response_messages.get_item_response_message {
                process_response_message_class(
                    "GetItem",
                    response_message.response_class,
                    response_message.response_code,
                    response_message.message_text,
                )?;

                // The expected shape of the list of response messages is
                // underspecified, but EWS always seems to return one message
                // per requested ID, containing the item corresponding to that
                // ID. However, it allows for multiple items per message, so we
                // need to be sure we aren't throwing some away.
                let items_len = response_message.items.inner.len();
                if items_len != 1 {
                    log::warn!(
                        "GetItemResponseMessage contained {} items, only 1 expected",
                        items_len
                    );
                }

                items.extend(response_message.items.inner.into_iter());
            }
        }

        Ok(items)
    }

    /// Send a message by performing a [`CreateItem`] operation via EWS.
    ///
    /// All headers except for Bcc are expected to be included in the provided
    /// MIME content.
    ///
    /// [`CreateItem`] https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    pub async fn send_message(
        self,
        mime_content: String,
        message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<Recipient>,
        observer: RefPtr<nsIRequestObserver>,
    ) {
        let cancellable_request = CancellableRequest::new();

        // Notify that the request has started.
        if let Err(err) =
            unsafe { observer.OnStartRequest(cancellable_request.coerce()) }.to_result()
        {
            log::error!("aborting sending: an error occurred while starting the observer: {err}");
            return;
        }

        // Send the request, using an inner method to more easily handle errors.
        // Use the return value to determine which status we should use when
        // notifying the end of the request.
        let status = match self
            .send_message_inner(mime_content, message_id, should_request_dsn, bcc_recipients)
            .await
        {
            Ok(_) => nserror::NS_OK,
            Err(err) => {
                log::error!("an error occurred while attempting to send the message: {err:?}");

                match err {
                    XpComEwsError::XpCom(status) => status,
                    XpComEwsError::Http(err) => err.into(),

                    _ => nserror::NS_ERROR_FAILURE,
                }
            }
        };

        // Notify that the request has finished.
        if let Err(err) =
            unsafe { observer.OnStopRequest(cancellable_request.coerce(), status) }.to_result()
        {
            log::error!("an error occurred while stopping the observer: {err}")
        }
    }

    async fn send_message_inner(
        &self,
        mime_content: String,
        message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<Recipient>,
    ) -> Result<(), XpComEwsError> {
        let bcc_recipients = if !bcc_recipients.is_empty() {
            Some(ArrayOfRecipients(bcc_recipients))
        } else {
            None
        };

        // Create a new message using the default values, and set the ones we
        // need.
        let message = create_item::Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(mime_content),
            }),
            is_delivery_receipt_requested: Some(should_request_dsn),
            internet_message_id: Some(message_id),
            bcc_recipients,
            ..Default::default()
        };

        let create_item = CreateItem {
            items: vec![create_item::Item::Message(message)],

            // We don't need EWS to copy messages to the Sent folder after
            // they've been sent, because the internal MessageSend module
            // already takes care of it, and will include additional headers we
            // don't send to EWS (such as Bcc).
            message_disposition: Some(MessageDisposition::SendOnly),
            saved_item_folder_id: None,
        };

        let response = self.make_operation_request(create_item).await?;

        // We have only sent one message, therefore the response should only
        // contain one response message.
        let response_messages = response.response_messages.create_item_response_message;
        if response_messages.len() != 1 {
            return Err(XpComEwsError::Processing {
                message: String::from("expected only one message in CreateItem response"),
            });
        }

        // Get the first (and only) response message, and check if there's a
        // warning or an error we should handle.
        let response_message = response_messages.into_iter().next().unwrap();
        process_response_message_class(
            "CreateItem",
            response_message.response_class,
            response_message.response_code,
            response_message.message_text,
        )
    }

    /// Makes a request to the EWS endpoint to perform an operation.
    ///
    /// If the request is throttled, it will be retried after the delay given in
    /// the response.
    async fn make_operation_request<Op>(&self, op: Op) -> Result<Op::Response, XpComEwsError>
    where
        Op: Operation,
    {
        let envelope = soap::Envelope { body: op };
        let request_body = envelope.as_xml_document()?;

        // Loop in case we need to retry the request after a delay.
        loop {
            // Fetch the Authorization header value for each request in case of
            // token expiration between requests.
            let auth_header_value = self.credentials.to_auth_header_value().await?;

            let response = self
                .client
                .post(&self.endpoint)?
                .header("Authorization", &auth_header_value)
                .body(request_body.as_slice(), "application/xml")
                .send()
                .await?;

            let response_body = response.body();

            // Don't immediately propagate in case the error represents a
            // throttled request, which we can address with retry.
            let op_result: Result<soap::Envelope<Op::Response>, _> =
                soap::Envelope::from_xml_document(&response_body);

            break match op_result {
                Ok(envelope) => Ok(envelope.body),
                Err(err) => {
                    // Check first to see if the request has been throttled and
                    // needs to be retried.
                    let backoff_delay_ms = maybe_get_backoff_delay_ms(&err);
                    if let Some(backoff_delay_ms) = backoff_delay_ms {
                        log::debug!(
                            "request throttled, will retry after {backoff_delay_ms} milliseconds"
                        );

                        xpcom_async::sleep(backoff_delay_ms).await?;
                        continue;
                    }

                    if matches!(err, ews::Error::Deserialize(_)) {
                        // If deserialization failed, the most likely cause is
                        // that our request failed and the response body was not
                        // an EWS XML response. In that case, prefer the
                        // HTTP-derived error, which includes the status code
                        // and full response body.
                        response.error_from_status()?;
                    }

                    Err(err.into())
                }
            };
        }
    }
}

/// Sets the fields of a database message header object from an EWS `Message`.
fn populate_message_header_from_item(
    header: &nsIMsgDBHdr,
    msg: &Message,
) -> Result<(), XpComEwsError> {
    let internet_message_id = if let Some(internet_message_id) = msg.internet_message_id.as_ref() {
        nsCString::from(internet_message_id)
    } else {
        // Lots of code assumes Message-ID is set and unique, so we need to
        // build something suitable. The value need not be stable, since we only
        // ever set message ID on a new header.
        let uuid = Uuid::new_v4();

        nsCString::from(format!("x-moz-uuid:{uuid}", uuid = uuid.hyphenated()))
    };

    unsafe { header.SetMessageId(&*internet_message_id) }.to_result()?;

    // Keep track of whether we changed any flags to avoid
    // making unnecessary XPCOM calls.
    let mut should_write_flags = false;

    let mut header_flags = 0;
    unsafe { header.GetFlags(&mut header_flags) }.to_result()?;

    if let Some(is_read) = msg.is_read {
        if is_read {
            should_write_flags = true;
            header_flags |= nsMsgMessageFlags::Read;
        }
    }

    if let Some(has_attachments) = msg.has_attachments {
        if has_attachments {
            should_write_flags = true;
            header_flags |= nsMsgMessageFlags::Attachment;
        }
    }

    if should_write_flags {
        unsafe { header.SetFlags(header_flags) }.to_result()?;
    }

    let sent_time_in_micros = msg.date_time_sent.as_ref().and_then(|date_time| {
        // `time` gives Unix timestamps in seconds. `PRTime` is an `i64`
        // representing Unix timestamps in microseconds. `PRTime` won't overflow
        // for over 500,000 years, but we use `checked_mul()` to guard against
        // receiving nonsensical values.
        let time_in_micros = date_time.0.unix_timestamp().checked_mul(1_000 * 1_000);
        if time_in_micros.is_none() {
            log::warn!(
                "message with ID {item_id} sent date {date_time:?} too big for `i64`, ignoring",
                item_id = msg.item_id.id
            );
        }

        time_in_micros
    });

    if let Some(sent) = sent_time_in_micros {
        unsafe { header.SetDate(sent) }.to_result()?;
    }

    if let Some(author) = msg.from.as_ref().or(msg.sender.as_ref()) {
        let author = nsCString::from(make_header_string_for_mailbox(&author.mailbox));
        unsafe { header.SetAuthor(&*author) }.to_result()?;
    }

    if let Some(reply_to) = msg.reply_to.as_ref() {
        let reply_to = nsCString::from(make_header_string_for_mailbox(&reply_to.mailbox));
        unsafe { header.SetStringProperty(cstr::cstr!("replyTo").as_ptr(), &*reply_to) }
            .to_result()?;
    }

    if let Some(to) = msg.to_recipients.as_ref() {
        let to = nsCString::from(make_header_string_for_mailbox_list(to));
        unsafe { header.SetRecipients(&*to) }.to_result()?;
    }

    if let Some(cc) = msg.cc_recipients.as_ref() {
        let cc = nsCString::from(make_header_string_for_mailbox_list(cc));
        unsafe { header.SetCcList(&*cc) }.to_result()?;
    }

    if let Some(bcc) = msg.bcc_recipients.as_ref() {
        let bcc = nsCString::from(make_header_string_for_mailbox_list(bcc));
        unsafe { header.SetBccList(&*bcc) }.to_result()?;
    }

    if let Some(subject) = msg.subject.as_ref() {
        let subject = nsCString::from(subject);
        unsafe { header.SetSubject(&*subject) }.to_result()?;
    }

    if let Some(importance) = msg.importance {
        let priority = match importance {
            Importance::Low => nsMsgPriority::low,
            Importance::Normal => nsMsgPriority::normal,
            Importance::High => nsMsgPriority::high,
        };

        unsafe { header.SetPriority(priority) }.to_result()?;
    }

    Ok(())
}

/// Gets the time to wait before retrying a throttled request, if any.
///
/// When an Exchange server throttles a request, the response will specify a
/// delay which should be observed before the request is retried.
fn maybe_get_backoff_delay_ms(err: &ews::Error) -> Option<u32> {
    if let ews::Error::RequestFault(fault) = err {
        // We successfully sent a request, but it was rejected for some reason.
        // Whatever the reason, retry if we're provided with a backoff delay.
        let delay = fault
            .as_ref()
            .detail
            .as_ref()?
            .message_xml
            .as_ref()?
            .back_off_milliseconds?;

        // There's no maximum delay documented, so we clamp the incoming value
        // just to be on the safe side.
        Some(u32::try_from(delay).unwrap_or(u32::MAX))
    } else {
        None
    }
}

/// Creates a string representation of a list of mailboxes, suitable for use as
/// the value of an Internet Message Format header.
fn make_header_string_for_mailbox_list(mailboxes: &ArrayOfRecipients) -> String {
    let strings: Vec<_> = mailboxes
        .iter()
        .map(|item| make_header_string_for_mailbox(&item.mailbox))
        .collect();

    strings.join(", ")
}

/// Creates a string representation of a mailbox, suitable for use as the value
/// of an Internet Message Format header.
fn make_header_string_for_mailbox(mailbox: &ews::Mailbox) -> String {
    let email_address = &mailbox.email_address;

    if let Some(name) = mailbox.name.as_ref() {
        let mut buf: Vec<u8> = Vec::new();

        // TODO: It may not be okay to unwrap here (could hit OOM, mainly), but
        // it isn't clear how we can handle that appropriately.
        mail_builder::encoders::encode::rfc2047_encode(&name, &mut buf).unwrap();

        // It's okay to unwrap here, as successful RFC 2047 encoding implies the
        // result is ASCII.
        let name = std::str::from_utf8(&buf).unwrap();

        format!("{name} <{email_address}>")
    } else {
        email_address.clone()
    }
}

/// Gets the Thunderbird flag corresponding to an EWS distinguished ID.
fn distinguished_id_to_flag(id: &&str) -> nsMsgFolderFlagType {
    // The type signature here is a little weird due to being passed directly to
    // `map()`.
    match *id {
        "inbox" => nsMsgFolderFlags::Inbox,
        "deleteditems" => nsMsgFolderFlags::Trash,
        "drafts" => nsMsgFolderFlags::Drafts,
        "outbox" => nsMsgFolderFlags::Queue,
        "sentitems" => nsMsgFolderFlags::SentMail,
        "junkemail" => nsMsgFolderFlags::Junk,
        "archiveinbox" => nsMsgFolderFlags::Archive,
        _ => Default::default(),
    }
}

#[derive(Debug, Error)]
pub(crate) enum XpComEwsError {
    #[error("an error occurred in an XPCOM call")]
    XpCom(#[from] nsresult),

    #[error("an error occurred during HTTP transport")]
    Http(#[from] moz_http::Error),

    #[error("an error occurred while (de)serializing")]
    Ews(#[from] ews::Error),

    #[error("error in processing response")]
    Processing { message: String },
}

/// Returns a function for processing an error and providing it to the provided
/// error-handling callback.
fn process_error_with_cb<Cb>(handler: Cb) -> impl FnOnce(XpComEwsError)
where
    Cb: FnOnce(u8, nsCString),
{
    |err| {
        let (client_err, desc) = match err {
            XpComEwsError::Http(moz_http::Error::StatusCode {
                status: StatusCode(401),
                ..
            }) => {
                // Authentication failed. Let Thunderbird know so we can
                // handle it appropriately.
                (IEwsClient::EWS_ERR_AUTHENTICATION_FAILED, nsCString::new())
            }

            _ => {
                log::error!("an unexpected error occurred while syncing folders: {err:?}");

                match err {
                    XpComEwsError::Http(moz_http::Error::StatusCode { response, .. }) => {
                        match std::str::from_utf8(response.body()) {
                            Ok(body) => eprintln!("body in UTF-8: {body}"),
                            Err(_) => (),
                        }
                    }

                    _ => (),
                }

                (
                    IEwsClient::EWS_ERR_UNEXPECTED,
                    nsCString::from("an unexpected error occurred while syncing folders"),
                )
            }
        };

        handler(client_err, desc);
    }
}

/// Look at the response class of a response message, and do nothing, warn or
/// return an error accordingly.
fn process_response_message_class(
    op_name: &str,
    response_class: ResponseClass,
    response_code: Option<ResponseCode>,
    message_text: Option<String>,
) -> Result<(), XpComEwsError> {
    match response_class {
        ResponseClass::Success => Ok(()),

        ResponseClass::Warning => {
            let message = if let Some(code) = response_code {
                if let Some(text) = message_text {
                    format!("{op_name} operation encountered `{code:?}' warning: {text}")
                } else {
                    format!("{op_name} operation encountered `{code:?}' warning")
                }
            } else if let Some(text) = message_text {
                format!("{op_name} operation encountered warning: {text}")
            } else {
                format!("{op_name} operation encountered unknown warning")
            };

            log::warn!("{message}");

            Ok(())
        }

        ResponseClass::Error => {
            let message = if let Some(code) = response_code {
                if let Some(text) = message_text {
                    format!("{op_name} operation encountered `{code:?}' error: {text}")
                } else {
                    format!("{op_name} operation encountered `{code:?}' error")
                }
            } else if let Some(text) = message_text {
                format!("{op_name} operation encountered error: {text}")
            } else {
                format!("{op_name} operation encountered unknown error")
            };

            Err(XpComEwsError::Processing { message })
        }
    }
}
