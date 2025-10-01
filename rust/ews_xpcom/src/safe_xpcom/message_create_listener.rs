/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::{getter_addrefs, interfaces::IEwsMessageCreateListener, RefPtr};

use crate::client::XpComEwsError;

use super::{SafeListener, SafeListenerWrapper, StaleMsgDbHeader, UpdatedMsgDbHeader};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeEwsMessageCreateListener = SafeListenerWrapper<IEwsMessageCreateListener>;

impl SafeEwsMessageCreateListener {
    /// A safe wrapper for [`IEwsMessageCreateListener::OnStopCreate`]. This is
    /// invoked by [`Self::on_success`] and [`Self::on_failure`].
    fn on_stop_create(&self, status: nsresult) -> Result<(), nsresult> {
        // SAFETY: nsresult is safe to cross the Rust/C++ boundary.
        unsafe { self.0.OnStopCreate(status) }.to_result()
    }

    /// Convert types and forward to [`IEwsMessageCreateListener::OnNewMessageKey`].
    pub fn on_new_message_key(&self, hdr: &UpdatedMsgDbHeader) -> Result<(), nsresult> {
        let key = hdr.get_message_key()?;
        // SAFETY: key was initialized in a way that ensures it is valid, and is
        // safe to cross the Rust/C++ boundary.
        unsafe { self.0.OnNewMessageKey(key) }.to_result()
    }

    /// Convert types and forward to
    /// [`IEwsMessageCreateListener::OnRemoteCreateSuccessful`].
    pub fn on_remote_create_successful(
        &self,
        message_id: impl AsRef<str>,
    ) -> Result<StaleMsgDbHeader, nsresult> {
        let ews_id = nsCString::from(message_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        getter_addrefs(|hdr| unsafe { self.0.OnRemoteCreateSuccessful(&*ews_id, hdr) })
            .map(|hdr| hdr.into())
    }

    /// Convert types and forward to [`IEwsMessageCreateListener::OnHdrPopulated`].
    pub fn on_hdr_populated(&self, hdr: &UpdatedMsgDbHeader) -> Result<(), nsresult> {
        let hdr: RefPtr<_> = hdr.into();
        // SAFETY: hdr is a safe, populated header object, which is safe to
        // cross the Rust/C++ boundary.
        unsafe { self.0.OnHdrPopulated(&*hdr) }.to_result()
    }
}

impl SafeListener for SafeEwsMessageCreateListener {
    type OnSuccessArg = ();
    type OnFailureArg = ();

    /// Calls [`IEwsMessageCreateListener::OnStopCreate`] with the appropriate
    /// arguments.
    fn on_success(&self, _arg: ()) -> Result<(), nsresult> {
        self.on_stop_create(nserror::NS_OK)
    }

    /// Calls [`IEwsMessageCreateListener::OnStopCreate`] with the appropriate
    /// arguments.
    fn on_failure(&self, err: &XpComEwsError, _arg: ()) -> Result<(), nsresult> {
        self.on_stop_create(err.into())
    }
}
