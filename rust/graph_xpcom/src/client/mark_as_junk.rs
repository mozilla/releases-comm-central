/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use nsstring::nsCString;
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{
        SafeExchangeSimpleOperationListener, SafeListener, SimpleOperationSuccessArgs,
        UseLegacyFallback,
    },
};
use thin_vec::ThinVec;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoMarkAsJunk {
    pub folder_id: String,
    pub message_ids: Vec<String>,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoMarkAsJunk {
    const NAME: &'static str = "mark as junk";
    type Okay = ThinVec<String>;
    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // Move messages to the destination folder specified by the caller.
        client
            .move_messages_to_folder(&self.folder_id, self.message_ids.clone())
            .await
    }

    fn into_success_arg(
        self,
        new_message_ids: Self::Okay,
    ) -> <Self::Listener as SafeListener>::OnSuccessArg {
        let fallback = if new_message_ids.len() == self.message_ids.len() {
            UseLegacyFallback::No
        } else {
            UseLegacyFallback::Yes
        };

        let new_message_ids = new_message_ids.iter().map(nsCString::from).collect();

        SimpleOperationSuccessArgs {
            new_ids: new_message_ids,
            use_legacy_fallback: fallback,
        }
    }

    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Marks messages as junk or not junk by moving them to the appropriate folder.
    pub(crate) async fn mark_items_as_junk(
        self: Arc<XpComGraphClient<ServerT>>,
        folder_id: String,
        message_ids: Vec<String>,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoMarkAsJunk {
            folder_id,
            message_ids,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
