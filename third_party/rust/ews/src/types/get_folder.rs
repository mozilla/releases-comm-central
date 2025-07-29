/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, FolderShape, Folders, MESSAGES_NS_URI};

/// A request to get information on one or more folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(GetFolderResponseMessage)]
pub struct GetFolder {
    /// A description of the information to be included in the response for each
    /// retrieved folder.
    pub folder_shape: FolderShape,

    /// A list of IDs for which to retrieve folder information.
    pub folder_ids: Vec<BaseFolderId>,
}

/// A response to a request for an individual folder within a [`GetFolder`] operation.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolderresponsemessage>
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponseMessage {
    /// A collection of the retrieved folders.
    pub folders: Folders,
}
