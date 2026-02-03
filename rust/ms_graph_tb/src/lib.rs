/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use http::method::Method;
use serde::{Deserialize, de::DeserializeOwned};
use std::{fmt::Display, marker::PhantomData};
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

    /// The type of the body of the request. Requests without a body will set
    /// this to `()`.
    type Body;

    /// The type of the response of the request, in the success case. Requests
    /// without a response type will set this to `()`.
    // This could be generalized for a possible performance win, but
    // at the cost of making consumers responsible for the lifetime of
    // the raw, unparsed response:
    // type Response<'response>: Deserialize<'response>
    type Response<'response>: DeserializeOwned;

    /// Create an [`http::Request`] from the current state of the operation
    /// object.
    fn build(&self) -> http::Request<Self::Body>;
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

/// A paginated response message. If the response has additional results, then
/// [`Self::next_page`] will return `Some`.
///
/// See [Microsoft documentation](https://learn.microsoft.com/en-us/graph/paging)
/// for more information.
#[derive(Debug, Deserialize)]
pub struct Paginated<T> {
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
    #[serde(flatten)]
    pub response: T,
}

impl<T> Paginated<T> {
    /// Get the operation to retreive the next page, if there is one.
    pub fn next_page(&self) -> Option<NextPage<T>> {
        if let Some(next_link) = &self.next_link {
            Some(NextPage {
                _phantom: PhantomData,
                next_uri: next_link.try_into().ok()?,
            })
        } else {
            None
        }
    }
}

/// The next page of a response. Note that unlike other [`Operation`]s, the
/// request constructed contains the *full* URL, and should not be modified.
#[derive(Debug)]
pub struct NextPage<T> {
    _phantom: PhantomData<T>,
    next_uri: http::Uri,
}

impl<T: for<'a> Deserialize<'a>> Operation for NextPage<T> {
    const METHOD: Method = Method::GET;
    type Body = ();
    type Response<'response> = Paginated<T>;

    /// Create an [`http::Request`] object from `Self`. See the struct note, the
    /// URI should not be modified.
    fn build(&self) -> http::Request<()> {
        http::Request::builder()
            .uri(&self.next_uri)
            .method(Method::GET)
            .body(())
            .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::paths;
    use super::types::{mail_folder, user};
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

    #[test]
    fn deserialize_paginated_with_page() {
        use mail_folder::MailFolder;

        let json = r#"{
    "@odata.context": "https://graph.microsoft.com/v1.0/me/mailFolders",
    "value": [
        {
            "id": "AQMkADYAAAIBXQAAAA==",
            "displayName": "Archive",
            "parentFolderId": "AQMkADYAAAIBCAAAAA==",
            "childFolderCount": 0,
            "unreadItemCount": 0,
            "totalItemCount": 0,
            "sizeInBytes": 0,
            "isHidden": false
        },
        {
            "id": "AQMkADYAAAIBCQAAAA==",
            "displayName": "Sent Items",
            "parentFolderId": "AQMkADYAAAIBCAAAAA==",
            "childFolderCount": 0,
            "unreadItemCount": 0,
            "totalItemCount": 0,
            "sizeInBytes": 0,
            "isHidden": false
        }
    ],
    "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders?%24skip=10"
}"#;

        let parsed: <paths::me_mail_folders::Get as Operation>::Response<'_> =
            serde_json::from_str(json).unwrap();
        let value = vec![
            MailFolder {
                properties: Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBXQAAAA==".into()),
                    ("displayName".to_string(), "Archive".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ])),
            },
            MailFolder {
                properties: Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBCQAAAA==".into()),
                    ("displayName".to_string(), "Sent Items".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ])),
            },
        ];

        assert_eq!(
            parsed.response.value().expect("value should be present"),
            value
        );

        let next_page_uri = parsed
            .next_page()
            .expect("next page should be present")
            .next_uri;
        let expected_uri: http::Uri = "https://graph.microsoft.com/v1.0/me/mailFolders?%24skip=10"
            .try_into()
            .unwrap();
        assert_eq!(next_page_uri, expected_uri)
    }

    #[test]
    fn deserialize_paginated_without_page() {
        use mail_folder::MailFolder;

        let json = r#"{
    "@odata.context": "https://graph.microsoft.com/v1.0/me/mailFolders",
    "value": [
        {
            "id": "AQMkADYAAAIBXQAAAA==",
            "displayName": "Archive",
            "parentFolderId": "AQMkADYAAAIBCAAAAA==",
            "childFolderCount": 0,
            "unreadItemCount": 0,
            "totalItemCount": 0,
            "sizeInBytes": 0,
            "isHidden": false
        },
        {
            "id": "AQMkADYAAAIBCQAAAA==",
            "displayName": "Sent Items",
            "parentFolderId": "AQMkADYAAAIBCAAAAA==",
            "childFolderCount": 0,
            "unreadItemCount": 0,
            "totalItemCount": 0,
            "sizeInBytes": 0,
            "isHidden": false
        }
    ]
}"#;

        let parsed: <paths::me_mail_folders::Get as Operation>::Response<'_> =
            serde_json::from_str(json).unwrap();
        let value = vec![
            MailFolder {
                properties: Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBXQAAAA==".into()),
                    ("displayName".to_string(), "Archive".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ])),
            },
            MailFolder {
                properties: Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBCQAAAA==".into()),
                    ("displayName".to_string(), "Sent Items".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ])),
            },
        ];

        assert_eq!(
            parsed.response.value().expect("value should be present"),
            value
        );

        assert!(parsed.next_page().is_none());
    }
}
