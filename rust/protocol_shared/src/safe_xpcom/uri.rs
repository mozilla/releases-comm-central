/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use std::ptr;
use xpcom::{
    get_service, getter_addrefs,
    interfaces::{nsIIOService, nsIURI},
    RefPtr,
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
