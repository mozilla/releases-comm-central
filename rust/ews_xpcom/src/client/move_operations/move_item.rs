/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    move_item::{MoveItem, MoveItemResponse},
    server_version::ExchangeServerVersion,
    BaseItemId,
};
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IEwsItemMoveCallbacks;
use xpcom::{RefCounted, RefPtr};

use crate::client::{XpComEwsClient, XpComEwsError};

use super::move_generic::{move_generic, MoveCallbacks};

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: UserInteractiveServer + RefCounted,
{
    pub(crate) async fn move_item(
        self,
        destination_folder_id: String,
        item_ids: Vec<String>,
        callbacks: RefPtr<IEwsItemMoveCallbacks>,
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
    client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    item_ids: Vec<String>,
) -> MoveItem
where
    ServerT: RefCounted,
{
    let server_version = client.server_version.get();

    // `ReturnNewItemIds` was introduced in Exchange Server 2010 SP1.
    let return_new_item_ids = if server_version <= ExchangeServerVersion::Exchange2010 {
        None
    } else {
        Some(true)
    };

    MoveItem {
        to_folder_id: ews::BaseFolderId::FolderId {
            id: destination_folder_id,
            change_key: None,
        },
        item_ids: item_ids
            .into_iter()
            .map(|id| BaseItemId::ItemId {
                id,
                change_key: None,
            })
            .collect(),
        return_new_item_ids: return_new_item_ids,
    }
}

impl MoveCallbacks<MoveItem> for IEwsItemMoveCallbacks {
    fn on_success(
        &self,
        input_data: MoveItem,
        new_ids: ThinVec<nsCString>,
    ) -> Result<(), XpComEwsError> {
        let sync_required = input_data.return_new_item_ids != Some(true);
        unsafe { self.OnRemoteMoveSuccessful(sync_required, &new_ids) }.to_result()?;
        Ok(())
    }

    fn on_error(&self, error: u8, description: &nsstring::nsACString) {
        unsafe { self.OnError(error, description) };
    }
}

fn get_new_ews_ids_from_response(response: MoveItemResponse) -> ThinVec<nsCString> {
    response
        .response_messages
        .move_item_response_message
        .iter()
        .filter_map(|response_message| {
            response_message
                .items
                .inner
                .first()
                .map(|item| {
                    item.inner_message()
                        .item_id
                        .as_ref()
                        .map(|x| nsCString::from(&x.id))
                })
                .unwrap_or(None)
        })
        .collect()
}
