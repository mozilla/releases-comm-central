/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    get_folder::{GetFolder, GetFolderResponse},
    sync_folder_hierarchy::{SyncFolderHierarchy, SyncFolderHierarchyResponse}, MESSAGES_NS_URI,
};

/// Available EWS operations (requests) that can be performed against an
/// Exchange server.
#[derive(Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
pub enum Operation {
    /// Retrieve information regarding one or more folder(s).
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolder-operation#getfolder-request-example>
    GetFolder(GetFolder),

    /// Retrieve the latest changes in the folder hierarchy for this mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy-operation#syncfolderhierarchy-request-example>
    SyncFolderHierarchy(SyncFolderHierarchy),
}

/// Responses to available operations.
#[derive(Debug, Deserialize)]
pub enum OperationResponse {
    /// The response to a GetFolder operation.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolder-operation#getfolder-response-example>
    GetFolderResponse(GetFolderResponse),

    /// The response to a SyncFolderHierarchy operation.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy-operation#successful-syncfolderhierarchy-response>
    SyncFolderHierarchyResponse(SyncFolderHierarchyResponse),
}
