/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::paths;
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{SafeEwsSimpleOperationListener, UseLegacyFallback},
};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoDeleteFolder {
    folder_ids: Vec<String>,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoDeleteFolder
{
    const NAME: &'static str = "delete folders";

    type Okay = UseLegacyFallback;

    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let requests = self
            .folder_ids
            .iter()
            .map(|folder_id| {
                paths::me::mail_folders::mail_folder_id::Delete::new(
                    client.base_url().to_string(),
                    folder_id.clone(),
                )
            })
            .collect();

        let responses = client
            .send_batch_request_json_response(requests, Default::default())
            .await?;

        let result = if responses.len() == self.folder_ids.len() {
            UseLegacyFallback::No
        } else {
            UseLegacyFallback::Yes
        };

        Ok(result)
    }

    fn into_success_arg(
        self,
        requery: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), requery).into()
    }

    fn into_failure_arg(
        self,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnFailureArg {
    }
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Perform a [delete folders] operation.
    ///
    /// [delete folders]:
    ///     https://learn.microsoft.com/en-us/graph/api/mailfolder-delete
    pub(crate) async fn delete_folders(
        self: Arc<XpComGraphClient<ServerT>>,
        folder_ids: Vec<String>,
        listener: SafeEwsSimpleOperationListener,
    ) {
        let operation = DoDeleteFolder { folder_ids };
        operation.handle_operation(&self, &listener).await;
    }
}
