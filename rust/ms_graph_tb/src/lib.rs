/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use http::method::Method;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::borrow::Cow;
use std::fmt::Display;
use thiserror::Error;

pub mod pagination;
pub mod paths;
pub mod types;

#[derive(Debug, Error)]
pub enum Error {
    #[error("object does not have this property set")]
    NotFound,

    #[error("property has an unexpected type: {0}")]
    UnexpectedResponse(String),

    #[error("an error occurred building the Graph resource URI: {0}")]
    Uri(#[from] http::uri::InvalidUri),

    #[error("an error occurred building the HTTP request: {0}")]
    HttpBuilder(#[from] http::Error),

    #[error("failed to serialize the request body into JSON: {0}")]
    JSONSerialize(#[from] serde_json::Error),
}

/// Internal type used for storing properties.
#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct PropertyMap<'a>(Cow<'a, serde_json::Map<String, serde_json::Value>>);

/// The body of a POST/PATCH/PUT/etc. request.
///
/// Some endpoints may support requests in other formats than JSON, which are
/// not always documented in the OpenAPI spec. For example, `POST /me/messages`
/// allows consumers to provide a base64-encoded RFC822 message (with the
/// "plain/text" content type) rather than the structured JSON body that is
/// documented in the OpenAPI specification file.
///
/// Wrapping the type of a request's structured JSON body inside this enum
/// allows consumers to provide an alternate body to include when building the
/// [`http::Request`] for the operation.
#[derive(Debug)]
pub enum OperationBody<StructuredBodyT: Serialize> {
    /// The structured JSON body for the request. When provided, the
    /// implementations of [`Operation::build_request`] in this crate generate a
    /// request body by calling [`serde_json::to_vec`] on the wrapped struct.
    JSON(StructuredBodyT),

    /// An alternate body (with its content type) for the request. Consumers are
    /// responsible for generating the bytes for body and providing the correct
    /// content type, as they will be used as-is when building the request.
    Other { content_type: String, body: Vec<u8> },
}

/// Trait for Graph operations.
pub trait Operation {
    /// The HTTP request method used for this operation.
    const METHOD: Method;

    /// The type of the response of the request, in the success case. Requests
    /// without a response type will set this to `()`.
    // This could be generalized for a possible performance win, but
    // at the cost of making consumers responsible for the lifetime of
    // the raw, unparsed response:
    // type Response<'response>: Deserialize<'response>
    type Response<'response>: DeserializeOwned;

    /// Create an [`http::Request`] from the current state of the operation
    /// object. The request's body contains the serialized body from the
    /// operation (or an empty bytes vector if the operation does not have a
    /// body).
    ///
    /// In cases where distinguishing between an empty and a missing body
    /// matters, consumers should determine the correct course of action based
    /// on the length of the `Request`'s body.
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error>;
}

/// Indicates the `Operation` accepts
/// [`$select`](https://learn.microsoft.com/en-us/graph/query-parameters?tabs=http#select).
pub trait Select: Operation {
    /// Type (typically an enum) representing the properties valid for this
    /// operation.
    type Properties: Display;

    /// Set the selected properties.
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P);

    /// Add aditional selected properties.
    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P);
}

/// Common internal representation of the `$select` parameter (used with
/// [`Select`]).
#[derive(Clone, Debug)]
struct Selection<P: Clone> {
    // The API seems to deduplicate on the server-side, so we don't need to do that. Because this
    // parameter will likely consist of a few small enum variants, vec operations are a good fit.
    properties: Vec<P>,
}

impl<T: Clone> Default for Selection<T> {
    fn default() -> Self {
        Self {
            properties: Vec::new(),
        }
    }
}

impl<P: Display + Clone> Selection<P> {
    pub fn select<I: IntoIterator<Item = P>>(&mut self, properties: I) {
        self.properties = properties.into_iter().collect();
    }

    pub fn extend<I: IntoIterator<Item = P>>(&mut self, properties: I) {
        self.properties.extend(properties);
    }

    /// Get the selection as a (key, value) pair. Useful for combining with
    /// `form_urlencoded::Serializer::append_pair` and similar.
    pub fn pair(&self) -> (&'static str, String) {
        (
            "$select",
            self.properties
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(","),
        )
    }
}

#[cfg(test)]
mod tests {
    use crate::{Error, Operation, Select, Selection, paths, types::user};
    use http::uri;
    use std::borrow::Cow;

    #[test]
    fn serialize_selection() {
        let mut selection = Selection::default();
        selection.extend(vec![user::UserSelection::AboutMe]);
        let (key, value) = selection.pair();
        assert_eq!(key, "$select");
        assert_eq!(value, "aboutMe");
    }

    #[test]
    fn serialize_get_me() -> Result<(), Error> {
        let mut get_me = paths::me::Get::new("https://graph.microsoft.com/v1.0".to_string());
        get_me.select(vec![user::UserSelection::AboutMe]);
        let req = get_me.build_request()?;
        let uri = req.uri();
        let expected =
            uri::Uri::try_from("https://graph.microsoft.com/v1.0/me?%24select=aboutMe").unwrap();
        assert_eq!(*uri, expected);

        Ok(())
    }

    #[test]
    fn deserialize_user() {
        let json = r#"{
    "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users/$entity",
    "businessPhones": [],
    "displayName": "Adele Vance",
    "givenName": "Adele",
    "jobTitle": null,
    "mail": "AdeleV@M365x63639251.OnMicrosoft.com",
    "mobilePhone": null,
    "officeLocation": null,
    "preferredLanguage": null,
    "surname": "Vance",
    "userPrincipalName": "AdeleV@M365x63639251.OnMicrosoft.com",
    "id": "3a2bc284-f11c-4676-a9e1-6310eea60f26"
}"#;

        let parsed: user::User = serde_json::from_str(json).unwrap();
        let properties = super::PropertyMap(Cow::Owned(serde_json::Map::from_iter([
            (
                "@odata.context".to_string(),
                "https://graph.microsoft.com/v1.0/$metadata#users/$entity".into(),
            ),
            ("displayName".to_string(), "Adele Vance".into()),
            (
                "businessPhones".to_string(),
                serde_json::Value::Array(vec![]),
            ),
            ("displayName".to_string(), "Adele Vance".into()),
            ("givenName".to_string(), "Adele".into()),
            ("jobTitle".to_string(), serde_json::Value::Null),
            (
                "mail".to_string(),
                "AdeleV@M365x63639251.OnMicrosoft.com".into(),
            ),
            ("mobilePhone".to_string(), serde_json::Value::Null),
            ("officeLocation".to_string(), serde_json::Value::Null),
            ("preferredLanguage".to_string(), serde_json::Value::Null),
            ("surname".to_string(), "Vance".into()),
            (
                "userPrincipalName".to_string(),
                "AdeleV@M365x63639251.OnMicrosoft.com".into(),
            ),
            (
                "id".to_string(),
                "3a2bc284-f11c-4676-a9e1-6310eea60f26".into(),
            ),
        ])));
        let expected = user::User { properties };
        assert_eq!(parsed, expected);
    }
}
