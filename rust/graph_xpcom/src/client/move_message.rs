/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{OperationBody, paths, types::message::Message};
use nsstring::nsCString;
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    safe_xpcom::{
        SafeEwsSimpleOperationListener, SafeListener, SimpleOperationSuccessArgs, UseLegacyFallback,
    },
};
use thin_vec::ThinVec;
use xpcom::RefCounted;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoMoveMessage {
    pub destination_folder_id: String,
    pub message_ids: Vec<String>,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoMoveMessage
{
    const NAME: &'static str = "move messages";
    type Okay = ThinVec<String>;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let mut new_message_ids = ThinVec::new();

        // Note: the C++ consumer code expects the order of new messages IDs to
        // match that of the old ones (so that e.g. `new_message_ids[0]` is the
        // new ID for `self.message_ids[0]`).
        for message_id in &self.message_ids {
            let message = client
                .send_move_message_request(self.destination_folder_id.clone(), message_id.clone())
                .await?;

            let message_id = message.outlook_item().entity().id()?.to_string();
            new_message_ids.push(message_id);
        }

        Ok(new_message_ids)
    }

    fn into_success_arg(
        self,
        new_message_ids: Self::Okay,
    ) -> <Self::Listener as SafeListener>::OnSuccessArg {
        let new_message_ids = new_message_ids.iter().map(nsCString::from).collect();

        SimpleOperationSuccessArgs {
            new_ids: new_message_ids,
            use_legacy_fallback: UseLegacyFallback::No,
        }
    }

    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg {}
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    /// Moves messages via Graph.
    ///
    /// Because we don't currently support [batching requests] (see [bug
    /// 2031761]), this performs a [message move] request for each message.
    ///
    /// [batching requests]:
    ///     https://learn.microsoft.com/en-us/graph/json-batching
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    /// [bug 2031761]: https://bugzilla.mozilla.org/show_bug.cgi?id=2031761
    pub(crate) async fn move_messages(
        self,
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

    /// Performs a [message move] request for the given message.
    ///
    /// Returns the [`Message`] object corresponding to the updated message
    /// after its move. This object should also contain an *updated* ID, since
    /// the API documentation indicates a move is performed by copying then
    /// deleting the message on the server side (which seems to be the case in
    /// practice too).
    ///
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    pub(crate) async fn send_move_message_request<'m>(
        &'m self,
        destination_folder_id: String,
        message_id: String,
    ) -> Result<Message<'m>, XpComGraphError> {
        let body = paths::me_messages_message_id_move::PostRequestBody::new()
            .set_destination_id(destination_folder_id);

        let request = paths::me_messages_message_id_move::Post::new(
            self.endpoint.to_string(),
            message_id,
            OperationBody::JSON(body),
        );

        self.send_request_json_response(request).await
    }
}
