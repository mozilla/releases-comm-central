/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::interfaces::IGraphCalendarDiscoveryListener;

use crate::safe_xpcom::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub type SafeCalendarListener = SafeListenerWrapper<IGraphCalendarDiscoveryListener>;

impl SafeCalendarListener {
    /// Convert types and forward to [`IGraphCalendarDiscoveryListener::OnCalendarsDiscovered`].
    pub fn on_calendar_discovered(&self, id: String, name: String, read_only: bool) -> nsresult {
        let id = nsCString::from(id);
        let name = nsCString::from(name);
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe {
            self.0
                .OnCalendarDiscovered(&raw const *id, &raw const *name, read_only)
        }
    }

    /// Convert types and forward to [`IGraphCalendarDiscoveryListener::OnFailure`].
    pub fn on_complete(&self, status_code: nsresult) -> nsresult {
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe { self.0.OnComplete(status_code) }
    }
}

impl SafeListener for SafeCalendarListener {
    type OnSuccessArg = ();
    type OnFailureArg = ();

    fn on_success(&self, _ok: Self::OnSuccessArg) -> Result<(), nsresult> {
        self.on_complete(nserror::NS_OK).to_result()
    }

    fn on_failure<E>(&self, err: &E, _arg: Self::OnFailureArg) -> Result<(), nsresult>
    where
        for<'a> &'a E: Into<nsresult> + TryInto<&'a moz_http::Error>,
        E: std::fmt::Debug,
    {
        self.on_complete(err.into()).to_result()
    }
}
