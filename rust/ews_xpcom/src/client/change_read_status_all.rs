/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    mark_all_read::MarkAllItemsAsRead, server_version::ExchangeServerVersion, BaseFolderId,
    Operation, OperationResponse,
};
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::RefCounted;

use crate::{
    authentication::credentials::AuthenticationProvider,
    client::{
        process_response_message_class, single_response_or_error, DoOperation, XpComEwsClient,
        XpComEwsError,
    },
    safe_xpcom::{SafeEwsSimpleOperationListener, SimpleOperationSuccessArgs, UseLegacyFallback},
};

struct DoChangeReadStatusAll {
    folder_ids: ThinVec<nsCString>,
    is_read: bool,
    suppress_read_receipts: bool,
}

impl DoOperation for DoChangeReadStatusAll {
    const NAME: &'static str = MarkAllItemsAsRead::NAME;
    type Okay = UseLegacyFallback;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        let server_version = client.server_version.get();

        // The `MarkAllItemsAsRead` operation was added in Exchange2013
        if server_version < ExchangeServerVersion::Exchange2013 {
            log::warn!(
                "Skipping {} operation with unsupported server version {server_version:?}",
                Self::NAME
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

        let response = client
            .make_operation_request(mark_all_items, Default::default())
            .await?;

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

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    /// Mark folders as read or unread by performing a [`MarkAllItemsAsRead` operation] via EWS.
    ///
    /// [`MarkAllItemsAsRead` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/markallitemsasread-operation
    pub async fn change_read_status_all(
        self,
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
