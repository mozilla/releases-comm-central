/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    OperationBody,
    paths::me::messages,
    types::{email_address::EmailAddress, message::Message, recipient::Recipient},
};
use protocol_shared::{
    ServerType,
    client::DoOperation,
    operation_sender::{OperationRequestOptions, TransportSecFailureBehavior},
    outgoing::{OwnedMailbox, SendCapableClient},
    safe_xpcom::{SafeListener, SafeMsgOutgoingListener, SafeUri},
};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoSendMessage<'a> {
    pub listener: &'a SafeMsgOutgoingListener,
    pub mime_content: String,
    pub should_request_dsn: bool,
    pub bcc_recipients: Vec<OwnedMailbox>,
    pub server_uri: SafeUri,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoSendMessage<'_>
{
    const NAME: &'static str = "send message";
    type Okay = ();
    type Listener = SafeMsgOutgoingListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // Notify that the request has started.
        self.listener.on_send_start()?;

        // First, let's create a draft for the message by sending the server its
        // full RFC822 payload. We *could* send in one go with `/me/sendMail`,
        // but since that endpoint only takes *either* structured JSON or
        // base64-encoded RFC822 text, we wouldn't be able to append further
        // information like the DSN flag or the Bcc recipients.
        let message_id = client
            .send_create_message_request(None, &self.mime_content)
            .await?
            .outlook_item()
            .entity()
            .id()?
            .to_string();

        // Update the draft message with the Bcc recipients and the DSN
        // (Delivery Status Notification) flags.
        let bcc_recipients: Vec<_> = self
            .bcc_recipients
            .iter()
            .map(|recipient| {
                let address = EmailAddress::new()
                    .set_name(recipient.name.clone())
                    .set_address(recipient.email_address.clone());

                Recipient::new().set_email_address(address)
            })
            .collect();

        let message_update = Message::new()
            .set_is_delivery_receipt_requested(Some(self.should_request_dsn))
            .set_bcc_recipients(bcc_recipients);

        // Send the update request. We don't need to check the response, since
        // it should just be the original message with the added properties (and
        // all we need to send is the ID, which we already have).
        let base_url = client.base_url();
        let request = messages::message_id::Patch::new(
            base_url.to_string(),
            message_id.clone(),
            OperationBody::JSON(message_update),
        );

        // We don't propagate transport security failures to users here, because
        // `SafeMsgOutgoingListener::on_send_stop` takes care of identifying
        // such errors and bubbling them up to the MessageSend module.
        client
            .send_request(
                request,
                OperationRequestOptions {
                    transport_sec_failure_behavior: TransportSecFailureBehavior::Silent,
                    ..Default::default()
                },
            )
            .await?;

        // Now tell the server to send the draft message we just created.
        let request = messages::message_id::send::Post::new(base_url.to_string(), message_id);
        client
            .send_request(
                request,
                OperationRequestOptions {
                    transport_sec_failure_behavior: TransportSecFailureBehavior::Silent,
                    ..Default::default()
                },
            )
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

impl<ServerT: ServerType> SendCapableClient for XpComGraphClient<ServerT> {
    /// Send a message via Graph.
    ///
    /// This first performs a [message creation] request, then a [message send]
    /// request.
    ///
    /// All headers except for Bcc are expected to be included in the provided
    /// MIME content.
    ///
    /// [message creation]:
    ///     https://learn.microsoft.com/en-us/graph/api/user-post-messages
    /// [message send]: https://learn.microsoft.com/en-us/graph/api/message-send
    async fn send_message(
        self: Arc<XpComGraphClient<ServerT>>,
        mime_content: String,
        _message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<OwnedMailbox>,
        listener: SafeMsgOutgoingListener,
        server_uri: SafeUri,
    ) {
        let operation = DoSendMessage {
            listener: &listener,
            mime_content,
            should_request_dsn,
            bcc_recipients,
            server_uri,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
