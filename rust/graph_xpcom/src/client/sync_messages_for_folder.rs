/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;

use ms_graph_tb::{
    Error, Select, define_svlep,
    extended_properties::{SingleValueExtendedPropertiesOp, SingleValueExtendedPropertiesType},
    pagination::{DeltaItem, DeltaResponse},
    paths::me::mail_folders::mail_folder_id::messages,
    types::{
        internet_message_header::InternetMessageHeader,
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

define_svlep!(PID_TAG_MESSAGE_SIZE, Integer, 0x0E08);

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
                let request = messages::delta::GetDelta::try_from(token.as_str())?;
                client.send_request_json_response(request).await?
            }
            None => {
                let select_properties = vec![
                    MessageSelection::BccRecipients,
                    MessageSelection::BodyPreview,
                    MessageSelection::CcRecipients,
                    MessageSelection::From,
                    MessageSelection::Importance,
                    MessageSelection::InternetMessageHeaders,
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
                let mut request = messages::delta::Get::new(endpoint, folder_id);
                request.select(select_properties);
                request.expand_typed_svlep([PID_TAG_MESSAGE_SIZE]);
                client.send_request_json_response(request).await?
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
                        let message_size = message
                            .typed_svlep(PID_TAG_MESSAGE_SIZE)?
                            .and_then(|message_size| message_size.try_into().ok())
                            .unwrap_or(0);
                        let is_read = message.is_read()?.ok_or(XpComGraphError::Processing {
                            message: "isRead not present in response despite being requested"
                                .into(),
                        })?;
                        // TODO
                        // (https://bugzilla.mozilla.org/show_bug.cgi?id=2025019)
                        // Get message flagged status.
                        let is_flagged = false;
                        let preview_text = message.body_preview().unwrap_or(None).unwrap_or("");

                        log::debug!("Found message in response with ID {message_id}");

                        // Graph doesn't provide a way to consistently
                        // distinguish new and updated objects, so it's tracked
                        // here by attempting to modify the folders and falling
                        // back to creating them.
                        let result = self.listener.on_message_updated(
                            message_id.clone(),
                            header_block.clone(),
                            message_size,
                            is_read,
                            is_flagged,
                            preview_text,
                        );

                        if let Err(nserror::NS_MSG_MESSAGE_NOT_FOUND) = result {
                            log::debug!("Creating message {message_id}");

                            self.listener.on_message_created(
                                message_id,
                                header_block,
                                message_size,
                                is_read,
                                is_flagged,
                                preview_text,
                            )?;
                        } else {
                            result?;
                            log::debug!("Updated message {message_id}");
                        }
                    }
                    DeltaItem::Removed(message) => {
                        let message_id = message.id().to_string();
                        log::debug!("Deleting message with id {message_id}");
                        self.listener.on_message_deleted(message_id)?;
                    }
                }
            }

            match response {
                DeltaResponse::NextLink { next_page, .. } => {
                    response = client.send_request_json_response(next_page).await?;
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
    let mut header_fields = HashMap::new();

    // Date
    if let Ok(Some(date_time)) = message.sent_date_time() {
        let rfc2822_date_time = iso8601_date_time_to_rfc2822(date_time)?;
        header_fields.insert(rfc5322_header::DATE.to_string(), rfc2822_date_time);
    }

    // Message id
    if let Ok(Some(message_id)) = message.internet_message_id() {
        header_fields.insert(
            rfc5322_header::MESSAGE_ID.to_string(),
            message_id.to_string(),
        );
    }

    // From
    if let Ok(from_recipient) = message.from()
        && let Some(value) = recipient_to_rfc5322(&from_recipient)
    {
        header_fields.insert(rfc5322_header::FROM.to_string(), value);
    }

    // Sender
    if let Ok(sender) = message.sender()
        && let Some(value) = recipient_to_rfc5322(&sender)
    {
        header_fields.insert(rfc5322_header::SENDER.to_string(), value);
    }

    // Reply to
    if let Ok(reply_tos) = message.reply_to() {
        let value = flatten_recipients(&reply_tos);
        header_fields.insert(rfc5322_header::REPLY_TO.to_string(), value);
    }

    // To
    if let Ok(to_recipients) = message.to_recipients() {
        let value = flatten_recipients(&to_recipients);
        header_fields.insert(rfc5322_header::TO.to_string(), value);
    }

    // CC
    if let Ok(cc_recipients) = message.cc_recipients() {
        let value = flatten_recipients(&cc_recipients);
        header_fields.insert(rfc5322_header::CC.to_string(), value);
    }

    // BCC
    if let Ok(bcc_recipients) = message.bcc_recipients() {
        let value = flatten_recipients(&bcc_recipients);
        header_fields.insert(rfc5322_header::BCC.to_string(), value);
    }

    // Subject
    if let Ok(Some(subject)) = message.subject() {
        header_fields.insert(rfc5322_header::SUBJECT.to_string(), subject.to_string());
    }

    // Priority
    if let Ok(importance) = message.importance() {
        header_fields.insert(
            rfc5322_header::PRIORITY.to_string(),
            importance.string().unwrap_or("normal").to_string(),
        );
    }

    if let Ok(internet_message_headers) = message.internet_message_headers() {
        overlay_internet_message_headers(&mut header_fields, &internet_message_headers);
    }

    HeaderBlock::new(header_fields.into_iter().collect()).query_interface::<IHeaderBlock>()
}

fn overlay_internet_message_headers(
    headers: &mut HashMap<String, String>,
    internet_message_headers: &Vec<InternetMessageHeader>,
) {
    for header in internet_message_headers {
        if let Ok(Some(key)) = header.name()
            && let Ok(Some(value)) = header.value()
        {
            if !headers.contains_key(key) {
                headers.insert(key.to_string(), value.to_string());
            }
        }
    }
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
