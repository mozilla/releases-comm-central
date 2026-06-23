/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{OperationBody, paths::me::messages::message_id::r#move};
use nsstring::nsCString;
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{
        SafeExchangeSimpleOperationListener, SafeListener, SimpleOperationSuccessArgs,
        UseLegacyFallback,
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
    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        client
            .move_messages_to_folder(&self.destination_folder_id, self.message_ids.clone())
            .await
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
    /// Moves messages via a [message move] Graph request.
    ///
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    pub(crate) async fn move_messages(
        self: Arc<XpComGraphClient<ServerT>>,
        destination_folder_id: String,
        message_ids: Vec<String>,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoMoveMessage {
            destination_folder_id,
            message_ids,
        };
        operation.handle_operation(&self, &listener).await;
    }

    /// Moves messages to a specific folder.
    ///
    /// This is a shared implementation used by both [`move_messages`] and
    /// [`mark_items_as_junk`].
    pub(crate) async fn move_messages_to_folder(
        &self,
        destination_folder_id: &str,
        message_ids: Vec<String>,
    ) -> Result<ThinVec<String>, XpComGraphError> {
        // Note: the C++ consumer code expects the order of new messages IDs to
        // match that of the old ones (so that e.g. `new_message_ids[0]` is the
        // new ID for `self.message_ids[0]`).
        let requests = message_ids
            .iter()
            .map(|message_id| {
                self.move_message_request(destination_folder_id.to_string(), message_id.clone())
            })
            .collect::<Result<Vec<r#move::Post>, XpComGraphError>>()?;

        let responses = self
            .send_batch_request_json_response(requests, Default::default())
            .await?;

        let new_message_ids = responses
            .into_iter()
            .filter_map(|response| response.outlook_item.entity.id)
            .collect();

        Ok(new_message_ids)
    }

    /// Creates a [message move] request for the given message.
    ///
    /// [message move]: https://learn.microsoft.com/en-us/graph/api/message-move
    pub(crate) fn move_message_request(
        &self,
        destination_folder_id: String,
        message_id: String,
    ) -> Result<r#move::Post, XpComGraphError> {
        let body = r#move::PostRequestBody {
            destination_id: Some(destination_folder_id),
        };

        let base_api_url = self.base_api_url()?;

        Ok(r#move::Post::new(
            base_api_url.to_string(),
            message_id,
            OperationBody::JSON(body),
        ))
    }
}
