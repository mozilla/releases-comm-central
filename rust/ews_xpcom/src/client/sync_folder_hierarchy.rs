/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    BaseFolderId, BaseShape, Folder, FolderShape, Operation, OperationResponse,
    get_folder::{GetFolder, GetFolderResponse},
    response::{ResponseCode, ResponseError},
    sync_folder_hierarchy::{self, SyncFolderHierarchy, SyncFolderHierarchyResponse},
};
use fxhash::FxHashMap;
use protocol_shared::{
    EXCHANGE_DISTINGUISHED_IDS, EXCHANGE_ROOT_FOLDER, client::DoOperation,
    safe_xpcom::SafeEwsFolderListener,
};
use std::{collections::HashSet, sync::Arc};

use super::{
    ServerType, XpComEwsClient, XpComEwsError, process_response_message_class,
    single_response_or_error, validate_get_folder_response_message,
};

use crate::macros::queue_operation;

struct DoSyncFolderHierarchy<'a> {
    pub listener: &'a SafeEwsFolderListener,
    pub sync_state_token: Option<String>,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoSyncFolderHierarchy<'_>
{
    const NAME: &'static str = SyncFolderHierarchy::NAME;
    type Okay = ();
    type Listener = SafeEwsFolderListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        // If we have received no sync state, assume that this is the first time
        // syncing this account. In that case, we need to determine which
        // folders are "well-known" (e.g., inbox, trash, etc.) so we can flag
        // them.
        let well_known = if self.sync_state_token.is_none() {
            Some(get_well_known_folder_map(client, self.listener).await?)
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
                    id: EXCHANGE_ROOT_FOLDER.to_string(),
                    change_key: None,
                }),
                sync_state: self.sync_state_token.clone(),
            };

            let rcv = queue_operation!(client, SyncFolderHierarchy, op, Default::default());
            let response_messages = rcv.await??.into_response_messages();

            let response = single_response_or_error(response_messages)?;
            let message = process_response_message_class("SyncFolderHierarchy", response)?;

            let mut create_ids = Vec::new();
            let mut update_ids = HashSet::new();
            let mut delete_ids = HashSet::new();

            // Build lists of all of the changed folder IDs. We'll need to fetch
            // further details when creating or updating folders as well.
            for change in message.changes.inner {
                match change {
                    sync_folder_hierarchy::Change::Create { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            let folder_id = folder_id.ok_or(XpComEwsError::MissingIdInResponse)?;

                            create_ids.push(folder_id.id);
                        }
                    }
                    sync_folder_hierarchy::Change::Update { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            let folder_id = folder_id.ok_or(XpComEwsError::MissingIdInResponse)?;

                            update_ids.insert(folder_id.id);
                        }
                    }
                    sync_folder_hierarchy::Change::Delete { folder_id } => {
                        delete_ids.insert(folder_id.id);
                    }
                }
            }

            // don't try to update anything that was deleted
            let update_ids = update_ids
                .difference(&delete_ids)
                .map(|s| s.to_string())
                .collect();
            let delete_ids = delete_ids.into_iter().collect();

            push_sync_state_to_ui(
                client,
                self.listener,
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

            self.sync_state_token = Some(message.sync_state);
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}
    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Performs a [`SyncFolderHierarchy` operation] via EWS.
    ///
    /// This will fetch a list of remote changes since the specified sync state,
    /// fetch any folder details needed for creating or updating local folders,
    /// and notify the Thunderbird protocol implementation of these changes via
    /// the provided callbacks.
    ///
    /// [`SyncFolderHierarchy` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy-operation
    pub(crate) async fn sync_folder_hierarchy(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsFolderListener,
        sync_state_token: Option<String>,
    ) {
        let operation = DoSyncFolderHierarchy {
            listener: &listener,
            sync_state_token,
        };
        operation.handle_operation(&self, &listener).await;
    }
}

async fn push_sync_state_to_ui<ServerT: ServerType>(
    client: &XpComEwsClient<ServerT>,
    listener: &SafeEwsFolderListener,
    create_ids: Vec<String>,
    update_ids: Vec<String>,
    delete_ids: Vec<String>,
    sync_state: &str,
    well_known_map: &Option<FxHashMap<String, &str>>,
) -> Result<(), XpComEwsError> {
    if !create_ids.is_empty() {
        let created = batch_get_folders(client, create_ids).await?;
        for folder in created {
            match folder {
                Folder::Folder {
                    folder_id,
                    parent_folder_id,
                    display_name,
                    ..
                } => listener.on_folder_created(
                    folder_id.map(|f| f.id),
                    parent_folder_id.map(|f| f.id),
                    display_name,
                    well_known_map,
                )?,
                _ => return Err(nserror::NS_ERROR_FAILURE.into()),
            }
        }
    }

    if !update_ids.is_empty() {
        let updated = batch_get_folders(client, update_ids).await?;
        for folder in updated {
            match folder {
                Folder::Folder {
                    folder_id,
                    parent_folder_id,
                    display_name,
                    ..
                } => listener.on_folder_updated(
                    folder_id.map(|f| f.id),
                    parent_folder_id.map(|f| f.id),
                    display_name,
                )?,
                _ => return Err(nserror::NS_ERROR_FAILURE.into()),
            }
        }
    }

    for id in delete_ids {
        listener.on_folder_deleted(id)?;
    }

    listener.on_sync_state_token_changed(sync_state)?;

    Ok(())
}

async fn batch_get_folders<ServerT: ServerType>(
    client: &XpComEwsClient<ServerT>,
    ids: Vec<String>,
) -> Result<Vec<Folder>, XpComEwsError> {
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

        let rcv = queue_operation!(client, GetFolder, op, Default::default());
        let response = rcv.await??;
        let messages = response.into_response_messages();

        let mut fetched = messages
            .into_iter()
            .filter_map(|response_class| {
                let message = match process_response_message_class(GetFolder::NAME, response_class)
                {
                    Ok(message) => message,
                    Err(err) => {
                        return Some(Err(err));
                    }
                };
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
                            let folder_class = folder_class.as_ref().map(|string| string.as_str());

                            // Filter out non-mail folders. According to EWS
                            // docs, this should be any folder which class
                            // start is "IPF.Note", or starts with
                            // "IPF.Note." (to allow some systems to define
                            // custom mail-derived classes).
                            //
                            // See
                            // <https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/folders-and-items-in-ews-in-exchange>
                            match folder_class {
                                Some(folder_class) => {
                                    if folder_class == "IPF.Note"
                                        || folder_class.starts_with("IPF.Note.")
                                    {
                                        Some(Ok(folder))
                                    } else {
                                        log::debug!(
                                            "Skipping folder with unsupported class: {folder_class}"
                                        );
                                        None
                                    }
                                }
                                None => {
                                    // See https://bugzilla.mozilla.org/show_bug.cgi?id=2009429 .
                                    // Folders without a class do happen, so we still want
                                    // to see those folders even though other clients hide
                                    // certain folders without a class (but not all of them).
                                    Some(Ok(folder))
                                }
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

/// Builds a map from remote folder ID to distinguished folder ID.
///
/// This allows translating from the folder ID returned by `GetFolder`
/// calls and well-known IDs associated with special folders.
async fn get_well_known_folder_map<ServerT: ServerType>(
    client: &XpComEwsClient<ServerT>,
    listener: &SafeEwsFolderListener,
) -> Result<FxHashMap<String, &'static str>, XpComEwsError> {
    // We should always request the root folder first to simplify processing
    // the response below.
    assert_eq!(
        EXCHANGE_DISTINGUISHED_IDS[0], EXCHANGE_ROOT_FOLDER,
        "expected first fetched folder to be root"
    );

    let ids = EXCHANGE_DISTINGUISHED_IDS
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

    let rcv = queue_operation!(client, GetFolder, op, Default::default());
    let response = rcv.await??;

    let response_messages = response.into_response_messages();
    super::validate_response_message_count(&response_messages, EXCHANGE_DISTINGUISHED_IDS.len())?;

    // We expect results from EWS to be in the same order as given in the
    // request. EWS docs aren't explicit about response ordering, but
    // responses don't contain another means of mapping requested ID to
    // response.
    let mut message_iter = EXCHANGE_DISTINGUISHED_IDS.iter().zip(response_messages);

    // Record the root folder for messages before processing the other
    // responses. We're okay to unwrap since we request a static number of
    // folders and we've already checked that we have that number of
    // responses.
    let (_, response_class) = message_iter.next().unwrap();
    let message = process_response_message_class(GetFolder::NAME, response_class)?;

    // Any error fetching the root folder is fatal, since we can't correctly
    // set the parents of any folders it contains without knowing its ID.
    let root_folder_id = validate_get_folder_response_message(&message)?;
    listener.on_new_root_folder(root_folder_id.id)?;

    // Build the mapping for the remaining folders.
    message_iter
        .filter_map(|(&distinguished_id, response_class)| {
            let message = match process_response_message_class(GetFolder::NAME, response_class) {
                Ok(message) => Some(message),

                // Not every Exchange account will have all queried
                // well-known folders, so we skip any which were not
                // found.
                Err(XpComEwsError::ResponseError(ResponseError {
                    response_code: ResponseCode::ErrorFolderNotFound,
                    ..
                })) => None,

                // Return any other error.
                Err(err) => {
                    return Some(Err(err));
                }
            };

            message.map(|message| {
                // Validate the message (and propagate any error) if it's
                // not `None`.
                match validate_get_folder_response_message(&message) {
                    // Map from EWS folder ID to distinguished ID.
                    Ok(folder_id) => Ok((folder_id.id, distinguished_id)),
                    Err(err) => Err(err),
                }
            })
        })
        .collect()
}
