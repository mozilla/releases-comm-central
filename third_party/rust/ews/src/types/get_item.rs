/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseItemId, ItemShape, Items, Operation,
    OperationResponse, ResponseClass, ResponseCode, MESSAGES_NS_URI,
};

/// A request for the properties of one or more Exchange items, e.g. messages,
/// calendar events, or contacts.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getitem>
#[derive(Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct GetItem {
    /// A description of the information to be included in the response for each
    /// item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemshape>
    pub item_shape: ItemShape,

    /// The Exchange identifiers of the items which should be fetched.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemids>
    pub item_ids: Vec<BaseItemId>,
}

impl Operation for GetItem {
    type Response = GetItemResponse;
}

impl EnvelopeBodyContents for GetItem {
    fn name() -> &'static str {
        "GetItem"
    }
}

/// A response to a [`GetItem`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getitemresponse>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetItemResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for GetItemResponse {}

impl EnvelopeBodyContents for GetItemResponse {
    fn name() -> &'static str {
        "GetItemResponse"
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub get_item_response_message: Vec<GetItemResponseMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetItemResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    pub response_code: Option<ResponseCode>,

    pub message_text: Option<String>,

    pub items: Items,
}
