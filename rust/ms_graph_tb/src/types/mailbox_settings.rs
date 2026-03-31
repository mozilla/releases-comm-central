/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailboxSettings.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MailboxSettingsSelection {
    ArchiveFolder,
    DateFormat,
    TimeFormat,
    TimeZone,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MailboxSettings<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for MailboxSettings<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> MailboxSettings<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "Folder ID of an archive folder for the user."]
    pub fn archive_folder(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("archiveFolder")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`archive_folder`](Self::archive_folder).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_archive_folder(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("archiveFolder".to_string(), val.into());
        self
    }
    #[doc = "The date format for the user's mailbox."]
    pub fn date_format(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("dateFormat").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`date_format`](Self::date_format).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_date_format(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("dateFormat".to_string(), val.into());
        self
    }
    #[doc = "The time format for the user's mailbox."]
    pub fn time_format(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("timeFormat").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`time_format`](Self::time_format).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_time_format(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("timeFormat".to_string(), val.into());
        self
    }
    #[doc = "The default time zone for the user's mailbox."]
    pub fn time_zone(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("timeZone").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`time_zone`](Self::time_zone).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_time_zone(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("timeZone".to_string(), val.into());
        self
    }
}
