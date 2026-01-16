/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use base64::prelude::{Engine, BASE64_STANDARD};
use ews::{
    create_item::CreateItem, ArrayOfRecipients, Message, MessageDisposition, MimeContent,
    Operation, RealItem, Recipient,
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{uri::SafeUri, SafeListener, SafeMsgOutgoingListener};

use super::{ServerType, TransportSecFailureBehavior, XpComEwsClient, XpComEwsError};

struct DoSendMessage<'a> {
    listener: &'a SafeMsgOutgoingListener,
    mime_content: String,
    message_id: String,
    should_request_dsn: bool,
    bcc_recipients: Vec<Recipient>,
    server_uri: SafeUri,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoSendMessage<'_>
{
    const NAME: &'static str = CreateItem::NAME;
    type Okay = ();
    type Listener = SafeMsgOutgoingListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        // Notify that the request has started.
        self.listener.on_send_start()?;

        let bcc_recipients = if !self.bcc_recipients.is_empty() {
            Some(ArrayOfRecipients(self.bcc_recipients.clone()))
        } else {
            None
        };

        // Create a new message using the default values, and set the ones we
        // need.
        let message = Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(&self.mime_content),
            }),
            is_delivery_receipt_requested: Some(self.should_request_dsn),
            internet_message_id: Some(self.message_id.clone()),
            bcc_recipients,
            ..Default::default()
        };

        let create_item = CreateItem {
            items: vec![RealItem::Message(message)],

            // We don't need EWS to copy messages to the Sent folder after
            // they've been sent, because the internal MessageSend module
            // already takes care of it and will include additional headers we
            // don't send to EWS (such as Bcc).
            message_disposition: Some(MessageDisposition::SendOnly),
            saved_item_folder_id: None,
        };

        // We don't propagate transport security failures to users here, because
        // `SafeMsgOutgoingListener::on_send_stop` takes care of identifying
        // such errors and bubbling them up to the MessageSend module.
        client
            .make_create_item_request(create_item, TransportSecFailureBehavior::Silent)
            .await?;

        Ok(())
    }

    fn into_success_arg(self, _: Self::Okay) -> SafeUri {
        self.server_uri
    }

    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg {
        (self.server_uri, None::<String>).into()
    }
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Send a message by performing a [`CreateItem` operation] via EWS.
    ///
    /// All headers except for Bcc are expected to be included in the provided
    /// MIME content.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    pub async fn send_message(
        self: Arc<XpComEwsClient<ServerT>>,
        mime_content: String,
        message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<Recipient>,
        listener: SafeMsgOutgoingListener,
        server_uri: SafeUri,
    ) {
        let operation = DoSendMessage {
            listener: &listener,
            mime_content,
            message_id,
            should_request_dsn,
            bcc_recipients,
            server_uri,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
