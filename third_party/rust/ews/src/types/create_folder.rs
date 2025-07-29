/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, Folder, FolderResponseMessage, MESSAGES_NS_URI};

/// A request to create a new folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createfolder>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(FolderResponseMessage)]
pub struct CreateFolder {
    pub parent_folder_id: BaseFolderId,
    pub folders: Vec<Folder>,
}
