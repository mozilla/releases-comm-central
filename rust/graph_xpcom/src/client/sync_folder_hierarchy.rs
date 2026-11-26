/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    pagination::{DeltaItem, DeltaResponse},
    paths::users::user_id::mail_folders,
};
use protocol_shared::{
    EXCHANGE_DISTINGUISHED_IDS, EXCHANGE_ROOT_FOLDER, ServerType,
    client::DoOperation,
    safe_xpcom::{SafeExchangeAccountInfo, SafeExchangeFolderListener},
};
use rustc_hash::{FxHashMap, FxHashSet};

use crate::{client::Required, error::XpComGraphError};

use super::XpComGraphClient;

struct DoSyncFolderHierarchy<'a> {
    account_info: &'a SafeExchangeAccountInfo,
    listener: &'a SafeExchangeFolderListener,
    sync_state_token: Option<String>,
}

impl DoSyncFolderHierarchy<'_> {
    /// Fetch the latest hierarchy changes and perform those operations.
    ///
    /// If this is invoked without a sync state token, the returned set contains
    /// all folders that are present in our local copy of the hierarchy, but
    /// missing in the server's copy. These are ghosts of folders that were
    /// deleted on the server, but we no longer have a valid sync state token to
    /// fetch those deletions; they should therefore always be deleted
    /// locally. Otherwise, the set is empty.
    async fn sync(
        &mut self,
        client: &XpComGraphClient<impl ServerType>,
    ) -> Result<FxHashSet<String>, XpComGraphError> {
        // If we have received no sync state, we want to enumerate all
        // folders. In that case, we need to determine which folders are
        // "well-known" (e.g., inbox, trash, etc.) so we can flag them.
        let (mut response, well_known, mut deletion_candidates) = match self.sync_state_token {
            Some(ref token) => {
                let request = mail_folders::delta::GetDelta::try_from(token.as_str())?;
                let response = client
                    .send_request_json_response(request, Default::default())
                    .await?;
                (response, None, FxHashSet::default())
            }
            None => {
                let deletion_candidates = self.account_info.get_current_folder_ids()?.collect();
                let base_url = client.base_api_url()?.to_string();
                let request = mail_folders::delta::Get::new(base_url, client.user_id().clone());
                let response = client
                    .send_request_json_response(request, Default::default())
                    .await?;
                let well_known = Some(get_well_known_folder_map(client, self.listener).await?);
                (response, well_known, deletion_candidates)
            }
        };

        loop {
            let folders = response.extract_response();

            for folder_delta in folders {
                match folder_delta {
                    DeltaItem::Removed(folder) => {
                        let folder_id = folder.id().to_string();
                        let reason = folder.reason();
                        log::debug!(
                            "Removing folder {folder_id} from delta sync (reason: {reason:?})"
                        );
                        self.listener.on_folder_deleted(&folder_id)?;
                        deletion_candidates.remove(&folder_id);
                    }
                    DeltaItem::Present(folder) => {
                        let folder_id = folder.entity.id.required("folder id")?;
                        let display_name: String =
                            folder.display_name.required("folder display name")?;
                        let parent_folder_id: String =
                            folder.parent_folder_id.required("parent folder id")?;

                        deletion_candidates.remove(&folder_id);

                        log::debug!(
                            "Found folder in response with ID {folder_id} ({display_name})"
                        );

                        // Graph doesn't provide a way to consistently
                        // distinguish new and updated objects, so it's tracked
                        // here by attempting to modify the folders and falling
                        // back to creating them.
                        let result = self.listener.on_folder_updated(
                            Some(folder_id.clone()),
                            Some(parent_folder_id.clone()),
                            Some(display_name.clone()),
                        );

                        if let Err(nserror::NS_MSG_ERROR_FOLDER_MISSING) = result {
                            log::debug!("Creating folder {folder_id}");

                            self.listener.on_folder_created(
                                Some(folder_id),
                                Some(parent_folder_id),
                                Some(display_name),
                                &well_known,
                            )?;
                        } else {
                            result?;
                            log::debug!("Updated folder {folder_id}");
                        }
                    }
                }
            }

            match response {
                DeltaResponse::NextLink { next_page, .. } => {
                    response = client
                        .send_request_json_response(next_page, Default::default())
                        .await?;
                }
                DeltaResponse::DeltaLink { delta_link, .. } => {
                    self.sync_state_token = Some(delta_link);
                    return Ok(deletion_candidates);
                }
            }
        }
    }
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoSyncFolderHierarchy<'_>
{
    const NAME: &'static str = "sync folder hierarchy";
    type Okay = ();
    type Listener = SafeExchangeFolderListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // Each sync gets up to two chances of completing: once handling the
        // normal, successful case...
        let deletion_candidates = match self.sync(client).await {
            Err(err) if super::response_invalidates_token(&err) => {
                // ... and once if the server invalidated the sync token.
                self.sync_state_token = None;
                self.listener.on_sync_state_token_changed("")?;

                // From this point on, any errors are returned as-is, since
                // additional invalidations likely indicate something gone awry.
                self.sync(client).await?
            }
            result => result?,
        };

        for folder_id in deletion_candidates {
            log::debug!(
                "Removing folder {folder_id} because it was absent from the first valid sync after refreshing a sync state token"
            );
            self.listener.on_folder_deleted(&folder_id)?;
        }

        self.listener
            .on_sync_state_token_changed(self.sync_state_token.as_deref().unwrap_or_default())?;

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Retrieve changes in the folder list/hierarchy by querying the [folder
    /// delta] endpoint.
    ///
    /// If we have already sync'd in the past, `sync_state_token` holds a token
    /// that allows us to only retrieve changes since then. Otherwise, the list
    /// of changes provided in the response should contain enough information to
    /// allow us to build our folder list/hierarchy.
    ///
    /// [folder delta]:
    ///     https://learn.microsoft.com/en-us/graph/api/mailfolder-delta
    pub(crate) async fn sync_folder_hierarchy(
        self: Arc<XpComGraphClient<ServerT>>,
        account_info: SafeExchangeAccountInfo,
        listener: SafeExchangeFolderListener,
        sync_state_token: Option<String>,
    ) {
        let operation = DoSyncFolderHierarchy {
            account_info: &account_info,
            listener: &listener,
            sync_state_token,
        };
        operation.handle_operation(&self, &listener).await;
    }
}

/// Builds a map from remote folder ID to distinguished folder ID.
///
/// This allows translating from the folder ID returned by `GetFolder`
/// calls and well-known IDs associated with special folders.
async fn get_well_known_folder_map<ServerT: ServerType>(
    client: &XpComGraphClient<ServerT>,
    listener: &SafeExchangeFolderListener,
) -> Result<FxHashMap<String, &'static str>, XpComGraphError> {
    // We should always request the root folder first to simplify processing
    // the response below.
    assert_eq!(
        EXCHANGE_DISTINGUISHED_IDS[0], EXCHANGE_ROOT_FOLDER,
        "expected first fetched folder to be root"
    );

    let base_url = client.base_api_url()?.to_string();

    let mut ret = FxHashMap::default();
    for distinguished_id in EXCHANGE_DISTINGUISHED_IDS {
        let request = mail_folders::mail_folder_id::Get::new(
            base_url.clone(),
            client.user_id().clone(),
            distinguished_id.to_string(),
        );

        // FIXME: Figure out what the response looks like when a well-known
        // folder isn't present, and handle accordingly.
        let folder = client
            .send_request_json_response(request, Default::default())
            .await?;
        let folder_id = folder.entity.id.required("folder id")?;

        if *distinguished_id == EXCHANGE_ROOT_FOLDER {
            listener.on_new_root_folder(folder_id.clone())?;
        }

        ret.insert(folder_id, *distinguished_id);
    }
    Ok(ret)
}
