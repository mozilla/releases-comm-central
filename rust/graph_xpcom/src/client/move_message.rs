/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    OperationBody,
    paths::me::messages::{self, message_id::r#move},
};
use nsstring::nsCString;
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{
        SafeEwsSimpleOperationListener, SafeListener, SimpleOperationSuccessArgs, UseLegacyFallback,
    },
};
use thin_vec::ThinVec;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoMoveMessage {
    pub destination_folder_id: String,
    pub message_ids: Vec<String>,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoMoveMessage
{
    const NAME: &'static str = "move messages";
    type Okay = ThinVec<String>;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // Note: the C++ consumer code expects the order of new messages IDs to
        // match that of the old ones (so that e.g. `new_message_ids[0]` is the
        // new ID for `self.message_ids[0]`).
        let requests = self
            .message_ids
            .iter()
            .map(|message_id| {
                client.move_message_request(self.destination_folder_id.clone(), message_id.clone())
            })
            .collect();

        let responses = client
            .send_batch_request_json_response(requests, Default::default())
            .await?;

        let new_message_ids = responses
            .iter()
            .filter_map(|response| {
                response
                    .outlook_item()
                    .entity()
                    .id()
                    .ok()
                    .map(ToString::to_string)
            })
            .collect();

        Ok(new_message_ids)
    }

    fn into_success_arg(
        self,
        new_message_ids: Self::Okay,
    ) -> <Self::Listener as SafeListener>::OnSuccessArg {
        // If we have a length mismatch, that means something went wrong, but
        // perhaps not the entire request, so we need to tell the client to
        // requery the server to see what happened to the messages.
        let fallback = if new_message_ids.len() == self.message_ids.len() {
            UseLegacyFallback::No
        } else {
            UseLegacyFallback::Yes
        };

        let new_message_ids = new_message_ids.iter().map(nsCString::from).collect();

        SimpleOperationSuccessArgs {
            new_ids: new_message_ids,
            use_legacy_fallback: fallback,
        }
    }

    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Moves messages via Graph.
    ///
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    pub(crate) async fn move_messages(
        self: Arc<XpComGraphClient<ServerT>>,
        destination_folder_id: String,
        message_ids: Vec<String>,
        listener: SafeEwsSimpleOperationListener,
    ) {
        let operation = DoMoveMessage {
            destination_folder_id,
            message_ids,
        };
        operation.handle_operation(&self, &listener).await;
    }

    /// Creates a [message move] request for the given message.
    ///
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    pub(crate) fn move_message_request<'m>(
        &'m self,
        destination_folder_id: String,
        message_id: String,
    ) -> r#move::Post<'m> {
        let body = messages::message_id::r#move::PostRequestBody::new()
            .set_destination_id(destination_folder_id);

        messages::message_id::r#move::Post::new(
            self.base_url().to_string(),
            message_id,
            OperationBody::JSON(body),
        )
    }
}
