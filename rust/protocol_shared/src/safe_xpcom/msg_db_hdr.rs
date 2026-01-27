/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use uuid::Uuid;
use xpcom::{
    RefPtr,
    interfaces::{nsIMsgDBHdr, nsMsgKey, nsMsgPriorityValue},
};

use crate::headers::{Mailbox, MessageHeaders};

/// Wrapper newtype for an [`nsIMsgDBHdr`] that has not yet had its fields
/// updated. This type only exposes safe methods for setting fields, which turns
/// the underlying type into an [`UpdatedMsgDbHeader`].
pub struct StaleMsgDbHeader(RefPtr<nsIMsgDBHdr>);

impl StaleMsgDbHeader {
    /// Sets the fields of a database header object from a collection of message
    /// headers.
    pub fn populate_from_message_headers(
        self,
        msg: impl MessageHeaders,
    ) -> Result<UpdatedMsgDbHeader, nsresult> {
        let internet_message_id = if let Some(internet_message_id) = msg.internet_message_id() {
            internet_message_id.as_ref().to_string()
        } else {
            // Lots of code assumes Message-ID is set and unique, so we need to
            // build something suitable. The value need not be stable, since we
            // only ever set message ID on a new header.
            let uuid = Uuid::new_v4();

            format!("x-moz-uuid:{uuid}", uuid = uuid.hyphenated())
        };

        self.set_message_id(internet_message_id)?;

        if let Some(has_attachments) = msg.has_attachments() {
            self.mark_has_attachments(has_attachments)?;
        }

        if let Some(is_read) = msg.is_read() {
            self.mark_read(is_read)?;
        }

        if let Some(sent) = msg.sent_timestamp_ms() {
            self.set_date(sent)?;
        }

        if let Some(author) = msg.author() {
            self.set_author(author)?;
        }

        if let Some(reply_to) = msg.reply_to_recipients() {
            self.set_reply_to(reply_to)?;
        }

        if let Some(to) = msg.to_recipients() {
            self.set_recipients(to)?;
        }

        if let Some(cc) = msg.cc_recipients() {
            self.set_cc_list(cc)?;
        }

        if let Some(bcc) = msg.bcc_recipients() {
            self.set_bcc_list(bcc)?;
        }

        if let Some(subject) = msg.message_subject() {
            self.set_subject(subject)?;
        }

        if let Some(priority) = msg.priority() {
            self.set_priority(priority)?;
        }

        if let Some(references) = msg.references() {
            self.set_references(references)?;
        }

        if let Some(size) = msg.size() {
            match size.try_into() {
                Ok(size) => {
                    self.set_size(size)?;
                }
                Err(_) => {
                    log::error!(
                        "failed to compute size for message that's larger than supported max size of {}",
                        u32::MAX
                    );
                }
            };
        }

        if let Some(preview) = msg.preview() {
            self.set_preview(preview)?;
        }

        Ok(UpdatedMsgDbHeader(self.0))
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetMessageId`].
    fn set_message_id(&self, message_id: impl AsRef<str>) -> Result<(), nsresult> {
        let message_id = nsCString::from(message_id.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetMessageId(&*message_id) }.to_result()
    }

    /// A safe wrapper for [`nsIMsgDBHdr::MarkHasAttachments`].
    fn mark_has_attachments(&self, has_attachments: bool) -> Result<(), nsresult> {
        // SAFETY: Bools are safe to use across the Rust/C++ boundary.
        unsafe { self.0.MarkHasAttachments(has_attachments) }.to_result()
    }

    /// A safe wrapper for [`nsIMsgDBHdr::MarkRead`].
    fn mark_read(&self, is_read: bool) -> Result<(), nsresult> {
        // SAFETY: Bools are safe to use across the Rust/C++ boundary.
        unsafe { self.0.MarkRead(is_read) }.to_result()
    }

    /// A safe wrapper for [`nsIMsgDBHdr::SetDate`].
    fn set_date(&self, sent: i64) -> Result<(), nsresult> {
        // SAFETY: i64s are safe to use across the Rust/C++ boundary.
        unsafe { self.0.SetDate(sent) }.to_result()
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetAuthor`].
    fn set_author(&self, author: Mailbox) -> Result<(), nsresult> {
        let author = nsCString::from(author.to_string());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetAuthor(&*author) }.to_result()
    }

    /// A safe wrapper for setting the `replyTo` property, via
    /// [`nsIMsgDBHdr::SetStringProperty`], converting types as needed.
    fn set_reply_to<'a>(
        &self,
        reply_to: impl IntoIterator<Item = Mailbox<'a>>,
    ) -> Result<(), nsresult> {
        let reply_to = nsCString::from(
            reply_to
                .into_iter()
                .map(|r| r.to_string())
                .collect::<Vec<_>>()
                .join(","),
        );
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetStringProperty(c"replyTo".as_ptr(), &*reply_to) }.to_result()
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetRecipients`].
    fn set_recipients<'a>(
        &self,
        to: impl IntoIterator<Item = Mailbox<'a>>,
    ) -> Result<(), nsresult> {
        let to = nsCString::from(make_header_string_for_mailbox_list(to));
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetRecipients(&*to) }.to_result()
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetCcList`].
    fn set_cc_list<'a>(&self, cc: impl IntoIterator<Item = Mailbox<'a>>) -> Result<(), nsresult> {
        let cc = nsCString::from(make_header_string_for_mailbox_list(cc));
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetCcList(&*cc) }.to_result()
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetBccList`].
    fn set_bcc_list<'a>(&self, bcc: impl IntoIterator<Item = Mailbox<'a>>) -> Result<(), nsresult> {
        let bcc = nsCString::from(make_header_string_for_mailbox_list(bcc));
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetBccList(&*bcc) }.to_result()
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetSubject`].
    fn set_subject(&self, subject: impl AsRef<str>) -> Result<(), nsresult> {
        let subject = nsCString::from(subject.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetSubject(&*subject) }.to_result()
    }

    /// A safe wrapper for [`nsIMsgDBHdr::SetPriority`].
    fn set_priority(&self, priority: nsMsgPriorityValue) -> Result<(), nsresult> {
        // SAFETY: nsMsgPriorityValues are safe to use across the Rust/C++
        // boundary.
        unsafe { self.0.SetPriority(priority) }.to_result()
    }

    /// Convert types and forward to [`nsIMsgDBHdr::SetReferences`].
    fn set_references(&self, references: impl AsRef<str>) -> Result<(), nsresult> {
        let references = nsCString::from(references.as_ref());
        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe { self.0.SetReferences(&*references) }.to_result()
    }

    /// A safe wrapper for [`nsIMsgDBHdr::SetMessageSize`].
    fn set_size(&self, size: u32) -> Result<(), nsresult> {
        // SAFETY: u32 is safe to cross the Rust/C++ boundary.
        unsafe { self.0.SetMessageSize(size) }.to_result()
    }

    /// A safe wrapper to set the message preview property on a message.
    fn set_preview(&self, preview: impl AsRef<str>) -> Result<(), nsresult> {
        // The display code uses a custom string property on the header property
        // called `preview` to access a short preview of the email.
        let property_name = c"preview";
        let preview_text = nsCString::from(preview.as_ref());
        // SAFETY: The input values are valid and the cast below applies
        // specifically to a C-String that is guaranteed to be null terminated.
        unsafe {
            self.0
                .SetStringProperty(property_name.as_ptr(), &*preview_text)
        }
        .to_result()
    }
}

/// Wrapper newtype for an [`nsIMsgDBHdr`] that is only created by updating the
/// fields of a [`StaleMsgDbHeader`]. Because of this, `UpdatedMsgDbHeader` (and
/// its unwrapped version) is safe to use anywhere that assumes an updated
/// `nsIMsgDBHdr`.
pub struct UpdatedMsgDbHeader(RefPtr<nsIMsgDBHdr>);

impl UpdatedMsgDbHeader {
    /// A safe wrapper for [`nsIMsgDBHdr::GetMessageKey`].
    pub fn get_message_key(&self) -> Result<nsMsgKey, nsresult> {
        let mut key: nsMsgKey = 0;
        // SAFETY: key was initialized and is still live.
        unsafe { self.0.GetMessageKey(&mut key) }.to_result()?;
        Ok(key)
    }
}

impl From<UpdatedMsgDbHeader> for RefPtr<nsIMsgDBHdr> {
    fn from(hdr: UpdatedMsgDbHeader) -> Self {
        hdr.0
    }
}

impl From<&UpdatedMsgDbHeader> for RefPtr<nsIMsgDBHdr> {
    fn from(hdr: &UpdatedMsgDbHeader) -> Self {
        hdr.0.clone()
    }
}

impl From<RefPtr<nsIMsgDBHdr>> for StaleMsgDbHeader {
    fn from(hdr: RefPtr<nsIMsgDBHdr>) -> Self {
        StaleMsgDbHeader(hdr)
    }
}

/// Creates a string representation of a list of mailboxes, suitable for use as
/// the value of an Internet Message Format header.
fn make_header_string_for_mailbox_list<'a>(
    mailboxes: impl IntoIterator<Item = Mailbox<'a>>,
) -> String {
    let strings: Vec<_> = mailboxes
        .into_iter()
        .map(|mailbox| mailbox.to_string())
        .collect();

    strings.join(", ")
}
