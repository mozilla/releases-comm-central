/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::Deref as _;

use ews::{
    get_folder::GetFolder,
    soap,
    sync_folder_hierarchy::{Change, SyncFolderHierarchy},
    BaseFolderId, BaseShape, Folder, FolderShape, Operation, ResponseClass,
};
use fxhash::FxHashMap;
use nserror::{nsresult, NS_ERROR_FAILURE};
use nsstring::{nsCString, nsString};
use thiserror::Error;
use url::Url;
use xpcom::{
    interfaces::{nsMsgFolderFlagType, nsMsgFolderFlags, IEwsFolderCallbacks, IEwsIncomingServer},
    RefPtr,
};

use crate::AuthStringListener;

pub(crate) struct XpComEwsClient {
    pub endpoint: Url,
    pub auth_source: RefPtr<IEwsIncomingServer>,
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
        self.sync_folder_hierarchy_inner(callbacks.clone(), sync_state_token)
            .await
            .unwrap_or_else(|err| {
                // TODO: We need better error handling, including reporting back
                // failure to authenticate.
                eprintln!("error while syncing: {err:?}");

                unsafe {
                    callbacks.OnError();
                }
            });
    }

    async fn sync_folder_hierarchy_inner(
        self,
        callbacks: RefPtr<IEwsFolderCallbacks>,
        mut sync_state_token: Option<String>,
    ) -> Result<(), XpComEwsError> {
        // If we have received no sync state, assume that this is the first time
        // syncing this account. In that case, we need to determine which
        // folders are "well-known" (e.g., inbox, trash, etc.) so we can flag
        // them.
        let well_known = if sync_state_token.is_none() {
            Some(self.get_well_known_folder_map(&callbacks).await?)
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
                    Change::Create { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            create_ids.push(folder_id.id)
                        }
                    }
                    Change::Update { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            update_ids.push(folder_id.id)
                        }
                    }
                    Change::Delete(folder_id) => delete_ids.push(folder_id.id),
                }
            }

            self.push_sync_state_to_ui(
                callbacks.clone(),
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

    async fn get_auth_string(&self) -> Result<String, nsresult> {
        let listener = AuthStringListener::new();

        unsafe { self.auth_source.GetAuthString(&*listener.coerce()) }.to_result()?;

        // Safety: Although the `Deref` impl for `RefPtr` doesn't decrease the
        // reference count, its `Drop` implem does, meaning we don't
        // accidentally leak the listener into the memory.
        listener.deref().await
    }

    /// Builds a map from remote folder ID to distinguished folder ID.
    ///
    /// This allows translating from the folder ID returned by `GetFolder`
    /// calls and well-known IDs associated with special folders.
    async fn get_well_known_folder_map(
        &self,
        callbacks: &RefPtr<IEwsFolderCallbacks>,
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
        callbacks: RefPtr<IEwsFolderCallbacks>,
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
        unsafe { callbacks.UpdateState(&*sync_state) }.to_result()?;

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
            // Fetch the auth string for each request in case of token
            // expiration between requests.
            let auth_string = self.get_auth_string().await?;

            let response = self
                .client
                .post(&self.endpoint)?
                .header("Authorization", &auth_string)
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
}
