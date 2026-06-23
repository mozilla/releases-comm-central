/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailboxSettings.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MailboxSettingsSelection {
    ArchiveFolder,
    DateFormat,
    TimeFormat,
    TimeZone,
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct MailboxSettings {
    #[doc = "Folder ID of an archive folder for the user."]
    pub archive_folder: Option<Nullable<String>>,
    #[doc = "The date format for the user's mailbox."]
    pub date_format: Option<Nullable<String>>,
    #[doc = "The time format for the user's mailbox."]
    pub time_format: Option<Nullable<String>>,
    #[doc = "The default time zone for the user's mailbox."]
    pub time_zone: Option<Nullable<String>>,
}
