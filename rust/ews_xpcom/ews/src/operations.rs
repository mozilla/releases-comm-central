/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod get_folder;
mod sync_folder_hierarchy;

use serde::Deserialize;
use xml_struct::XmlSerialize;

pub use get_folder::*;
pub use sync_folder_hierarchy::*;

use crate::types::MESSAGES_NS_URI;

#[derive(Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub enum OperationRequest {
    GetFolder(GetFolder),
    SyncFolderHierarchy(SyncFolderHierarchy),
}

#[derive(Debug, Deserialize)]
pub enum OperationResponse {
    GetFolderResponse(GetFolderResponse),
    SyncFolderHierarchyResponse(SyncFolderHierarchyResponse),
}

#[derive(Debug, Deserialize)]
pub enum ResponseMessageContents {
    GetFolderResponseMessage(GetFolderResponseMessage),
    SyncFolderHierarchyResponseMessage(SyncFolderHierarchyResponseMessage),
}
