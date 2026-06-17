/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use protocol_shared::ServerType;
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeExchangeSimpleOperationListener, SimpleOperationSuccessArgs, UseLegacyFallback,
};
use thin_vec::ThinVec;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoChangeReadStatusAll {
    _folder_ids: ThinVec<String>,
    _is_read: bool,
    _suppress_read_receipts: bool,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoChangeReadStatusAll
{
    const NAME: &'static str = "change read status";
    type Okay = ();
    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        _client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // Graph provides an API for marking an entire folder as read in beta
        // (https://learn.microsoft.com/en-us/graph/api/mailfolder-updateallmessagesreadstate),
        // so we stub this out and tell the consumer to use the legacy fallback,
        // i.e. to use `IExchangeClient::ChangeReadStatus`.
        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> SimpleOperationSuccessArgs {
        SimpleOperationSuccessArgs {
            new_ids: ThinVec::new(),
            use_legacy_fallback: UseLegacyFallback::Yes,
        }
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Stub for changing the read status of all items within a given folder.
    ///
    /// Graph only provides an API for this in the beta version, so until it
    /// gets stabilized we don't do anything and tell the consumer to use the
    /// legacy fallback (i.e. to use `IExchangeClient::ChangeReadStatus`).
    pub(crate) async fn change_read_status_all(
        self: Arc<XpComGraphClient<ServerT>>,
        folder_ids: ThinVec<String>,
        is_read: bool,
        suppress_read_receipts: bool,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoChangeReadStatusAll {
            _folder_ids: folder_ids,
            _is_read: is_read,
            _suppress_read_receipts: suppress_read_receipts,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
