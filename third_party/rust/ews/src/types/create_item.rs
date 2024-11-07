/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseFolderId, Items, MessageDisposition, Operation,
    OperationResponse, RealItem, ResponseClass, ResponseCode, MESSAGES_NS_URI,
};

/// A request to create (and optionally send) one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct CreateItem {
    /// The action the Exchange server will take upon creating this item.
    ///
    /// This field is required for and only applicable to [`Message`] items.
    ///
    /// [`Message`]: `crate::Message`
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem#messagedisposition-attribute>
    #[xml_struct(attribute)]
    pub message_disposition: Option<MessageDisposition>,

    /// The folder in which to store an item once it has been created.
    ///
    /// This is ignored if `message_disposition` is [`SendOnly`].
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/saveditemfolderid>
    ///
    /// [`SendOnly`]: `MessageDisposition::SendOnly`
    pub saved_item_folder_id: Option<BaseFolderId>,

    /// The item or items to create.
    pub items: Vec<RealItem>,
}

impl Operation for CreateItem {
    type Response = CreateItemResponse;
}

impl EnvelopeBodyContents for CreateItem {
    fn name() -> &'static str {
        "CreateItem"
    }
}

/// A response to a [`CreateItem`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitemresponse>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateItemResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for CreateItemResponse {}

impl EnvelopeBodyContents for CreateItemResponse {
    fn name() -> &'static str {
        "CreateItemResponse"
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub create_item_response_message: Vec<CreateItemResponseMessage>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateItemResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    pub response_code: Option<ResponseCode>,

    pub message_text: Option<String>,

    pub items: Items,
}
