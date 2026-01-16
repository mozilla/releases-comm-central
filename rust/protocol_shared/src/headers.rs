/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::iter::IntoIterator;

use mail_parser::HeaderName;

use xpcom::interfaces::{nsMsgPriority, nsMsgPriorityValue};

/// A message from which email headers can be retrieved.
pub trait MessageHeaders {
    /// The value of the `Message-ID` header for this message.
    fn internet_message_id(&self) -> Option<impl AsRef<str>>;

    /// Whether the message has already been read.
    fn is_read(&self) -> Option<bool>;

    /// Whether the message has any attachment.
    fn has_attachments(&self) -> Option<bool>;

    /// The time the message was sent, as a Unix timestamp converted to
    /// milliseconds.
    fn sent_timestamp_ms(&self) -> Option<i64>;

    /// The author for this message. This can be the value of either the `From`
    /// or `Sender` header (in order of preference).
    fn author<'a>(&'a self) -> Option<Mailbox<'a>>;

    /// The `Reply-To` header for this message.
    fn reply_to_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>>;

    /// The `To` header for this message.
    fn to_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>>;

    /// The `Cc` header for this message.
    fn cc_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>>;

    /// The `Bcc` header for this message.
    fn bcc_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>>;

    /// The `Subject` header for this message.
    fn message_subject(&self) -> Option<impl AsRef<str>>;

    /// The message's priority/importance. Might be represented by its
    /// `X-Priority` header.
    fn priority(&self) -> Option<nsMsgPriorityValue>;

    /// The messages this message refers to. This is a string which follows the
    /// format of the `References` header described in RFC822.
    fn references(&self) -> Option<impl AsRef<str>>;

    /// The size of the message in bytes.
    fn size(&self) -> Option<usize>;

    /// A short preview string for the message.
    fn preview(&self) -> Option<impl AsRef<str>>;
}

impl MessageHeaders for mail_parser::Message<'_> {
    fn internet_message_id(&self) -> Option<impl AsRef<str>> {
        self.message_id()
    }

    fn is_read(&self) -> Option<bool> {
        // TODO: read this value from the X-Mozilla-Status header
        Some(false)
    }

    fn has_attachments(&self) -> Option<bool> {
        Some(self.attachment_count() > 0)
    }

    fn sent_timestamp_ms(&self) -> Option<i64> {
        self.date()
            .and_then(|date_time| match date_time.to_timestamp().checked_mul(1_000 * 1_000) {
                Some(timestamp_ms) => Some(timestamp_ms),
                None => {
                    log::warn!(
                        "message with ID {item_id} sent date {date_time:?} too big for `i64`, ignoring",
                        item_id=self.message_id().unwrap_or("<none>")
                    );

                    None
                },
            })
    }

    fn author<'a>(&'a self) -> Option<Mailbox<'a>> {
        self.to()
            .or(self.sender())
            .and_then(mail_parser::Address::first)
            .and_then(|addr| addr.try_into().ok())
    }

    fn reply_to_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.reply_to().map(|addr| addr.iter()).and_then(|addrs| {
            addrs
                .into_iter()
                .map(|addr| addr.try_into().ok())
                .collect::<Option<Vec<Mailbox<'a>>>>()
        })
    }

    fn to_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.to().map(address_to_mailboxes)
    }

    fn cc_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.cc().map(address_to_mailboxes)
    }

    fn bcc_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.bcc().map(address_to_mailboxes)
    }

    fn message_subject(&self) -> Option<impl AsRef<str>> {
        self.subject()
    }

    fn priority(&self) -> Option<nsMsgPriorityValue> {
        self.header("X-Priority")
            .and_then(|value| value.as_text())
            .and_then(|value| value.trim().chars().nth(0))
            .map(|first_char| {
                match first_char {
                    // Annoyingly, the indices in nsMsgPriority don't match with the
                    // integer values in the header. These pairings come from
                    // https://people.dsv.su.se/~jpalme/ietf/ietf-mail-attributes.html#Heading14,
                    // and `NS_MsgGetPriorityFromString`.
                    '1' => nsMsgPriority::highest,
                    '2' => nsMsgPriority::high,
                    '3' => nsMsgPriority::normal,
                    '4' => nsMsgPriority::low,
                    '5' => nsMsgPriority::lowest,
                    _ => nsMsgPriority::Default,
                }
            })
    }

    fn references(&self) -> Option<impl AsRef<str>> {
        self.header(HeaderName::References)
            .and_then(|value| value.as_text())
    }

    fn size(&self) -> Option<usize> {
        Some(self.raw_message.len())
    }

    fn preview(&self) -> Option<impl AsRef<str>> {
        None::<String>
    }
}

/// Gets an iterator of mailboxes from a `mail_parser` address field, filtering
/// out any addresses which do not have an associated email address.
fn address_to_mailboxes<'a>(
    address: &'a mail_parser::Address,
) -> impl Iterator<Item = Mailbox<'a>> {
    address.iter().filter_map(|addr| addr.try_into().ok())
}

#[derive(Clone, Copy, Debug)]
pub struct Mailbox<'a> {
    pub name: Option<&'a str>,
    pub email_address: Option<&'a str>,
}

impl<'a> TryFrom<&'a mail_parser::Addr<'_>> for Mailbox<'a> {
    type Error = ();

    fn try_from(value: &'a mail_parser::Addr) -> Result<Self, Self::Error> {
        value.address.as_ref().ok_or(()).map(|address| Mailbox {
            name: value.name.as_ref().map(|name| name.as_ref()),
            email_address: Some(address.as_ref()),
        })
    }
}

impl std::fmt::Display for Mailbox<'_> {
    /// Writes the contents of the mailbox in a format suitable for use in an
    /// Internet Message Format header.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(name) = self.name {
            let mut buf: Vec<u8> = Vec::new();

            // TODO: It may not be okay to unwrap here (could hit OOM, mainly), but
            // it isn't clear how we can handle that appropriately.
            mail_builder::encoders::encode::rfc2047_encode(name, &mut buf).unwrap();

            // It's okay to unwrap here, as successful RFC 2047 encoding implies the
            // result is ASCII.
            let name = std::str::from_utf8(&buf).unwrap();
            write!(f, "{name}")?;

            if let Some(address) = self.email_address {
                write!(f, " <{address}>")?;
            }
        } else if let Some(address) = self.email_address {
            write!(f, "{address}")?;
        }

        Ok(())
    }
}
