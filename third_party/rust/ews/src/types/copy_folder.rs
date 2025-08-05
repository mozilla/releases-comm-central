/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use xml_struct::XmlSerialize;

use crate::{CopyMoveFolderData, FolderResponseMessage, MESSAGES_NS_URI};

/// A request to copy one or more Exchange folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/copyfolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(FolderResponseMessage)]
pub struct CopyFolder {
    #[xml_struct(flatten)]
    pub inner: CopyMoveFolderData,
}

#[cfg(test)]
mod test {
    use crate::{
        copy_folder::{CopyFolder, CopyFolderResponse},
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseFolderId, CopyMoveFolderData, Folder, FolderId, FolderResponseMessage, Folders,
        ResponseClass,
    };

    #[test]
    fn test_serialize_copy_folder() {
        let copy_folder = CopyFolder {
            inner: CopyMoveFolderData {
                to_folder_id: BaseFolderId::DistinguishedFolderId {
                    id: "inbox".to_string(),
                    change_key: None,
                },
                folder_ids: vec![
                    BaseFolderId::FolderId {
                        id: "AS4A=".to_string(),
                        change_key: Some("fsVU4==".to_string()),
                    },
                    BaseFolderId::FolderId {
                        id: "AS4AU=".to_string(),
                        change_key: Some("fsVU4o==".to_string()),
                    },
                ],
            },
        };

        let expected = r#"<CopyFolder xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><ToFolderId><t:DistinguishedFolderId Id="inbox"/></ToFolderId><FolderIds><t:FolderId Id="AS4A=" ChangeKey="fsVU4=="/><t:FolderId Id="AS4AU=" ChangeKey="fsVU4o=="/></FolderIds></CopyFolder>"#;

        assert_serialized_content(&copy_folder, "CopyFolder", expected);
    }

    #[test]
    fn test_deserialize_copy_folder_response() {
        let content = r#"<CopyFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" 
                        xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                        <m:ResponseMessages>
                            <m:CopyFolderResponseMessage ResponseClass="Success">
                            <m:ResponseCode>NoError</m:ResponseCode>
                            <m:Folders>
                                <t:Folder>
                                <t:FolderId Id="AS4AUn=" ChangeKey="fsVU4o==" />
                                </t:Folder>
                            </m:Folders>
                            </m:CopyFolderResponseMessage>
                        </m:ResponseMessages>
                        </CopyFolderResponse>"#;

        let response = CopyFolderResponse {
            response_messages: crate::ResponseMessages {
                response_messages: vec![ResponseClass::Success(FolderResponseMessage {
                    folders: Folders {
                        inner: vec![Folder::Folder {
                            folder_id: Some(FolderId {
                                id: "AS4AUn=".to_string(),
                                change_key: Some("fsVU4o==".to_string()),
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
