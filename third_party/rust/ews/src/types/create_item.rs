/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, ItemResponseMessage, MessageDisposition, RealItem, MESSAGES_NS_URI};

/// A request to create (and optionally send) one or more Exchange items.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(ItemResponseMessage)]
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

#[cfg(test)]
mod test {
    use crate::{
        test_utils::assert_deserialized_content, types::common::ItemResponseMessage, Items,
        ResponseClass, ResponseMessages,
    };

    use super::CreateItemResponse;

    #[test]
    fn test_deserialize_create_item_response() {
        let content = r#"<CreateItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                        xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                    <m:ResponseMessages>
                        <m:CreateItemResponseMessage ResponseClass="Success">
                        <m:ResponseCode>NoError</m:ResponseCode>
                        <m:Items />
                        </m:CreateItemResponseMessage>
                    </m:ResponseMessages>
                    </CreateItemResponse>"#;

        let expected = CreateItemResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(ItemResponseMessage {
                    items: Items { inner: vec![] },
                })],
            },
        };

        assert_deserialized_content(content, expected);
    }
}
