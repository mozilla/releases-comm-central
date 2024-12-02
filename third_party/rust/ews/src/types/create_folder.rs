/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseFolderId, Folder, Operation, OperationResponse,
    ResponseClass, ResponseCode, MESSAGES_NS_URI,
};

/// A request to create a new folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createfolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct CreateFolder {
    pub parent_folder_id: BaseFolderId,
    pub folders: Vec<Folder>,
}

impl Operation for CreateFolder {
    type Response = CreateFolderResponse;
}

impl EnvelopeBodyContents for CreateFolder {
    fn name() -> &'static str {
        "CreateFolder"
    }
}

/// A response to a [`CreateFolder`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createfolderresponse>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateFolderResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for CreateFolderResponse {}

impl EnvelopeBodyContents for CreateFolderResponse {
    fn name() -> &'static str {
        "CreateFolderResponse"
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub create_folder_response_message: Vec<CreateFolderResponseMessage>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateFolderResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    pub response_code: Option<ResponseCode>,

    pub message_text: Option<String>,

    pub folders: Vec<Folder>,
}
