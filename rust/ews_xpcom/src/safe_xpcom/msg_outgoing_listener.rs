/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::{
    interfaces::{nsIMsgOutgoingListener, nsIRequest, nsIURI},
    RefPtr,
};

use crate::{cancellable_request::CancellableRequest, client::XpComEwsError};

use super::{SafeListener, SafeListenerWrapper, SafeUri};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeMsgOutgoingListener = SafeListenerWrapper<nsIMsgOutgoingListener>;

impl SafeMsgOutgoingListener {
    /// A safe wrapper for [`nsIMsgOutgoingListener::OnSendStart`].
    pub fn on_send_start(&self) -> Result<(), nsresult> {
        let cancellable_request = CancellableRequest::new();
        let request: &nsIRequest = cancellable_request.coerce();
        // SAFETY: CancellableRequest coerced to an nsIRequest means it's safe
        // to cross the XPCOM Rust/C++ boundary.
        unsafe { self.0.OnSendStart(request) }.to_result()
    }

    /// Convert types and forward to
    /// [`nsIMsgOutgoingListener::OnSendStop`]. This is invoked by
    /// [`Self::on_success`] and [`Self::on_failure`].
    fn on_send_stop(
        &self,
        server_uri: SafeUri,
        error: Option<&XpComEwsError>,
        err_msg: Option<nsCString>,
    ) -> Result<(), nsresult> {
        let (status, sec_info) = match error {
            None => (nserror::NS_OK, None),
            Some(rc) => match rc {
                XpComEwsError::Http(moz_http::Error::TransportSecurityFailure {
                    status,
                    transport_security_info,
                }) => (*status, Some(transport_security_info.0.clone())),
                err => (err.into(), None),
            },
        };

        let sec_info = match sec_info {
            Some(sec_info) => RefPtr::forget_into_raw(sec_info),
            None => std::ptr::null(),
        };

        let err_msg = match err_msg {
            Some(msg) => msg,
            None => nsCString::new(),
        };

        let server_uri: RefPtr<nsIURI> = server_uri.into();

        // SAFETY: server_uri is behind a RefPtr, `nsresult`s are safe to use
        // across the Rust/C++ boundary, sec_info is a null pointer iff there
        // was a security error, err_msg is always a valid nsCString.
        unsafe { self.0.OnSendStop(&*server_uri, status, sec_info, &*err_msg) }.to_result()
    }
}

pub struct OnSendStopArg {
    server_uri: SafeUri,
    err_msg: Option<nsCString>,
}

impl<S> From<(SafeUri, Option<S>)> for OnSendStopArg
where
    S: Into<nsCString>,
{
    fn from((server_uri, err_msg): (SafeUri, Option<S>)) -> Self {
        Self {
            server_uri,
            err_msg: err_msg.map(|s| s.into()),
        }
    }
}

impl SafeListener for SafeMsgOutgoingListener {
    type OnSuccessArg = SafeUri;
    type OnFailureArg = OnSendStopArg;

    /// Calls [`nsIMsgOutgoingListener::OnSendStop`] with the appropriate arguments.
    fn on_success(&self, arg: SafeUri) -> Result<(), nsresult> {
        self.on_send_stop(arg, None, None)
    }

    /// Calls [`nsIMsgOutgoingListener::OnSendStop`] with the appropriate arguments.
    fn on_failure(&self, err: &XpComEwsError, arg: OnSendStopArg) -> Result<(), nsresult> {
        self.on_send_stop(arg.server_uri, Some(err), arg.err_msg)
    }
}
