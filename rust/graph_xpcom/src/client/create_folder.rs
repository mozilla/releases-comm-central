/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{OperationBody, paths, types::mail_folder::MailFolder};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    safe_xpcom::{SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback},
};
use xpcom::RefCounted;

use crate::error::XpComGraphError;

use super::XpComGraphClient;

struct DoCreateFolder {
    parent_id: String,
    name: String,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoCreateFolder
{
    const NAME: &'static str = "create folder";
    type Okay = String;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let folder_config = MailFolder::new().set_display_name(Some(self.name.clone()));
        let request = paths::me_mail_folders_mail_folder_id_child_folders::Post::new(
            client.endpoint.as_str().to_string(),
            self.parent_id.clone(),
            OperationBody::JSON(folder_config),
        );

        let folder = client.send_request(request).await?;
        let folder_id = folder.entity().id()?.to_string();
        Ok(folder_id)
    }

    fn into_success_arg(
        self,
        folder_id: Self::Okay,
    ) -> <Self::Listener as SafeListener>::OnSuccessArg {
        (std::iter::once(folder_id), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub(crate) async fn create_folder(
        self,
        listener: SafeEwsSimpleOperationListener,
        parent_id: String,
        name: String,
    ) {
        let operation = DoCreateFolder { parent_id, name };
        operation.handle_operation(&self, &listener).await;
    }
}
