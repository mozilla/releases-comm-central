/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::paths;
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{
        SafeExchangeSimpleOperationListener, SimpleOperationSuccessArgs, UseLegacyFallback,
    },
};
use thin_vec::ThinVec;

use crate::{client::XpComGraphClient, error::XpComGraphError};

pub(super) struct DoDeleteMessages {
    pub message_ids: Vec<String>,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoDeleteMessages
{
    const NAME: &str = "delete messages";

    type Okay = ();

    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let base_api_url = client.base_api_url()?;
        let requests = self
            .message_ids
            .iter()
            .map(|message_id| {
                paths::me::messages::message_id::Delete::new(
                    base_api_url.to_string(),
                    message_id.clone(),
                )
            })
            .collect();

        client
            .send_batch_request_json_response(requests, Default::default())
            .await?;

        Ok(())
    }

    fn into_success_arg(
        self,
        _ok: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
        SimpleOperationSuccessArgs {
            new_ids: ThinVec::new(),
            use_legacy_fallback: UseLegacyFallback::No,
        }
    }

    fn into_failure_arg(
        self,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnFailureArg {
    }
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Performs a [delete message] operation for each of the provided message
    /// IDs (in a batch).
    ///
    /// [delete message]:
    ///     https://learn.microsoft.com/en-us/graph/api/message-delete
    pub(crate) async fn delete_messages(
        self: Arc<XpComGraphClient<ServerT>>,
        message_ids: Vec<String>,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoDeleteMessages { message_ids };
        operation.handle_operation(&self, &listener).await;
    }
}
