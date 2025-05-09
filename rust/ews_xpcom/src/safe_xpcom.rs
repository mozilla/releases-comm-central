/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use xpcom::interfaces::IEwsClient;

pub use folder_callbacks::*;

mod folder_callbacks;

/// Enumeration of error values that uses an equivalent underlying
/// representation to the corresponding error values used in C++ interfaces.
#[repr(u8)]
pub enum EwsClientError {
    AuthenticationFailed = IEwsClient::EWS_ERR_AUTHENTICATION_FAILED,
    Unexpected = IEwsClient::EWS_ERR_UNEXPECTED,
}

impl From<EwsClientError> for u8 {
    fn from(value: EwsClientError) -> Self {
        value as u8
    }
}
