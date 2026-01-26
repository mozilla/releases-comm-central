/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to SendMailRequestBody. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::message::*;
use crate::Error;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum SendMailRequestBodySelection {
    SaveToSentItems,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct SendMailRequestBody<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> SendMailRequestBody<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        SendMailRequestBody {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "Accessor to inhereted properties from `Message`."]
    pub fn message(&'a self) -> Message<'a> {
        Message {
            properties: Cow::Borrowed(&*self.properties),
        }
    }
    pub fn save_to_sent_items(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("SaveToSentItems")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
}
