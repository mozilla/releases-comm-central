/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::interfaces::IGraphCalendarEventListener;

use crate::safe_xpcom::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub type SafeGraphCalendarEventListener = SafeListenerWrapper<IGraphCalendarEventListener>;

impl SafeGraphCalendarEventListener {
    /// Convert types and forward to [`IGraphCalendarEventListener::OnEventPresent`]`.
    pub fn on_event_present(
        &self,
        id: String,
        title: String,
        start_date_time: String,
        end_date_time: String,
    ) -> nsresult {
        let id = nsCString::from(id);
        let title = nsCString::from(title);
        let start_date_time = nsCString::from(start_date_time);
        let end_date_time = nsCString::from(end_date_time);
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe {
            self.0.OnEventPresent(
                &raw const *id,
                &raw const *title,
                &raw const *start_date_time,
                &raw const *end_date_time,
            )
        }
    }

    /// Convert types and forward to [`IGraphCalendarEventListener::OnComplete`].
    pub fn on_complete(&self, status_code: nsresult) -> nsresult {
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe { self.0.OnComplete(status_code) }
    }
}

impl SafeListener for SafeGraphCalendarEventListener {
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
