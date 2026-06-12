/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::paths;
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{
        SafeExchangeSimpleOperationListener, SafeListener, SimpleOperationSuccessArgs,
        UseLegacyFallback,
    },
};
use thin_vec::ThinVec;

use crate::{
    client::{XpComGraphClient, delete_message::DoDeleteMessages},
    error::XpComGraphError,
};

struct DoEmptyFolder {
    folder_id: String,
    subfolder_ids: Vec<String>,
    message_ids: Vec<String>,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoEmptyFolder
{
    const NAME: &'static str = "empty folder";

    type Okay = ();

    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let base_api_url = client.base_api_url()?;
        if !self.subfolder_ids.is_empty() {
            let requests = self
                .subfolder_ids
                .iter()
                .map(|folder_id| {
                    paths::me::mail_folders::mail_folder_id::Delete::new(
                        base_api_url.to_string(),
                        folder_id.clone(),
                    )
                })
                .collect();

            let responses = client
                .send_batch_request_json_response(requests, Default::default())
                .await?;

            if responses.len() != self.subfolder_ids.len() {
                return Err(XpComGraphError::Processing {
                    message: format!(
                        "expected to delete {} subfolders from {}, deleted {}",
                        self.subfolder_ids.len(),
                        self.folder_id,
                        responses.len(),
                    ),
                });
            }
        }

        if !self.message_ids.is_empty() {
            DoDeleteMessages {
                message_ids: self.message_ids.clone(),
            }
            .do_operation(client)
            .await?;
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        SimpleOperationSuccessArgs {
            new_ids: ThinVec::new(),
            use_legacy_fallback: UseLegacyFallback::No,
        }
    }

    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Perform [delete folders] on the `subfolder_ids`, then construct and use
    /// [`DoDeleteMessages`] with `message_ids`.
    ///
    /// [delete folders]:
    ///     https://learn.microsoft.com/en-us/graph/api/mailfolder-delete
    pub(crate) async fn empty_folder(
        self: Arc<XpComGraphClient<ServerT>>,
        folder_id: String,
        subfolder_ids: Vec<String>,
        message_ids: Vec<String>,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoEmptyFolder {
            folder_id,
            subfolder_ids,
            message_ids,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
