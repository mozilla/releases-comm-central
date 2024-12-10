/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{create_folder::CreateFolder, BaseFolderId, Folder};
use nsstring::nsCString;
use xpcom::{interfaces::IEwsFolderCreateCallbacks, RefPtr};

use super::{
    process_error_with_cb, process_response_message_class, validate_response_message_count,
    XpComEwsClient, XpComEwsError,
};

impl XpComEwsClient {
    pub(crate) async fn create_folder(
        self,
        parent_id: String,
        name: String,
        callbacks: RefPtr<IEwsFolderCreateCallbacks>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        self.create_folder_inner(parent_id, name, &callbacks)
            .await
            .unwrap_or_else(process_error_with_cb(move |client_err, desc| unsafe {
                callbacks.OnError(client_err, &*desc);
            }));
    }

    async fn create_folder_inner(
        self,
        parent_id: String,
        name: String,
        callbacks: &IEwsFolderCreateCallbacks,
    ) -> Result<(), XpComEwsError> {
        let op = CreateFolder {
            parent_folder_id: BaseFolderId::FolderId {
                id: parent_id,
                change_key: None,
            },
            folders: vec![Folder::Folder {
                folder_id: None,
                parent_folder_id: None,
                folder_class: None,
                display_name: Some(name),
                total_count: None,
                child_folder_count: None,
                extended_property: None,
                unread_count: None,
            }],
        };

        let response = self.make_operation_request(op).await?;

        // Validate the response against our request params and known/assumed
        // constraints on response shape.
        let response_messages = response.response_messages.create_folder_response_message;
        validate_response_message_count(&response_messages, 1)?;

        let response_message = response_messages.into_iter().next().unwrap();
        process_response_message_class(
            "CreateFolder",
            &response_message.response_class,
            &response_message.response_code,
            &response_message.message_text,
        )?;

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

        let folder_id = nsCString::from(folder_id);
        unsafe { callbacks.OnSuccess(&*folder_id) }.to_result()?;

        Ok(())
    }
}
