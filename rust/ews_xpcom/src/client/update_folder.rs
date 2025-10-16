/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    update_folder::{FolderChange, FolderChanges, UpdateFolder, Updates},
    BaseFolderId, Folder, Operation, OperationResponse, PathToElement,
};
use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use super::{
    process_response_message_class, single_response_or_error, DoOperation, XpComEwsClient,
    XpComEwsError,
};

use crate::{
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{SafeEwsSimpleOperationListener, UseLegacyFallback},
};

struct DoUpdateFolder {
    pub folder_id: String,
    pub folder_name: String,
}

impl DoOperation for DoUpdateFolder {
    const NAME: &'static str = UpdateFolder::NAME;
    type Okay = ();
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        let update_folder = UpdateFolder {
            folder_changes: FolderChanges {
                folder_change: FolderChange {
                    folder_id: BaseFolderId::FolderId {
                        id: self.folder_id.clone(),
                        change_key: None,
                    },
                    updates: Updates::SetFolderField {
                        field_URI: PathToElement::FieldURI {
                            field_URI: "folder:DisplayName".to_string(),
                        },
                        folder: Folder::Folder {
                            display_name: Some(self.folder_name.clone()),
                            folder_id: None,
                            parent_folder_id: None,
                            folder_class: None,
                            total_count: None,
                            child_folder_count: None,
                            extended_property: None,
                            unread_count: None,
                        },
                    },
                },
            },
        };

        let response = client
            .make_operation_request(update_folder, Default::default())
            .await?;
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        process_response_message_class(Self::NAME, response_message)?;

        Ok(())
    }

    fn into_success_arg(
        self,
        _ok: Self::Okay,
    ) -> <Self::Listener as crate::safe_xpcom::SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    pub async fn update_folder(
        self,
        listener: SafeEwsSimpleOperationListener,
        folder_id: String,
        folder_name: String,
    ) {
        let operation = DoUpdateFolder {
            folder_id,
            folder_name,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
