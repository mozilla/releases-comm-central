/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{create_folder::CreateFolder, BaseFolderId, Folder, OperationResponse};

use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use crate::client::single_response_or_error;
use crate::safe_xpcom::{handle_error, SafeEwsSimpleOperationListener, SafeListener};

use super::{process_response_message_class, XpComEwsClient, XpComEwsError};
use crate::authentication::credentials::AuthenticationProvider;

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
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        match self.create_folder_inner(parent_id, name).await {
            Ok(folder_id) => {
                let _ = listener.on_success((std::iter::once(folder_id), false).into());
            }
            Err(err) => handle_error(&listener, "CreateFolder", &err, ()),
        };
    }

    async fn create_folder_inner(
        self,
        parent_id: String,
        name: String,
    ) -> Result<String, XpComEwsError> {
        let op = CreateFolder {
            parent_folder_id: BaseFolderId::FolderId {
                id: parent_id,
                change_key: None,
            },
            folders: vec![Folder::Folder {
                folder_id: None,
                parent_folder_id: None,
                folder_class: Some("IPF.Note".to_string()),
                display_name: Some(name),
                total_count: None,
                child_folder_count: None,
                extended_property: None,
                unread_count: None,
            }],
        };

        let response = self.make_operation_request(op, Default::default()).await?;

        // Validate the response against our request params and known/assumed
        // constraints on response shape.
        let response_messages = response.into_response_messages();
        let response_class = single_response_or_error(response_messages)?;
        let response_message = process_response_message_class("CreateFolder", response_class)?;

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
}
