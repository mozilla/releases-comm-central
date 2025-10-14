/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, MESSAGES_NS_URI};

/// A request to mark all items in a collection of folders as read.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/markallitemsasread>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(MarkAllItemsAsReadResponseMessage)]
pub struct MarkAllItemsAsRead {
    pub read_flag: bool,
    pub suppress_read_receipts: bool,
    pub folder_ids: Vec<BaseFolderId>,
}

/// The response to a `MarkAllItemsAsRead` request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/markallitemsasreadresponsemessage>
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct MarkAllItemsAsReadResponseMessage {}

#[cfg(test)]
mod test {
    use crate::{
        mark_all_read::{
            MarkAllItemsAsRead, MarkAllItemsAsReadResponse, MarkAllItemsAsReadResponseMessage,
        },
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseFolderId, ResponseClass, ResponseMessages,
    };

    #[test]
    fn test_serialize_mark_all_items_as_read() {
        let mark_all_items_as_read = MarkAllItemsAsRead {
            read_flag: true,
            suppress_read_receipts: true,
            folder_ids: vec![BaseFolderId::FolderId {
                id: "AAMkADEzOTExYZRAAA=".to_string(),
                change_key: Some("AQAAAAA3vA==".to_string()),
            }],
        };

        let expected = r#"<MarkAllItemsAsRead xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><ReadFlag>true</ReadFlag><SuppressReadReceipts>true</SuppressReadReceipts><FolderIds><t:FolderId Id="AAMkADEzOTExYZRAAA=" ChangeKey="AQAAAAA3vA=="/></FolderIds></MarkAllItemsAsRead>"#;

        assert_serialized_content(&mark_all_items_as_read, "MarkAllItemsAsRead", expected);
    }

    #[test]
    fn test_deserialize_mark_all_items_as_read_response() {
        let content = r#"<m:MarkAllItemsAsReadResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
            xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
                <m:ResponseMessages>
                    <m:MarkAllItemsAsReadResponseMessage ResponseClass="Success">
                        <m:ResponseCode>NoError</m:ResponseCode>
                    </m:MarkAllItemsAsReadResponseMessage>
                </m:ResponseMessages>
            </m:MarkAllItemsAsReadResponse>"#;

        let response = MarkAllItemsAsReadResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(
                    MarkAllItemsAsReadResponseMessage {},
                )],
            },
        };

        assert_deserialized_content(content, response);
    }
}
