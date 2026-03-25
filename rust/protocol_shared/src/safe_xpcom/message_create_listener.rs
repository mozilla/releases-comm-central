/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::interfaces::IExchangeMessageCreateListener;

use super::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub type SafeEwsMessageCreateListener = SafeListenerWrapper<IExchangeMessageCreateListener>;

impl SafeEwsMessageCreateListener {
    /// Convert types and forward to [`IExchangeMessageCreateListener::OnRemoteCreateFinished`].
    pub fn on_remote_create_finished(
        &self,
        status: nsresult,
        ews_id: impl AsRef<str>,
    ) -> Result<(), nsresult> {
        let ews_id = nsCString::from(ews_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.OnRemoteCreateFinished(status, &*ews_id) }.to_result()
    }
}

// NOTE: This SafeListener stuff feels a bit jarring here.
// See Bug 2023010
impl SafeListener for SafeEwsMessageCreateListener {
    type OnSuccessArg = String;
    type OnFailureArg = ();

    fn on_success(&self, ews_id: String) -> Result<(), nsresult> {
        self.on_remote_create_finished(nserror::NS_OK, ews_id)
    }

    fn on_failure<E>(&self, err: &E, _arg: ()) -> Result<(), nsresult>
    where
        for<'a> &'a E: Into<nsresult>,
    {
        self.on_remote_create_finished(err.into(), "")
    }
}
