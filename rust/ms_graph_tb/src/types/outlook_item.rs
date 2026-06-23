/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to OutlookItem.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use crate::types::entity::{Entity, EntitySelection};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum OutlookItemSelection {
    Categories,
    ChangeKey,
    CreatedDateTime,
    Entity(EntitySelection),
    LastModifiedDateTime,
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct OutlookItem {
    #[doc = "The categories associated with the item"]
    pub categories: Option<Vec<String>>,
    #[doc = "Identifies the version of the item.\n\n Every time the item is changed, changeKey changes as well. This allows Exchange to apply changes to the correct version of the object. Read-only."]
    pub change_key: Option<Nullable<String>>,
    #[doc = "The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.\n\n For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub created_date_time: Option<Nullable<String>>,
    #[doc = "Inherited properties from `Entity`."]
    #[serde(flatten)]
    pub entity: Entity,
    #[doc = "The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.\n\n For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub last_modified_date_time: Option<Nullable<String>>,
}
