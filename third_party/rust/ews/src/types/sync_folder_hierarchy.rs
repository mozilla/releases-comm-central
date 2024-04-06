/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseFolderId, Folder, FolderId, FolderShape, ResponseClass};

/// The request for update regarding the folder hierarchy in a mailbox.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy>
#[derive(Debug, XmlSerialize)]
pub struct SyncFolderHierarchy {
    pub folder_shape: FolderShape,
    pub sync_folder_id: Option<BaseFolderId>,
    pub sync_state: Option<String>,
}

/// The response to a SyncFolderHierarchy request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchyresponse>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SyncFolderHierarchyResponse {
    pub response_messages: ResponseMessages,
}

/// A collection of response messages from a SyncFolderHierarchy response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub sync_folder_hierarchy_response_message: Vec<SyncFolderHierarchyResponseMessage>,
}

/// A message in a SyncFolderHierarchy response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchyresponsemessage>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SyncFolderHierarchyResponseMessage {
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,
    pub sync_state: String,
    pub includes_last_folder_in_range: bool,
    pub changes: Changes,
}

/// The changes that happened since the last folder hierachy sync.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/changes-hierarchy>
#[derive(Debug, Deserialize)]
pub struct Changes {
    #[serde(default, rename = "$value")]
    pub inner: Vec<Change>,
}

/// A single change described in a SyncFolderHierarchy response message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/changes-hierarchy>
#[derive(Debug, Deserialize)]
pub enum Change {
    /// A folder to create.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/create-foldersync>
    Create {
        #[serde(rename = "$value")]
        folder: Folder,
    },

    /// A folder to update.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/update-foldersync>
    Update {
        #[serde(rename = "$value")]
        folder: Folder,
    },

    /// A folder to delete.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/delete-foldersync>
    Delete(FolderId),
}
