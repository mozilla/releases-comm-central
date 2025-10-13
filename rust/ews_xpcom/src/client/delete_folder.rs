/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    delete_folder::DeleteFolder,
    response::{ResponseCode, ResponseError},
    BaseFolderId, DeleteType, Operation, OperationResponse,
};
use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use super::{process_response_message_class, DoOperation, XpComEwsClient, XpComEwsError};

use crate::{
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{SafeEwsSimpleOperationListener, SafeListener},
};

struct DoDeleteFolder {
    pub folder_ids: Vec<String>,
}

impl DoOperation for DoDeleteFolder {
    const NAME: &'static str = DeleteFolder::NAME;
    type Okay = ();
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        let folder_ids = self
            .folder_ids
            .iter()
            .map(|id| BaseFolderId::FolderId {
                id: id.clone(),
                change_key: None,
            })
            .collect();
        let delete_folder = DeleteFolder {
            delete_type: DeleteType::HardDelete,
            folder_ids,
        };
        let response = client
            .make_operation_request(delete_folder, Default::default())
            .await?;

        let response_messages = response.into_response_messages();
        for response_message in response_messages {
            if let Err(err) = process_response_message_class(Self::NAME, response_message) {
                match err {
                    XpComEwsError::ResponseError(ResponseError {
                        response_code: ResponseCode::ErrorItemNotFound,
                        ..
                    }) => {
                        // Something happened in a previous attempt that caused the
                        // folder to be deleted on the EWS server but not in the
                        // database. In this case, we don't want to force a zombie
                        // folder in the account, so we ignore the error and move on
                        // with the local deletion.
                        log::warn!("found folder that was deleted from the EWS server but not the local db");
                    }
                    _ => return Err(err),
                }
            }
        }
        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), false).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    pub async fn delete_folder(
        self,
        listener: SafeEwsSimpleOperationListener,
        folder_ids: Vec<String>,
    ) {
        let operation = DoDeleteFolder { folder_ids };
        operation.handle_operation(&self, &listener).await;
    }
}
