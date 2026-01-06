/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailboxSettings. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Error;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MailboxSettingsSelection {
    ArchiveFolder,
    DateFormat,
    TimeFormat,
    TimeZone,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct MailboxSettings<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> MailboxSettings<'a> {
    #[doc = r" Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        MailboxSettings {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "Folder ID of an archive folder for the user."]
    pub fn archive_folder(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("archiveFolder")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The date format for the user's mailbox."]
    pub fn date_format(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("dateFormat").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The time format for the user's mailbox."]
    pub fn time_format(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("timeFormat").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The default time zone for the user's mailbox."]
    pub fn time_zone(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("timeZone").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
}
