/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

pub(crate) const MESSAGES_NS_URI: &str =
    "http://schemas.microsoft.com/exchange/services/2006/messages";
pub(crate) const SOAP_NS_URI: &str = "http://schemas.xmlsoap.org/soap/envelope/";
pub(crate) const TYPES_NS_URI: &str = "http://schemas.microsoft.com/exchange/services/2006/types";

/// The folder properties which should be included in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/foldershape>.
#[derive(Debug, XmlSerialize)]
pub struct FolderShape {
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,
}

/// The item properties which should be included in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemshape>.
#[derive(Debug, XmlSerialize)]
pub struct ItemShape {
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,
}

/// The base set of properties to be returned in response to our request.
/// Additional properties may be specified by the parent element.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/baseshape>.
#[derive(Debug, Default, XmlSerialize)]
#[xml_struct(text)]
pub enum BaseShape {
    /// Only the IDs of any items or folders returned.
    IdOnly,

    /// The default set of properties for the relevant item or folder.
    ///
    /// The properties returned are dependent on the type of item or folder. See
    /// the EWS documentation for details.
    #[default]
    Default,

    /// All properties of an item or folder.
    AllProperties,
}

/// The success/failure status of an operation.
#[derive(Debug, Deserialize, PartialEq)]
pub enum ResponseClass {
    Success,
    Warning,
    Error,
}

/// An error code describing the error encountered in processing a request, if
/// any.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/responsecode>
#[derive(Debug, Deserialize, PartialEq)]
pub struct ResponseCode(pub String);

impl<T> From<T> for ResponseCode
where
    T: ToString,
{
    fn from(value: T) -> Self {
        Self(value.to_string())
    }
}

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
        #[xml_struct(attribute)]
        id: String,

        #[xml_struct(attribute)]
        change_key: Option<String>,
    },
}

/// The unique identifier of a folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderid>
#[derive(Debug, Deserialize, PartialEq)]
pub struct FolderId {
    #[serde(rename = "@Id")]
    pub id: String,

    #[serde(rename = "@ChangeKey")]
    pub change_key: Option<String>,
}

/// The representation of a folder in an EWS operation.
#[derive(Debug, Deserialize, PartialEq)]
pub enum Folder {
    /// A calendar folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/calendarfolder>
    #[serde(rename_all = "PascalCase")]
    CalendarFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },

    /// A contacts folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contactsfolder>
    #[serde(rename_all = "PascalCase")]
    ContactsFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },

    /// A folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folder>
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

    /// A search folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/searchfolder>
    #[serde(rename_all = "PascalCase")]
    SearchFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },

    /// A task folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/tasksfolder>
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

/// Structured data for diagnosing or responding to an EWS error.
///
/// Because the possible contents of this field are not documented, any XML
/// contained in the field is provided as text for debugging purposes. Known
/// fields which are relevant for programmatic error responses should be
/// provided as additional fields of this structure.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/messagexml>
#[derive(Debug, PartialEq)]
#[non_exhaustive]
pub struct MessageXml {
    /// A text representation of the contents of the field.
    pub content: String,

    /// The duration in milliseconds to wait before making additional requests
    /// if the server is throttling operations.
    pub back_off_milliseconds: Option<usize>,
}
