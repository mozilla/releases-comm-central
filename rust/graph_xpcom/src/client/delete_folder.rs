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

struct DoDeleteFolder {
    folder_id: String,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoDeleteFolder
{
    const NAME: &'static str = "delete folders";

    type Okay = ();

    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let request = paths::me::mail_folders::mail_folder_id::Delete::new(
            client.base_api_url()?.to_string(),
            self.folder_id.clone(),
        );

        client
            .send_request_json_response(request, Default::default())
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
    /// Perform a [delete folders] operation.
    ///
    /// [delete folders]:
    ///     https://learn.microsoft.com/en-us/graph/api/mailfolder-delete
    pub(crate) async fn delete_folders(
        self: Arc<XpComGraphClient<ServerT>>,
        folder_id: String,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoDeleteFolder { folder_id };
        operation.handle_operation(&self, &listener).await;
    }
}
