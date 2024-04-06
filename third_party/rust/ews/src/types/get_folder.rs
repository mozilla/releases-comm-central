/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, Folder, FolderShape, ResponseClass};

/// The request to get one or more folder(s).
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolder>
#[derive(Debug, XmlSerialize)]
pub struct GetFolder {
    pub folder_shape: FolderShape,
    pub folder_ids: Vec<BaseFolderId>,
}

/// The response to a GetFolder request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolderresponse>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponse {
    pub response_messages: ResponseMessages,
}

/// A collection of response messages from a GetFolder response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub get_folder_response_message: Vec<GetFolderResponseMessage>,
}

/// A message in a GetFolder response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolderresponsemessage>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponseMessage {
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,
    pub folders: Folders,
}

/// A list of folders in a GetFolder response message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folders-ex15websvcsotherref>
#[derive(Debug, Deserialize)]
pub struct Folders {
    #[serde(rename = "$value")]
    pub inner: Vec<Folder>,
}
