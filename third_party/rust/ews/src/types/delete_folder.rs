/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, DeleteType, MESSAGES_NS_URI};

/// A request to delete one or more folders.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deletefolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(DeleteFolderResponseMessage)]
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

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct DeleteFolderResponseMessage {
    pub message_text: Option<String>,
}
