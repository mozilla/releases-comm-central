use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, Groups, ItemShape, Items, View, MESSAGES_NS_URI};

/// Defines a request to find items in mailbox.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/finditem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(FindItemResponseMessage)]
pub struct FindItem {
    #[xml_struct(attribute)]
    pub traversal: Traversal,

    pub item_shape: ItemShape,

    #[xml_struct(flatten)]
    pub view: Option<View>,

    pub parent_folder_ids: Vec<BaseFolderId>,
}

/// Defines whether the search finds items in folders or the folders' dumpsters.
/// This attribute is required.
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum Traversal {
    /// Returns only the identities of items in the folder.
    Shallow,

    /// Returns only the identities of items that are in a folder's dumpster.
    /// Note that a soft-deleted traversal combined with a search restriction
    /// will result in zero items returned even if there are items that match the search criteria.
    SoftDeleted,

    ///Returns only the identities of associated items in the folder.
    Associated,
}

/// Contains the status and result of a single [`FindItem`] operation request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/finditemresponsemessage>
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct FindItemResponseMessage {
    pub root_folder: RootFolder,
}

/// The `RootFolder` element of a `FindItemResponseMessage`
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/rootfolder-finditemresponsemessage>
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct RootFolder {
    /// Represents the next index that should be used for the next request when using an indexed paging view.
    #[serde(rename = "@IndexedPagingOffset")]
    pub indexed_paging_offset: Option<usize>,

    /// Represents the new numerator value to use for the next request when using fraction page views.
    #[serde(rename = "@NumeratorOffset")]
    pub numerator_offset: Option<usize>,

    /// Represents the next denominator to use for the next request when doing fractional paging.
    #[serde(rename = "@AbsoluteDenominator")]
    pub absolute_denominator: Option<usize>,

    /// Indicates whether the current results contain the last item in the query, such that further paging is not needed.
    #[serde(rename = "@TotalItemsInView")]
    pub total_items_in_view: Option<usize>,

    /// Represents the total number of items that pass the restriction. In a grouped `FindItem` operation,
    /// the `TotalItemsInView` attribute returns the total number of items in the view plus the total number of groups.
    #[serde(rename = "@IncludesLastItemInRange")]
    pub includes_last_item_in_range: Option<bool>,

    pub items: Items,

    pub groups: Option<Groups>,
}

#[cfg(test)]
mod tests {
    use crate::{
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BasePoint, BaseShape, Groups, ItemId, Items, Message, RealItem, ResponseClass,
        ResponseMessages,
    };

    use super::*;

    #[test]
    fn test_serialize_find_item_indexed_page_item_view() {
        let find_item = FindItem {
            traversal: Traversal::Shallow,
            item_shape: ItemShape {
                base_shape: BaseShape::IdOnly,
                include_mime_content: None,
                additional_properties: None,
            },
            parent_folder_ids: vec![BaseFolderId::DistinguishedFolderId {
                id: "deleteditems".to_string(),
                change_key: None,
            }],
            view: Some(View::IndexedPageItemView {
                max_entries_returned: Some(6),
                offset: 0,
                base_point: BasePoint::Beginning,
            }),
        };

        let expected = r#"<FindItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" Traversal="Shallow"><ItemShape><t:BaseShape>IdOnly</t:BaseShape></ItemShape><IndexedPageItemView MaxEntriesReturned="6" BasePoint="Beginning" Offset="0"/><ParentFolderIds><t:DistinguishedFolderId Id="deleteditems"/></ParentFolderIds></FindItem>"#;

        assert_serialized_content(&find_item, "FindItem", expected);
    }

    #[test]
    fn test_serialize_find_item_fractional_page_item_view() {
        let finditem = FindItem {
            traversal: Traversal::Shallow,
            item_shape: ItemShape {
                base_shape: BaseShape::IdOnly,
                include_mime_content: None,
                additional_properties: None,
            },
            parent_folder_ids: vec![BaseFolderId::DistinguishedFolderId {
                id: "inbox".to_string(),
                change_key: None,
            }],
            view: Some(View::FractionalPageItemView {
                max_entries_returned: Some(12),
                numerator: 2,
                denominator: 3,
            }),
        };

        let expected = r#"<FindItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" Traversal="Shallow"><ItemShape><t:BaseShape>IdOnly</t:BaseShape></ItemShape><FractionalPageItemView MaxEntriesReturned="12" Numerator="2" Denominator="3"/><ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></ParentFolderIds></FindItem>"#;
        assert_serialized_content(&finditem, "FindItem", expected);
    }

    #[test]
    fn test_serialize_find_item_calendar_view() {
        let finditem = FindItem {
            traversal: Traversal::Shallow,
            item_shape: ItemShape {
                base_shape: BaseShape::IdOnly,
                include_mime_content: None,
                additional_properties: None,
            },
            parent_folder_ids: vec![BaseFolderId::DistinguishedFolderId {
                id: "calendar".to_string(),
                change_key: None,
            }],
            view: Some(View::CalendarView {
                max_entries_returned: Some(2),
                start_date: "2006-05-18T00:00:00-08:00".to_string(),
                end_date: "2006-05-19T00:00:00-08:00".to_string(),
            }),
        };

        let expected = r#"<FindItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" Traversal="Shallow"><ItemShape><t:BaseShape>IdOnly</t:BaseShape></ItemShape><CalendarView MaxEntriesReturned="2" StartDate="2006-05-18T00:00:00-08:00" EndDate="2006-05-19T00:00:00-08:00"/><ParentFolderIds><t:DistinguishedFolderId Id="calendar"/></ParentFolderIds></FindItem>"#;

        assert_serialized_content(&finditem, "FindItem", expected);
    }

    #[test]
    fn test_serialize_find_item_contacts_view() {
        let finditem = FindItem {
            traversal: Traversal::Shallow,
            item_shape: ItemShape {
                base_shape: BaseShape::IdOnly,
                include_mime_content: None,
                additional_properties: None,
            },
            parent_folder_ids: vec![BaseFolderId::DistinguishedFolderId {
                id: "contacts".to_string(),
                change_key: None,
            }],
            view: Some(View::ContactsView {
                max_entries_returned: Some(3),
                initial_name: Some("Kelly Rollin".to_string()),
                final_name: None,
            }),
        };

        let expected = r#"<FindItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" Traversal="Shallow"><ItemShape><t:BaseShape>IdOnly</t:BaseShape></ItemShape><ContactsView MaxEntriesReturned="3" InitialName="Kelly Rollin"/><ParentFolderIds><t:DistinguishedFolderId Id="contacts"/></ParentFolderIds></FindItem>"#;

        assert_serialized_content(&finditem, "FindItem", expected);
    }

    #[test]
    fn test_deserialize_root_folder() {
        let xml = r#"
                    <m:RootFolder IndexedPagingOffset="1" NumeratorOffset="1" AbsoluteDenominator="1" IncludesLastItemInRange="true" TotalItemsInView="10">
                        <Items/>
                    </m:RootFolder>"#;
        let expected = RootFolder {
            indexed_paging_offset: Some(1),
            numerator_offset: Some(1),
            absolute_denominator: Some(1),
            total_items_in_view: Some(10),
            includes_last_item_in_range: Some(true),
            items: Items { inner: vec![] },
            groups: None,
        };

        assert_deserialized_content(xml, expected);
    }

    #[test]
    fn test_deserialize_find_item_response_message() {
        let content = r#"
                    <FindItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                        xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                        <m:ResponseMessages>
                            <m:FindItemResponseMessage ResponseClass="Success">
                            <m:ResponseCode>NoError</m:ResponseCode>
                            <m:RootFolder IncludesLastItemInRange="true" TotalItemsInView="10">
                                <Items>
                                    <t:Message>
                                        <t:ItemId Id="AS4AUn=" ChangeKey="fsVU4==" />
                                    </t:Message>
                               </Items>
                               <Groups/>
                            </m:RootFolder>
                            </m:FindItemResponseMessage>
                        </m:ResponseMessages>
                    </FindItemResponse>"#;

        let response = FindItemResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(FindItemResponseMessage {
                    root_folder: RootFolder {
                        indexed_paging_offset: None,
                        numerator_offset: None,
                        absolute_denominator: None,
                        total_items_in_view: Some(10),
                        includes_last_item_in_range: Some(true),
                        items: Items {
                            inner: vec![RealItem::Message(Message {
                                item_id: Some(ItemId {
                                    id: "AS4AUn=".to_string(),
                                    change_key: Some("fsVU4==".to_string()),
                                }),
                                ..Default::default()
                            })],
                        },

                        groups: Some(Groups { inner: vec![] }),
                    },
                })],
            },
        };

        assert_deserialized_content(content, response);
    }
}
