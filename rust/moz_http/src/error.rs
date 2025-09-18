/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{fmt::Debug, num::TryFromIntError};

use thiserror::Error;

use nserror::nsresult;
use xpcom::interfaces::nsITransportSecurityInfo;
use xpcom::RefPtr;

use crate::{Response, StatusCode};

/// Information describing the transport security information (i.e. parameters and
/// status) of an HTTP request.
pub struct TransportSecurityInfo(pub RefPtr<nsITransportSecurityInfo>);

impl std::fmt::Debug for TransportSecurityInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The underlying type does not implement the `Debug` trait, but we need
        // it to be supported so we can include transport security information
        // in an `Error`.
        f.debug_tuple("Opaque TransportSecurityInfo").finish()
    }
}

/// An error that happened either when building a request, sending it, or
/// reading its response.
#[derive(Debug, Error)]
pub enum Error {
    /// The provided body exceeds the maximum allowed length.
    #[error("invalid body length (max {} bytes)", i32::MAX)]
    InvalidBodyLength(#[from] TryFromIntError),

    /// The provided URL features a protocol scheme that is not supported (i.e.
    /// which is neither HTTP nor HTTPS).
    #[error("url scheme is not supported: {0}")]
    UnsupportedScheme(String),

    /// An XPCOM operation failed, e.g. creating an instance of an XPCOM object,
    /// retrieving an instance of a service, or querying a specific interface on
    /// an XPCOM object.
    ///
    /// It includes a human-readable message that provides context on the
    /// operation that failed.
    #[error("XPCOM operation failed: {0}")]
    XpComOperationFailure(&'static str),

    /// The request timed out.
    #[error("timed out")]
    TimedOut,

    /// The destination host could not be found.
    #[error("unknown host")]
    UnknownHost,

    /// A network-related error that does not fit within any other
    /// network-related category.
    #[error("unexpected error")]
    UnknownNetworkError(#[source] nsresult),

    /// A redirect loop was detected and the request was aborted.
    #[error("redirect loop detected")]
    RedirectLoop,

    /// The status of the response is either a client error or a server error
    /// (i.e. its status code is within the 400-599 range).
    #[error("HTTP error ({status})")]
    StatusCode {
        status: StatusCode,
        response: Response,
    },

    /// An error that came up while negotiating transport security, such as an
    /// unsupported TLS/SSL version, or a bad certificate.
    #[error("an error occurred negotiating transport security: {{status}}")]
    TransportSecurityFailure {
        status: nsresult,
        transport_security_info: TransportSecurityInfo,
    },

    /// An unexpected XPCOM error which does not fit within any other category.
    #[error("unexpected error: {0}")]
    Unknown(#[source] nsresult),
}

impl From<nsresult> for Error {
    /// Converts an error of type [`nsresult`] into an [`enum@Error`], and try to
    /// match it against a supported error variant.
    fn from(value: nsresult) -> Self {
        match value {
            // Handle timeouts as a subclass of network errors.
            nserror::NS_ERROR_NET_TIMEOUT => Error::TimedOut,
            // Handle unknown host errors as a subclass of network errors.
            nserror::NS_ERROR_UNKNOWN_HOST => Error::UnknownHost,
            // Handle any other network error.
            value if value.to_string().starts_with("NS_ERROR_NET_") => {
                Error::UnknownNetworkError(value)
            }
            // Handle redirect loops.
            nserror::NS_ERROR_REDIRECT_LOOP => Error::RedirectLoop,
            // Default to unknown error if this is not a supported status.
            _ => Error::Unknown(value),
        }
    }
}

impl From<&Error> for nsresult {
    fn from(value: &Error) -> Self {
        match value {
            Error::UnsupportedScheme(_) => nserror::NS_ERROR_UNKNOWN_PROTOCOL,
            Error::TimedOut => nserror::NS_ERROR_NET_TIMEOUT,
            Error::UnknownHost => nserror::NS_ERROR_UNKNOWN_HOST,
            Error::UnknownNetworkError(result) => result.clone(),
            Error::RedirectLoop => nserror::NS_ERROR_REDIRECT_LOOP,
            Error::TransportSecurityFailure { status, .. } => status.clone(),
            Error::Unknown(result) => result.clone(),
            Error::StatusCode { .. } => nserror::NS_ERROR_NET_ERROR_RESPONSE,

            _ => nserror::NS_ERROR_FAILURE,
        }
    }
}

impl From<Error> for nsresult {
    fn from(value: Error) -> Self {
        (&value).into()
    }
}

/// A result which error type is always an [`enum@Error`].
pub type Result<T> = std::result::Result<T, Error>;
