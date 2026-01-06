/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;

use crate::Error;

#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum EntitySelection {
    Id,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Entity<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}

impl<'a> Entity<'a> {
    /// Internal constructor.
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        Entity {
            properties: Cow::Borrowed(properties),
        }
    }

    /// The unique identifier for an entity. Read-only.
    pub fn id(&self) -> Result<&str, Error> {
        let val = self.properties.get("id").ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))
    }
}
