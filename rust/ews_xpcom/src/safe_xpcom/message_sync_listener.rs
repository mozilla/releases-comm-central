/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::{getter_addrefs, interfaces::IEwsMessageSyncListener, RefPtr};

use crate::error::XpComEwsError;

use super::{SafeListener, SafeListenerWrapper, StaleMsgDbHeader, UpdatedMsgDbHeader};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeEwsMessageSyncListener = SafeListenerWrapper<IEwsMessageSyncListener>;

impl SafeListenerWrapper<IEwsMessageSyncListener> {
    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnMessageCreated`].
    pub fn on_message_created<S: AsRef<str>>(
        &self,
        message_id: S,
    ) -> Result<StaleMsgDbHeader, nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        getter_addrefs(|hdr| unsafe { self.0.OnMessageCreated(&*ews_id, hdr) })
            .map(|hdr| hdr.into())
    }

    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnMessageUpdated`].
    pub fn on_message_updated<S: AsRef<str>>(
        &self,
        message_id: S,
    ) -> Result<StaleMsgDbHeader, nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        getter_addrefs(|hdr| unsafe { self.0.OnMessageUpdated(&*ews_id, hdr) })
            .map(|hdr| hdr.into())
    }

    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnMessageDeleted`].
    pub fn on_message_deleted<S: AsRef<str>>(&self, message_id: S) -> Result<(), nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnMessageDeleted(&*ews_id) }.to_result()
    }

    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnReadStatusChanged`].
    pub fn on_read_status_changed<S: AsRef<str>>(
        &self,
        message_id: S,
        is_read: bool,
    ) -> Result<(), nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnReadStatusChanged(&*ews_id, is_read) }.to_result()
    }

    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnSyncStateTokenChanged`].
    pub fn on_sync_state_token_changed(&self, sync_state_token: &str) -> Result<(), XpComEwsError> {
        let sync_state = nsCString::from(sync_state_token);
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnSyncStateTokenChanged(&*sync_state) }.to_result()?;
        Ok(())
    }

    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnDetachedHdrPopulated`].
    pub fn on_detached_hdr_populated(&self, hdr: UpdatedMsgDbHeader) -> Result<(), nsresult> {
        let hdr: RefPtr<_> = hdr.into();
        // SAFETY: hdr is behind a safe wrapper, so points to a valid (in the
        // safety sense) header.
        unsafe { self.0.OnDetachedHdrPopulated(&*hdr) }.to_result()
    }

    /// A safe wrapper for
    /// [`IEwsMessageSyncListener::OnExistingHdrChanged`].
    pub fn on_existing_hdr_changed(&self) -> Result<(), nsresult> {
        // SAFETY: Callback takes no arguments.
        unsafe { self.0.OnExistingHdrChanged() }.to_result()
    }
}

impl SafeListener for SafeListenerWrapper<IEwsMessageSyncListener> {
    type OnSuccessArg = ();
    type OnFailureArg = ();

    /// Forward to [`IEwsMessageSyncListener::OnSyncComplete`].
    fn on_success(&self, _arg: ()) -> Result<(), nsresult> {
        // SAFETY: Callback takes no arguments.
        unsafe { self.0.OnSyncComplete() }.to_result()
    }
}
