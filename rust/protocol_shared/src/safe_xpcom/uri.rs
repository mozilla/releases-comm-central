/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::{nsACString, nsCString};
use std::{fmt, ptr};
use xpcom::{
    RefPtr, get_service, getter_addrefs,
    interfaces::{nsIIOService, nsIURI},
};

/// Wrapper newtype for [`nsIURI`] that utilizes only safe Rust types in
/// its public interface and handles converting to unsafe types and call to the
/// underlying unsafe C++ interface with validated data.
#[derive(Clone)]
pub struct SafeUri(RefPtr<nsIURI>);

impl SafeUri {
    /// Constructs a new `SafeUri` using [`nsIIOService::NewURI`].
    pub fn new(uri: impl Into<nsCString>) -> Result<Self, nsresult> {
        let io_service = get_service::<nsIIOService>(c"@mozilla.org/network/io-service;1")
            .ok_or(nserror::NS_ERROR_FAILURE)?;

        let uri: nsCString = uri.into();

        // SAFETY: uri is a valid nsCString, the other two arguments are optional.
        let uri =
            getter_addrefs(|p| unsafe { io_service.NewURI(&*uri, ptr::null(), ptr::null(), p) })?;
        Ok(Self(uri))
    }
}

impl From<SafeUri> for RefPtr<nsIURI> {
    fn from(value: SafeUri) -> Self {
        value.0
    }
}

impl fmt::Display for SafeUri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut out_param = nsCString::new();
        let out: *mut nsACString = (&mut *out_param) as *mut nsACString;

        // SAFETY: out is a pointer to a valid nsCString
        unsafe { self.0.GetSpec(out) };
        write!(f, "{}", out_param)
    }
}
