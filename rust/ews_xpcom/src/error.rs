/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! EWS error values.
//!
//! Provides an error type specific to EWS operations that may wrap an
//! underlying [`protocol_shared::ProtocolError`].

use ews::response::ResponseError;
use nserror::nsresult;
use protocol_shared::error::ProtocolError;
use thiserror::Error;

/// Error types for EWS operations.
#[derive(Debug, Error)]
pub(crate) enum XpComEwsError {
    #[error(transparent)]
    Protocol(#[from] ProtocolError),

    #[error("an error occurred while (de)serializing EWS traffic")]
    Ews(#[from] ews::Error),

    #[error("an error occurred while (de)serializing JSON")]
    Json(#[from] serde_json::Error),

    #[error("request resulted in an error: {0:?}")]
    ResponseError(#[from] ResponseError),

    #[error("missing item or folder ID in response from Exchange")]
    MissingIdInResponse,

    #[error(
        "response contained an unexpected number of response messages: expected {expected}, got {actual}"
    )]
    UnexpectedResponseMessageCount { expected: usize, actual: usize },

    #[error("error in processing response")]
    Processing { message: String },
}

impl From<&XpComEwsError> for nsresult {
    fn from(value: &XpComEwsError) -> Self {
        match value {
            XpComEwsError::Protocol(ProtocolError::XpCom(value)) => *value,
            XpComEwsError::Protocol(ProtocolError::Http(value)) => value.into(),

            _ => nserror::NS_ERROR_UNEXPECTED,
        }
    }
}

impl From<XpComEwsError> for nsresult {
    fn from(value: XpComEwsError) -> Self {
        (&value).into()
    }
}

impl From<nsresult> for XpComEwsError {
    fn from(value: nsresult) -> Self {
        ProtocolError::XpCom(value).into()
    }
}

impl From<moz_http::Error> for XpComEwsError {
    fn from(value: moz_http::Error) -> Self {
        XpComEwsError::Protocol(ProtocolError::Http(value))
    }
}
