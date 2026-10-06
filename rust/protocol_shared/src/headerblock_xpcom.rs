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

/// Header fields which are only ever written locally, and must not be accepted
/// from a server.
const LOCAL_ONLY_HEADERS: [&str; 4] = [
    "X-Mozilla-Status",
    "X-Mozilla-Status2",
    "X-Mozilla-Keys",
    "X-Account-Key",
];

/// Whether `name` is a valid RFC5322 field name (printable US-ASCII, except
/// colon).
fn is_valid_header_name(name: &str) -> bool {
    !name.is_empty() && name.bytes().all(|b| (33..=126).contains(&b) && b != b':')
}

/// Remove line breaks from a header value, so it can't spill over into
/// additional header fields once serialized.
fn sanitize_header_value(value: &str) -> String {
    value.replace('\r', "").replace('\n', " ")
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
    /// Create a HeaderBlock from server-provided header fields. Fields with
    /// invalid or local-only names are dropped, and line breaks in values are
    /// replaced with spaces.
    pub fn new(hdrs: Vec<(String, String)>) -> RefPtr<Self> {
        let headers = hdrs
            .into_iter()
            .filter(|(name, _)| {
                is_valid_header_name(name)
                    && !LOCAL_ONLY_HEADERS
                        .iter()
                        .any(|local| local.eq_ignore_ascii_case(name))
            })
            .map(|(name, value)| (name, sanitize_header_value(&value)))
            .collect();
        HeaderBlock::allocate(InitHeaderBlock { headers })
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
