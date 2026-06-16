/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to FollowupFlag.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::followup_flag_status::FollowupFlagStatus;
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum FollowupFlagSelection {
    FlagStatus,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct FollowupFlag<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for FollowupFlag<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> FollowupFlag<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "The status for follow-up for an item.\n\n Possible values are notFlagged, complete, and flagged."]
    pub fn flag_status(&self) -> Result<FollowupFlagStatus, Error> {
        let val = self.properties.0.get("flagStatus").ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .parse::<FollowupFlagStatus>()
            .map_err(|e| Error::UnexpectedResponse(format!("{e:?}")))
    }
    #[doc = "Setter for [`flag_status`](Self::flag_status).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_flag_status(mut self, val: FollowupFlagStatus) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("flagStatus".to_string(), Value::String(val.to_string()));
        self
    }
}
