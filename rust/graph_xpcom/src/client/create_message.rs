/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use base64::prelude::*;

use ms_graph_tb::types::message::Message;
use ms_graph_tb::{OperationBody, paths::me::messages};
use protocol_shared::safe_xpcom::SafeEwsMessageCreateListener;
use protocol_shared::{authentication::credentials::AuthenticationProvider, client::DoOperation};
use xpcom::RefCounted;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoCreateMessage<'a> {
    pub endpoint: &'a url::Url,
    pub folder_id: String,
    pub is_draft: bool,
    pub is_read: bool,
    pub content: Vec<u8>,
    new_message_id: String,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoCreateMessage<'_>
{
    const NAME: &'static str = "create message";
    type Okay = ();
    type Listener = SafeEwsMessageCreateListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        self.new_message_id = client
            .send_create_message_request(Some(self.folder_id.clone()), &self.content)
            .await?
            .outlook_item()
            .entity()
            .id()?
            .to_string();

        // Now update our message with the draft and read flags. We don't need
        // to check the response, since it should just be the original message
        // with the added properties (and all we need to send is the ID, which
        // we already have).
        let endpoint = self.endpoint.as_str();
        let message_update = Message::new()
            .set_is_draft(Some(self.is_draft))
            .set_is_read(Some(self.is_read));

        let request = messages::message_id::Patch::new(
            endpoint.to_string(),
            self.new_message_id.clone(),
            OperationBody::JSON(message_update),
        );

        client.send_request(request).await?;

        // NOTE: we rely on the on_success()/on_failure() call to invoke
        // on_remote_create_finished().
        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> String {
        self.new_message_id
    }
    fn into_failure_arg(self) {}
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    /// Create a message on the server by performing a [message creation]
    /// request.
    ///
    /// All headers are expected to be included in the provided MIME content.
    ///
    /// [message creation]:
    ///     https://learn.microsoft.com/en-us/graph/api/user-post-messages
    pub async fn create_message(
        self,
        folder_id: String,
        is_draft: bool,
        is_read: bool,
        content: Vec<u8>,
        listener: SafeEwsMessageCreateListener,
    ) {
        let operation = DoCreateMessage {
            endpoint: &self.endpoint,
            folder_id,
            is_draft: is_draft,
            is_read: is_read,
            content,
            new_message_id: String::new(),
        };
        operation.handle_operation(&self, &listener).await;
    }

    /// Creates a message in the given folder with the given content, by
    /// performing a [message creation] request.
    ///
    /// The message move request is always performed without specifying a
    /// folder. If `folder_id` isn't [`None`], a subsequent [message move] is
    /// performed to move the message to the desired final location.
    ///
    /// [message creation]:
    ///     https://learn.microsoft.com/en-us/graph/api/user-post-messages
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    pub async fn send_create_message_request<ContentT: AsRef<[u8]>>(
        &self,
        folder_id: Option<String>,
        content: ContentT,
    ) -> Result<Message<'_>, XpComGraphError> {
        let content = BASE64_STANDARD.encode(content);

        let body = OperationBody::Other {
            content_type: "text/plain".to_string(),
            body: content.as_bytes().to_vec(),
        };

        let request = messages::Post::new(self.endpoint.to_string(), body);
        let message = self.send_request_json_response(request).await?;

        if let Some(folder_id) = folder_id {
            // Ideally we'd create the message using `POST
            // /me/mailFolders/{id}/messages` if a folder ID is specified, but
            // in practice it looks like that endpoint does not support creating
            // messages using raw MIME/RFC822 payloads. So as a workaround, we
            // create the message the same way in both cases and we move it if a
            // folder was specified.
            let message_id = message.outlook_item().entity().id()?.to_string();
            self.send_move_message_request(folder_id, message_id).await
        } else {
            Ok(message)
        }
    }
}
