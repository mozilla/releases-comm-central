/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{OperationBody, paths::me, types::mail_folder::MailFolder};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    safe_xpcom::{SafeEwsSimpleOperationListener, UseLegacyFallback},
};
use xpcom::RefCounted;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoUpdateFolder {
    folder_id: String,
    folder_name: String,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoUpdateFolder
{
    const NAME: &str = "update folder";

    type Okay = ();

    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let patch_body = MailFolder::new().set_display_name(Some(self.folder_name.clone()));
        let request = me::mail_folders::mail_folder_id::Patch::new(
            client.endpoint.to_string(),
            self.folder_id.clone(),
            OperationBody::JSON(patch_body),
        );

        // The folder IDs appear to be stable through a rename, so nothing needs
        // to be done with the response here.
        let _ = client.send_request_json_response(request).await?;

        Ok(())
    }

    fn into_success_arg(
        self,
        _ok: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(
        self,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnFailureArg {
    }
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    /// Perform an operation to update a graph folder.
    ///
    /// Note that the only supported attribute to update is currently
    /// the folder's display name.
    ///
    /// See <https://learn.microsoft.com/en-us/graph/api/mailfolder-update>
    pub(crate) async fn update_folder(
        self,
        folder_id: String,
        folder_name: String,
        listener: SafeEwsSimpleOperationListener,
    ) {
        let operation = DoUpdateFolder {
            folder_id,
            folder_name,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
