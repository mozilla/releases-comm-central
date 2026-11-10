/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IGraphCalendarEventListener;

use crate::safe_xpcom::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub type SafeGraphCalendarEventListener = SafeListenerWrapper<IGraphCalendarEventListener>;

/// The data associated with a calendar event.
pub struct CalendarEventData {
    pub id: String,
    pub title: String,
    pub start_date_time: String,
    pub end_date_time: String,
    pub start_time_zone: String,
    pub end_time_zone: String,
    pub attendee_email_addresses: Vec<String>,
    pub attendee_common_names: Vec<String>,
    pub attendee_response_statuses: Vec<String>,
    pub attendee_types: Vec<String>,
}

impl SafeGraphCalendarEventListener {
    /// Convert types and forward to [`IGraphCalendarEventListener::OnEventPresent`]`.
    pub fn on_event_present(&self, data: CalendarEventData) -> nsresult {
        let id = nsCString::from(data.id);
        let title = nsCString::from(data.title);
        let start_date_time = nsCString::from(data.start_date_time);
        let end_date_time = nsCString::from(data.end_date_time);
        let start_time_zone = nsCString::from(data.start_time_zone);
        let end_time_zone = nsCString::from(data.end_time_zone);
        let attendee_email_addresses = into_xpcom_array(data.attendee_email_addresses);
        let attendee_common_names = into_xpcom_array(data.attendee_common_names);
        let attendee_response_statuses = into_xpcom_array(data.attendee_response_statuses);
        let attendee_types = into_xpcom_array(data.attendee_types);

        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe {
            self.0.OnEventPresent(
                &raw const *id,
                &raw const *title,
                &raw const *start_date_time,
                &raw const *end_date_time,
                &raw const *start_time_zone,
                &raw const *end_time_zone,
                &raw const attendee_email_addresses,
                &raw const attendee_common_names,
                &raw const attendee_response_statuses,
                &raw const attendee_types,
            )
        }
    }

    /// Convert types and forward to [`IGraphCalendarEventListener::OnEventDeleted`]`.
    pub fn on_event_deleted(&self, event_id: impl AsRef<str>) -> Result<(), nsresult> {
        let id = nsCString::from(event_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnEventDeleted(&raw const *id) }.to_result()
    }

    /// Convert types and forward to [`IGraphCalendarEventListener::OnComplete`].
    pub fn on_complete(&self, status_code: nsresult) -> nsresult {
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe { self.0.OnComplete(status_code) }
    }

    /// Convert types and forward to
    /// [`IGraphCalendarEventListener::OnSyncStateTokenChanged`].
    pub fn on_sync_state_token_changed(&self, sync_state_token: &str) -> Result<(), nsresult> {
        let sync_state = nsCString::from(sync_state_token);
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnSyncStateTokenChanged(&raw const *sync_state) }.to_result()
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

fn into_xpcom_array(strings: Vec<String>) -> ThinVec<nsCString> {
    ThinVec::from(
        strings
            .iter()
            .map(nsCString::from)
            .collect::<Vec<_>>()
            .as_slice(),
    )
}
