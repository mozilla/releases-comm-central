/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Graph API error values.
//!
//! Provides an error type specific to Graph operations that may wrap an
//! underlying [`protocol_shared::error::ProtocolError`]

use nserror::nsresult;
use protocol_shared::error::ProtocolError;
use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum XpComGraphError {
    #[error(transparent)]
    Protocol(#[from] ProtocolError),

    #[error("an error occurred in the interpretation of a Graph API type")]
    Type(#[from] ms_graph_tb::Error),

    #[error("an error occurred while (de)serializing JSON")]
    Json(#[from] serde_json::Error),

    #[error("an error occurred building the Graph resource URI.")]
    Uri,

    #[error("error in processing response")]
    Processing { message: String },
}

impl From<&XpComGraphError> for nsresult {
    fn from(value: &XpComGraphError) -> Self {
        match value {
            XpComGraphError::Protocol(ProtocolError::XpCom(value)) => *value,
            XpComGraphError::Protocol(ProtocolError::Http(value)) => value.into(),

            _ => nserror::NS_ERROR_UNEXPECTED,
        }
    }
}

impl From<XpComGraphError> for nsresult {
    fn from(value: XpComGraphError) -> Self {
        (&value).into()
    }
}

impl From<nsresult> for XpComGraphError {
    fn from(value: nsresult) -> Self {
        ProtocolError::XpCom(value).into()
    }
}

impl From<moz_http::Error> for XpComGraphError {
    fn from(value: moz_http::Error) -> Self {
        XpComGraphError::Protocol(ProtocolError::Http(value))
    }
}

impl<'a> TryFrom<&'a XpComGraphError> for &'a moz_http::Error {
    type Error = ();

    fn try_from(value: &'a XpComGraphError) -> Result<Self, Self::Error> {
        match value {
            XpComGraphError::Protocol(ProtocolError::Http(err)) => Ok(err),
            _ => Err(()),
        }
    }
}
