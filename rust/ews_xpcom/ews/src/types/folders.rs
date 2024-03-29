/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use super::{items::Items, BaseShape};

/// An identifier for a remote folder.
#[derive(Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum BaseFolderId {
    /// An identifier for an arbitrary folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderid>.
    FolderId {
        #[xml_struct(attribute)]
        id: String,

        #[xml_struct(attribute)]
        change_key: Option<String>,
    },

    /// An identifier for referencing a folder by name, e.g. "inbox" or
    /// "junkemail".
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/distinguishedfolderid>.
    DistinguishedFolderId {
        // This should probably be an enum, but this is a proof of concept and
        // I'm not writing all of those out right now.
        #[xml_struct(attribute)]
        id: String,

        #[xml_struct(attribute)]
        change_key: Option<String>,
    },
}

#[derive(Debug, Deserialize, XmlSerialize)]
pub struct FolderId {
    #[serde(rename = "@Id")]
    #[xml_struct(attribute)]
    pub id: String,

    #[serde(rename = "@ChangeKey")]
    #[xml_struct(attribute)]
    pub change_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct RootFolder {
    pub folders: Option<Folders>,
    pub items: Option<Items>,
}

#[derive(Debug, Deserialize)]
pub struct Folders {
    #[serde(default, rename = "$value")]
    pub inner: Vec<Folder>,
}

#[derive(Debug, Deserialize)]
pub enum Folder {
    #[serde(rename_all = "PascalCase")]
    CalendarFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },
    #[serde(rename_all = "PascalCase")]
    ContactsFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },
    #[serde(rename_all = "PascalCase")]
    Folder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
        unread_count: Option<u32>,
    },
    #[serde(rename_all = "PascalCase")]
    SearchFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },
    #[serde(rename_all = "PascalCase")]
    TasksFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },
}

#[derive(Clone, Copy, Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum Traversal {
    Shallow,
    Deep,
    SoftDeleted,
}

/// The folder properties to include in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/foldershape>.
#[derive(Debug, XmlSerialize)]
pub struct FolderShape {
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,
}
