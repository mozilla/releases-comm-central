/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{
    Error, Select,
    pagination::{DeltaItem, DeltaResponse},
    paths,
    types::{
        message::{Message, MessageSelection},
        recipient::Recipient,
    },
};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    headerblock_xpcom::{HeaderBlock, rfc5322_header},
    safe_xpcom::SafeEwsMessageSyncListener,
};
use time::{
    OffsetDateTime,
    format_description::well_known::{Iso8601, Rfc2822},
};
use url::Url;
use xpcom::{RefCounted, RefPtr, interfaces::IHeaderBlock};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoSyncMessagesForFolder<'a> {
    pub listener: &'a SafeEwsMessageSyncListener,
    pub folder_id: String,
    pub sync_state_token: Option<String>,
    pub endpoint: &'a Url,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoSyncMessagesForFolder<'_>
{
    const NAME: &'static str = "sync folder hierarchy";
    type Okay = ();
    type Listener = SafeEwsMessageSyncListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let mut response = match self.sync_state_token {
            Some(ref token) => {
                let request =
                    paths::me_mail_folders_mail_folder_id_messages_delta::GetDelta::try_from(
                        token.as_str(),
                    )?;
                client.send_request(request).await?
            }
            None => {
                let select_properties = vec![
                    MessageSelection::BccRecipients,
                    MessageSelection::BodyPreview,
                    MessageSelection::CcRecipients,
                    MessageSelection::From,
                    MessageSelection::Importance,
                    MessageSelection::InternetMessageId,
                    MessageSelection::IsDraft,
                    MessageSelection::IsRead,
                    MessageSelection::ParentFolderId,
                    MessageSelection::ReceivedDateTime,
                    MessageSelection::ReplyTo,
                    MessageSelection::Sender,
                    MessageSelection::SentDateTime,
                    MessageSelection::Subject,
                    MessageSelection::ToRecipients,
                ];

                let endpoint = self.endpoint.as_str().to_string();
                let folder_id = self.folder_id.clone();
                let mut request = paths::me_mail_folders_mail_folder_id_messages_delta::Get::new(
                    endpoint, folder_id,
                );
                request.select(select_properties);
                client.send_request(request).await?
            }
        };

        loop {
            let messages = response.response();

            for message in messages {
                match message {
                    DeltaItem::Present(message) => {
                        let message_id = message.outlook_item().entity().id()?.to_string();
                        let header_block =
                            headers_for_message(message).ok_or(XpComGraphError::Processing {
                                message: "Failed to get message headers.".to_string(),
                            })?;
                        // TODO
                        // (https://bugzilla.mozilla.org/show_bug.cgi?id=2025016)
                        // Use extended properties to get the message size.
                        let message_size = 0;
                        let is_read = message.is_read().unwrap_or(None).unwrap_or(false);
                        // TODO
                        // (https://bugzilla.mozilla.org/show_bug.cgi?id=2025019)
                        // Get message flagged status.
                        let is_flagged = false;
                        let preview_text = message.body_preview().unwrap_or(None).unwrap_or("");
                        self.listener.on_message_created(
                            message_id,
                            header_block,
                            message_size,
                            is_read,
                            is_flagged,
                            preview_text,
                        )?;
                    }
                    DeltaItem::Removed(message) => {
                        let message_id = message.id().to_string();
                        self.listener.on_message_deleted(message_id)?;
                    }
                }
            }

            match response {
                DeltaResponse::NextLink { next_page, .. } => {
                    response = client.send_request(next_page).await?;
                }
                DeltaResponse::DeltaLink { delta_link, .. } => {
                    self.listener.on_sync_state_token_changed(&delta_link)?;
                    self.sync_state_token = Some(delta_link);
                    break;
                }
            }
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}

    fn into_failure_arg(self) {}
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub async fn sync_messages_for_folder(
        self,
        listener: SafeEwsMessageSyncListener,
        folder_id: String,
        sync_state_token: Option<String>,
    ) {
        let operation = DoSyncMessagesForFolder {
            listener: &listener,
            folder_id,
            sync_state_token,
            endpoint: &self.endpoint,
        };
        operation.handle_operation(&self, &listener).await
    }
}

fn headers_for_message(message: &Message) -> Option<RefPtr<IHeaderBlock>> {
    let mut header_fields = Vec::new();

    // Date
    if let Ok(Some(date_time)) = message.received_date_time() {
        let rfc2822_date_time = iso8601_date_time_to_rfc2822(date_time)?;
        header_fields.push((rfc5322_header::DATE.to_string(), rfc2822_date_time));
    }

    // Message id
    if let Ok(Some(message_id)) = message.internet_message_id() {
        header_fields.push((
            rfc5322_header::MESSAGE_ID.to_string(),
            message_id.to_string(),
        ));
    }

    // From
    if let Ok(from_recipient) = message.from() {
        if let Some(value) = recipient_to_rfc5322(&from_recipient) {
            header_fields.push((rfc5322_header::FROM.to_string(), value));
        }
    }

    // Sender
    if let Ok(sender) = message.sender() {
        if let Some(value) = recipient_to_rfc5322(&sender) {
            header_fields.push((rfc5322_header::SENDER.to_string(), value));
        }
    }

    // Reply to
    if let Ok(reply_tos) = message.reply_to() {
        let value = flatten_recipients(&reply_tos);
        header_fields.push((rfc5322_header::REPLY_TO.to_string(), value));
    }

    // To
    if let Ok(to_recipients) = message.to_recipients() {
        let value = flatten_recipients(&to_recipients);
        header_fields.push((rfc5322_header::TO.to_string(), value));
    }

    // CC
    if let Ok(cc_recipients) = message.cc_recipients() {
        let value = flatten_recipients(&cc_recipients);
        header_fields.push((rfc5322_header::CC.to_string(), value));
    }

    // BCC
    if let Ok(bcc_recipients) = message.bcc_recipients() {
        let value = flatten_recipients(&bcc_recipients);
        header_fields.push((rfc5322_header::BCC.to_string(), value));
    }

    // Subject
    if let Ok(Some(subject)) = message.subject() {
        header_fields.push((rfc5322_header::SUBJECT.to_string(), subject.to_string()))
    }

    // Priority
    if let Ok(importance) = message.importance() {
        header_fields.push((
            rfc5322_header::PRIORITY.to_string(),
            importance.string().unwrap_or("normal").to_string(),
        ))
    }

    HeaderBlock::new(header_fields).query_interface::<IHeaderBlock>()
}

fn flatten_recipients(recipients: &Vec<Recipient<'_>>) -> String {
    recipients
        .iter()
        .filter_map(|recipient| recipient_to_rfc5322(recipient))
        .collect::<Vec<String>>()
        .join(", ")
}

fn recipient_to_rfc5322(from_recipient: &Recipient<'_>) -> Option<String> {
    from_recipient
        .email_address()
        .and_then(|email_address| {
            if let Ok(Some(name)) = email_address.name()
                && let Ok(Some(address)) = email_address.address()
            {
                Ok(format!("{name} <{address}>"))
            } else {
                Err(Error::UnexpectedResponse("".to_string()))
            }
        })
        .ok()
}

fn iso8601_date_time_to_rfc2822(iso8601_date_time: &str) -> Option<String> {
    let parsed = OffsetDateTime::parse(iso8601_date_time, &Iso8601::DEFAULT).ok()?;
    parsed.format(&Rfc2822).ok()
}
