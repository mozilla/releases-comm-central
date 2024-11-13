/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::types::common::{BaseItemId, Message, MessageDisposition, PathToElement};
use crate::{
    types::sealed::EnvelopeBodyContents, Items, Operation, OperationResponse, ResponseClass,
    ResponseCode, MESSAGES_NS_URI,
};
use serde::Deserialize;
use xml_struct::XmlSerialize;

/// A request to update properties of one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct UpdateItem {
    /// The action the Exchange server will take upon updating this item.
    ///
    /// This field is required for and only applicable to [`Message`] items.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem#messagedisposition-attribute>
    #[xml_struct(attribute)]
    pub message_disposition: MessageDisposition,

    /// The method the Exchange server will use to resolve conflicts between
    /// updates.
    ///
    /// If omitted, the server will default to [`AutoResolve`].
    ///
    /// [`AutoResolve`]: `ConflictResolution::AutoResolve`
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem#conflictresolution-attribute>
    #[xml_struct(attribute)]
    pub conflict_resolution: Option<ConflictResolution>,

    /// A list of items and their corresponding updates.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemchanges>
    pub item_changes: Vec<ItemChange>,
}

impl Operation for UpdateItem {
    type Response = UpdateItemResponse;
}

impl EnvelopeBodyContents for UpdateItem {
    fn name() -> &'static str {
        "UpdateItem"
    }
}

/// A response to an [`UpdateItem`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitemresponse>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct UpdateItemResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for UpdateItemResponse {}

impl EnvelopeBodyContents for UpdateItemResponse {
    fn name() -> &'static str {
        "UpdateItemResponse"
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub update_item_response_message: Vec<UpdateItemResponseMessage>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct UpdateItemResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    pub response_code: Option<ResponseCode>,

    pub message_text: Option<String>,

    pub items: Items,
}

/// The method used by the Exchange server to resolve conflicts between item
/// updates.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem#conflictresolution-attribute>
#[derive(Clone, Copy, Debug, Default, XmlSerialize)]
#[xml_struct(text)]
pub enum ConflictResolution {
    /// Conflicts will cause the update to fail and return an error.
    NeverOverwrite,

    /// The Exchange server will attempt to resolve any conflicts automatically.
    #[default]
    AutoResolve,

    /// Conflicting fields will be overwritten with the contents of the update.
    AlwaysOverwrite,
}

#[derive(Clone, Debug, XmlSerialize)]
pub struct ItemChange {
    #[xml_struct(ns_prefix = "t")]
    pub item_change: ItemChangeInner,
}

/// One or more updates to a single item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemchange>
#[derive(Clone, Debug, XmlSerialize)]
pub struct ItemChangeInner {
    /// The ID of the item to be updated.
    #[xml_struct(flatten, ns_prefix = "t")]
    pub item_id: BaseItemId,

    /// The changes to make to the item, including appending, setting, or
    /// deleting fields.
    #[xml_struct(ns_prefix = "t")]
    pub updates: Updates,
}

/// A list of changes to fields, with each element representing a single change.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updates-item>
#[derive(Clone, Debug, XmlSerialize)]
pub struct Updates {
    #[xml_struct(flatten, ns_prefix = "t")]
    pub inner: Vec<ItemChangeDescription>,
}

/// An individual change to a single field.
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum ItemChangeDescription {
    /// An update setting the value of a single field.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/setitemfield>
    SetItemField {
        /// The field to be updated.
        #[xml_struct(flatten, ns_prefix = "t")]
        field_uri: PathToElement,

        /// The new value of the specified field.
        #[xml_struct(ns_prefix = "t")]
        message: Message,
    },
}
