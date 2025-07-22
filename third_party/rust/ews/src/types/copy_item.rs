/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, CopyMoveItemData, ItemResponseMessage, Operation,
    OperationResponse, ResponseClass, MESSAGES_NS_URI,
};

/// A request to copy one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/copyitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct CopyItem {
    #[xml_struct(flatten)]
    pub inner: CopyMoveItemData,
}

/// A response to a `CopyItem` operation.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/copyitemresponse>
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct CopyItemResponse {
    pub response_messages: CopyItemResponseMessages,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct CopyItemResponseMessages {
    pub copy_item_response_message: Vec<ResponseClass<ItemResponseMessage>>,
}

impl Operation for CopyItem {
    type Response = CopyItemResponse;
}

impl EnvelopeBodyContents for CopyItem {
    fn name() -> &'static str {
        "CopyItem"
    }
}

impl OperationResponse for CopyItemResponse {}

impl EnvelopeBodyContents for CopyItemResponse {
    fn name() -> &'static str {
        "CopyItemResponse"
    }
}

#[cfg(test)]
mod test {
    use crate::{
        copy_item::{CopyItem, CopyItemResponse, CopyItemResponseMessages},
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseFolderId, BaseItemId, CopyMoveItemData, ItemId, ItemResponseMessage, Items, Message,
        RealItem, ResponseClass,
    };

    #[test]
    fn test_serialize_copy_item() {
        let request = CopyItem {
            inner: CopyMoveItemData {
                to_folder_id: BaseFolderId::DistinguishedFolderId {
                    id: "inbox".to_string(),
                    change_key: None,
                },
                item_ids: vec![BaseItemId::ItemId {
                    id: "AS4AUnV=".to_string(),
                    change_key: None,
                }],
                return_new_item_ids: None,
            },
        };

        let expected = r#"<CopyItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><ToFolderId><t:DistinguishedFolderId Id="inbox"/></ToFolderId><ItemIds><t:ItemId Id="AS4AUnV="/></ItemIds></CopyItem>"#;

        assert_serialized_content(&request, "CopyItem", expected);
    }

    #[test]
    fn test_deserialize_copy_item_response() {
        let content = r#"<CopyItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                      xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                      xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                        <m:ResponseMessages>
                        <m:CopyItemResponseMessage ResponseClass="Success">
                            <m:ResponseCode>NoError</m:ResponseCode>
                            <m:Items>
                                <t:Message>
                                    <t:ItemId Id="AAMkAd" ChangeKey="FwAAABY" />
                                </t:Message>
                            </m:Items>
                        </m:CopyItemResponseMessage>
                        </m:ResponseMessages>
                    </CopyItemResponse>"#;

        let expected = CopyItemResponse {
            response_messages: CopyItemResponseMessages {
                copy_item_response_message: vec![ResponseClass::Success(ItemResponseMessage {
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

        assert_deserialized_content(content, expected);
    }
}
