/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to TimeSlot.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::date_time_time_zone::{DateTimeTimeZone, DateTimeTimeZoneSelection};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum TimeSlotSelection {
    End(DateTimeTimeZoneSelection),
    Start(DateTimeTimeZoneSelection),
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct TimeSlot {
    #[doc = "Inherited properties from `DateTimeTimeZone`."]
    #[serde(flatten)]
    pub end: DateTimeTimeZone,
    #[doc = "Inherited properties from `DateTimeTimeZone`."]
    #[serde(flatten)]
    pub start: DateTimeTimeZone,
}
