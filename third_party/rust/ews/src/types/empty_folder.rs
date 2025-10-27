/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, DeleteType, MESSAGES_NS_URI};

/// A request to empty one or more folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/emptyfolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(EmptyFolderResponseMessage)]
pub struct EmptyFolder {
    /// The method the EWS server will use to perform deletions.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/emptyfolder#deletetype-attribute>
    #[xml_struct(attribute)]
    pub delete_type: DeleteType,

    /// Whether subfolders should be deleted as part of the operation.
    #[xml_struct(attribute)]
    pub delete_sub_folders: bool,

    /// A list of folders to empty.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderids>
    pub folder_ids: Vec<BaseFolderId>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct EmptyFolderResponseMessage {}

#[cfg(test)]
mod test {
    use crate::{
        empty_folder::{EmptyFolder, EmptyFolderResponse, EmptyFolderResponseMessage},
        test_utils::{assert_deserialized_content, assert_serialized_content},
        BaseFolderId, DeleteType, ResponseClass, ResponseMessages,
    };

    #[test]
    fn test_serialize_empty_folder() {
        let empty_folder = EmptyFolder {
            delete_type: DeleteType::HardDelete,
            delete_sub_folders: true,
            folder_ids: vec![BaseFolderId::FolderId {
                id: "AAMkADEzOTExYZRAAA=".to_string(),
                change_key: Some("AQAAAAA3vA==".to_string()),
            }],
        };

        let expected = r#"<EmptyFolder xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" DeleteType="HardDelete" DeleteSubFolders="true"><FolderIds><t:FolderId Id="AAMkADEzOTExYZRAAA=" ChangeKey="AQAAAAA3vA=="/></FolderIds></EmptyFolder>"#;

        assert_serialized_content(&empty_folder, "EmptyFolder", expected);
    }

    #[test]
    fn test_deserialize_empty_folder_response() {
        let content = r#"<m:EmptyFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
            xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
                <m:ResponseMessages>
                  <m:EmptyFolderResponseMessage ResponseClass="Success">
                    <m:ResponseCode>NoError</m:ResponseCode>
                  </m:EmptyFolderResponseMessage>
                </m:ResponseMessages>
              </m:EmptyFolderResponse>"#;

        let response = EmptyFolderResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(EmptyFolderResponseMessage {})],
            },
        };

        assert_deserialized_content(content, response);
    }
}
