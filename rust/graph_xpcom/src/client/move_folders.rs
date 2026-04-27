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
        let requests = self
            .folder_ids
            .iter()
            .map(|folder_id| {
                let body = paths::me::mail_folders::mail_folder_id::r#move::PostRequestBody::new()
                    .set_destination_id(self.destination_folder_id.clone());
                let request = paths::me::mail_folders::mail_folder_id::r#move::Post::new(
                    self.endpoint.to_string(),
                    folder_id.clone(),
                    OperationBody::JSON(body),
                );
                request
            })
            .collect();

        let responses = client.send_batch_request_json_response(requests).await?;

        let new_folder_ids = responses
            .iter()
            .filter_map(|response| response.entity().id().ok().map(|x| x.to_string()))
            .collect();

        Ok(new_folder_ids)
    }

    fn into_success_arg(
        self,
        new_folder_ids: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
        // If we have a length mismatch, that means something went wrong, but
        // perhaps not the entire request, so we need to tell the client to
        // requery the server to see what happened to the messages.
        let fallback = if new_folder_ids.len() == self.folder_ids.len() {
            UseLegacyFallback::No
        } else {
            UseLegacyFallback::Yes
        };

        let new_folder_ids = new_folder_ids.iter().map(nsCString::from).collect();
        SimpleOperationSuccessArgs {
            new_ids: new_folder_ids,
            use_legacy_fallback: fallback,
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
