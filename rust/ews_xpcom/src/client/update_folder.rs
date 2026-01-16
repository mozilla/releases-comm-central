/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ews::{
    update_folder::{FolderChange, FolderChanges, UpdateFolder, UpdateFolderResponse, Updates},
    BaseFolderId, Folder, Operation, OperationResponse, PathToElement,
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback,
};

use super::{
    process_response_message_class, single_response_or_error, ServerType, XpComEwsClient,
    XpComEwsError,
};

use crate::macros::queue_operation;

struct DoUpdateFolder {
    pub folder_id: String,
    pub folder_name: String,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError> for DoUpdateFolder {
    const NAME: &'static str = UpdateFolder::NAME;
    type Okay = ();
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
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

        let rcv = queue_operation!(client, UpdateFolder, update_folder, Default::default());
        let response = rcv.await??;

        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        let name = <Self as DoOperation<XpComEwsClient<ServerT>, _>>::NAME;
        process_response_message_class(name, response_message)?;

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    pub async fn update_folder(
        self: Arc<XpComEwsClient<ServerT>>,
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
