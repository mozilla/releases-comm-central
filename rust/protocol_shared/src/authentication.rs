/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// The name of the server property in which the authentication realm is stored.
pub(crate) const REALM_SERVER_PROPERTY_NAME: &str = "realm";

pub mod authentication_provider;
mod oauth_listener;
