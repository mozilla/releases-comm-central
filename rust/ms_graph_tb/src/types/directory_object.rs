/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;

use crate::types::entity::*;
use crate::Error;

#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum DirectoryObjectSelection {
    DeletedDateTime,
    Entity(EntitySelection),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct DirectoryObject<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> DirectoryObject<'a> {
    /// Internal constructor.
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        DirectoryObject {
            properties: Cow::Borrowed(properties),
        }
    }

    /// Date and time when this object was deleted. Always null when the object hasn't been deleted.
    pub fn deleted_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("deletedDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }

    /// Accessor to inhereted properties from `Entity`.
    pub fn entity(&'a self) -> Entity<'a> {
        Entity {
            properties: Cow::Borrowed(&*self.properties),
        }
    }
}
