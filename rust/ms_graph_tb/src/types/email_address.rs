/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to EmailAddress.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum EmailAddressSelection {
    Address,
    Name,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct EmailAddress<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for EmailAddress<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> EmailAddress<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "The email address of the person or entity."]
    pub fn address(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("address").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`address`](Self::address).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_address(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("address".to_string(), val.into());
        self
    }
    #[doc = "The display name of the person or entity."]
    pub fn name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("name").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`name`](Self::name).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_name(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("name".to_string(), val.into());
        self
    }
}
