/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseFolderId, DeleteType, Operation, OperationResponse,
    ResponseClass, ResponseCode, MESSAGES_NS_URI,
};

/// A request to delete one or more folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deletefolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct DeleteFolder {
    /// The method the EWS server will use to perform the deletion.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deletefolder#deletetype-attribute>
    #[xml_struct(attribute)]
    pub delete_type: DeleteType,

    /// A list of folders to delete.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderids>
    pub folder_ids: Vec<BaseFolderId>,
}

impl Operation for DeleteFolder {
    type Response = DeleteFolderResponse;
}

impl EnvelopeBodyContents for DeleteFolder {
    fn name() -> &'static str {
        "DeleteFolder"
    }
}

/// A response to a [`DeleteFolder`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deletefolderresponse>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteFolderResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for DeleteFolderResponse {}

impl EnvelopeBodyContents for DeleteFolderResponse {
    fn name() -> &'static str {
        "DeleteFolderResponse"
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub delete_folder_response_message: Vec<DeleteFolderResponseMessage>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteFolderResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    pub response_code: Option<ResponseCode>,

    pub message_text: Option<String>,
}
