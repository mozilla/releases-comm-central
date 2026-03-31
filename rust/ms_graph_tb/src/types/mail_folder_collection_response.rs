/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailFolderCollectionResponse.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::mail_folder::MailFolder;
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MailFolderCollectionResponseSelection {
    Value,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailFolderCollectionResponse<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for MailFolderCollectionResponse<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> MailFolderCollectionResponse<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    pub fn value(&'a self) -> Result<Vec<MailFolder<'a>>, Error> {
        let val = self.properties.0.get("value").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                Ok::<_, Error>(
                    PropertyMap(Cow::Borrowed(
                        v.as_object()
                            .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))?,
                    ))
                    .into(),
                )
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`value`](Self::value).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_value(mut self, val: Vec<MailFolder<'_>>) -> Self {
        self.properties.0.to_mut().insert(
            "value".to_string(),
            val.into_iter()
                .map(|v| Value::Object(v.properties.0.into_owned()))
                .collect(),
        );
        self
    }
}
