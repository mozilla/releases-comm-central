/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::move_folder::{MoveFolder, MoveFolderResponse};
use ews::{BaseFolderId, Folder};
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IEwsFolderMoveCallbacks;
use xpcom::{RefCounted, RefPtr};

use crate::client::{XpComEwsClient, XpComEwsError};

use super::move_generic::{move_generic, MoveCallbacks};

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: UserInteractiveServer + RefCounted,
{
    pub(crate) async fn move_folder(
        self,
        destination_folder_id: String,
        item_ids: Vec<String>,
        callbacks: RefPtr<IEwsFolderMoveCallbacks>,
    ) {
        move_generic(
            self,
            destination_folder_id,
            item_ids,
            construct_request,
            get_new_ews_ids_from_response,
            callbacks,
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
                id: id,
                change_key: None,
            })
            .collect(),
    }
}

impl MoveCallbacks<MoveFolder> for IEwsFolderMoveCallbacks {
    fn on_success(
        &self,
        _input_data: MoveFolder,
        new_ids: thin_vec::ThinVec<nsCString>,
    ) -> Result<(), XpComEwsError> {
        unsafe { self.OnRemoteMoveSuccessful(&new_ids) }.to_result()?;
        Ok(())
    }

    fn on_error(&self, error: u8, description: &nsstring::nsACString) {
        unsafe {
            self.OnError(error, description);
        }
    }
}

fn get_new_ews_ids_from_response(response: MoveFolderResponse) -> ThinVec<nsCString> {
    response
        .response_messages
        .move_folder_response_message
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
        .filter_map(|id| id)
        .collect()
}
