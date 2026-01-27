/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ews::{
    BaseFolderId, Operation, OperationResponse,
    mark_all_read::{MarkAllItemsAsRead, MarkAllItemsAsReadResponse},
    server_version::ExchangeServerVersion,
};
use nsstring::nsCString;
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeEwsSimpleOperationListener, SimpleOperationSuccessArgs, UseLegacyFallback,
};
use thin_vec::ThinVec;

use crate::{
    client::{
        ServerType, XpComEwsClient, XpComEwsError, process_response_message_class,
        single_response_or_error,
    },
    macros::queue_operation,
};

struct DoChangeReadStatusAll {
    folder_ids: ThinVec<nsCString>,
    is_read: bool,
    suppress_read_receipts: bool,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoChangeReadStatusAll
{
    const NAME: &'static str = MarkAllItemsAsRead::NAME;
    type Okay = UseLegacyFallback;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        let server_version = client.version_handler.get_version();

        // The `MarkAllItemsAsRead` operation was added in Exchange2013
        if server_version < ExchangeServerVersion::Exchange2013 {
            let name = <Self as DoOperation<XpComEwsClient<ServerT>, _>>::NAME;
            log::warn!(
                "Skipping {} operation with unsupported server version {server_version:?}",
                name
            );
            return Ok(UseLegacyFallback::Yes);
        }

        let folder_ids: Vec<BaseFolderId> = self
            .folder_ids
            .iter()
            .map(|raw_id| BaseFolderId::FolderId {
                id: raw_id.to_string(),
                change_key: None,
            })
            .collect();

        let mark_all_items = MarkAllItemsAsRead {
            read_flag: self.is_read,
            suppress_read_receipts: self.suppress_read_receipts,
            folder_ids,
        };

        let rcv = queue_operation!(
            client,
            MarkAllItemsAsRead,
            mark_all_items,
            Default::default()
        );
        let response = rcv.await??;

        // Validate the response against our request params and known/assumed
        // constraints on response shape.
        let response_messages = response.into_response_messages();
        let response_class = single_response_or_error(response_messages)?;
        process_response_message_class(MarkAllItemsAsRead::NAME, response_class)?;

        Ok(UseLegacyFallback::No)
    }

    fn into_success_arg(self, ok: Self::Okay) -> SimpleOperationSuccessArgs {
        (ThinVec::<nsCString>::new(), ok).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Mark folders as read or unread by performing a [`MarkAllItemsAsRead` operation] via EWS.
    ///
    /// [`MarkAllItemsAsRead` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/markallitemsasread-operation
    pub async fn change_read_status_all(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        folder_ids: ThinVec<nsCString>,
        is_read: bool,
        suppress_read_receipts: bool,
    ) {
        let operation = DoChangeReadStatusAll {
            folder_ids,
            is_read,
            suppress_read_receipts,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
