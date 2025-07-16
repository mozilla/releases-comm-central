/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::move_folder::MoveFolder;
use ews::{BaseFolderId, Folder, FolderResponseMessage};
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IEwsSimpleOperationListener;
use xpcom::{RefCounted, RefPtr};

use crate::authentication::credentials::AuthenticationProvider;
use crate::client::copy_move_operations::move_generic::CopyMoveOperation;
use crate::client::XpComEwsClient;

use super::move_generic::move_generic;

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    pub(crate) async fn move_folder(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        destination_folder_id: String,
        item_ids: Vec<String>,
    ) {
        move_generic(
            self,
            listener,
            destination_folder_id,
            item_ids,
            construct_request,
            get_new_ews_ids_from_response,
        )
        .await;
    }
}

fn construct_request<ServerT>(
    _client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    folder_ids: Vec<String>,
) -> MoveFolder
where
    ServerT: RefCounted,
{
    MoveFolder {
        to_folder_id: BaseFolderId::FolderId {
            id: destination_folder_id,
            change_key: None,
        },
        folder_ids: folder_ids
            .into_iter()
            .map(|id| BaseFolderId::FolderId {
                id,
                change_key: None,
            })
            .collect(),
    }
}

impl CopyMoveOperation for MoveFolder {
    fn requires_resync(&self) -> bool {
        // We don't expect folder IDs to change after a move, so we shouldn't
        // need to sync the folder hierarchy after this operation completes.
        false
    }
}

fn get_new_ews_ids_from_response(response: Vec<FolderResponseMessage>) -> ThinVec<nsCString> {
    response
        .into_iter()
        .filter_map(|response_message| {
            response_message.folders.inner.first().map(|folder| {
                match folder {
                    Folder::Folder { folder_id, .. } => folder_id,
                    _ => &None,
                }
                .as_ref()
                .map(|x| nsCString::from(&x.id))
            })
        })
        .flatten()
        .collect()
}
