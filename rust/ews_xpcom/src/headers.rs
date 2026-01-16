/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use protocol_shared::headers::{Mailbox, MessageHeaders};

use xpcom::interfaces::{nsMsgPriority, nsMsgPriorityValue};

/// Wrapper type for [`ews::Message`] for trait implementations.
pub(crate) struct Message<'a>(pub &'a ews::Message);

impl MessageHeaders for Message<'_> {
    fn internet_message_id(&self) -> Option<impl AsRef<str>> {
        self.0.internet_message_id.as_ref()
    }

    fn is_read(&self) -> Option<bool> {
        self.0.is_read
    }

    fn has_attachments(&self) -> Option<bool> {
        self.0.has_attachments
    }

    fn sent_timestamp_ms(&self) -> Option<i64> {
        self.0.date_time_sent.as_ref().and_then(|date_time| {
            // `time` gives Unix timestamps in seconds. `PRTime` is an `i64`
            // representing Unix timestamps in microseconds. `PRTime` won't overflow
            // for over 500,000 years, but we use `checked_mul()` to guard against
            // receiving nonsensical values.
            let time_in_micros = date_time.0.unix_timestamp().checked_mul(1_000 * 1_000);
            if time_in_micros.is_none() {
                let item_id = self.0.item_id.as_ref().map_or_else(
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

    fn author<'a>(&'a self) -> Option<Mailbox<'a>> {
        self.0
            .from
            .as_ref()
            .or(self.0.sender.as_ref())
            .map(|recipient| convert_mailbox(&recipient.mailbox))
    }

    fn reply_to_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.0
            .reply_to
            .as_ref()
            .map(|recipients| &recipients.0)
            .map(|recipients| {
                recipients
                    .iter()
                    .map(|recipient| convert_mailbox(&recipient.mailbox))
            })
    }

    fn to_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.0
            .to_recipients
            .as_ref()
            .map(array_of_recipients_to_mailboxes)
    }

    fn cc_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.0
            .cc_recipients
            .as_ref()
            .map(array_of_recipients_to_mailboxes)
    }

    fn bcc_recipients<'a>(&'a self) -> Option<impl IntoIterator<Item = Mailbox<'a>>> {
        self.0
            .bcc_recipients
            .as_ref()
            .map(array_of_recipients_to_mailboxes)
    }

    fn message_subject(&self) -> Option<impl AsRef<str>> {
        self.0.subject.as_ref()
    }

    fn priority(&self) -> Option<nsMsgPriorityValue> {
        self.0.importance.map(|importance| match importance {
            ews::Importance::Low => nsMsgPriority::low,
            ews::Importance::Normal => nsMsgPriority::normal,
            ews::Importance::High => nsMsgPriority::high,
        })
    }

    fn references(&self) -> Option<impl AsRef<str>> {
        self.0.references.as_ref()
    }

    fn size(&self) -> Option<usize> {
        self.0.size
    }

    fn preview(&self) -> Option<impl AsRef<str>> {
        self.0.preview.as_ref()
    }
}

/// Gets an iterator of mailboxes from an EWS representation of a list of
/// recipients.
fn array_of_recipients_to_mailboxes<'a>(
    recipients: &'a ews::ArrayOfRecipients,
) -> impl Iterator<Item = Mailbox<'a>> {
    recipients
        .iter()
        .map(|recipient| convert_mailbox(&recipient.mailbox))
}

/// Simple conversion between foreign types without `From` implementation.
fn convert_mailbox(mailbox: &ews::Mailbox) -> Mailbox<'_> {
    Mailbox {
        name: mailbox.name.as_deref(),
        email_address: mailbox.email_address.as_deref(),
    }
}
