/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Recipient. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Error;
use crate::types::email_address::EmailAddress;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
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
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> Recipient<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        Recipient {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "The recipient's email address."]
    pub fn email_address(&'a self) -> Result<EmailAddress<'a>, Error> {
        let val = self.properties.get("emailAddress").ok_or(Error::NotFound)?;
        Ok(EmailAddress::new(val.as_object().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
}
