/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use http::method::Method;
use std::fmt::Display;
use thiserror::Error;

pub mod paths;
pub mod types;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum Error {
    #[error("object does not have this property set")]
    NotFound,
    #[error("property has an unexpected type")]
    UnexpectedResponse(String),
}

/// Trait for Graph operations.
pub trait Operation {
    /// The HTTP request method used for this operation.
    const METHOD: Method;

    /// The type of the body of the request. Requests without a body will set this to `()`.
    type Body;

    /// Create an [`http::Request`] from the current state of the operation object.
    fn build(&self) -> http::Request<Self::Body>;
}

/// Indicates the `Operation` accepts
/// [`$select`](https://learn.microsoft.com/en-us/graph/query-parameters?tabs=http#select).
pub trait Select: Operation {
    /// Type (typically an enum) representing the properties valid for this operation.
    type Properties: Display;

    /// Set the selected properties.
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P);

    /// Add aditional selected properties.
    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P);
}

/// Common internal representation of the `$select` parameter (used with [`Select`]).
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
    use super::paths;
    use super::types::user;
    use super::{Operation, Select, Selection};
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
    fn serialize_get_me() {
        let mut get_me = paths::me::Get::new();
        get_me.select(vec![user::UserSelection::AboutMe]);
        let req = get_me.build();
        assert_eq!(
            req.uri(),
            &uri::Uri::try_from("/me?%24select=aboutMe").unwrap()
        );
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
        let properties = Cow::Owned(serde_json::Map::from_iter([
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
        ]));
        let expected = user::User { properties };
        assert_eq!(parsed, expected);
    }
}
