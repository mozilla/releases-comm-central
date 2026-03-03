/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::{
    RefPtr,
    interfaces::{IEwsMessageSyncListener, IHeaderBlock},
};

use super::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub type SafeEwsMessageSyncListener = SafeListenerWrapper<IEwsMessageSyncListener>;

impl SafeEwsMessageSyncListener {
    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnMessageCreated`].
    pub fn on_message_created<S: AsRef<str>>(
        &self,
        message_id: S,
        header_block: RefPtr<IHeaderBlock>,
        message_size: u32,
        is_read: bool,
        is_flagged: bool,
        preview_text: &str,
    ) -> Result<(), nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        let preview = nsCString::from(preview_text);
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe {
            self.0.OnMessageCreated(
                &*ews_id,
                header_block.coerce(),
                message_size,
                is_read,
                is_flagged,
                &*preview,
            )
        }
        .to_result()
    }

    /// Convert types and forward to
    /// [`IEwsMessageSyncListener::OnMessageUpdated`].
    pub fn on_message_updated<S: AsRef<str>>(
        &self,
        message_id: S,
        header_block: RefPtr<IHeaderBlock>,
        message_size: u32,
        is_read: bool,
        is_flagged: bool,
        preview_text: &str,
    ) -> Result<(), nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        let preview = nsCString::from(preview_text);

        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe {
            self.0.OnMessageUpdated(
                &*ews_id,
                header_block.coerce(),
                message_size,
                is_read,
                is_flagged,
                &*preview,
            )
        }
        .to_result()
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
    pub fn on_sync_state_token_changed(&self, sync_state_token: &str) -> Result<(), nsresult> {
        let sync_state = nsCString::from(sync_state_token);
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnSyncStateTokenChanged(&*sync_state) }.to_result()
    }
}

impl SafeListener for SafeEwsMessageSyncListener {
    type OnSuccessArg = ();
    type OnFailureArg = ();

    /// Forward to [`IEwsMessageSyncListener::OnSyncComplete`].
    fn on_success(&self, _arg: ()) -> Result<(), nsresult> {
        // SAFETY: Callback takes no arguments.
        unsafe { self.0.OnSyncComplete() }.to_result()
    }
}
