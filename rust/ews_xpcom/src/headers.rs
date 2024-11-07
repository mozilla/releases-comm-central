/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::iter::IntoIterator;

use xpcom::interfaces::{nsMsgPriority, nsMsgPriorityValue};

/// A message from which email headers can be retrieved.
pub(crate) trait MessageHeaders {
    /// The value of the `Message-ID` header for this message.
    fn internet_message_id(&self) -> Option<String>;

    /// Whether the message has already been read.
    fn is_read(&self) -> Option<bool>;

    /// Whether the message has any attachment.
    fn has_attachments(&self) -> Option<bool>;

    /// The time the message was sent, as a Unix timestamp converted to
    /// milliseconds.
    fn sent_timestamp_ms(&self) -> Option<i64>;

    /// The author for this message. This can be the value of either the `From`
    /// or `Sender` header (in order of preference).
    fn author(&self) -> Option<ews::Mailbox>;

    /// The `Reply-To` header for this message.
    fn reply_to_recipient(&self) -> Option<ews::Mailbox>;

    /// The `To` header for this message.
    fn to_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>>;

    /// The `Cc` header for this message.
    fn cc_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>>;

    /// The `Bcc` header for this message.
    fn bcc_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>>;

    /// The `Subject` header for this message.
    fn message_subject(&self) -> Option<String>;

    /// The message's priority/importance. Might be represented by its
    /// `X-Priority` header.
    fn priority(&self) -> Option<nsMsgPriorityValue>;
}

impl MessageHeaders for &ews::Message {
    fn internet_message_id(&self) -> Option<String> {
        self.internet_message_id.clone()
    }

    fn is_read(&self) -> Option<bool> {
        self.is_read
    }

    fn has_attachments(&self) -> Option<bool> {
        self.has_attachments
    }

    fn sent_timestamp_ms(&self) -> Option<i64> {
        self.date_time_sent.as_ref().and_then(|date_time| {
            // `time` gives Unix timestamps in seconds. `PRTime` is an `i64`
            // representing Unix timestamps in microseconds. `PRTime` won't overflow
            // for over 500,000 years, but we use `checked_mul()` to guard against
            // receiving nonsensical values.
            let time_in_micros = date_time.0.unix_timestamp().checked_mul(1_000 * 1_000);
            if time_in_micros.is_none() {
                let item_id = self.item_id.as_ref().map_or_else(
                    || {
                        // We should never receive a `Message` from Exchange without
                        // an ID. We don't want to fail here in case it's not
                        // needed, but we should make sure we log it.
                        log::error!("received message from Exchange server without an item ID");

                        "unknown"
                    },
                    |item_id| item_id.id.as_str(),
                );

                log::warn!(
                    "message with ID {item_id} sent date {date_time:?} too big for `i64`, ignoring",
                );
            }

            time_in_micros
        })
    }

    fn author(&self) -> Option<ews::Mailbox> {
        self.from
            .as_ref()
            .or(self.sender.as_ref())
            .and_then(|recipient| Some(recipient.mailbox.clone()))
    }

    fn reply_to_recipient(&self) -> Option<ews::Mailbox> {
        self.reply_to
            .as_ref()
            .and_then(|recipient| Some(recipient.mailbox.clone()))
    }

    fn to_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>> {
        self.to_recipients
            .as_ref()
            .and_then(|recipients| Some(array_of_recipients_to_mailboxes(recipients)))
    }

    fn cc_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>> {
        self.cc_recipients
            .as_ref()
            .and_then(|recipients| Some(array_of_recipients_to_mailboxes(recipients)))
    }

    fn bcc_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>> {
        self.bcc_recipients
            .as_ref()
            .and_then(|recipients| Some(array_of_recipients_to_mailboxes(recipients)))
    }

    fn message_subject(&self) -> Option<String> {
        self.subject.clone()
    }

    fn priority(&self) -> Option<nsMsgPriorityValue> {
        self.importance.and_then(|importance| {
            Some(match importance {
                ews::Importance::Low => nsMsgPriority::low,
                ews::Importance::Normal => nsMsgPriority::normal,
                ews::Importance::High => nsMsgPriority::high,
            })
        })
    }
}

impl MessageHeaders for &mail_parser::Message<'_> {
    fn internet_message_id(&self) -> Option<String> {
        self.message_id()
            .and_then(|message_id| Some(message_id.to_string()))
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
                        item_id=self.message_id().or(Some("<none>")).unwrap()
                    );

                    None
                },
            })
    }

    fn author(&self) -> Option<ews::Mailbox> {
        self.to()
            .or(self.sender())
            .and_then(|author| author.first())
            .and_then(addr_to_maybe_mailbox)
    }

    fn reply_to_recipient(&self) -> Option<ews::Mailbox> {
        self.reply_to()
            .and_then(|reply_to| reply_to.first())
            .and_then(addr_to_maybe_mailbox)
    }

    fn to_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>> {
        self.to()
            .and_then(|address| Some(address_to_mailboxes(address)))
    }

    fn cc_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>> {
        self.cc()
            .and_then(|address| Some(address_to_mailboxes(address)))
    }

    fn bcc_recipients(&self) -> Option<impl IntoIterator<Item = ews::Mailbox>> {
        self.bcc()
            .and_then(|address| Some(address_to_mailboxes(address)))
    }

    fn message_subject(&self) -> Option<String> {
        self.subject().and_then(|subject| Some(subject.to_string()))
    }

    fn priority(&self) -> Option<nsMsgPriorityValue> {
        self.header("X-Priority")
            .and_then(|value| value.as_text())
            .and_then(|value| value.trim().chars().nth(0))
            .and_then(|first_char| {
                Some(match first_char {
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
                })
            })
    }
}

/// Turns a `mail_parser::Address` into a vector of `ews::Mailbox`es, filtering
/// out any that does not have an e-mail address.
fn address_to_mailboxes(address: &mail_parser::Address) -> Vec<ews::Mailbox> {
    address
        .clone()
        .into_list()
        .iter()
        .filter_map(addr_to_maybe_mailbox)
        .collect()
}

/// Turns the given `mail_parser::Addr` into an `ews::Mailbox`, if its email
/// address is not `None`.
fn addr_to_maybe_mailbox(addr: &mail_parser::Addr) -> Option<ews::Mailbox> {
    match addr.address() {
        Some(address) => Some(ews::Mailbox {
            name: addr
                .name
                .as_ref()
                .and_then(|name| Some(name.clone().into_owned())),
            email_address: address.into(),
            ..Default::default()
        }),
        None => None,
    }
}

/// Turns an `ews::ArrayOfRecipients` into a vector of `ews::Mailbox`es.
fn array_of_recipients_to_mailboxes(recipients: &ews::ArrayOfRecipients) -> Vec<ews::Mailbox> {
    recipients
        .iter()
        .map(|recipient| recipient.mailbox.clone())
        .collect()
}
