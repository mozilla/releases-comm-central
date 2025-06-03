/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::Error;

/// The Exchange Server version identifiers allowed in `RequestServerVersion`
/// headers.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/requestserverversion#version-attribute-values>
#[allow(non_camel_case_types)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, XmlSerialize)]
#[xml_struct(text)]
pub enum ExchangeServerVersion {
    Exchange2007,
    Exchange2007_SP1,
    Exchange2010,
    Exchange2010_SP1,
    Exchange2010_SP2,
    Exchange2013,
    Exchange2013_SP1,
}

/// Parses the provided string into a known version identifier.
impl TryFrom<&str> for ExchangeServerVersion {
    /// If the provided string could not be turned into a known version
    /// identifier, [`Error::UnknownServerVersion`] is returned.
    type Error = Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "Exchange2007" => Ok(ExchangeServerVersion::Exchange2007),
            "Exchange2007_SP1" => Ok(ExchangeServerVersion::Exchange2007_SP1),
            "Exchange2010" => Ok(ExchangeServerVersion::Exchange2010),
            "Exchange2010_SP1" => Ok(ExchangeServerVersion::Exchange2010_SP1),
            "Exchange2010_SP2" => Ok(ExchangeServerVersion::Exchange2010_SP2),
            "Exchange2013" => Ok(ExchangeServerVersion::Exchange2013),
            "Exchange2013_SP1" => Ok(ExchangeServerVersion::Exchange2013_SP1),

            _ => Err(Error::UnknownServerVersion(value.to_owned())),
        }
    }
}

// While we don't strictly need this implementation for serialization
// (`xml-struct` knows how to string-ify unit enum variants without additional
// guidance), consumers can require it to persist the version associated with a
// given server.
impl From<ExchangeServerVersion> for String {
    fn from(value: ExchangeServerVersion) -> Self {
        match value {
            ExchangeServerVersion::Exchange2007 => "Exchange2007",
            ExchangeServerVersion::Exchange2007_SP1 => "Exchange2007_SP1",
            ExchangeServerVersion::Exchange2010 => "Exchange2010",
            ExchangeServerVersion::Exchange2010_SP1 => "Exchange2010_SP1",
            ExchangeServerVersion::Exchange2010_SP2 => "Exchange2010_SP2",
            ExchangeServerVersion::Exchange2013 => "Exchange2013",
            ExchangeServerVersion::Exchange2013_SP1 => "Exchange2013_SP1",
        }
        .into()
    }
}

/// The version information of the Exchange Server instance that generated
/// the attached response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/serverversioninfo>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct ServerVersionInfo {
    #[xml_struct(attribute)]
    #[serde(rename = "@MajorVersion")]
    pub major_version: Option<String>,

    #[xml_struct(attribute)]
    #[serde(rename = "@MinorVersion")]
    pub minor_version: Option<String>,

    #[xml_struct(attribute)]
    #[serde(rename = "@MajorBuildNumber")]
    pub major_build_number: Option<String>,

    #[xml_struct(attribute)]
    #[serde(rename = "@MinorBuildNumber")]
    pub minor_build_number: Option<String>,

    #[xml_struct(attribute)]
    #[serde(rename = "@Version")]
    pub version: Option<String>,
}
