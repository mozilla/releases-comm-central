/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to OutlookItem. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Error;
use crate::types::entity::*;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
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
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> OutlookItem<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        OutlookItem {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "The categories associated with the item"]
    pub fn categories(&self) -> Result<Vec<&str>, Error> {
        let val = self.properties.get("categories").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", v)))
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Identifies the version of the item.\n\n Every time the item is changed, changeKey changes as well. This allows Exchange to apply changes to the correct version of the object. Read-only."]
    pub fn change_key(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("changeKey").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.\n\n For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub fn created_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("createdDateTime")
            .ok_or(Error::NotFound)?;
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
    #[doc = "The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.\n\n For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub fn last_modified_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("lastModifiedDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
}
