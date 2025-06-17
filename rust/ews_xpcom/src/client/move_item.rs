/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    move_item::{MoveItem, MoveItemResponse},
    server_version::ExchangeServerVersion,
    BaseItemId,
};
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::{interfaces::IEwsItemMoveCallbacks, RefPtr};

use super::{process_error_with_cb_cpp, XpComEwsClient, XpComEwsError};

impl XpComEwsClient {
    pub(crate) async fn move_item(
        self,
        destination_folder_id: String,
        item_ids: Vec<String>,
        callbacks: RefPtr<IEwsItemMoveCallbacks>,
    ) {
        self.move_item_inner(destination_folder_id, item_ids, &callbacks)
            .await
            .unwrap_or_else(process_error_with_cb_cpp(
                move |error, description| unsafe {
                    callbacks.OnError(error, &*description);
                },
            ));
    }

    async fn move_item_inner(
        self,
        destination_folder_id: String,
        item_ids: Vec<String>,
        callbacks: &IEwsItemMoveCallbacks,
    ) -> Result<(), XpComEwsError> {
        let server_version = self.server_version.get();

        // `ReturnNewItemIds` was introduced in Exchange Server 2010 SP1.
        let return_new_item_ids = if server_version <= ExchangeServerVersion::Exchange2010 {
            None
        } else {
            Some(true)
        };

        let move_item = MoveItem {
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
        };

        let response = self.make_operation_request(move_item).await?;

        let new_ids = get_new_ews_ids_from_response(response);

        unsafe { callbacks.OnRemoteMoveSuccessful(return_new_item_ids != Some(true), &new_ids) }
            .to_result()?;

        Ok(())
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
