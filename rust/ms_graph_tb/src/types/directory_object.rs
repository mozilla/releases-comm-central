/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to DirectoryObject.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::entity::{Entity, EntitySelection};
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum DirectoryObjectSelection {
    DeletedDateTime,
    Entity(EntitySelection),
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct DirectoryObject<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for DirectoryObject<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> DirectoryObject<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "Date and time when this object was deleted.\n\n Always null when the object hasn't been deleted."]
    pub fn deleted_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("deletedDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`deleted_date_time`](Self::deleted_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_deleted_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("deletedDateTime".to_string(), val.into());
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
}
