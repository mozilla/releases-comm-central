/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    delete_folder::DeleteFolder, empty_folder::EmptyFolder, server_version::ExchangeServerVersion,
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{handle_error, SafeEwsSimpleOperationListener};
use std::{marker::PhantomData, sync::Arc};

use super::{DoEraseFolder, XpComEwsClient};

use crate::client::ServerType;

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    pub async fn empty_folder(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        folder_ids: Vec<String>,
        subfolder_ids: Vec<String>,
        message_ids: Vec<String>,
    ) {
        // This is more complicated than typical because we need to fall back on other operations to
        // handle the fallback case

        let server_version = self.version_handler.get_version();
        // EmptyFolder was added in Exchange 2010
        if server_version >= ExchangeServerVersion::Exchange2010 {
            // we have support for the EmptyFolder operation, just use that
            let operation = DoEraseFolder::<EmptyFolder> {
                folder_ids,
                _op_type: PhantomData,
            };
            return operation.handle_operation(&self, &listener).await;
        }

        log::warn!("EmptyFolder operation unsupported in server version {server_version:?}, manually deleting messages and subfolders.");

        if !subfolder_ids.is_empty() {
            let mut delete_folder_op = DoEraseFolder::<DeleteFolder> {
                folder_ids: subfolder_ids,
                _op_type: PhantomData,
            };
            if let Err(err) = delete_folder_op.do_operation(&self).await {
                return handle_error(&listener, "DeleteFolder via EmptyFolder", &err, ());
            }
        }

        if !message_ids.is_empty() {
            let message_ids = message_ids.into_iter().map(|s| s.into()).collect();
            self.delete_messages(listener, message_ids).await;
        }
    }
}
