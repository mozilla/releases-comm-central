/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::interfaces::{nsIInputStream, nsIStringInputStream, IEwsMessageFetchListener};

use crate::client::XpComEwsError;

use super::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeEwsMessageFetchListener = SafeListenerWrapper<IEwsMessageFetchListener>;

impl SafeEwsMessageFetchListener {
    /// A safe wrapper for [`IEwsMessageFetchListener::OnFetchStart`].
    pub fn on_fetch_start(&self) -> Result<(), nsresult> {
        // SAFETY: OnFetchStart has no safety preconditions.
        unsafe { self.0.OnFetchStart() }.to_result()
    }

    /// A safe wrapper for [`IEwsMessageFetchListener::OnFetchStop`]. This is
    /// invoked by [`Self::on_success`] and [`Self::on_failure`].
    fn on_fetch_stop(&self, status: nsresult) -> Result<(), nsresult> {
        // SAFETY: nsresult is safe to cross the Rust/C++ boundary.
        unsafe { self.0.OnFetchStop(status) }.to_result()
    }

    /// Convert types and forward to
    /// [`IEwsMessageFetchListener::OnFetchedDataAvailable`].
    pub fn on_fetched_data_available(&self, data: impl AsRef<[u8]>) -> Result<(), XpComEwsError> {
        let data = data.as_ref();
        if data.len() > i32::MAX as usize {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "item is of length {}, larger than supported size of 2GiB",
                    data.len()
                ),
            });
        }

        let stream = xpcom::create_instance::<nsIStringInputStream>(cstr::cstr!(
            "@mozilla.org/io/string-input-stream;1"
        ))
        .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        let data = nsCString::from(data);
        // SAFETY: data is a correctly formatted nsCString, and short enough to
        // safely handle. We use `SetByteStringData()` here instead of one of
        // the alternatives to ensure that the data is copied. Otherwise, the
        // pointer may become invalid before the stream is dropped.
        unsafe { stream.SetByteStringData(&*data) }.to_result()?;

        let stream: &nsIInputStream = stream.coerce();
        // Safety: nsIInputStream is safe to use across the Rust/C++ boundary.
        unsafe { self.0.OnFetchedDataAvailable(stream) }.to_result()?;
        Ok(())
    }
}

impl SafeListener for SafeEwsMessageFetchListener {
    type OnSuccessArg = ();
    type OnFailureArg = ();

    /// Calls [`IEwsMessageFetchListener::OnFetchStop`] with the appropriate arguments.
    fn on_success(&self, _arg: ()) -> Result<(), nsresult> {
        self.on_fetch_stop(nserror::NS_OK)
    }

    /// Calls [`IEwsMessageFetchListener::OnFetchStop`] with the appropriate arguments.
    fn on_failure(&self, err: &XpComEwsError, _arg: ()) -> Result<(), nsresult> {
        self.on_fetch_stop(err.into())
    }
}
