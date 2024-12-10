/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    types::sealed::EnvelopeBodyContents, BaseFolderId, Folder, FolderId, FolderShape, Operation,
    OperationResponse, ResponseClass, MESSAGES_NS_URI,
};

/// A request for a list of folders which have been created, updated, or deleted
/// server-side.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub struct SyncFolderHierarchy {
    /// A description of the information to be included in the response for each
    /// changed folder.
    pub folder_shape: FolderShape,

    /// The ID of the folder to sync.
    pub sync_folder_id: Option<BaseFolderId>,

    /// The synchronization state after which to list changes.
    ///
    /// If `None`, the response will include `Create` changes for each folder
    /// which is a descendant of the requested folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncstate-ex15websvcsotherref>
    pub sync_state: Option<String>,
}

impl Operation for SyncFolderHierarchy {
    type Response = SyncFolderHierarchyResponse;
}

impl EnvelopeBodyContents for SyncFolderHierarchy {
    fn name() -> &'static str {
        "SyncFolderHierarchy"
    }
}

/// A response to a [`SyncFolderHierarchy`] request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchyresponse>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SyncFolderHierarchyResponse {
    pub response_messages: ResponseMessages,
}

impl OperationResponse for SyncFolderHierarchyResponse {}

impl EnvelopeBodyContents for SyncFolderHierarchyResponse {
    fn name() -> &'static str {
        "SyncFolderHierarchyResponse"
    }
}

/// A collection of responses for individual entities within a request.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/responsemessages>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ResponseMessages {
    pub sync_folder_hierarchy_response_message: Vec<SyncFolderHierarchyResponseMessage>,
}

/// A response to a request for an individual folder within a [`SyncFolderHierarchy`] operation.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchyresponsemessage>
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SyncFolderHierarchyResponseMessage {
    /// The status of the corresponding request, i.e. whether it succeeded or
    /// resulted in an error.
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,

    /// An identifier for the synchronization state following application of the
    /// changes included in this response.
    pub sync_state: String,

    /// Whether all relevant folder changes have been synchronized following
    /// this response.
    pub includes_last_folder_in_range: bool,

    /// The collection of changes between the prior synchronization state and
    /// the one represented by this response.
    pub changes: Changes,
}

/// A sequentially-ordered collection of folder creations, updates, and
/// deletions.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/changes-hierarchy>
#[derive(Clone, Debug, Deserialize)]
pub struct Changes {
    #[serde(default, rename = "$value")]
    pub inner: Vec<Change>,
}

/// A server-side change to a folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/changes-hierarchy>
#[derive(Clone, Debug, Deserialize)]
pub enum Change {
    /// A creation of a folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/create-foldersync>
    Create {
        /// The state of the folder upon creation.
        #[serde(rename = "$value")]
        folder: Folder,
    },

    /// An update to a folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/update-foldersync>
    Update {
        /// The updated state of the folder.
        #[serde(rename = "$value")]
        folder: Folder,
    },

    /// A deletion of a folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/delete-foldersync>
    #[serde(rename_all = "PascalCase")]
    Delete {
        /// The EWS ID for the deleted folder.
        folder_id: FolderId,
    },
}
