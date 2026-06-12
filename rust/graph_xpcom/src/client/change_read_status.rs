/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::OperationBody;
use ms_graph_tb::paths;
use ms_graph_tb::types::message::Message;
use nsstring::nsCString;
use protocol_shared::ServerType;
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeExchangeSimpleOperationListener, SimpleOperationSuccessArgs, UseLegacyFallback,
};
use thin_vec::ThinVec;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoChangeReadStatus {
    pub message_ids: Vec<String>,
    pub is_read: bool,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoChangeReadStatus
{
    const NAME: &'static str = "change read status";
    type Okay = ThinVec<nsCString>;
    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let message_update = Message::new().set_is_read(Some(self.is_read));
        let base_api_url = client.base_api_url()?;
        let operations = self
            .message_ids
            .iter()
            .map(|message_id| {
                paths::me::messages::message_id::Patch::new(
                    base_api_url.to_string(),
                    message_id.clone(),
                    OperationBody::JSON(message_update.clone()),
                )
            })
            .collect();

        // Send the request, wait for the response, and compile the IDs of the
        // messages for which the operation has succeeded so it can be passed to
        // `into_success_arg`. `client.send_batch_request_json_response` filters
        // out items for which the operation has failed, so any message in the
        // response is a success.
        let message_ids = client
            .send_batch_request_json_response(operations, Default::default())
            .await?
            .iter()
            .map(|msg| msg.outlook_item().entity().id().map(nsCString::from))
            .collect::<Result<ThinVec<_>, ms_graph_tb::Error>>()?;

        if message_ids.len() != self.message_ids.len() {
            return Err(XpComGraphError::Processing {
                message: format!(
                    "expected to mark {} messages as read, marked {}",
                    self.message_ids.len(),
                    message_ids.len()
                ),
            });
        }

        Ok(message_ids)
    }

    fn into_success_arg(self, success_ids: Self::Okay) -> SimpleOperationSuccessArgs {
        SimpleOperationSuccessArgs {
            new_ids: success_ids,
            use_legacy_fallback: UseLegacyFallback::No,
        }
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Sets the read status for the given messages using a [message update]
    /// request.
    ///
    /// [message update]:
    ///     https://learn.microsoft.com/en-us/graph/api/message-update
    pub async fn change_read_status(
        self: Arc<XpComGraphClient<ServerT>>,
        message_ids: Vec<String>,
        is_read: bool,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoChangeReadStatus {
            message_ids,
            is_read,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
