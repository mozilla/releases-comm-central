/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use xml_struct::XmlSerialize;

use crate::{CopyMoveItemData, ItemResponseMessage, MESSAGES_NS_URI};

/// A request to copy one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/copyitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(ItemResponseMessage)]
pub struct CopyItem {
    #[xml_struct(flatten)]
    pub inner: CopyMoveItemData,
}

#[cfg(test)]
mod test {
    use crate::{
        copy_item::{CopyItem, CopyItemResponse},
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseFolderId, BaseItemId, CopyMoveItemData, ItemId, ItemResponseMessage, Items, Message,
        RealItem, ResponseClass, ResponseMessages,
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
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(ItemResponseMessage {
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
