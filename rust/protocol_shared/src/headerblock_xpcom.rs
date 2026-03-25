/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::{NS_OK, nsresult};
use nsstring::{nsACString, nsCString};
use xpcom::{RefPtr, xpcom, xpcom_method};

pub mod rfc5322_header {
    pub const DATE: &str = "Date";
    pub const MESSAGE_ID: &str = "Message-Id";
    pub const FROM: &str = "From";
    pub const SENDER: &str = "Sender";
    pub const REPLY_TO: &str = "Reply-To";
    pub const TO: &str = "To";
    pub const CC: &str = "Cc";
    pub const BCC: &str = "Bcc";
    pub const SUBJECT: &str = "Subject";
    pub const REFERENCES: &str = "References";
    pub const PRIORITY: &str = "Priority";
}

/// A simple IHeaderBlock implementation.
///
/// Just holds a list of name->value mail header pairs.
/// Designed to be read-only once constructed, so no interior mutability
/// required.
#[xpcom(implement(IHeaderBlock), atomic)]
pub struct HeaderBlock {
    headers: Vec<(String, String)>,
}

impl HeaderBlock {
    pub fn new(hdrs: Vec<(String, String)>) -> RefPtr<Self> {
        HeaderBlock::allocate(InitHeaderBlock { headers: hdrs })
    }

    xpcom_method!(num_headers => GetNumHeaders() -> u32);
    fn num_headers(&self) -> Result<u32, nsresult> {
        Ok(self.headers.len() as u32)
    }

    xpcom_method!( value => Value(index: u32) -> nsACString);
    fn value(&self, index: u32) -> Result<nsCString, nsresult> {
        match self.headers.get(index as usize) {
            Some(entry) => Ok(nsCString::from(entry.1.clone())),
            None => Err(nserror::NS_ERROR_ILLEGAL_VALUE),
        }
    }

    xpcom_method!( name => Name(index: u32) -> nsACString);
    fn name(&self, index: u32) -> Result<nsCString, nsresult> {
        match self.headers.get(index as usize) {
            Some(entry) => Ok(nsCString::from(entry.0.clone())),
            None => Err(nserror::NS_ERROR_ILLEGAL_VALUE),
        }
    }

    xpcom_method!( as_raw => AsRaw() -> nsACString);
    fn as_raw(&self) -> Result<nsCString, nsresult> {
        let raw: nsCString = (self
            .headers
            .iter()
            .map(|(name, value)| format!("{name}: {value}\r\n"))
            .collect::<Vec<String>>()
            .concat()
            + "\r\n") // Blank line to signify end of header block.
            .into();
        Ok(raw)
    }
}
