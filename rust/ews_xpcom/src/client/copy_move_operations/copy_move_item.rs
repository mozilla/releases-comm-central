/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    BaseItemId, CopyMoveItemData, ItemResponseMessage, Operation, OperationResponse,
    copy_item::{CopyItem, CopyItemResponse},
    move_item::{MoveItem, MoveItemResponse},
    server_version::ExchangeServerVersion,
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{SafeEwsSimpleOperationListener, SafeListener};
use std::{marker::PhantomData, sync::Arc};

use crate::client::copy_move_operations::move_generic::{
    CopyMoveOperation, CopyMoveSuccess, RequiresResync, move_generic,
};
use crate::client::{ServerType, XpComEwsClient, XpComEwsError};
use crate::macros::queue_operation;

struct DoCopyMoveItem<RequestT> {
    destination_folder_id: String,
    item_ids: Vec<String>,
    _request_type: PhantomData<RequestT>,
}

impl<ServerT: ServerType, RequestT> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoCopyMoveItem<RequestT>
where
    RequestT: CopyMoveOperation + From<CopyMoveItemData> + Into<CopyMoveItemData>,
    <RequestT as Operation>::Response: OperationResponse<Message = ItemResponseMessage>,
{
    const NAME: &'static str = <RequestT as Operation>::NAME;
    type Okay = CopyMoveSuccess;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        move_generic::<_, RequestT>(
            client,
            self.destination_folder_id.clone(),
            self.item_ids.clone(),
        )
        .await
    }

    fn into_success_arg(self, ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        ok.into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Copy or move a collection of EWS items.
    ///
    /// The `RequestT` generic parameter indicates which EWS operation to perform
    /// based on its request input type. The trait bounds on `RequestT` enforce
    /// the required available operations to be generic over copy or move
    /// operations.
    ///
    /// The `destination_folder_id` is the EWS ID of the destination folder for
    /// the move or copy operation. The `item_ids` parameter contains the
    /// collection of EWS item IDs to copy or move. The `listener` parameter
    /// contains the callbacks to execute upon success or failure.
    pub(crate) async fn copy_move_item<RequestT>(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        destination_folder_id: String,
        item_ids: Vec<String>,
    ) where
        RequestT: CopyMoveOperation + From<CopyMoveItemData> + Into<CopyMoveItemData>,
        <RequestT as Operation>::Response: OperationResponse<Message = ItemResponseMessage>,
    {
        let operation = DoCopyMoveItem::<RequestT> {
            destination_folder_id,
            item_ids,
            _request_type: PhantomData,
        };
        operation.handle_operation(&self, &listener).await;
    }

    /// Copy or move a collection of EWS items (functional version).
    ///
    /// The `RequestT` generic parameter indicates which EWS operation to perform
    /// based on its request input type. The trait bounds on `RequestT` enforce
    /// the required available operations to be generic over copy or move
    /// operations.
    ///
    /// The `destination_folder_id` is the EWS ID of the destination folder for
    /// the move or copy operation. The `item_ids` parameter contains the
    /// collection of EWS item IDs to copy or move.
    ///
    /// Return a result containing a pair with the new ids (if available)
    /// and a boolean indicating whether or not a resync is required or
    /// an [`XpComEwsError`]
    ///
    /// This version is suitable for use when a larger operation requires item
    /// copy or move operations as part of its orchestration.
    pub(crate) async fn copy_move_item_functional<RequestT>(
        &self,
        destination_folder_id: String,
        item_ids: Vec<String>,
    ) -> Result<CopyMoveSuccess, XpComEwsError>
    where
        RequestT: CopyMoveOperation + From<CopyMoveItemData> + Into<CopyMoveItemData>,
        <RequestT as Operation>::Response: OperationResponse<Message = ItemResponseMessage>,
    {
        move_generic::<_, RequestT>(self, destination_folder_id, item_ids).await
    }
}

fn construct_request<RequestT, ServerT>(
    client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    item_ids: Vec<String>,
) -> RequestT
where
    RequestT: From<CopyMoveItemData>,
    ServerT: ServerType,
{
    let server_version = client.version_handler.get_version();

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

fn get_new_ews_ids_from_response(response: Vec<ItemResponseMessage>) -> Vec<String> {
    response
        .into_iter()
        .filter_map(|response_message| {
            response_message
                .items
                .inner
                .first()
                .map(|item| item.inner_message().item_id.as_ref().map(|x| x.id.clone()))
                .unwrap_or(None)
        })
        .collect()
}

impl CopyMoveOperation for CopyItem {
    async fn queue_operation<ServerT: ServerType>(
        client: &XpComEwsClient<ServerT>,
        destination_folder_id: String,
        ids: Vec<String>,
    ) -> Result<(Self::Response, RequiresResync), XpComEwsError> {
        let op: Self = construct_request(client, destination_folder_id, ids);
        let requires_resync = if let Some(true) = op.inner.return_new_item_ids {
            RequiresResync::No
        } else {
            RequiresResync::Yes
        };

        let rcv = queue_operation!(client, CopyItem, op, Default::default());
        rcv.await?.map(|resp| (resp, requires_resync))
    }

    fn response_to_ids(
        response: Vec<<Self::Response as OperationResponse>::Message>,
    ) -> Vec<String> {
        get_new_ews_ids_from_response(response)
    }
}

impl CopyMoveOperation for MoveItem {
    async fn queue_operation<ServerT: ServerType>(
        client: &XpComEwsClient<ServerT>,
        destination_folder_id: String,
        ids: Vec<String>,
    ) -> Result<(Self::Response, RequiresResync), XpComEwsError> {
        let op: Self = construct_request(client, destination_folder_id, ids);
        let requires_resync = if let Some(true) = op.inner.return_new_item_ids {
            RequiresResync::No
        } else {
            RequiresResync::Yes
        };

        let rcv = queue_operation!(client, MoveItem, op, Default::default());
        rcv.await?.map(|resp| (resp, requires_resync))
    }

    fn response_to_ids(
        response: Vec<<Self::Response as OperationResponse>::Message>,
    ) -> Vec<String> {
        get_new_ews_ids_from_response(response)
    }
}
