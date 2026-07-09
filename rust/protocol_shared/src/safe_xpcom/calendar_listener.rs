/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IGraphCalendarDiscoveryListener;

use crate::safe_xpcom::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub type SafeCalendarListener = SafeListenerWrapper<IGraphCalendarDiscoveryListener>;

impl SafeCalendarListener {
    /// Convert types and forward to [`IGraphCalendarDiscoveryListener::OnCalendarsDiscovered`].
    fn on_calendars_discovered(&self, calendars: ThinVec<nsCString>) -> nsresult {
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe {
            self.0.OnCalendarsDiscovered(&raw const calendars)
        }
    }

    /// Convert types and forward to [`IGraphCalendarDiscoveryListener::OnFailure`].
    fn on_failure(&self, error_status: nsresult) -> nsresult {
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe {
            self.0.OnFailure(error_status)
        }
    }
}

impl SafeListener for SafeCalendarListener {
    type OnSuccessArg = ThinVec<nsCString>;
    type OnFailureArg = ();

    fn on_success(&self, calendars: ThinVec<nsCString>) -> Result<(), nsresult> {
        self.on_calendars_discovered(calendars).to_result()
    }

    fn on_failure<E>(&self, err: &E, _arg: Self::OnFailureArg) -> Result<(), nsresult>
    where
        for<'a> &'a E: Into<nsresult> + TryInto<&'a moz_http::Error>,
        E: std::fmt::Debug,
    {
        self.on_failure(err.into()).to_result()
    }
}
