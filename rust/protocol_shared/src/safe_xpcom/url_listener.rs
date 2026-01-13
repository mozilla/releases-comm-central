/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use xpcom::{
    interfaces::{nsIURI, nsIUrlListener},
    RefPtr,
};

use crate::safe_xpcom::SafeUri;

/// See [`SafeListenerWrapper`].
pub struct SafeUrlListener(RefPtr<nsIUrlListener>);

impl SafeUrlListener {
    pub fn new(unsafe_listener: &nsIUrlListener) -> Self {
        Self(RefPtr::new(unsafe_listener))
    }

    /// Convert types and forward to [`nsIUrlListener::OnStartRunningUrl`].
    pub fn on_start_running_url(&self, uri: SafeUri) -> nsresult {
        let uri: RefPtr<nsIURI> = uri.into();
        // SAFETY: uri points to a valid nsIRUI
        unsafe { self.0.OnStartRunningUrl(&*uri) }
    }

    /// Convert types and forward to [`nsIUrlListener::OnStopRunningUrl`]. This
    /// is invoked by [`Self::on_success`] and [`Self::on_failure`].
    pub fn on_stop_running_url(&self, uri: SafeUri, status: nsresult) -> nsresult {
        let uri: RefPtr<nsIURI> = uri.into();
        // SAFETY: uri points to a valid nsIRUI
        unsafe { self.0.OnStopRunningUrl(&*uri, status) }
    }

    /// Get the internal unsafe listener.
    ///
    /// NOTE: This function should not be used. It is implemented here only
    /// while more of the safe listener implementations are moved into this
    /// crate.
    pub unsafe fn unsafe_listener(&self) -> RefPtr<nsIUrlListener> {
        self.0.clone()
    }
}
