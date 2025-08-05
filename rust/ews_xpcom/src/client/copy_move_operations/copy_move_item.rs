/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::copy_item::CopyItem;
use ews::move_item::MoveItem;
use ews::{
    server_version::ExchangeServerVersion, BaseItemId, CopyMoveItemData, ItemResponseMessage,
    Operation, OperationResponse,
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
    /// Copy or move a collection of EWS items.
    ///
    /// The `RequestT` generic parameter indicates which EWS operation to perform
    /// based on its request input type. The trait bounds on `RequestT` enforce
    /// the required available operations to be generic over copy or move
    /// operations.
    ///
    /// The `destination_folder_id` is the EWS ID of the destination folder for
    /// the move or copy operation. The `item_ids` parameter contains the
    /// collection of EWS item IDs to copy or move. The `callbacks` parameter
    /// contains the callbacks to execute upon success or failure.
    pub(crate) async fn copy_move_item<RequestT>(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        destination_folder_id: String,
        item_ids: Vec<String>,
    ) where
        RequestT: CopyMoveOperation + From<CopyMoveItemData> + Into<CopyMoveItemData>,
        <RequestT as Operation>::Response: OperationResponse<Message = ItemResponseMessage>,
    {
        move_generic(
            self,
            listener,
            destination_folder_id,
            item_ids,
            construct_request::<RequestT, ServerT>,
            get_new_ews_ids_from_response,
        )
        .await;
    }
}

fn construct_request<RequestT, ServerT>(
    client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    item_ids: Vec<String>,
) -> RequestT
where
    RequestT: From<CopyMoveItemData>,
    ServerT: RefCounted,
{
    let server_version = client.server_version.get();

    // `ReturnNewItemIds` was introduced in Exchange Server 2010 SP1.
    let return_new_item_ids = if server_version <= ExchangeServerVersion::Exchange2010 {
        None
    } else {
        Some(true)
    };

    CopyMoveItemData {
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
        return_new_item_ids,
    }
    .into()
}

fn get_new_ews_ids_from_response(response: Vec<ItemResponseMessage>) -> ThinVec<nsCString> {
    response
        .into_iter()
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

impl CopyMoveOperation for CopyItem {
    fn requires_resync(&self) -> bool {
        // If we don't expect the response to give us the new IDs for the items
        // we've copied, we should get them by syncing again.
        self.inner.return_new_item_ids != Some(true)
    }
}

impl CopyMoveOperation for MoveItem {
    fn requires_resync(&self) -> bool {
        // If we don't expect the response to give us the new IDs for the items
        // we've moved, we should get them by syncing again.
        self.inner.return_new_item_ids != Some(true)
    }
}
