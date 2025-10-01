/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{Operation, OperationResponse};
use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use super::{
    process_response_message_class, single_response_or_error, validate_get_folder_response_message,
    AuthFailureBehavior, BaseFolderId, BaseShape, DoOperation, FolderShape, GetFolder,
    OperationRequestOptions, XpComEwsClient, XpComEwsError, EWS_ROOT_FOLDER,
};

use crate::{
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{SafeUri, SafeUrlListener},
};

struct DoCheckConnectivity<'a> {
    pub listener: &'a SafeUrlListener,
    pub uri: SafeUri,
}

impl DoOperation for DoCheckConnectivity<'_> {
    // the connectivity check is ad hoc, not an operation, so this "name" is more a description
    const NAME: &'static str = "check connectivity";
    type Okay = ();
    type Listener = SafeUrlListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        self.listener.on_start_running_url(self.uri.clone());
        // Request the EWS ID of the root folder.
        let get_root_folder = GetFolder {
            folder_shape: FolderShape {
                base_shape: BaseShape::IdOnly,
            },
            folder_ids: vec![BaseFolderId::DistinguishedFolderId {
                id: EWS_ROOT_FOLDER.to_string(),
                change_key: None,
            }],
        };

        let response_messages = client
            // Make authentication failure silent, since all we want to know is
            // whether our credentials are valid.
            .make_operation_request(
                get_root_folder,
                OperationRequestOptions {
                    auth_failure_behavior: AuthFailureBehavior::Silent,
                    ..Default::default()
                },
            )
            .await?
            .into_response_messages();

        // Get the first (and only) response message so we can inspect it.
        let response_class = single_response_or_error(response_messages)?;
        let message = process_response_message_class(GetFolder::NAME, response_class)?;

        // Any error fetching the root folder is fatal, since it likely means
        // all subsequent request will fail, and that we won't manage to sync
        // the folder list later.
        validate_get_folder_response_message(&message)?;

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> SafeUri {
        self.uri
    }

    fn into_failure_arg(self) -> SafeUri {
        self.uri
    }
}

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    /// Performs a connectivity check to the EWS server.
    ///
    /// Because EWS does not have a dedicated endpoint to test connectivity and
    /// authentication, we try to look up the ID of the account's root mail
    /// folder, since it produces a fairly small request and represents the
    /// first operation performed when adding a new account to Thunderbird.
    pub(crate) async fn check_connectivity(self, uri: SafeUri, listener: SafeUrlListener) {
        let operation = DoCheckConnectivity {
            listener: &listener,
            uri,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
