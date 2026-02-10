/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use url::Url;
use xpcom::{RefPtr, interfaces::nsIMsgIncomingServer};

use crate::authentication::credentials::Credentials;

pub mod authentication;
pub mod cancellable_request;
pub mod client;
pub mod error;
pub mod headers;
pub mod safe_xpcom;

/// Connection details required for HTTPS-based Exchange protocols.
#[derive(Clone)]
pub struct ExchangeConnectionDetails {
    /// The HTTPS endpoint for the protocol.
    pub endpoint: Url,
    /// The incoming server used for protocol interaction.
    pub server: RefPtr<nsIMsgIncomingServer>,
    /// The credentials required for interacting with the server.
    pub credentials: Credentials,
}

/// String used in various parts of both Exchange protocols to represent the
/// root folder.
pub const EXCHANGE_ROOT_FOLDER: &str = "msgfolderroot";

/// Well-known folder names and DistinguishedFolderIds, which, for our purposes,
/// happen to be the same in EWS and Graph.
///
/// See the respective [EWS docs] and [Graph API docs].
///
/// [EWS docs]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/distinguishedfolderid
/// [Graph API docs]: https://learn.microsoft.com/en-us/graph/api/resources/mailfolder?view=graph-rest-1.0
pub const EXCHANGE_DISTINGUISHED_IDS: &[&str] = &[
    EXCHANGE_ROOT_FOLDER,
    "inbox",
    "deleteditems",
    "drafts",
    "outbox",
    "sentitems",
    "junkemail",
    // The `archive` distinguished id isn't documented at
    // https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/distinguishedfolderid
    // but it does provide the Exchange account's archive folder when
    // requested, while the other documented `archive*` distinguished
    // ids result in folder not found errors.
    "archive",
];
