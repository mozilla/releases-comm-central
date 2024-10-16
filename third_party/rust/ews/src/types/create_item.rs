/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, ArrayOfRecipients, BaseFolderId, ExtendedFieldURI, Items,
    MimeContent, Operation, OperationResponse, ResponseClass, ResponseCode, MESSAGES_NS_URI,
};

/// The action an Exchange server will take upon creating a `Message` item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem#messagedisposition-attribute>
#[derive(Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum MessageDisposition {
    SaveOnly,
    SendOnly,
    SendAndSaveCopy,
}

/// A request to create (and optionally send) one or more Exchange item(s).
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem>
#[derive(Debug, XmlSerialize)]
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
    pub message_disposition: MessageDisposition,

    /// The folder in which to store an item once it has been created.
    ///
    /// This is ignored if `message_disposition` is [`SendOnly`].
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/saveditemfolderid>
    ///
    /// [`SendOnly`]: [`MessageDisposition::SendOnly`]
    pub saved_item_folder_id: Option<BaseFolderId>,

    /// The item or items to create.
    pub items: Vec<Item>,
}

/// A new item that appears in a CreateItem request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/items>
// N.B.: Commented-out variants are not yet implemented.
#[non_exhaustive]
#[derive(Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum Item {
    // Item(Item),
    Message(Message),
    // CalendarItem(CalendarItem),
    // Contact(Contact),
    // Task(Task),
    // MeetingMessage(MeetingMessage),
    // MeetingRequest(MeetingRequest),
    // MeetingResponse(MeetingResponse),
    // MeetingCancellation(MeetingCancellation),
}

/// An email message to create.
///
/// This struct follows the same specification to [`common::Message`], but has a
/// few differences that allow the creation of new messages without forcing any
/// tradeoff on strictness when deserializing; for example not making the item
/// ID a required field.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/message-ex15websvcsotherref>
///
/// [`common::message`]: crate::Message
#[derive(Debug, Default, XmlSerialize)]
pub struct Message {
    /// The MIME content of the item.
    #[xml_struct(ns_prefix = "t")]
    pub mime_content: Option<MimeContent>,

    // Whether to request a delivery receipt.
    #[xml_struct(ns_prefix = "t")]
    pub is_delivery_receipt_requested: Option<bool>,

    // The message ID for the message, semantically identical to the Message-ID
    // header.
    #[xml_struct(ns_prefix = "t")]
    pub internet_message_id: Option<String>,

    // Recipients to include as Bcc, who won't be included in the MIME content.
    #[xml_struct(ns_prefix = "t")]
    pub bcc_recipients: Option<ArrayOfRecipients>,

    // Extended MAPI properties to set on the message.
    #[xml_struct(ns_prefix = "t")]
    pub extended_property: Option<Vec<ExtendedProperty>>,
}

/// An extended MAPI property to set on the message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedproperty>
#[allow(non_snake_case)]
#[derive(Debug, XmlSerialize)]
pub struct ExtendedProperty {
    #[xml_struct(ns_prefix = "t")]
    pub extended_field_URI: ExtendedFieldURI,

    #[xml_struct(ns_prefix = "t")]
    pub value: String,
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
#[derive(Debug, Deserialize)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub create_item_response_message: Vec<CreateItemResponseMessage>,
}

#[derive(Debug, Deserialize)]
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
