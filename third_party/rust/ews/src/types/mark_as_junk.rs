/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseItemId, ItemId, MESSAGES_NS_URI};

/// A request to mark an item as junk on the server.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/markasjunk>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(MarkAsJunkResponseMessage)]
pub struct MarkAsJunk {
    #[xml_struct(attribute)]
    pub is_junk: bool,

    #[xml_struct(attribute)]
    pub move_item: bool,

    pub item_ids: Vec<BaseItemId>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct MarkAsJunkResponseMessage {
    pub moved_item_id: ItemId,
}

#[cfg(test)]
mod test {
    use std::vec;

    use crate::{
        mark_as_junk::{MarkAsJunk, MarkAsJunkResponse, MarkAsJunkResponseMessage},
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseItemId, ItemId, ResponseClass, ResponseMessages,
    };

    #[test]
    fn test_serialize_mark_as_junk() {
        let mark_as_junk = MarkAsJunk {
            is_junk: true,
            move_item: true,
            item_ids: vec![BaseItemId::ItemId {
                id: "AAMkAD=".to_string(),
                change_key: Some("CQAAABYA".to_string()),
            }],
        };

        let expected = r#"<MarkAsJunk xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" IsJunk="true" MoveItem="true"><ItemIds><t:ItemId Id="AAMkAD=" ChangeKey="CQAAABYA"/></ItemIds></MarkAsJunk>"#;

        assert_serialized_content(&mark_as_junk, "MarkAsJunk", expected);
    }

    #[test]
    fn test_deserialize_mark_as_junk_response() {
        let content = r#"<m:MarkAsJunkResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
            xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
            <m:ResponseMessages>
                <m:MarkAsJunkResponseMessage ResponseClass="Success">
                    <m:ResponseCode>NoError</m:ResponseCode>
                    <m:MovedItemId Id="AAMkAD=" ChangeKey="CQAAABYu" />
                </m:MarkAsJunkResponseMessage>
            </m:ResponseMessages>
            </m:MarkAsJunkResponse>"#;

        let response = MarkAsJunkResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(MarkAsJunkResponseMessage {
                    moved_item_id: ItemId {
                        id: "AAMkAD=".to_string(),
                        change_key: Some("CQAAABYu".to_string()),
                    },
                })],
            },
        };

        assert_deserialized_content(content, response);
    }
}
