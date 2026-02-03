/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailFolder. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Error;
use crate::types::entity::*;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MailFolderSelection {
    ChildFolderCount,
    DisplayName,
    Entity(EntitySelection),
    IsHidden,
    ParentFolderId,
    TotalItemCount,
    UnreadItemCount,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct MailFolder<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> MailFolder<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        MailFolder {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "The number of immediate child mailFolders in the current mailFolder."]
    pub fn child_folder_count(&self) -> Result<Option<i32>, Error> {
        let val = self
            .properties
            .get("childFolderCount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(
            val.as_i64()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
                .try_into()
                .map_err(|e| Error::UnexpectedResponse(format!("{:?}", e)))?,
        ))
    }
    #[doc = "The mailFolder's display name."]
    pub fn display_name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("displayName").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Accessor to inhereted properties from `Entity`."]
    pub fn entity(&'a self) -> Entity<'a> {
        Entity {
            properties: Cow::Borrowed(&*self.properties),
        }
    }
    #[doc = "Indicates whether the mailFolder is hidden.\n\n This property can be set only when creating the folder. Find more information in Hidden mail folders."]
    pub fn is_hidden(&self) -> Result<Option<bool>, Error> {
        let val = self.properties.get("isHidden").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The unique identifier for the mailFolder's parent mailFolder."]
    pub fn parent_folder_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("parentFolderId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The number of items in the mailFolder."]
    pub fn total_item_count(&self) -> Result<Option<i32>, Error> {
        let val = self
            .properties
            .get("totalItemCount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(
            val.as_i64()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
                .try_into()
                .map_err(|e| Error::UnexpectedResponse(format!("{:?}", e)))?,
        ))
    }
    #[doc = "The number of items in the mailFolder marked as unread."]
    pub fn unread_item_count(&self) -> Result<Option<i32>, Error> {
        let val = self
            .properties
            .get("unreadItemCount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(
            val.as_i64()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
                .try_into()
                .map_err(|e| Error::UnexpectedResponse(format!("{:?}", e)))?,
        ))
    }
}
