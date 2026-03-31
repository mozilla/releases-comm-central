/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Recipient.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::email_address::EmailAddress;
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum RecipientSelection {
    EmailAddress,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Recipient<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for Recipient<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> Recipient<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "The recipient's email address."]
    pub fn email_address(&'a self) -> Result<EmailAddress<'a>, Error> {
        let val = self
            .properties
            .0
            .get("emailAddress")
            .ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`email_address`](Self::email_address).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_email_address(mut self, val: EmailAddress<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "emailAddress".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
}
