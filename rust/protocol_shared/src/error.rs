/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Error values available to multiple HTTPS-based protocols.
//!
//! Provides an error type that can be shared among protocol implementations
//! that utilize HTTPS connections to interact with servers.

use nserror::nsresult;
use thiserror::Error;

/// Error types for HTTPS-based protocols.
#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("an error occurred in an XPCOM call: {0}")]
    XpCom(#[from] nsresult),

    #[error("an error occurred during HTTP transport: {0}")]
    Http(#[from] moz_http::Error),

    #[error("failed to authenticate")]
    Authentication,

    #[error("an item was too large to process: {0}")]
    Size(usize),
}

impl From<&ProtocolError> for nsresult {
    fn from(value: &ProtocolError) -> Self {
        match value {
            ProtocolError::XpCom(value) => *value,
            ProtocolError::Http(value) => value.into(),

            _ => nserror::NS_ERROR_UNEXPECTED,
        }
    }
}

impl From<ProtocolError> for nsresult {
    fn from(value: ProtocolError) -> Self {
        (&value).into()
    }
}

impl<'a> TryFrom<&'a ProtocolError> for &'a moz_http::Error {
    type Error = ();

    fn try_from(value: &'a ProtocolError) -> Result<Self, Self::Error> {
        match value {
            ProtocolError::Http(err) => Ok(err),
            _ => Err(()),
        }
    }
}
