/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailFolder.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::entity::{Entity, EntitySelection};
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
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
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailFolder<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for MailFolder<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> MailFolder<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "The number of immediate child mailFolders in the current mailFolder."]
    pub fn child_folder_count(&self) -> Result<Option<i32>, Error> {
        let val = self
            .properties
            .0
            .get("childFolderCount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(
            val.as_i64()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
                .try_into()
                .map_err(|e| Error::UnexpectedResponse(format!("{e:?}")))?,
        ))
    }
    #[doc = "Setter for [`child_folder_count`](Self::child_folder_count).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_child_folder_count(mut self, val: Option<i32>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("childFolderCount".to_string(), val.into());
        self
    }
    #[doc = "The mailFolder's display name."]
    pub fn display_name(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("displayName")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`display_name`](Self::display_name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_display_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("displayName".to_string(), val.into());
        self
    }
    #[doc = "Accessor to inhereted properties from `Entity`."]
    #[must_use]
    pub fn entity(&'a self) -> Entity<'a> {
        Entity {
            properties: PropertyMap(Cow::Borrowed(&*self.properties.0)),
        }
    }
    #[doc = "Setter for [`entity`](Self::entity).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_entity(mut self, mut val: Entity<'_>) -> Self {
        self.properties.0.to_mut().append(val.properties.0.to_mut());
        self
    }
    #[doc = "Indicates whether the mailFolder is hidden.\n\n This property can be set only when creating the folder. Find more information in Hidden mail folders."]
    pub fn is_hidden(&self) -> Result<Option<bool>, Error> {
        let val = self.properties.0.get("isHidden").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_hidden`](Self::is_hidden).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_hidden(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isHidden".to_string(), val.into());
        self
    }
    #[doc = "The unique identifier for the mailFolder's parent mailFolder."]
    pub fn parent_folder_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("parentFolderId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`parent_folder_id`](Self::parent_folder_id).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_parent_folder_id(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("parentFolderId".to_string(), val.into());
        self
    }
    #[doc = "The number of items in the mailFolder."]
    pub fn total_item_count(&self) -> Result<Option<i32>, Error> {
        let val = self
            .properties
            .0
            .get("totalItemCount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(
            val.as_i64()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
                .try_into()
                .map_err(|e| Error::UnexpectedResponse(format!("{e:?}")))?,
        ))
    }
    #[doc = "Setter for [`total_item_count`](Self::total_item_count).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_total_item_count(mut self, val: Option<i32>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("totalItemCount".to_string(), val.into());
        self
    }
    #[doc = "The number of items in the mailFolder marked as unread."]
    pub fn unread_item_count(&self) -> Result<Option<i32>, Error> {
        let val = self
            .properties
            .0
            .get("unreadItemCount")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(
            val.as_i64()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
                .try_into()
                .map_err(|e| Error::UnexpectedResponse(format!("{e:?}")))?,
        ))
    }
    #[doc = "Setter for [`unread_item_count`](Self::unread_item_count).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_unread_item_count(mut self, val: Option<i32>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("unreadItemCount".to_string(), val.into());
        self
    }
}
