/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to OutlookItem.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::entity::{Entity, EntitySelection};
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum OutlookItemSelection {
    Categories,
    ChangeKey,
    CreatedDateTime,
    Entity(EntitySelection),
    LastModifiedDateTime,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct OutlookItem<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for OutlookItem<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> OutlookItem<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "The categories associated with the item"]
    pub fn categories(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.0.get("categories").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`categories`](Self::categories).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_categories(mut self, val: Vec<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("categories".to_string(), val.into());
        self
    }
    #[doc = "Identifies the version of the item.\n\n Every time the item is changed, changeKey changes as well. This allows Exchange to apply changes to the correct version of the object. Read-only."]
    pub fn change_key(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("changeKey").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`change_key`](Self::change_key).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_change_key(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("changeKey".to_string(), val.into());
        self
    }
    #[doc = "The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.\n\n For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub fn created_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("createdDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`created_date_time`](Self::created_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_created_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("createdDateTime".to_string(), val.into());
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
    #[doc = "The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.\n\n For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub fn last_modified_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("lastModifiedDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`last_modified_date_time`](Self::last_modified_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_last_modified_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("lastModifiedDateTime".to_string(), val.into());
        self
    }
}
