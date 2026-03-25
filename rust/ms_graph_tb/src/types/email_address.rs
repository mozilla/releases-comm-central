/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to EmailAddress. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Error;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::borrow::Cow;
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
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> EmailAddress<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        EmailAddress {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "The email address of the person or entity."]
    pub fn address(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("address").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "The display name of the person or entity."]
    pub fn name(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("name").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
}
