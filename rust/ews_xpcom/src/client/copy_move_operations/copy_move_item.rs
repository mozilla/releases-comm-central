/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    copy_item::CopyItem, move_item::MoveItem, server_version::ExchangeServerVersion, BaseItemId,
    CopyMoveItemData, ItemResponseMessage, Operation, OperationResponse,
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
    /// The `InputT` generic parameter indicates which EWS operation to perform
    /// based on its request input type. The trait bounds on `InputT` enforce
    /// the required available operations to be generic over copy or move
    /// operations.
    ///
    /// The `destination_folder_id` is the EWS ID of the destination folder for
    /// the move or copy operation. The `item_ids` parameter contains the
    /// collection of EWS item IDs to copy or move. The `callbacks` parameter
    /// contains the callbacks to execute upon success or failure.
    pub(crate) async fn copy_move_item<InputT>(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        destination_folder_id: String,
        item_ids: Vec<String>,
    ) where
        InputT: CopyMoveOperation + Wrapped,
        <InputT as Operation>::Response: OperationResponse<Message = ItemResponseMessage>,
        <InputT as Wrapped>::Wrapper:
            Wrapper<InputT> + From<CopyMoveItemData> + Into<CopyMoveItemData>,
        <InputT as Wrapped>::Wrapper: Wrapper<InputT> + Into<CopyMoveItemData>,
    {
        move_generic(
            self,
            listener,
            destination_folder_id,
            item_ids,
            construct_request::<InputT, <InputT as Wrapped>::Wrapper, ServerT>,
            get_new_ews_ids_from_response,
        )
        .await;
    }
}

fn construct_request<T, W, ServerT>(
    client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    item_ids: Vec<String>,
) -> T
where
    T: Operation + Clone,
    W: Wrapper<T> + From<CopyMoveItemData>,
    ServerT: RefCounted,
{
    let server_version = client.server_version.get();

    // `ReturnNewItemIds` was introduced in Exchange Server 2010 SP1.
    let return_new_item_ids = if server_version <= ExchangeServerVersion::Exchange2010 {
        None
    } else {
        Some(true)
    };

    W::from(CopyMoveItemData {
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
    })
    .unwrap()
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

// The newtypes and wrapping traits (and implementations) below are all to
// handle conversions between the wrapped ews-rs types and the ews-rs data types
// that are common to both move and copy operations. Rust does not allow us to
// implement traits when both the trait and the type that we're implementing the
// trait for come from an external crate, thereby disallowing us to implement
// the `From` trait for the ews-rs copy and move request and response types to
// convert between them and their common underlying data representations for
// both copy and move operations. We introduce this wrapping layer in order to
// handle those conversions within the bounds of this module.

#[derive(Debug, Clone)]
pub(crate) struct CopyItemWrapper(CopyItem);
#[derive(Debug, Clone)]
pub(crate) struct MoveItemWrapper(MoveItem);

pub(crate) trait Wrapped {
    type Wrapper;
}

pub(crate) trait Wrapper<T> {
    fn unwrap(self) -> T;
}

impl Wrapped for CopyItem {
    type Wrapper = CopyItemWrapper;
}

impl Wrapped for MoveItem {
    type Wrapper = MoveItemWrapper;
}

impl Wrapper<CopyItem> for CopyItemWrapper {
    fn unwrap(self) -> CopyItem {
        self.0
    }
}

impl Wrapper<MoveItem> for MoveItemWrapper {
    fn unwrap(self) -> MoveItem {
        self.0
    }
}

impl From<CopyMoveItemData> for CopyItemWrapper {
    fn from(value: CopyMoveItemData) -> Self {
        CopyItemWrapper(CopyItem { inner: value })
    }
}

impl From<CopyItemWrapper> for CopyMoveItemData {
    fn from(value: CopyItemWrapper) -> Self {
        value.0.inner
    }
}

impl From<CopyMoveItemData> for MoveItemWrapper {
    fn from(value: CopyMoveItemData) -> Self {
        MoveItemWrapper(MoveItem { inner: value })
    }
}

impl From<MoveItemWrapper> for CopyMoveItemData {
    fn from(value: MoveItemWrapper) -> Self {
        value.0.inner
    }
}
