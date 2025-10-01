/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use xpcom::{
    interfaces::{nsIURI, nsIUrlListener},
    RefPtr,
};

use crate::client::XpComEwsError;

use super::{SafeListener, SafeListenerWrapper, SafeUri};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeUrlListener = SafeListenerWrapper<nsIUrlListener>;

impl SafeUrlListener {
    /// Convert types and forward to [`nsIUrlListener::OnStartRunningUrl`].
    pub fn on_start_running_url(&self, uri: SafeUri) -> nsresult {
        let uri: RefPtr<nsIURI> = uri.into();
        // SAFETY: uri points to a valid nsIRUI
        unsafe { self.0.OnStartRunningUrl(&*uri) }
    }

    /// Convert types and forward to [`nsIUrlListener::OnStopRunningUrl`]. This
    /// is invoked by [`Self::on_success`] and [`Self::on_failure`].
    fn on_stop_running_url(&self, uri: SafeUri, status: nsresult) -> nsresult {
        let uri: RefPtr<nsIURI> = uri.into();
        // SAFETY: uri points to a valid nsIRUI
        unsafe { self.0.OnStopRunningUrl(&*uri, status) }
    }
}

impl SafeListener for SafeUrlListener {
    type OnSuccessArg = SafeUri;
    type OnFailureArg = SafeUri;

    /// Calls [`nsIUrlListener::OnStopRunningUrl`] with the appropriate
    /// arguments.
    fn on_success(&self, uri: SafeUri) -> Result<(), nsresult> {
        self.on_stop_running_url(uri, nserror::NS_OK).to_result()?;
        Ok(())
    }

    /// Calls [`nsIUrlListener::OnStopRunningUrl`] with the appropriate
    /// arguments.
    fn on_failure(&self, err: &XpComEwsError, uri: SafeUri) -> Result<(), nsresult> {
        self.on_stop_running_url(uri, err.into()).to_result()?;
        Ok(())
    }
}
