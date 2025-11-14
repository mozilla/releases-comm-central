/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::fmt;
use std::vec::Vec;

use nsstring::nsCString;
use xpcom::interfaces::nsIHttpChannel;
use xpcom::RefPtr;

use crate::error::Error;

/// The status code of an HTTP response.
#[derive(Debug, Clone, Copy)]
pub struct StatusCode(pub u32);

impl StatusCode {
    /// Check if status is within 400-499.
    pub fn is_client_error(&self) -> bool {
        500 > self.0 && self.0 >= 400
    }

    /// Check if status is within 500-599.
    pub fn is_server_error(&self) -> bool {
        600 > self.0 && self.0 >= 500
    }
}

impl fmt::Display for StatusCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// An HTTP response resulting from a previous request.
///
/// The response body can be read from the `body` field.
pub struct Response {
    pub(crate) channel: RefPtr<nsIHttpChannel>,
    pub(crate) body: Vec<u8>,
}

impl Response {
    /// Retrieves the status code number from the response.
    pub fn status(&self) -> crate::Result<StatusCode> {
        let mut retval: u32 = 0;

        unsafe {
            self.channel.GetResponseStatus(&mut retval).to_result()?;
        }

        Ok(StatusCode(retval))
    }

    /// Returns an [`Error`] if the server responded with either a client or
    /// server error (i.e. if the response's status code is between 400 and
    /// 599).
    ///
    /// [`Error`]: crate::Error
    pub fn error_from_status(self) -> crate::Result<Self> {
        let status = self.status()?;

        if status.is_client_error() || status.is_server_error() {
            return Err(Error::StatusCode {
                status,
                response: self,
            });
        }

        Ok(self)
    }

    /// Retrieves the values of the response headers with the given name.
    pub fn header(&self, key: String) -> crate::Result<Vec<String>> {
        let key = nsCString::from(key);
        let mut value = nsCString::new();

        unsafe {
            self.channel
                .GetResponseHeader(&*key, &mut *value)
                .to_result()?;
        }

        // If there are multiple headers with the same name, Necko seems to
        // place each value on a different line (without a trailing line break
        // at the end of the last value), so splitting on line breaks splits
        // them up nicely.
        let value: Vec<String> = value
            .to_utf8()
            .split("\n")
            .map(|split| split.to_string())
            .collect();

        Ok(value)
    }

    /// Retrieves the body bytes from the response.
    pub fn body(&self) -> &[u8] {
        self.body.as_slice()
    }
}

impl fmt::Debug for Response {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut f = f.debug_struct("Response");
        f.field("status", &self.status());
        if let Ok(ref body) = core::str::from_utf8(&self.body) {
            f.field("body", body);
        } else {
            f.field("body", &self.body);
        }
        f.finish()
    }
}
