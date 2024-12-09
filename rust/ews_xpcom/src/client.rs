/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{
    collections::{HashMap, HashSet, VecDeque},
    ffi::c_char,
};

use base64::prelude::{Engine, BASE64_STANDARD};
use ews::{
    create_item::{CreateItem, CreateItemResponseMessage},
    delete_item::{DeleteItem, DeleteType},
    get_folder::{GetFolder, GetFolderResponseMessage},
    get_item::GetItem,
    soap,
    sync_folder_hierarchy::{self, SyncFolderHierarchy},
    sync_folder_items::{self, SyncFolderItems},
    update_item::{
        ConflictResolution, ItemChange, ItemChangeDescription, ItemChangeInner, UpdateItem, Updates,
    },
    ArrayOfRecipients, BaseFolderId, BaseItemId, BaseShape, ExtendedFieldURI, ExtendedProperty,
    Folder, FolderId, FolderShape, ItemShape, Message, MessageDisposition, MimeContent, Operation,
    PathToElement, RealItem, Recipient, ResponseClass, ResponseCode,
};
use fxhash::FxHashMap;
use mail_parser::MessageParser;
use moz_http::StatusCode;
use nserror::nsresult;
use nsstring::{nsCString, nsString};
use thin_vec::ThinVec;
use thiserror::Error;
use url::Url;
use uuid::Uuid;
use xpcom::{
    getter_addrefs,
    interfaces::{
        nsIMsgCopyServiceListener, nsIMsgDBHdr, nsIMsgOutgoingListener, nsIStringInputStream,
        nsIURI, nsMsgFolderFlagType, nsMsgFolderFlags, nsMsgKey, nsMsgMessageFlags,
        IEWSMessageFetchCallbacks, IEwsClient, IEwsFolderCallbacks, IEwsMessageCallbacks,
        IEwsMessageDeleteCallbacks,
    },
    RefPtr,
};

use crate::headers::{Mailbox, MessageHeaders};
use crate::{authentication::credentials::Credentials, cancellable_request::CancellableRequest};

// Flags to use for setting the `PR_MESSAGE_FLAGS` MAPI property.
//
// See
// <https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property>,
// although the specific values are set in `Mapidefs.h` from the Windows SDK:
// <https://github.com/microsoft/MAPIStubLibrary/blob/1d30c31ebf05ef444371520cd4268d6e1fda8a3b/include/MAPIDefS.h#L2143-L2154>
//
// Message flags are of type `PT_LONG`, which corresponds to i32 (signed 32-bit
// integers) according to
// https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/property-types
const MSGFLAG_READ: i32 = 0x00000001;
const MSGFLAG_UNMODIFIED: i32 = 0x00000002;
const MSGFLAG_UNSENT: i32 = 0x00000008;

const EWS_ROOT_FOLDER: &str = "msgfolderroot";

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
                    id: EWS_ROOT_FOLDER.to_string(),
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
                            let folder_id = folder_id.ok_or(XpComEwsError::MissingIdInResponse)?;

                            create_ids.push(folder_id.id)
                        }
                    }
                    sync_folder_hierarchy::Change::Update { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            let folder_id = folder_id.ok_or(XpComEwsError::MissingIdInResponse)?;

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
                .filter_map(|change| {
                    let message = match change {
                        sync_folder_items::Change::Create {
                            item: RealItem::Message(message),
                        } => message,
                        sync_folder_items::Change::Update {
                            item: RealItem::Message(message),
                        } => message,

                        // We don't fetch items for anything other than messages,
                        // since we don't have support for other items, and we don't
                        // need to fetch for other types of changes since the ID is
                        // sufficient to do the necessary work.
                        _ => return None,
                    };

                    let result = message
                        .item_id
                        .as_ref()
                        .map(|item_id| item_id.id.clone())
                        // If there is no item ID in a response from Exchange,
                        // something has gone badly wrong. We'll end processing
                        // here.
                        .ok_or(XpComEwsError::MissingIdInResponse);

                    Some(result)
                })
                .collect::<Result<_, _>>()?;

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
                    false,
                )
                .await?
                .into_iter()
                .map(|item| match item {
                    RealItem::Message(message) => message
                        .item_id
                        .clone()
                        .ok_or_else(|| XpComEwsError::MissingIdInResponse)
                        .map(|item_id| (item_id.id.to_owned(), message)),

                    // We should have filtered above for only Message-related
                    // changes.
                    #[allow(unreachable_patterns)]
                    _ => panic!("Encountered unexpected non-Message item in response"),
                })
                .collect::<Result<_, _>>()?;

            for change in message.changes.inner {
                match change {
                    sync_folder_items::Change::Create { item } => {
                        let item_id = match item {
                            RealItem::Message(message) => {
                                message
                                    .item_id
                                    .ok_or_else(|| XpComEwsError::MissingIdInResponse)?
                                    .id
                            }

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
                        // can fill out any fields it wants beforehand. The
                        // header we get back will have its EWS ID already set.
                        let ews_id = nsCString::from(&item_id);
                        let result = getter_addrefs(|hdr| unsafe {
                            callbacks.CreateNewHeaderForItem(&*ews_id, hdr)
                        });

                        if let Err(nserror::NS_OK) = result {
                            // If a header already existed for the given item,
                            // `CreateNewHeaderForItem()` will return `NULL`.
                            // `getter_addrefs()` represents this as an error
                            // with `NS_OK`. We assume here that a previous sync
                            // encountered an error partway through and skip
                            // this item.
                            log::debug!(
                                "Message with ID {item_id} already exists in database, skipping"
                            );
                            continue;
                        }

                        let header = result?;
                        populate_db_message_header_from_message_headers(&header, msg)?;

                        unsafe { callbacks.CommitHeader(&*header) }.to_result()?;
                    }

                    sync_folder_items::Change::Update { item } => {
                        let item_id = match item {
                            RealItem::Message(message) => {
                                message
                                    .item_id
                                    .ok_or_else(|| XpComEwsError::MissingIdInResponse)?
                                    .id
                            }

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

                    sync_folder_items::Change::Delete { item_id } => {
                        log::error!(
                            "Attempt to Delete message with ID {id} - not yet supported",
                            id = item_id.id
                        );

                        // TODO: Need to actually handle this rather than just logging error.
                    }

                    sync_folder_items::Change::ReadFlagChange { item_id, is_read } => {
                        log::error!(
                            "Attempt Read flag change for message with ID {id}: is_read = {ir} - not yet supported", id=item_id.id, ir=is_read
                        );

                        // TODO: Need to actually handle this rather than just logging error.
                    }
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

    pub(crate) async fn get_message(
        self,
        id: String,
        callbacks: RefPtr<IEWSMessageFetchCallbacks>,
    ) {
        unsafe { callbacks.OnFetchStart() };

        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        let result = self.get_message_inner(id.clone(), &callbacks).await;

        let status = match result {
            Ok(_) => nserror::NS_OK,
            Err(err) => {
                log::error!("an unexpected error occurred while fetching message {id}: {err:?}");

                nsresult::from(err)
            }
        };

        unsafe { callbacks.OnFetchStop(status) };
    }

    async fn get_message_inner(
        self,
        id: String,
        callbacks: &IEWSMessageFetchCallbacks,
    ) -> Result<(), XpComEwsError> {
        let items = self.get_items([id], &[], true).await?;
        if items.len() != 1 {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "provided single ID to GetItem operation, got {} responses",
                    items.len()
                ),
            });
        }

        // Extract the Internet Message Format content of the message from the
        // response. We've guaranteed above that the iteration will produce
        // at least one element, so unwrapping is okay here.
        let message = match items.into_iter().next().unwrap() {
            RealItem::Message(message) => message,
        };

        let raw_mime = if let Some(raw_mime) = message.mime_content {
            raw_mime.content
        } else {
            return Err(XpComEwsError::Processing {
                message: format!("item has no content"),
            });
        };

        // EWS returns the content of the email b64encoded on top of any
        // encoding within the message.
        let mime_content =
            BASE64_STANDARD
                .decode(raw_mime)
                .map_err(|_| XpComEwsError::Processing {
                    message: format!("MIME content for item is not validly base64 encoded"),
                })?;

        let len: i32 = mime_content
            .len()
            .try_into()
            .map_err(|_| XpComEwsError::Processing {
                message: format!(
                    "item is of length {}, larger than supported size of 2GiB",
                    mime_content.len()
                ),
            })?;

        let stream = xpcom::create_instance::<nsIStringInputStream>(cstr::cstr!(
            "@mozilla.org/io/string-input-stream;1"
        ))
        .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        // We use `SetData()` here instead of one of the alternatives to ensure
        // that the data is copied. Otherwise, the pointer may become invalid
        // before the stream is dropped.
        unsafe { stream.SetData(mime_content.as_ptr() as *const c_char, len) }.to_result()?;

        unsafe { callbacks.OnDataAvailable(&*stream.coerce(), len as u32) }.to_result()?;

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
            EWS_ROOT_FOLDER,
            "inbox",
            "deleteditems",
            "drafts",
            "outbox",
            "sentitems",
            "junkemail",
        ];

        // We should always request the root folder first to simplify processing
        // the response below.
        assert_eq!(
            DISTINGUISHED_IDS[0], EWS_ROOT_FOLDER,
            "expected first fetched folder to be root"
        );

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
        let response_messages = response.response_messages.get_folder_response_message;

        if response_messages.len() != DISTINGUISHED_IDS.len() {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "received an unexpected number of response messages for GetFolder request: expected {}, got {}",
                    DISTINGUISHED_IDS.len(),
                    response_messages.len(),
                ),
            });
        }

        // We expect results from EWS to be in the same order as given in the
        // request. EWS docs aren't explicit about response ordering, but
        // responses don't contain another means of mapping requested ID to
        // response.
        let mut message_iter = DISTINGUISHED_IDS.iter().zip(response_messages);

        // Record the root folder for messages before processing the other
        // responses. We're okay to unwrap since we request a static number of
        // folders and we've already checked that we have that number of
        // responses.
        let (_, message) = message_iter.next().unwrap();

        // Any error fetching the root folder is fatal, since we can't correctly
        // set the parents of any folders it contains without knowing its ID.
        let root_folder_id = validate_get_folder_response_message(&message)?;
        let folder_id = nsCString::from(root_folder_id.id);

        unsafe { callbacks.RecordRootFolder(&*folder_id) }.to_result()?;

        // Build the mapping for the remaining folders.
        message_iter
            .filter_map(|(&distinguished_id, message)| {
                match validate_get_folder_response_message(&message) {
                    // Map from EWS folder ID to distinguished ID.
                    Ok(folder_id) => Some(Ok((folder_id.id, distinguished_id))),

                    Err(err) => {
                        match err {
                            // Not every Exchange account will have all queried
                            // well-known folders, so we skip any which were not
                            // found.
                            XpComEwsError::ResponseError {
                                code: ResponseCode::ErrorFolderNotFound,
                                ..
                            } => None,

                            // Propagate any other error.
                            _ => Some(Err(err)),
                        }
                    }
                }
            })
            .collect()
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
                        // We should have already verified that the folder ID is
                        // present, so it should be okay to unwrap here.
                        let id = folder_id.unwrap().id;
                        let display_name = display_name.ok_or(nserror::NS_ERROR_FAILURE)?;

                        let well_known_folder_flag = well_known_map
                            .as_ref()
                            .and_then(|map| map.get(&id))
                            .map(distinguished_id_to_flag)
                            .unwrap_or_default();

                        let id = nsCString::from(id);
                        let parent_struct = parent_folder_id.ok_or(nserror::NS_ERROR_FAILURE)?;
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

                    _ => return Err(nserror::NS_ERROR_FAILURE.into()),
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
                        // We should have already verified that the folder ID is
                        // present, so it should be okay to unwrap here.
                        let id = folder_id.unwrap().id;
                        let display_name = display_name.ok_or(nserror::NS_ERROR_FAILURE)?;

                        let id = nsCString::from(id);
                        let display_name = nsCString::from(display_name);

                        unsafe { callbacks.Update(&*id, &*display_name) }.to_result()?;
                    }

                    _ => return Err(nserror::NS_ERROR_FAILURE.into()),
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
                    if let Err(err) = validate_get_folder_response_message(&message) {
                        return Some(Err(err));
                    }

                    message
                        .folders
                        .inner
                        .into_iter()
                        .next()
                        .and_then(|folder| match &folder {
                            Folder::Folder { folder_class, .. } => {
                                // Filter out non-mail folders, which will have
                                // a class value other than "IPF.Note".
                                if let Some("IPF.Note") =
                                    folder_class.as_ref().map(|string| string.as_str())
                                {
                                    Some(Ok(folder))
                                } else {
                                    None
                                }
                            }

                            _ => None,
                        })
                })
                .collect::<Result<_, _>>()?;

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
        include_mime_content: bool,
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
                    include_mime_content: Some(include_mime_content),
                    ..Default::default()
                },
                item_ids: batch_ids,
            };

            let response = self.make_operation_request(op).await?;
            for response_message in response.response_messages.get_item_response_message {
                process_response_message_class(
                    "GetItem",
                    &response_message.response_class,
                    &response_message.response_code,
                    &response_message.message_text,
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
        listener: RefPtr<nsIMsgOutgoingListener>,
        server_uri: RefPtr<nsIURI>,
    ) {
        let cancellable_request = CancellableRequest::new();

        // Notify that the request has started.
        if let Err(err) = unsafe { listener.OnSendStart(cancellable_request.coerce()) }.to_result()
        {
            log::error!("aborting sending: an error occurred while starting the observer: {err}");
            return;
        }

        // Send the request, using an inner method to more easily handle errors.
        // Use the return value to determine which status we should use when
        // notifying the end of the request.
        let (status, sec_info) = match self
            .send_message_inner(mime_content, message_id, should_request_dsn, bcc_recipients)
            .await
        {
            Ok(_) => (nserror::NS_OK, None),
            Err(err) => {
                log::error!("an error occurred while attempting to send the message: {err:?}");

                match err {
                    XpComEwsError::Http(moz_http::Error::TransportSecurityFailure {
                        status,
                        transport_security_info,
                    }) => (status, Some(transport_security_info.0.clone())),
                    _ => (err.into(), None),
                }
            }
        };

        // Notify that the request has finished. We pass in an empty string as
        // the error message because we don't currently generate any user-facing
        // error from here, so it's likely better to let MessageSend generate
        // one.
        let err_msg = nsCString::new();
        let sec_info = match sec_info {
            Some(sec_info) => RefPtr::forget_into_raw(sec_info),
            None => std::ptr::null(),
        };

        if let Err(err) =
            unsafe { listener.OnSendStop(server_uri.coerce(), status, sec_info, &*err_msg) }
                .to_result()
        {
            log::error!("an error occurred while stopping the observer: {err}")
        }
    }

    async fn send_message_inner(
        self,
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
        let message = Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(&mime_content),
            }),
            is_delivery_receipt_requested: Some(should_request_dsn),
            internet_message_id: Some(message_id),
            bcc_recipients,
            ..Default::default()
        };

        let create_item = CreateItem {
            items: vec![RealItem::Message(message)],

            // We don't need EWS to copy messages to the Sent folder after
            // they've been sent, because the internal MessageSend module
            // already takes care of it and will include additional headers we
            // don't send to EWS (such as Bcc).
            message_disposition: Some(MessageDisposition::SendOnly),
            saved_item_folder_id: None,
        };

        self.make_create_item_request(create_item).await?;

        Ok(())
    }

    /// Create a message on the server by performing a [`CreateItem`] operation
    /// via EWS.
    ///
    /// All headers are expected to be included in the provided MIME content.
    ///
    /// [`CreateItem`] https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    pub async fn save_message(
        self,
        folder_id: String,
        is_draft: bool,
        content: Vec<u8>,
        copy_listener: RefPtr<nsIMsgCopyServiceListener>,
        message_callbacks: RefPtr<IEwsMessageCallbacks>,
    ) {
        if let Err(status) = unsafe { copy_listener.OnStartCopy().to_result() } {
            log::error!("aborting copy: an error occurred while starting the listener: {status}");
            return;
        }

        // Send the request, using an inner method to more easily handle errors.
        // Use the return value to determine which status we should use when
        // notifying the end of the request.
        let status = match self
            .save_message_inner(
                folder_id,
                is_draft,
                content,
                copy_listener.clone(),
                message_callbacks,
            )
            .await
        {
            Ok(_) => nserror::NS_OK,
            Err(err) => {
                log::error!("an error occurred while attempting to copy the message: {err:?}");

                err.into()
            }
        };

        if let Err(err) = unsafe { copy_listener.OnStopCopy(status) }.to_result() {
            log::error!("aborting copy: an error occurred while stopping the listener: {err}")
        }
    }

    async fn save_message_inner(
        &self,
        folder_id: String,
        is_draft: bool,
        content: Vec<u8>,
        copy_listener: RefPtr<nsIMsgCopyServiceListener>,
        message_callbacks: RefPtr<IEwsMessageCallbacks>,
    ) -> Result<(), XpComEwsError> {
        // Create a new message from the binary content we got.
        let mut message = Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(&content),
            }),
            ..Default::default()
        };

        // Set the `PR_MESSAGE_FLAGS` MAPI property. If not set, the EWS server
        // uses `MSGFLAG_UNSENT` | `MSGFLAG_UNMODIFIED` as the default value,
        // which is not what we want.
        //
        // See
        // https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property
        let mut mapi_flags = MSGFLAG_READ;
        if is_draft {
            mapi_flags |= MSGFLAG_UNSENT;
        } else {
            mapi_flags |= MSGFLAG_UNMODIFIED;
        }

        message.extended_property = Some(vec![ExtendedProperty {
            extended_field_URI: ExtendedFieldURI {
                distinguished_property_set_id: None,
                property_set_id: None,
                property_name: None,
                property_id: None,

                // 3591 (0x0E07) is the `PR_MESSAGE_FLAGS` MAPI property.
                property_tag: Some("3591".into()),
                property_type: ews::PropertyType::Integer,
            },
            value: mapi_flags.to_string(),
        }]);

        let create_item = CreateItem {
            items: vec![RealItem::Message(message)],
            message_disposition: Some(MessageDisposition::SaveOnly),
            saved_item_folder_id: Some(BaseFolderId::FolderId {
                id: folder_id,
                change_key: None,
            }),
        };

        let response_message = self.make_create_item_request(create_item).await?;

        let hdr = create_and_populate_header_from_save_response(
            response_message,
            &content,
            message_callbacks,
        )?;

        if is_draft {
            // If we're dealing with a draft message, copy the message key to
            // the listener so that the draft can be replaced if a newer draft
            // of the message is saved.
            let mut key: nsMsgKey = 0;

            unsafe { hdr.GetMessageKey(&mut key) }.to_result()?;
            unsafe { copy_listener.SetMessageKey(key) }.to_result()?;
        }

        Ok(())
    }

    /// Performs a [`CreateItem`] operation and processes its response.
    ///
    /// [`CreateItem`] https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    async fn make_create_item_request(
        &self,
        create_item: CreateItem,
    ) -> Result<CreateItemResponseMessage, XpComEwsError> {
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
            &response_message.response_class,
            &response_message.response_code,
            &response_message.message_text,
        )?;

        Ok(response_message)
    }

    /// Mark a message as read or unread by performing an [`UpdateItem`] operation via EWS.
    ///
    /// [`UpdateItem`] https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    pub async fn change_read_status(self, message_ids: Vec<String>, is_read: bool) {
        // Send the request, using an inner method to more easily handle errors.
        if let Err(err) = self.change_read_status_inner(message_ids, is_read).await {
            log::error!("an error occurred while attempting to update the read status: {err:?}");
        }
    }

    async fn change_read_status_inner(
        self,
        message_ids: Vec<String>,
        is_read: bool,
    ) -> Result<(), XpComEwsError> {
        // Create the structure for setting the messages as read/unread.
        let item_changes: Vec<ItemChange> = message_ids
            .into_iter()
            .map(|message_id| {
                let updates = Updates {
                    inner: vec![ItemChangeDescription::SetItemField {
                        field_uri: PathToElement::FieldURI {
                            field_URI: "message:IsRead".to_string(),
                        },
                        message: Message {
                            is_read: Some(is_read),
                            ..Default::default()
                        },
                    }],
                };

                ItemChange {
                    item_change: ItemChangeInner {
                        item_id: BaseItemId::ItemId {
                            id: message_id,
                            // TODO: We should be able to get the change key from the
                            // database or server, but we don't have a way to do that yet.
                            change_key: None,
                        },
                        updates,
                    },
                }
            })
            .collect();

        let update_item = UpdateItem {
            item_changes,
            message_disposition: MessageDisposition::SaveOnly,
            // If we don't provide a ChangeKey as part of the ItemChange, then
            // we cannot use the default value of `AutoResolve` for
            // `ConflictResolution`. Instead, we will use `AlwaysOverwrite` for now.
            conflict_resolution: Some(ConflictResolution::AlwaysOverwrite),
        };

        self.make_update_item_request(update_item).await?;

        Ok(())
    }

    /// Performs an [`UpdateItem`] operation and processes its response.
    ///
    /// [`UpdateItem`] https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    async fn make_update_item_request(&self, update_item: UpdateItem) -> Result<(), XpComEwsError> {
        // Make the operation request using the provided parameters.
        let response = self.make_operation_request(update_item.clone()).await?;

        // Get all response messages.
        let response_messages = &response.response_messages.update_item_response_message;
        if response_messages.len() < update_item.item_changes.len() {
            return Err(XpComEwsError::Processing {
                message: String::from(
                    "expected at least one response message per UpdateItem request",
                ),
            });
        }

        let mut processed_messages = Vec::new();
        let mut errors = Vec::new();

        // Process each response message, checking for errors or warnings.
        for (index, response_message) in response_messages.iter().enumerate() {
            match process_response_message_class(
                "UpdateItem",
                &response_message.response_class,
                &response_message.response_code,
                &response_message.message_text,
            ) {
                Ok(_) => processed_messages.push(response_message.clone()),
                Err(err) => errors.push(format!(
                    "Failed to process message #{} ({:?}): {}",
                    index, response_message, err
                )),
            }
        }

        // If there were errors, return an aggregated error.
        if !errors.is_empty() {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "Some errors occurred while processing response messages: {:?}",
                    errors
                ),
            });
        }

        Ok(())
    }

    pub async fn delete_messages(
        self,
        ews_ids: ThinVec<nsCString>,
        callbacks: RefPtr<IEwsMessageDeleteCallbacks>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        self.delete_messages_inner(ews_ids, &callbacks)
            .await
            .unwrap_or_else(process_error_with_cb(move |client_err, desc| unsafe {
                callbacks.OnError(client_err, &*desc);
            }));
    }

    async fn delete_messages_inner(
        self,
        ews_ids: ThinVec<nsCString>,
        callbacks: &RefPtr<IEwsMessageDeleteCallbacks>,
    ) -> Result<(), XpComEwsError> {
        let item_ids: Vec<BaseItemId> = ews_ids
            .iter()
            .map(|raw_id| BaseItemId::ItemId {
                id: raw_id.to_string(),
                change_key: None,
            })
            .collect();

        let delete_item = DeleteItem {
            item_ids,
            delete_type: DeleteType::HardDelete,
            send_meeting_cancellations: None,
            affected_task_occurrences: None,
            suppress_read_receipts: None,
        };

        let response = self.make_operation_request(delete_item).await?;

        // Make sure we got the amount of response messages matches the amount
        // of messages we requested to have deleted.
        let response_messages = response.response_messages.delete_item_response_message;
        if response_messages.len() != ews_ids.len() {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "received an unexpected number of response messages for DeleteItem request: expected {}, got {}",
                    ews_ids.len(),
                    response_messages.len(),
                ),
            });
        }

        // Check every response message for an error.
        response_messages
            .into_iter()
            .zip(ews_ids.iter())
            .map(|(response_message, ews_id)| {
                if let Err(err) = process_response_message_class(
                    "DeleteItem",
                    &response_message.response_class,
                    &response_message.response_code,
                    &response_message.message_text,
                ) {
                    if matches!(err, XpComEwsError::ResponseError { code: ResponseCode::ErrorItemNotFound, .. }) {
                        // Something happened in a previous attempt that caused
                        // the message to be deleted on the EWS server but not
                        // in the database. In this case, we don't want to force
                        // a zombie message in the folder, so we ignore the
                        // error and move on with the local deletion.
                        log::warn!("found message that was deleted from the EWS server but not the local db: {ews_id}");
                        Ok(())
                    } else {
                        // We've already checked that there are as many elements in
                        // `response_messages` as in `message_ews_ids`, so we
                        // shouldn't be able to get out of bounds here.
                        Err(XpComEwsError::Processing {
                            message: format!(
                                "error while attempting to delete message {ews_id}: {err:?}"
                            ),
                        })
                    }
                } else {
                    Ok(())
                }
            }).collect::<Result<(), _>>()?;

        // Delete the messages from the folder's database.
        unsafe { callbacks.OnRemoteDeleteSuccessful() }
            .to_result()
            .map_err(|err| err.into())
    }

    /// Makes a request to the EWS endpoint to perform an operation.
    ///
    /// If the request is throttled, it will be retried after the delay given in
    /// the response.
    async fn make_operation_request<Op>(&self, op: Op) -> Result<Op::Response, XpComEwsError>
    where
        Op: Operation,
    {
        let op_name = op.name();
        let envelope = soap::Envelope { body: op };
        let request_body = envelope.as_xml_document()?;

        // Loop in case we need to retry the request after a delay.
        loop {
            // Fetch the Authorization header value for each request in case of
            // token expiration between requests.
            let auth_header_value = self.credentials.to_auth_header_value().await?;
            // Generate random id for logging purposes.
            let request_id = Uuid::new_v4();
            log::info!("Making operation request {request_id}: {op_name}");
            log::info!("C: {}", String::from_utf8_lossy(&request_body));
            let response = self
                .client
                .post(&self.endpoint)?
                .header("Authorization", &auth_header_value)
                .body(request_body.as_slice(), "application/xml")
                .send()
                .await?;

            let response_body = response.body();
            log::info!("Response received for request {request_id}: {op_name}");
            log::info!("S: {}", String::from_utf8_lossy(&response_body));

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

                    log::error!("Request FAILED: {err}");
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

/// Sets the fields of a database header object from a collection of message
/// headers.
fn populate_db_message_header_from_message_headers(
    header: &nsIMsgDBHdr,
    msg: impl MessageHeaders,
) -> Result<(), XpComEwsError> {
    let internet_message_id = if let Some(internet_message_id) = msg.internet_message_id() {
        nsCString::from(internet_message_id.as_ref())
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

    if let Some(is_read) = msg.is_read() {
        if is_read {
            should_write_flags = true;
            header_flags |= nsMsgMessageFlags::Read;
        }
    }

    if let Some(has_attachments) = msg.has_attachments() {
        if has_attachments {
            should_write_flags = true;
            header_flags |= nsMsgMessageFlags::Attachment;
        }
    }

    if should_write_flags {
        unsafe { header.SetFlags(header_flags) }.to_result()?;
    }

    if let Some(sent) = msg.sent_timestamp_ms() {
        unsafe { header.SetDate(sent) }.to_result()?;
    }

    if let Some(author) = msg.author() {
        let author = nsCString::from(author.to_string());
        unsafe { header.SetAuthor(&*author) }.to_result()?;
    }

    if let Some(reply_to) = msg.reply_to_recipient() {
        let reply_to = nsCString::from(reply_to.to_string());
        unsafe { header.SetStringProperty(cstr::cstr!("replyTo").as_ptr(), &*reply_to) }
            .to_result()?;
    }

    if let Some(to) = msg.to_recipients() {
        let to = nsCString::from(make_header_string_for_mailbox_list(to));
        unsafe { header.SetRecipients(&*to) }.to_result()?;
    }

    if let Some(cc) = msg.cc_recipients() {
        let cc = nsCString::from(make_header_string_for_mailbox_list(cc));
        unsafe { header.SetCcList(&*cc) }.to_result()?;
    }

    if let Some(bcc) = msg.bcc_recipients() {
        let bcc = nsCString::from(make_header_string_for_mailbox_list(bcc));
        unsafe { header.SetBccList(&*bcc) }.to_result()?;
    }

    if let Some(subject) = msg.message_subject() {
        let subject = nsCString::from(subject.as_ref());
        unsafe { header.SetSubject(&*subject) }.to_result()?;
    }

    if let Some(priority) = msg.priority() {
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
fn make_header_string_for_mailbox_list<'a>(
    mailboxes: impl IntoIterator<Item = Mailbox<'a>>,
) -> String {
    let strings: Vec<_> = mailboxes
        .into_iter()
        .map(|mailbox| mailbox.to_string())
        .collect();

    strings.join(", ")
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

    #[error("request resulted in error with code {code:?} and message {message:?}")]
    ResponseError {
        code: ResponseCode,
        message: Option<String>,
    },

    #[error("error in processing response")]
    Processing { message: String },

    #[error("missing item or folder ID in response from Exchange")]
    MissingIdInResponse,
}

impl From<XpComEwsError> for nsresult {
    fn from(value: XpComEwsError) -> Self {
        match value {
            XpComEwsError::XpCom(value) => value,
            XpComEwsError::Http(value) => value.into(),

            _ => nserror::NS_ERROR_UNEXPECTED,
        }
    }
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
                log::error!("an unexpected error occurred: {err:?}");

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
                    nsCString::from("an unexpected error occurred"),
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
    response_class: &ResponseClass,
    response_code: &Option<ResponseCode>,
    message_text: &Option<String>,
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
            let code = response_code.unwrap_or_default();

            Err(XpComEwsError::ResponseError {
                code,
                message: message_text.clone(),
            })
        }
    }
}

/// Verifies that a response message for a GetFolder request is valid for a
/// standard folder.
///
/// Returns the ID of a valid folder for convenience.
fn validate_get_folder_response_message(
    message: &GetFolderResponseMessage,
) -> Result<FolderId, XpComEwsError> {
    process_response_message_class(
        "GetFolder",
        &message.response_class,
        &message.response_code,
        &message.message_text,
    )?;

    if message.folders.inner.len() != 1 {
        return Err(XpComEwsError::Processing {
            message: format!(
                "expected exactly one folder per response message, got {}",
                message.folders.inner.len()
            ),
        });
    }

    // Okay to unwrap as we've verified the length.
    match message.folders.inner.iter().next().unwrap() {
        Folder::Folder { folder_id, .. } => folder_id
            .as_ref()
            .map(|id| id.clone())
            .ok_or(XpComEwsError::MissingIdInResponse),

        _ => Err(XpComEwsError::Processing {
            message: String::from("expected folder to be of type Folder"),
        }),
    }
}

/// Uses the provided `CreateItemResponseMessage` to create, populate and commit
/// an `nsIMsgDBHdr` for a newly created message.
fn create_and_populate_header_from_save_response(
    response_message: CreateItemResponseMessage,
    content: &[u8],
    message_callbacks: RefPtr<IEwsMessageCallbacks>,
) -> Result<RefPtr<nsIMsgDBHdr>, XpComEwsError> {
    // If we're saving the message (rather than sending it), we must create a
    // new database entry for it and associate it with the message's EWS ID.
    let items = response_message.items.inner;
    if items.len() != 1 {
        return Err(XpComEwsError::Processing {
            message: String::from("expected only one item in CreateItem response"),
        });
    }

    let message = match items.into_iter().next().unwrap() {
        RealItem::Message(message) => message,
    };

    let ews_id = message
        .item_id
        .ok_or(XpComEwsError::MissingIdInResponse)?
        .id;
    let ews_id = nsCString::from(ews_id);

    let hdr =
        getter_addrefs(|hdr| unsafe { message_callbacks.CreateNewHeaderForItem(&*ews_id, hdr) })?;

    // Parse the message and use its headers to populate the `nsIMsgDBHdr`
    // before committing it to the database. We parse the original content
    // rather than use the `Message` from the `CreateItemResponse` because the
    // latter only contains the item's ID, and so is missing the required
    // fields.
    let message = MessageParser::default()
        .parse(content)
        .ok_or(XpComEwsError::Processing {
            message: String::from("failed to parse message"),
        })?;

    populate_db_message_header_from_message_headers(&hdr, message)?;
    unsafe { message_callbacks.CommitHeader(&*hdr) }.to_result()?;

    Ok(hdr)
}
