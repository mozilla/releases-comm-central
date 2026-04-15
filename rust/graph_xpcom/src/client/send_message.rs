/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    OperationBody, paths,
    types::{email_address::EmailAddress, message::Message, recipient::Recipient},
};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    outgoing::{OwnedMailbox, SendCapableClient},
    safe_xpcom::{SafeListener, SafeMsgOutgoingListener, SafeUri},
};
use xpcom::RefCounted;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoSendMessage<'a> {
    pub endpoint: &'a url::Url,
    pub listener: &'a SafeMsgOutgoingListener,
    pub mime_content: String,
    pub should_request_dsn: bool,
    pub bcc_recipients: Vec<OwnedMailbox>,
    pub server_uri: SafeUri,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoSendMessage<'_>
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
        let endpoint = self.endpoint.as_str();
        let request = paths::me_messages_message_id::Patch::new(
            endpoint.to_string(),
            message_id.clone(),
            OperationBody::JSON(message_update),
        );
        client.send_request(request).await?;

        // Now tell the server to send the draft message we just created.
        let request =
            paths::me_messages_message_id_send::Post::new(self.endpoint.to_string(), message_id);
        client.send_request(request).await?;

        Ok(())
    }

    fn into_success_arg(self, _: Self::Okay) -> SafeUri {
        self.server_uri
    }

    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg {
        (self.server_uri, None::<String>).into()
    }
}

impl<ServerT: AuthenticationProvider + RefCounted> SendCapableClient for XpComGraphClient<ServerT> {
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
            endpoint: &self.endpoint,
            listener: &listener,
            mime_content,
            should_request_dsn,
            bcc_recipients,
            server_uri,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
