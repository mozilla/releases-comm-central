/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::copy_folder::CopyFolder;
use ews::move_folder::MoveFolder;
use ews::{
    BaseFolderId, CopyMoveFolderData, Folder, FolderResponseMessage, Operation, OperationResponse,
};
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
    /// Copy or move a collection of EWS folders.
    ///
    /// The `RequestT` generic parameter indicates which EWS operation to perform
    /// based on its request input type. The trait bounds on `RequestT` enforce
    /// the required available operations to be generic over copy or move
    /// operations.
    ///
    /// The `destination_folder_id` is the EWS ID of the destination folder for
    /// the move or copy operation. The `folder_ids` parameter contains the
    /// collection of EWS folder IDs to copy or move. The `callbacks` parameter
    /// contains the callbacks to execute upon success or failure.
    pub(crate) async fn copy_move_folder<RequestT>(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        destination_folder_id: String,
        folder_ids: Vec<String>,
    ) where
        RequestT: CopyMoveOperation + From<CopyMoveFolderData> + Into<CopyMoveFolderData>,
        <RequestT as Operation>::Response: OperationResponse<Message = FolderResponseMessage>,
    {
        move_generic(
            self,
            listener,
            destination_folder_id,
            folder_ids,
            construct_request::<RequestT, ServerT>,
            get_new_ews_ids_from_response,
        )
        .await;
    }
}

fn construct_request<RequestT, ServerT>(
    _client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    folder_ids: Vec<String>,
) -> RequestT
where
    RequestT: From<CopyMoveFolderData>,
    ServerT: RefCounted,
{
    CopyMoveFolderData {
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
    .into()
}

impl CopyMoveOperation for MoveFolder {
    fn requires_resync(&self) -> bool {
        // We don't expect folder IDs to change after a move, so we shouldn't
        // need to sync the folder hierarchy after this operation completes.
        false
    }
}

impl CopyMoveOperation for CopyFolder {
    fn requires_resync(&self) -> bool {
        // A `CopyFolder` operation always requires a resync to get the newly
        // copied folder and item ids, but the resync path is different than the
        // item resync path, so we return false here.
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
