/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use http::method::Method;
use serde::{Deserialize, Serialize};
use std::marker::PhantomData;

use crate::Error;
use crate::Operation;

/// A paginated response message. If the response has additional results, then
/// [`Self::next_page`] will return `Some`.
///
/// See [Microsoft documentation](https://learn.microsoft.com/en-us/graph/paging)
/// for more information.
#[derive(Debug, Deserialize)]
pub struct Paginated<T> {
    #[serde(flatten)]
    next_page: Option<NextPage<Paginated<T>>>,
    #[serde(flatten)]
    pub response: T,
}

impl<T> Paginated<T> {
    /// Get the operation for retrieving the next page, if there is one.
    pub fn next_page(&self) -> Option<NextPage<Paginated<T>>> {
        self.next_page.clone()
    }
}

/// Similar to a [`Paginated`] response, but the last response should return a
/// delta link for efficiently tracking future changes.
///
/// See [Microsoft
/// documentation](https://learn.microsoft.com/en-us/graph/delta-query-overview)
/// for more information.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum DeltaResponse<T> {
    /// This response has at least one additional page that must be fetched
    /// before a delta link can be obtained.
    NextLink {
        #[serde(flatten)]
        next_page: NextPage<DeltaResponse<T>>,
        value: Vec<DeltaItem<T>>,
    },
    /// This response is the last page, so contains a delta link for future sync
    /// requests.
    DeltaLink {
        #[serde(rename = "@odata.deltaLink")]
        delta_link: String,
        value: Vec<DeltaItem<T>>,
    },
}

impl<T> DeltaResponse<T> {
    /// Get the response value, irrespective of whether there is a next page or
    /// delta link.
    pub fn response(&self) -> &Vec<DeltaItem<T>> {
        match self {
            Self::NextLink { value, .. } | Self::DeltaLink { value, .. } => value,
        }
    }
}

/// An item in a [`DeltaResponse`], and therefore an item that has been added,
/// updated, or removed.
///
/// Graph delta queries do not distinguish between added and updated items.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum DeltaItem<T> {
    // Graph identifies removed delta items by the presence of `@removed`.
    // This variant must stay first so serde tries it before the more
    // permissive object form used by present items.
    Removed(RemovedDeltaItem),
    Present(T),
}

/// An item that has been reported in a [`DeltaResponse`] as removed.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemovedDeltaItem {
    id: String,
    #[serde(rename = "@removed")]
    removed: Removed,
}

impl RemovedDeltaItem {
    /// Get the ID of the removed item.
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Get the reason the item was removed.
    #[must_use]
    pub fn reason(&self) -> Option<RemovedReason> {
        match self.removed.reason.as_deref() {
            Some("changed") => Some(RemovedReason::Changed),
            Some("deleted") => Some(RemovedReason::Deleted),
            Some(other) => Some(RemovedReason::Other(other.to_string())),
            None => None,
        }
    }
}

/// A special object whose presence indicates that the item was removed.
///
/// See the [Microsoft documentation on resource representation] for delta query
/// responses.
///
/// [Microsoft documentation on resource representation]: https://learn.microsoft.com/en-us/graph/delta-query-overview#resource-representation-in-the-delta-query-response
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
struct Removed {
    reason: Option<String>,
}

/// The reason something was removed, as reported by a delta query.
///
/// See the [Microsoft documentation on resource representation] for delta query
/// responses.
///
/// [Microsoft documentation on resource representation]: https://learn.microsoft.com/en-us/graph/delta-query-overview#resource-representation-in-the-delta-query-response
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RemovedReason {
    Changed,
    Deleted,
    Other(String),
}

/// The next page of a response. Note that unlike other [`Operation`]s, the
/// request constructed contains the *full* URL, and should not be modified.
#[derive(Debug, Deserialize)]
#[serde(try_from = "NextPageWire")]
pub struct NextPage<R> {
    _phantom: PhantomData<R>,
    next_uri: http::Uri,
}

impl<R> Clone for NextPage<R> {
    fn clone(&self) -> Self {
        Self {
            _phantom: PhantomData,
            next_uri: self.next_uri.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct NextPageWire {
    #[serde(rename = "@odata.nextLink")]
    next_link: String,
}

impl<R> TryFrom<NextPageWire> for NextPage<R> {
    type Error = http::uri::InvalidUri;

    fn try_from(value: NextPageWire) -> Result<Self, Self::Error> {
        Ok(Self {
            _phantom: PhantomData,
            next_uri: value.next_link.try_into()?,
        })
    }
}

impl<R> NextPage<R> {
    pub fn next_uri(&self) -> &http::Uri {
        &self.next_uri
    }
}

impl<R: for<'a> Deserialize<'a>> Operation for NextPage<R> {
    const METHOD: Method = Method::GET;
    type Response<'response> = R;

    /// Create an [`http::Request`] object from `Self`. See the struct note, the
    /// URI should not be modified.
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let req = http::Request::builder()
            .uri(&self.next_uri)
            .method(Method::GET)
            .body(vec![])?;

        Ok(req)
    }
}

#[cfg(test)]
mod tests {
    use super::{DeltaItem, DeltaResponse, Removed, RemovedDeltaItem};
    use crate::{Error, Operation, PropertyMap, paths, types::mail_folder};
    use std::borrow::Cow;

    #[test]
    fn deserialize_paginated_with_page() -> Result<(), Error> {
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
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBXQAAAA==".into()),
                    ("displayName".to_string(), "Archive".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            },
            MailFolder {
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBCQAAAA==".into()),
                    ("displayName".to_string(), "Sent Items".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            },
        ];

        assert_eq!(
            parsed.response.value().expect("value should be present"),
            value
        );

        let request = parsed
            .next_page()
            .expect("next page should be present")
            .build_request()?;
        let next_page_uri = request.uri();
        let expected_uri: http::Uri = "https://graph.microsoft.com/v1.0/me/mailFolders?%24skip=10"
            .try_into()
            .unwrap();
        assert_eq!(next_page_uri, &expected_uri);

        Ok(())
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
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBXQAAAA==".into()),
                    ("displayName".to_string(), "Archive".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            },
            MailFolder {
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBCQAAAA==".into()),
                    ("displayName".to_string(), "Sent Items".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            },
        ];

        assert_eq!(
            parsed.response.value().expect("value should be present"),
            value
        );

        assert!(parsed.next_page().is_none());
    }

    #[test]
    fn deserialize_delta_with_page() -> Result<(), Error> {
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
        },
        {
            "id": "AQMkADYAAAIBDQAAAA==",
            "@removed": {
                "reason": "changed"
            }
        }
    ],
    "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders?%24skip=10"
}"#;

        let parsed: <paths::me_mail_folders_delta::Get as Operation>::Response<'_> =
            serde_json::from_str(json).unwrap();
        let value = vec![
            DeltaItem::Present(MailFolder {
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBXQAAAA==".into()),
                    ("displayName".to_string(), "Archive".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            }),
            DeltaItem::Present(MailFolder {
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBCQAAAA==".into()),
                    ("displayName".to_string(), "Sent Items".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            }),
            DeltaItem::Removed(RemovedDeltaItem {
                id: "AQMkADYAAAIBDQAAAA==".into(),
                removed: Removed {
                    reason: Some("changed".into()),
                },
            }),
        ];

        assert_eq!(parsed.response(), &value);

        let DeltaResponse::NextLink { next_page, .. } = parsed else {
            panic!("NextLink should be present");
        };
        let next_page_uri = next_page.build_request()?.uri().clone();
        let expected_uri: http::Uri = "https://graph.microsoft.com/v1.0/me/mailFolders?%24skip=10"
            .try_into()
            .unwrap();
        assert_eq!(next_page_uri, expected_uri);

        Ok(())
    }

    #[test]
    fn deserialize_delta_without_page() {
        use mail_folder::MailFolder;

        let json = r#"{
    "@odata.context": "https://graph.microsoft.com/v1.0/me/mailFolders/delta()",
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
        },
        {
            "id": "AQMkADYAAAIBDQAAAA==",
            "@removed": {
                "reason": "changed"
            }
        }
    ],
    "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/delta?$deltatoken=Aa1_Bb2_cC3"
}"#;

        let parsed: <paths::me_mail_folders_delta::Get as Operation>::Response<'_> =
            serde_json::from_str(json).unwrap();
        let value = vec![
            DeltaItem::Present(MailFolder {
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBXQAAAA==".into()),
                    ("displayName".to_string(), "Archive".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            }),
            DeltaItem::Present(MailFolder {
                properties: PropertyMap(Cow::Owned(serde_json::Map::from_iter([
                    ("id".to_string(), "AQMkADYAAAIBCQAAAA==".into()),
                    ("displayName".to_string(), "Sent Items".into()),
                    ("parentFolderId".to_string(), "AQMkADYAAAIBCAAAAA==".into()),
                    ("childFolderCount".to_string(), 0.into()),
                    ("unreadItemCount".to_string(), 0.into()),
                    ("totalItemCount".to_string(), 0.into()),
                    ("sizeInBytes".to_string(), 0.into()),
                    ("isHidden".to_string(), false.into()),
                ]))),
            }),
            DeltaItem::Removed(RemovedDeltaItem {
                id: "AQMkADYAAAIBDQAAAA==".into(),
                removed: Removed {
                    reason: Some("changed".into()),
                },
            }),
        ];

        assert_eq!(parsed.response(), &value);

        let DeltaResponse::DeltaLink {
            delta_link,
            value: _,
        } = parsed
        else {
            panic!("next page should parse as such");
        };
        let expected_uri =
            "https://graph.microsoft.com/v1.0/me/mailFolders/delta?$deltatoken=Aa1_Bb2_cC3";
        assert_eq!(delta_link, expected_uri)
    }
}
