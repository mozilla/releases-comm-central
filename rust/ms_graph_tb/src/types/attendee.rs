/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Attendee.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::attendee_base::{AttendeeBase, AttendeeBaseSelection};
use crate::types::response_status::ResponseStatus;
use crate::types::time_slot::TimeSlot;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum AttendeeSelection {
    AttendeeBase(AttendeeBaseSelection),
    ProposedNewTime,
    Status,
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Attendee {
    #[doc = "Inherited properties from `AttendeeBase`."]
    #[serde(flatten)]
    pub attendee_base: AttendeeBase,
    #[doc = "An alternate date/time proposed by the attendee for a meeting request to start and end.\n\n If the attendee hasn't proposed another time, then this property isn't included in a response of a GET event."]
    pub proposed_new_time: Option<TimeSlot>,
    #[doc = "The attendee's response (none, accepted, declined, etc.) for the event and date-time that the response was sent."]
    pub status: Option<ResponseStatus>,
}
