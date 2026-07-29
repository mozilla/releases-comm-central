/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::fmt::Display;

/// An authentication identity to insert into Necko's authentication cache.
#[derive(Debug, Clone)]
pub struct AuthIdentity<'ai> {
    /// The authentication type, in lowercase, e.g. "basic" or "ntlm".
    pub auth_type: AuthType,

    /// The realm in which to authenticate. Optional.
    pub realm: Option<&'ai str>,

    /// The path for which we want to set the authentication identity. Optional,
    /// a missing value means the authentication identity is not scoped on the
    /// path.
    pub path: Option<&'ai str>,

    /// The domain to use when authenticating requests. Optional.
    pub domain: Option<&'ai str>,

    /// The username to use when authenticating requests.
    pub username: &'ai str,

    /// The password to use when authenticating requests.
    pub password: &'ai str,
}

/// Authentication types that can be used in an [`AuthIdentity`].
#[derive(Debug, Clone)]
pub enum AuthType {
    Basic,
    Ntlm,
}

impl Display for AuthType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            AuthType::Basic => "basic",
            AuthType::Ntlm => "ntlm",
        };

        write!(f, "{s}")
    }
}
