/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    mark_as_junk::MarkAsJunk, move_item::MoveItem, server_version::ExchangeServerVersion,
    BaseItemId, Operation, OperationResponse,
};
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::RefCounted;

use crate::{
    authentication::credentials::AuthenticationProvider,
    client::{
        copy_move_operations::move_generic::CopyMoveSuccess, process_response_message_class,
        validate_response_message_count, DoOperation, XpComEwsClient, XpComEwsError,
    },
    safe_xpcom::{SafeEwsSimpleOperationListener, SafeListener},
};

struct DoMarkAsJunk {
    ews_ids: ThinVec<nsCString>,
    is_junk: bool,
    legacy_destination_folder_id: String,
}

impl DoOperation for DoMarkAsJunk {
    const NAME: &'static str = MarkAsJunk::NAME;
    type Okay = Option<ThinVec<nsCString>>;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        let server_version = client.server_version.get();

        // The `MarkAsJunk` operation was added in Exchange2013.
        let use_mark_as_junk = server_version >= ExchangeServerVersion::Exchange2013;

        let item_ids: Vec<BaseItemId> = self
            .ews_ids
            .iter()
            .map(|raw_id| BaseItemId::ItemId {
                id: raw_id.to_string(),
                change_key: None,
            })
            .collect();

        if use_mark_as_junk {
            let mark_as_junk = MarkAsJunk {
                is_junk: self.is_junk,
                move_item: true,
                item_ids,
            };

            let response = client
                .make_operation_request(mark_as_junk, Default::default())
                .await?;

            let response_messages = response.into_response_messages();
            validate_response_message_count(&response_messages, self.ews_ids.len())?;

            let new_ids = response_messages
                .into_iter()
                .map(|response_message| {
                    process_response_message_class(MarkAsJunk::NAME, response_message)
                })
                .map(|response| response.map(|v| nsCString::from(v.moved_item_id.id)))
                .collect::<Result<ThinVec<nsCString>, _>>()?;

            Ok(Some(new_ids))
        } else if !self.legacy_destination_folder_id.is_empty() {
            // We have to move the items to the junk folder using a regular move operation.
            let CopyMoveSuccess {
                new_ids,
                requires_resync,
            } = client
                .copy_move_item_functional::<MoveItem>(
                    self.legacy_destination_folder_id.to_string(),
                    self.ews_ids.iter().map(|s| s.to_string()).collect(),
                )
                .await?;
            Ok(if requires_resync {
                None
            } else {
                Some(new_ids.iter().map(nsCString::from).collect())
            })
        } else {
            Err(XpComEwsError::Processing { message: "Unable to determine junk folder and Exchange version is too old for `MarkAsJunk` operation.".to_string() })
        }
    }

    fn into_success_arg(self, ids: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        let use_legacy_fallback = ids.is_none();
        (ids.unwrap_or(ThinVec::new()), use_legacy_fallback).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    pub async fn mark_as_junk(
        self,
        listener: SafeEwsSimpleOperationListener,
        ews_ids: ThinVec<nsCString>,
        is_junk: bool,
        legacy_destination_folder_id: String,
    ) {
        let operation = DoMarkAsJunk {
            ews_ids,
            is_junk,
            legacy_destination_folder_id,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
