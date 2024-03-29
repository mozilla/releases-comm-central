/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::ResponseMessageContents;

/// The base set of properties to be returned in response to our request, which
/// can be modified by the parent.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/baseshape>.
#[derive(Debug, Default, XmlSerialize)]
#[xml_struct(text)]
pub enum BaseShape {
    IdOnly,

    #[default]
    Default,

    AllProperties,
}

#[derive(Debug, Deserialize)]
pub struct ResponseMessages {
    #[serde(rename = "$value")]
    pub contents: Vec<ResponseMessageContents>,
}

#[derive(Debug, Deserialize)]
pub enum ResponseClass {
    Success,
    Warning,
    Error,
}
