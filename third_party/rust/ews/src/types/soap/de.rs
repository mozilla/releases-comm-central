/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::marker::PhantomData;

use serde::{de::Visitor, Deserialize, Deserializer};

use crate::OperationResponse;

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
    #[serde(deserialize_with = "deserialize_body")]
    pub body: T,
}

fn deserialize_body<'de, D, T>(body: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: OperationResponse,
{
    body.deserialize_map(BodyVisitor::<T>(PhantomData))
}

/// A visitor for custom name-based deserialization of operation responses.
struct BodyVisitor<T>(PhantomData<T>);

impl<'de, T> Visitor<'de> for BodyVisitor<T>
where
    T: OperationResponse,
{
    type Value = T;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("EWS operation response body")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::MapAccess<'de>,
    {
        match map.next_key::<String>()? {
            Some(name) => {
                // We expect the body of the response to contain a single
                // element with the name of the expected operation response.
                let expected = T::name();
                if name.as_str() != expected {
                    return Err(serde::de::Error::custom(format_args!(
                        "unknown element `{}`, expected {}",
                        name, expected
                    )));
                }

                let value = map.next_value()?;

                // To satisfy quick-xml's serde impl, we need to consume the
                // final `None` key value in order to successfully complete.
                match map.next_key::<String>()? {
                    Some(name) => {
                        // The response body contained more than one element,
                        // which violates our expectations.
                        Err(serde::de::Error::custom(format_args!(
                            "unexpected element `{}`",
                            name
                        )))
                    }
                    None => Ok(value),
                }
            }
            None => Err(serde::de::Error::invalid_type(
                serde::de::Unexpected::Map,
                &self,
            )),
        }
    }
}
