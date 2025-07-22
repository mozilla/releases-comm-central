/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::CopyMoveItemData;

use super::{
    sealed::EnvelopeBodyContents, ItemResponseMessage, Operation, OperationResponse, ResponseClass,
    MESSAGES_NS_URI,
};

/// A request to move one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/moveitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct MoveItem {
    #[xml_struct(flatten)]
    pub inner: CopyMoveItemData,
}

/// A response to a `MoveItem` operation.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/moveitemresponse>
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct MoveItemResponse {
    pub response_messages: MoveItemResponseMessages,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct MoveItemResponseMessages {
    pub move_item_response_message: Vec<ResponseClass<ItemResponseMessage>>,
}

impl Operation for MoveItem {
    type Response = MoveItemResponse;
}

impl EnvelopeBodyContents for MoveItem {
    fn name() -> &'static str {
        "MoveItem"
    }
}

impl OperationResponse for MoveItemResponse {}

impl EnvelopeBodyContents for MoveItemResponse {
    fn name() -> &'static str {
        "MoveItemResponse"
    }
}

#[cfg(test)]
mod test {
    use crate::{
        test_utils::{assert_deserialized_content, assert_serialized_content},
        types::common::ItemResponseMessage,
        BaseFolderId, BaseItemId, CopyMoveItemData, ItemId, Items, Message, RealItem,
        ResponseClass,
    };

    use super::{MoveItem, MoveItemResponse, MoveItemResponseMessages};

    #[test]
    fn test_serialize_move_item() {
        let move_item = MoveItem {
            inner: CopyMoveItemData {
                to_folder_id: BaseFolderId::DistinguishedFolderId {
                    id: "drafts".to_string(),
                    change_key: None,
                },
                item_ids: vec![BaseItemId::ItemId {
                    id: "AAAtAEF/swbAAA=".to_string(),
                    change_key: Some("EwAAABYA/s4b".to_string()),
                }],
                return_new_item_ids: None,
            },
        };

        let expected = r#"<MoveItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><ToFolderId><t:DistinguishedFolderId Id="drafts"/></ToFolderId><ItemIds><t:ItemId Id="AAAtAEF/swbAAA=" ChangeKey="EwAAABYA/s4b"/></ItemIds></MoveItem>"#;

        assert_serialized_content(&move_item, "MoveItem", expected);
    }

    #[test]
    fn test_deserialize_move_item_response() {
        let content = r#"<MoveItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                    xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                    xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                    <m:ResponseMessages>
                    <m:MoveItemResponseMessage ResponseClass="Success">
                    <m:ResponseCode>NoError</m:ResponseCode>
                    <m:Items>
                        <t:Message>
                        <t:ItemId Id="AAMkAd" ChangeKey="FwAAABY" />
                        </t:Message>
                    </m:Items>
                    </m:MoveItemResponseMessage>
                </m:ResponseMessages>
            </MoveItemResponse>"#;

        let response = MoveItemResponse {
            response_messages: MoveItemResponseMessages {
                move_item_response_message: vec![ResponseClass::Success(ItemResponseMessage {
                    items: Items {
                        inner: vec![RealItem::Message(Message {
                            item_id: Some(ItemId {
                                id: "AAMkAd".to_string(),
                                change_key: Some("FwAAABY".to_string()),
                            }),
                            ..Default::default()
                        })],
                    },
                })],
            },
        };

        assert_deserialized_content(content, response);
    }
}
