/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::marker::PhantomData;

use serde::{de::Visitor, Deserialize, Deserializer};

use crate::soap::Header;
use crate::OperationResponse;

use super::Fault;

/// A helper for deserialization of SOAP envelopes.
///
/// This struct is declared separately from the more general [`Envelope`] type
/// so that the latter can be used with types that are write-only.
///
/// [`Envelope`]: super::Envelope
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(super) struct DeserializeEnvelope<T>
where
    T: OperationResponse,
{
    pub header: Option<SoapHeaders>,
    #[serde(deserialize_with = "deserialize_body")]
    pub body: EnvelopeContent<T>,
}

#[derive(Deserialize)]
pub struct SoapHeaders {
    #[serde(rename = "$value", default)]
    pub inner: Vec<Header>,
}

#[derive(Deserialize)]
pub enum EnvelopeContent<T> {
    Fault(Fault),
    Body(T),
}

fn deserialize_body<'de, D, T>(body: D) -> Result<EnvelopeContent<T>, D::Error>
where
    D: Deserializer<'de>,
    T: OperationResponse,
{
    body.deserialize_map(BodyVisitor::<T>(PhantomData))
}

/// A visitor for custom name-based deserialization of operation responses.
struct BodyVisitor<T>(PhantomData<T>);

fn consume_final_none<'de, A: serde::de::MapAccess<'de>>(mut map: A) -> Result<(), A::Error> {
    // To satisfy quick-xml's serde impl, we need to consume the final
    // `None` key value in order to successfully complete.
    match map.next_key::<String>()? {
        Some(name) => {
            // The response body contained more than one element,
            // which violates our expectations.
            Err(serde::de::Error::custom(format_args!(
                "unexpected element `{name}`"
            )))
        }
        None => Ok(()),
    }
}

impl<'de, T> Visitor<'de> for BodyVisitor<T>
where
    T: OperationResponse,
{
    type Value = EnvelopeContent<T>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("EWS operation response body")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::MapAccess<'de>,
    {
        loop {
            match map.next_key::<String>()?.as_deref() {
                Some("Fault") => {
                    let value: Fault = map.next_value()?;
                    consume_final_none(map)?;
                    return Ok(EnvelopeContent::Fault(value));
                }
                Some(name) if name.starts_with('@') => {
                    // Serde doesn't differentiate between attributes and nested
                    // elements, and treats the former just like the latter.
                    // Since we're only really interested in the first nested
                    // element, we can ignore attributes (which are recognizable
                    // from their starting character '@'). We just need to
                    // "pump" the next value so we don't go out of sync in
                    // the next iteration.
                    map.next_value::<()>()?;
                    continue;
                }
                Some(name) => {
                    // We expect the body of the response to contain a single
                    // element with the name of the expected operation response.
                    let expected = T::name();
                    if name != expected {
                        return Err(serde::de::Error::custom(format_args!(
                            "unknown element `{name}`, expected {expected}"
                        )));
                    }

                    let value: T = map.next_value()?;
                    consume_final_none(map)?;
                    return Ok(EnvelopeContent::Body(value));
                }
                None => {
                    return Err(serde::de::Error::invalid_type(
                        serde::de::Unexpected::Map,
                        &self,
                    ))
                }
            }
        }
    }
}
