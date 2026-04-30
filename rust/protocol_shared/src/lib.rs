/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use crate::{
    authentication::credentials::AuthenticationProvider,
    operation_sender::observable_server::ObservableServer,
};

pub mod authentication;
pub mod cancellable_request;
pub mod client;
pub mod error;
pub mod headerblock_xpcom;
pub mod headers;
pub mod operation_sender;
pub mod outgoing;
pub mod safe_xpcom;
pub mod xpcom_io;

mod observers;

/// Shorthand for the most common server type constraints.
pub trait ServerType:
    AuthenticationProvider + UserInteractiveServer + ObservableServer + RefCounted
{
}
impl<T> ServerType for T where
    T: AuthenticationProvider + UserInteractiveServer + ObservableServer + RefCounted
{
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
