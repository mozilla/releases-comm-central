/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use protocol_shared::{
    headerblock_xpcom::{HeaderBlock, rfc5322_header},
    headers::Mailbox,
};
use std::collections::HashMap;
use xpcom::RefPtr;

use time::format_description::well_known::Rfc2822;

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
        out.insert(rfc5322_header::DATE.to_string(), formatted);
    }

    if let Some(message_id) = &msg.internet_message_id {
        out.insert(rfc5322_header::MESSAGE_ID.to_string(), message_id.clone());
    }

    if let Some(from) = &msg.from {
        out.insert(
            rfc5322_header::FROM.to_string(),
            mailbox_to_string(&from.mailbox),
        );
    }

    if let Some(sender) = &msg.sender {
        out.insert(
            rfc5322_header::SENDER.to_string(),
            mailbox_to_string(&sender.mailbox),
        );
    }

    if let Some(reply_to) = &msg.reply_to {
        out.insert(
            rfc5322_header::REPLY_TO.to_string(),
            flatten_recipients(reply_to),
        );
    }

    if let Some(to) = &msg.to_recipients {
        out.insert(rfc5322_header::TO.to_string(), flatten_recipients(to));
    }
    if let Some(cc) = &msg.cc_recipients {
        out.insert(rfc5322_header::CC.to_string(), flatten_recipients(cc));
    }
    if let Some(bcc) = &msg.bcc_recipients {
        out.insert(rfc5322_header::BCC.to_string(), flatten_recipients(bcc));
    }

    if let Some(subject) = &msg.subject {
        out.insert(rfc5322_header::SUBJECT.to_string(), subject.clone());
    }

    if let Some(references) = &msg.references {
        out.insert(rfc5322_header::REFERENCES.to_string(), references.clone());
    }

    // Map importance to "Priority:", an X.400 import - see RFC2156.
    let opt_pri = match &msg.importance {
        Some(ews::Importance::Low) => Some("non-urgent"),
        Some(ews::Importance::Normal) => Some("normal"),
        Some(ews::Importance::High) => Some("urgent"),
        None => None,
    };
    if let Some(pri) = &opt_pri {
        out.insert(rfc5322_header::PRIORITY.to_string(), pri.to_string());
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
