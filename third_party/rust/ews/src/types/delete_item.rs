/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::types::sealed::EnvelopeBodyContents;
use crate::{
    BaseItemId, DeleteType, Operation, OperationResponse, ResponseClass, ResponseCode,
    MESSAGES_NS_URI,
};

/// Whether to send meeting cancellations when deleting a calendar item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem#sendmeetingcancellations-attribute>
#[derive(Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum SendMeetingCancellations {
    SendToNone,
    SendOnlyToAll,
    SendToAllAndSaveCopy,
}

/// Which tasks should be impacted when deleting a task item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem#affectedtaskoccurrences-attribute>
#[derive(Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum AffectedTaskOccurrences {
    AllOccurrences,
    SpecifiedOccurrenceOnly,
}

/// A request to delete one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem>
#[derive(Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct DeleteItem {
    /// The method the EWS server will use to perform the deletion.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem#deletetype-attribute>
    #[xml_struct(attribute)]
    pub delete_type: DeleteType,

    /// The action the EWS server will take when deleting a calendar item.
    ///
    /// Required when deleting calendar items, otherwise it has no effect.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem#sendmeetingcancellations-attribute>
    #[xml_struct(attribute)]
    pub send_meeting_cancellations: Option<SendMeetingCancellations>,

    /// The task item(s) to delete.
    ///
    /// Required when deleting task items, otherwise it has no effect.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem#affectedtaskoccurrences-attribute>
    #[xml_struct(attribute)]
    pub affected_task_occurrences: Option<AffectedTaskOccurrences>,

    /// Whether to suppress read receipts for the deleted item(s).
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitem#attributes>
    #[xml_struct(attribute)]
    pub suppress_read_receipts: Option<bool>,

    /// A list of items to delete.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemids>
    pub item_ids: Vec<BaseItemId>,
}

impl Operation for DeleteItem {
    type Response = DeleteItemResponse;
}

impl EnvelopeBodyContents for DeleteItem {
    fn name() -> &'static str {
        "DeleteItem"
    }
}

/// A response to a [`DeleteItem`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deleteitemresponse>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteItemResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for DeleteItemResponse {}

impl EnvelopeBodyContents for DeleteItemResponse {
    fn name() -> &'static str {
        "DeleteItemResponse"
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub delete_item_response_message: Vec<DeleteItemResponseMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteItemResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    pub response_code: Option<ResponseCode>,

    pub message_text: Option<String>,
}
