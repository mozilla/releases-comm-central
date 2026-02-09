/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use nserror::{NS_OK, nsresult};
use nsstring::{nsACString, nsCString};
use protocol_shared::headers::Mailbox;
use std::collections::HashMap;
use xpcom::{RefPtr, xpcom, xpcom_method};

use time::format_description::well_known::Rfc2822;

/// A simple IHeaderBlock implementation.
/// Just holds a list of name->value mail header pairs.
/// Designed to be read-only once constructed, so no interior mutability
/// required.
#[xpcom(implement(IHeaderBlock), atomic)]
pub(crate) struct HeaderBlock {
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

fn mailbox_to_string(mailbox: &ews::Mailbox) -> String {
    Mailbox {
        name: mailbox.name.as_deref(),
        email_address: mailbox.email_address.as_deref(),
    }
    .to_string()
}

fn flatten_recipients(recipients: &ews::ArrayOfRecipients) -> String {
    recipients
        .iter()
        .map(|x| mailbox_to_string(&x.mailbox))
        .collect::<Vec<String>>()
        .join(", ")
}

/// Convert a few vital fields of an ews::Message into RFC5322 headers.
fn extract_core(msg: &ews::Message) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();

    if let Some(dt) = &msg.date_time_sent
        && let Ok(formatted) = dt.0.format(&Rfc2822)
    {
        out.insert("Date".to_string(), formatted);
    }

    if let Some(message_id) = &msg.internet_message_id {
        out.insert("Message-Id".to_string(), message_id.clone());
    }

    if let Some(from) = &msg.from {
        out.insert("From".to_string(), mailbox_to_string(&from.mailbox));
    }

    if let Some(sender) = &msg.sender {
        out.insert("Sender".to_string(), mailbox_to_string(&sender.mailbox));
    }

    if let Some(reply_to) = &msg.reply_to {
        out.insert("Reply-To".to_string(), flatten_recipients(reply_to));
    }

    if let Some(to) = &msg.to_recipients {
        out.insert("To".to_string(), flatten_recipients(to));
    }
    if let Some(cc) = &msg.cc_recipients {
        out.insert("Cc".to_string(), flatten_recipients(cc));
    }
    if let Some(bcc) = &msg.bcc_recipients {
        out.insert("Bcc".to_string(), flatten_recipients(bcc));
    }

    if let Some(subject) = &msg.subject {
        out.insert("Subject".to_string(), subject.clone());
    }

    if let Some(references) = &msg.references {
        out.insert("References".to_string(), references.clone());
    }

    // Map importance to "Priority:", an X.400 import - see RFC2156.
    let opt_pri = match &msg.importance {
        Some(ews::Importance::Low) => Some("non-urgent"),
        Some(ews::Importance::Normal) => Some("normal"),
        Some(ews::Importance::High) => Some("urgent"),
        None => None,
    };
    if let Some(pri) = &opt_pri {
        out.insert("Priority".to_string(), pri.to_string());
    }
    out
}

/// Produce a HeaderBlock from an EWS Message.
/// The result should have the kind of RFC5322-style headers you'd expect in
/// a standard email.
///
/// To do this we need to combine the EWS-native Message fields with the
/// just-along-for-the-ride internet_message_headers data.
/// We can't just use the internet_message_headers data because:
/// a) the internet_message_headers don't include address fields - "To:",
///   "From:" etc...
/// b) it's possible that internet_message_headers data is missing
///    entirely for messages which have only ever been on exchange servers.
#[allow(unused)]
pub fn extract_headers(msg: &ews::Message) -> RefPtr<HeaderBlock> {
    // Part one - convert message fields to RFC5322 equivalents.
    let core = extract_core(msg);

    // Part two - add in the Internet message headers...
    // Avoid duplicating existing headers.
    let mut headers: Vec<(String, String)> = match &msg.internet_message_headers {
        Some(h) => h
            .internet_message_header
            .iter()
            .filter_map(|x| {
                let val = x.value.clone().unwrap_or("".to_string());
                if core.get(&x.header_name) == Some(&val) {
                    None // Discard duplicate
                } else {
                    Some((x.header_name.clone(), val))
                }
            })
            .collect(),
        None => vec![],
    };

    headers.extend(core);
    HeaderBlock::new(headers)
}

// Unit test wishlist:
//
// For this rust implementation:
// - Ensure asRaw() includes the blank line at the end.
// - Ensure field values with RFC2047 encoding are _not_ decoded.
// - Ensure translated fields like msg.importance map to sensible values in RFC5322 output.
// - more...
//
// When there's a C++ version which wraps (and parses) raw header blocks:
// - Ensure field values with non ascii (UTF-8) are produced OK (to ensure RFC5335 compliance).
// - Ensure folded values pop out OK.
// - more...
//
