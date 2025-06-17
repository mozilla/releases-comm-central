/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseFolderId, Operation, OperationResponse, ResponseClass,
    ResponseCode, MESSAGES_NS_URI,
};

use super::{Folder, Folders, PathToElement};

/// The unique identifier of an update to be performed on a folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updates-folder>
#[derive(Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum Updates {
    /// Not implemented in EWS (as per the documentation page for this element), but still an option
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/appendtofolderfield>
    AppendToFolderField,

    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/setfolderfield>
    #[allow(non_snake_case)]
    SetFolderField {
        #[xml_struct(ns_prefix = "t", flatten)]
        field_URI: PathToElement,
        #[xml_struct(ns_prefix = "t", flatten)]
        folder: Folder,
    },

    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deletefolderfield>
    #[allow(non_snake_case)]
    DeleteFolderField {
        #[xml_struct(flatten, ns_prefix = "t")]
        field_URI: PathToElement,
    },
}

#[derive(Debug, XmlSerialize)]
pub struct FolderChanges {
    #[xml_struct(ns_prefix = "t")]
    pub folder_change: FolderChange,
}

/// A collection of changes to be performed on a folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderchange>.
#[derive(Debug, XmlSerialize)]
pub struct FolderChange {
    /// The folder to be updated.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderid>.
    #[xml_struct(flatten, ns_prefix = "t")]
    pub folder_id: BaseFolderId,

    /// The update to be performed on the folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updates-folder>.
    #[xml_struct(ns_prefix = "t")]
    pub updates: Updates,
}

/// An operation to update a given property of a specified folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updatefolder>.
#[derive(Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct UpdateFolder {
    pub folder_changes: FolderChanges,
}

impl Operation for UpdateFolder {
    type Response = UpdateFolderResponse;
}

impl EnvelopeBodyContents for UpdateFolder {
    fn name() -> &'static str {
        "UpdateFolder"
    }
}

/// A response to a [`UpdateFolder`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updatefolderresponsemessage>
#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct UpdateFolderResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for UpdateFolderResponse {}

impl EnvelopeBodyContents for UpdateFolderResponse {
    fn name() -> &'static str {
        "UpdateFolderResponse"
    }
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub update_folder_response_message: Vec<UpdateFolderResponseMessage>,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct UpdateFolderResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,
    pub response_code: Option<ResponseCode>,
    pub message_text: Option<String>,
    pub folders: Folders,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::assert_deserialized_content;
    use crate::test_utils::assert_serialized_content;
    use crate::BaseFolderId;
    use crate::FolderId;

    #[test]
    fn serialize_update_request() {
        let update_folder = UpdateFolder {
            folder_changes: FolderChanges {
                folder_change: FolderChange {
                    folder_id: BaseFolderId::FolderId {
                        id: "AScA".to_string(),
                        change_key: Some("GO3u/".to_string()),
                    },
                    updates: Updates::SetFolderField {
                        field_URI: PathToElement::FieldURI {
                            field_URI: "folder:DisplayName".to_string(),
                        },
                        folder: Folder::Folder {
                            display_name: Some("NewFolderName".to_string()),
                            folder_id: None,
                            parent_folder_id: None,
                            folder_class: None,
                            total_count: None,
                            child_folder_count: None,
                            extended_property: None,
                            unread_count: None,
                        },
                    },
                },
            },
        };

        let expected = r#"<UpdateFolder xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><FolderChanges><t:FolderChange><t:FolderId Id="AScA" ChangeKey="GO3u/"/><t:Updates><t:SetFolderField><t:FieldURI FieldURI="folder:DisplayName"/><t:Folder><t:DisplayName>NewFolderName</t:DisplayName></t:Folder></t:SetFolderField></t:Updates></t:FolderChange></FolderChanges></UpdateFolder>"#;

        assert_serialized_content(&update_folder, "UpdateFolder", expected);
    }

    #[test]
    fn deserialize_update_response() {
        let content = r#"<UpdateFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                          xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
                          xmlns="http://schemas.microsoft.com/exchange/services/2006/messages">
                <m:ResponseMessages>
                    <m:UpdateFolderResponseMessage ResponseClass="Success">
                    <m:ResponseCode>NoError</m:ResponseCode>
                    <m:Folders>
                        <t:Folder>
                        <t:FolderId Id="AAAlAFVz" ChangeKey="AQAAAB" />
                        </t:Folder>
                    </m:Folders>
                    </m:UpdateFolderResponseMessage>
                </m:ResponseMessages>
            </UpdateFolderResponse>"#;

        let expected = UpdateFolderResponse {
            response_messages: ResponseMessages {
                update_folder_response_message: vec![UpdateFolderResponseMessage {
                    response_class: ResponseClass::Success,
                    response_code: Some(ResponseCode::NoError),
                    message_text: None,
                    folders: Folders {
                        inner: vec![Folder::Folder {
                            folder_id: Some(FolderId {
                                id: "AAAlAFVz".to_string(),
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
                }],
            },
        };

        assert_deserialized_content(content, expected);
    }
}
