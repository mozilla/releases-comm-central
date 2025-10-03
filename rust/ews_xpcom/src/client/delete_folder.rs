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

use super::{
    process_response_message_class, single_response_or_error, DoOperation, XpComEwsClient,
    XpComEwsError,
};

use crate::{
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{SafeEwsSimpleOperationListener, SafeListener},
};

struct DoDeleteFolder {
    pub folder_id: String,
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
        let delete_folder = DeleteFolder {
            folder_ids: vec![BaseFolderId::FolderId {
                id: self.folder_id.clone(),
                change_key: None,
            }],
            delete_type: DeleteType::HardDelete,
        };
        let response = client
            .make_operation_request(delete_folder, Default::default())
            .await?;

        // We have only sent one message, therefore the response should only
        // contain one response message.
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        match process_response_message_class(Self::NAME, response_message) {
            Ok(_) => Ok(()),
            Err(err) => match err {
                XpComEwsError::ResponseError(ResponseError {
                    response_code: ResponseCode::ErrorItemNotFound,
                    ..
                }) => {
                    // Something happened in a previous attempt that caused the
                    // folder to be deleted on the EWS server but not in the
                    // database. In this case, we don't want to force a zombie
                    // folder in the account, so we ignore the error and move on
                    // with the local deletion.
                    log::warn!("found folder that was deleted from the EWS server but not the local db: {}", self.folder_id);
                    Ok(())
                }
                _ => Err(err),
            },
        }
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
    pub async fn delete_folder(self, listener: SafeEwsSimpleOperationListener, folder_id: String) {
        let operation = DoDeleteFolder { folder_id };
        operation.handle_operation(&self, &listener).await;
    }
}
