/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseFolderId, Folder, FolderShape, Operation,
    OperationResponse, ResponseClass, MESSAGES_NS_URI,
};

/// A request to get information on one or more folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolder>
#[derive(Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct GetFolder {
    /// A description of the information to be included in the response for each
    /// retrieved folder.
    pub folder_shape: FolderShape,

    /// A list of IDs for which to retrieve folder information.
    pub folder_ids: Vec<BaseFolderId>,
}

impl Operation for GetFolder {
    type Response = GetFolderResponse;
}

impl EnvelopeBodyContents for GetFolder {
    fn name() -> &'static str {
        "GetFolder"
    }
}

/// A response to a [`GetFolder`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolderresponse>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for GetFolderResponse {}

impl EnvelopeBodyContents for GetFolderResponse {
    fn name() -> &'static str {
        "GetFolderResponse"
    }
}

/// A collection of responses for individual entities within a request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/responsemessages>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub get_folder_response_message: Vec<GetFolderResponseMessage>,
}

/// A response to a request for an individual folder within a [`GetFolder`] operation.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolderresponsemessage>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponseMessage {
    /// The success value of the corresponding request.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    /// A collection of the retrieved folders.
    pub folders: Folders,
}

/// A collection of information on Exchange folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folders-ex15websvcsotherref>
#[derive(Debug, Deserialize)]
pub struct Folders {
    #[serde(rename = "$value")]
    pub inner: Vec<Folder>,
}
