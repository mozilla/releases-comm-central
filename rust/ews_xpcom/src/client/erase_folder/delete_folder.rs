/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::delete_folder::DeleteFolder;
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::SafeEwsSimpleOperationListener;
use std::{marker::PhantomData, sync::Arc};

use super::{DoEraseFolder, XpComEwsClient};

use crate::client::ServerType;

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    pub async fn delete_folder(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        folder_ids: Vec<String>,
    ) {
        let operation = DoEraseFolder::<DeleteFolder> {
            folder_ids,
            _op_type: PhantomData,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
