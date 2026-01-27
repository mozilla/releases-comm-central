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
