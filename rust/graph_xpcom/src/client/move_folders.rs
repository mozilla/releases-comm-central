/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{OperationBody, paths};
use nsstring::nsCString;
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    safe_xpcom::{SafeEwsSimpleOperationListener, SimpleOperationSuccessArgs, UseLegacyFallback},
};
use thin_vec::ThinVec;
use url::Url;
use xpcom::RefCounted;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoMoveFolder {
    destination_folder_id: String,
    folder_ids: Vec<String>,
    endpoint: Url,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoMoveFolder
{
    const NAME: &'static str = "move folders";

    type Okay = ThinVec<String>;

    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let mut new_folder_ids = ThinVec::new();

        for folder_id in &self.folder_ids {
            let body = paths::me::mail_folders::mail_folder_id::r#move::PostRequestBody::new()
                .set_destination_id(self.destination_folder_id.clone());
            let request = paths::me::mail_folders::mail_folder_id::r#move::Post::new(
                self.endpoint.to_string(),
                folder_id.clone(),
                OperationBody::JSON(body),
            );

            let response = client.send_request_json_response(request).await?;

            new_folder_ids.push(response.entity().id()?.to_string());
        }

        Ok(new_folder_ids)
    }

    fn into_success_arg(
        self,
        ok: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
        let new_folder_ids = ok.iter().map(nsCString::from).collect();
        SimpleOperationSuccessArgs {
            new_ids: new_folder_ids,
            use_legacy_fallback: UseLegacyFallback::No,
        }
    }

    fn into_failure_arg(
        self,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnFailureArg {
        todo!()
    }
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    /// Perform a [move folders] operation.
    ///
    /// We currently move the folders with one request per folder since Graph
    /// batch operations are not yet supported.
    ///
    /// See <https://bugzilla.mozilla.org/show_bug.cgi?id=2031761>
    ///
    /// [move folders]:
    ///     https://learn.microsoft.com/en-us/graph/api/mailfolder-move
    pub(crate) async fn move_folders(
        self,
        destination_folder_id: String,
        folder_ids: Vec<String>,
        listener: SafeEwsSimpleOperationListener,
    ) {
        let operation = DoMoveFolder {
            destination_folder_id,
            folder_ids,
            endpoint: self.endpoint.clone(),
        };
        operation.handle_operation(&self, &listener).await;
    }
}
