/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use fxhash::FxHashMap;
use ms_graph_tb::{DeltaResponse, paths};
use protocol_shared::{
    EXCHANGE_DISTINGUISHED_IDS, EXCHANGE_ROOT_FOLDER,
    authentication::credentials::AuthenticationProvider, client::DoOperation,
    safe_xpcom::SafeEwsFolderListener,
};
use xpcom::RefCounted;

use crate::error::XpComGraphError;

use super::XpComGraphClient;

struct DoSyncFolderHierarchy<'a> {
    pub listener: &'a SafeEwsFolderListener,
    pub sync_state_token: Option<String>,
    pub endpoint: &'a url::Url,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoSyncFolderHierarchy<'_>
{
    const NAME: &'static str = "sync folder hierarchy";
    type Okay = ();
    type Listener = SafeEwsFolderListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // If we have received no sync state, assume that this is the first time
        // syncing this account. In that case, we need to determine which
        // folders are "well-known" (e.g., inbox, trash, etc.) so we can flag
        // them.
        let (mut response, well_known) = match self.sync_state_token {
            Some(ref token) => {
                let request = paths::me_mail_folders_delta::GetDelta::try_from(token.as_str())?;
                let response = client.send_request(request).await?;
                (response, None)
            }
            None => {
                let endpoint = self.endpoint.as_str().to_string();
                let request = paths::me_mail_folders_delta::Get::new(endpoint);
                let response = client.send_request(request).await?;
                let well_known = Some(get_well_known_folder_map(client, self.listener).await?);
                (response, well_known)
            }
        };

        loop {
            let folders = response.response();

            for folder in folders {
                let folder_id = folder.entity().id()?.to_string();
                let display_name = folder
                    .display_name()?
                    .ok_or_else(|| XpComGraphError::Processing {
                        message: format!("Folder without display name: {folder_id}"),
                    })?
                    .to_string();
                let parent_folder_id = folder
                    .parent_folder_id()?
                    .ok_or_else(|| XpComGraphError::Processing {
                        message: format!("Folder without parent ID: {display_name} {folder_id}"),
                    })?
                    .to_string();

                // FIXME: get @removed objects
                // https://learn.microsoft.com/en-us/graph/delta-query-overview#resource-representation-in-the-delta-query-response

                // Graph doesn't provide a way to consistently distinguish new
                // and updated objects, so it's tracked here by attempting to
                // modify the folders and falling back to creating them.
                if let Err(err) = self.listener.on_folder_updated(
                    Some(folder_id.clone()),
                    Some(parent_folder_id.clone()),
                    Some(display_name.clone()),
                ) {
                    log::debug!(
                        "Folder update failed ({err}); falling back to create for {folder_id}"
                    );
                    self.listener.on_folder_created(
                        Some(folder_id),
                        Some(parent_folder_id),
                        Some(display_name),
                        &well_known,
                    )?;
                }
            }

            match response {
                DeltaResponse::NextLink { next_page, .. } => {
                    response = client.send_request(next_page).await?
                }
                DeltaResponse::DeltaLink { delta_link, .. } => {
                    self.listener.on_sync_state_token_changed(&delta_link)?;
                    self.sync_state_token = Some(delta_link);
                    break;
                }
            }
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}

    fn into_failure_arg(self) {}
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub async fn sync_folder_hierarchy(
        self,
        listener: SafeEwsFolderListener,
        sync_state_token: Option<String>,
    ) {
        let operation = DoSyncFolderHierarchy {
            listener: &listener,
            sync_state_token,
            endpoint: &self.endpoint,
        };
        operation.handle_operation(&self, &listener).await
    }
}

/// Builds a map from remote folder ID to distinguished folder ID.
///
/// This allows translating from the folder ID returned by `GetFolder`
/// calls and well-known IDs associated with special folders.
async fn get_well_known_folder_map<ServerT: AuthenticationProvider + RefCounted>(
    client: &XpComGraphClient<ServerT>,
    listener: &SafeEwsFolderListener,
) -> Result<FxHashMap<String, &'static str>, XpComGraphError> {
    // We should always request the root folder first to simplify processing
    // the response below.
    assert_eq!(
        EXCHANGE_DISTINGUISHED_IDS[0], EXCHANGE_ROOT_FOLDER,
        "expected first fetched folder to be root"
    );

    let endpoint = client.endpoint.as_str().to_string();

    let mut ret = FxHashMap::default();
    for distinguished_id in EXCHANGE_DISTINGUISHED_IDS {
        let request = paths::me_mail_folders_mail_folder_id::Get::new(
            endpoint.clone(),
            distinguished_id.to_string(),
        );

        // FIXME: Figure out what the response looks like when a well-known
        // folder isn't present, and handle accordingly.
        let folder = client.send_request(request).await?;
        let folder_id = folder.entity().id()?.to_string();

        if *distinguished_id == EXCHANGE_ROOT_FOLDER {
            listener.on_new_root_folder(folder_id.clone())?;
        }

        ret.insert(folder_id, *distinguished_id);
    }
    Ok(ret)
}
