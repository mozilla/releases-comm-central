/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    sync_folder_hierarchy::{self, SyncFolderHierarchy, SyncFolderHierarchyResponse},
    BaseFolderId, BaseShape, Folder, FolderShape, Operation, OperationResponse,
};
use std::{collections::HashSet, sync::Arc};

use super::{
    process_response_message_class, single_response_or_error, DoOperation, ServerType,
    XpComEwsClient, XpComEwsError, EWS_ROOT_FOLDER,
};

use crate::{macros::queue_operation, safe_xpcom::SafeEwsFolderListener};

struct DoSyncFolderHierarchy<'a> {
    pub listener: &'a SafeEwsFolderListener,
    pub sync_state_token: Option<String>,
}

impl DoOperation for DoSyncFolderHierarchy<'_> {
    const NAME: &'static str = SyncFolderHierarchy::NAME;
    type Okay = ();
    type Listener = SafeEwsFolderListener;

    async fn do_operation<ServerT: ServerType>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        // If we have received no sync state, assume that this is the first time
        // syncing this account. In that case, we need to determine which
        // folders are "well-known" (e.g., inbox, trash, etc.) so we can flag
        // them.
        let well_known = if self.sync_state_token.is_none() {
            Some(client.get_well_known_folder_map(self.listener).await?)
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

            client
                .push_sync_state_to_ui(
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
