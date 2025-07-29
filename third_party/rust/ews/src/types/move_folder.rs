/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, FolderResponseMessage, MESSAGES_NS_URI};

/// A request to move one or more Exchange folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/movefolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(FolderResponseMessage)]
pub struct MoveFolder {
    pub to_folder_id: BaseFolderId,
    pub folder_ids: Vec<BaseFolderId>,
}

#[cfg(test)]
mod test {
    use crate::{
        move_folder::{MoveFolder, MoveFolderResponse},
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseFolderId, Folder, FolderId, FolderResponseMessage, Folders, ResponseClass,
        ResponseMessages,
    };

    #[test]
    fn test_serialize_move_folder() {
        let move_folder = MoveFolder {
            to_folder_id: BaseFolderId::DistinguishedFolderId {
                id: "junkemail".to_string(),
                change_key: None,
            },
            folder_ids: vec![BaseFolderId::FolderId {
                id: "AScAc".to_string(),
                change_key: None,
            }],
        };

        let expected = r#"<MoveFolder xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><ToFolderId><t:DistinguishedFolderId Id="junkemail"/></ToFolderId><FolderIds><t:FolderId Id="AScAc"/></FolderIds></MoveFolder>"#;

        assert_serialized_content(&move_folder, "MoveFolder", expected);
    }

    #[test]
    fn test_deserialize_move_folder_response() {
        let content = r#"<MoveFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                    xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                    xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                    <m:ResponseMessages>
                        <m:MoveFolderResponseMessage ResponseClass="Success">
                        <m:ResponseCode>NoError</m:ResponseCode>
                        <m:Folders>
                            <t:Folder>
                            <t:FolderId Id="AAAlAFV" ChangeKey="AQAAAB" />
                            </t:Folder>
                        </m:Folders>
                        </m:MoveFolderResponseMessage>
                    </m:ResponseMessages>
                    </MoveFolderResponse>"#;

        let response = MoveFolderResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(FolderResponseMessage {
                    folders: Folders {
                        inner: vec![Folder::Folder {
                            folder_id: Some(FolderId {
                                id: "AAAlAFV".to_string(),
                                change_key: Some("AQAAAB".to_string()),
                            }),
                            parent_folder_id: None,
                            folder_class: None,
                            display_name: None,
                            total_count: None,
                            child_folder_count: None,
                            extended_property: None,
                            unread_count: None,
                        }],
                    },
                })],
            },
        };

        assert_deserialized_content(content, response);
    }
}
