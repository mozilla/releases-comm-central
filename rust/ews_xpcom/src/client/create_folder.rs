/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{create_folder::CreateFolder, BaseFolderId, Folder, Operation, OperationResponse};
use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use crate::client::single_response_or_error;
use crate::safe_xpcom::{SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback};

use super::{process_response_message_class, DoOperation, XpComEwsClient, XpComEwsError};
use crate::authentication::credentials::AuthenticationProvider;

struct DoCreateFolder {
    parent_id: String,
    name: String,
}

impl DoOperation for DoCreateFolder {
    const NAME: &'static str = CreateFolder::NAME;
    type Okay = String;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        let op = CreateFolder {
            parent_folder_id: BaseFolderId::FolderId {
                id: self.parent_id.clone(),
                change_key: None,
            },
            folders: vec![Folder::Folder {
                folder_id: None,
                parent_folder_id: None,
                folder_class: Some("IPF.Note".to_string()),
                display_name: Some(self.name.clone()),
                total_count: None,
                child_folder_count: None,
                extended_property: None,
                unread_count: None,
            }],
        };

        let response = client
            .make_operation_request(op, Default::default())
            .await?;

        // Validate the response against our request params and known/assumed
        // constraints on response shape.
        let response_messages = response.into_response_messages();
        let response_class = single_response_or_error(response_messages)?;
        let response_message = process_response_message_class(CreateFolder::NAME, response_class)?;

        let folders = response_message.folders.inner;
        if folders.len() != 1 {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "expected exactly one folder in response, got {}",
                    folders.len()
                ),
            });
        }

        let folder_id = match folders.into_iter().next().unwrap() {
            Folder::Folder { folder_id, .. } => match folder_id {
                Some(folder_id) => folder_id.id,
                None => return Err(XpComEwsError::MissingIdInResponse),
            },

            _ => {
                return Err(XpComEwsError::Processing {
                    message: "created folder of unexpected type".to_string(),
                });
            }
        };

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

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
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
