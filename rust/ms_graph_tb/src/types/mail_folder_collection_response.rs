/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailFolderCollectionResponse. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Error;
use crate::types::mail_folder::*;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MailFolderCollectionResponseSelection {
    Value,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct MailFolderCollectionResponse<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> MailFolderCollectionResponse<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        MailFolderCollectionResponse {
            properties: Cow::Borrowed(properties),
        }
    }
    pub fn value(&'a self) -> Result<Vec<MailFolder<'a>>, Error> {
        let val = self.properties.get("value").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
            .iter()
            .map(|v| {
                Ok(MailFolder::new(v.as_object().ok_or_else(|| {
                    Error::UnexpectedResponse(format!("{:?}", v))
                })?))
            })
            .collect::<Result<_, _>>()
    }
}
