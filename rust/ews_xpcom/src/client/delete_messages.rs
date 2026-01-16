/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ews::{
    delete_item::{DeleteItem, DeleteItemResponse},
    response::{ResponseCode, ResponseError},
    BaseItemId, DeleteType, Operation, OperationResponse,
};
use nsstring::nsCString;
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback,
};
use thin_vec::ThinVec;

use super::{
    process_response_message_class, validate_response_message_count, ServerType, XpComEwsClient,
    XpComEwsError,
};

use crate::macros::queue_operation;

struct DoDeleteMessages {
    pub ews_ids: ThinVec<nsCString>,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError> for DoDeleteMessages {
    const NAME: &'static str = DeleteItem::NAME;
    type Okay = ();
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        let item_ids: Vec<BaseItemId> = self
            .ews_ids
            .iter()
            .map(|raw_id| BaseItemId::ItemId {
                id: raw_id.to_string(),
                change_key: None,
            })
            .collect();

        let delete_item = DeleteItem {
            item_ids,
            delete_type: DeleteType::HardDelete,
            send_meeting_cancellations: None,
            affected_task_occurrences: None,
            suppress_read_receipts: None,
        };

        let rcv = queue_operation!(client, DeleteItem, delete_item, Default::default());
        let response = rcv.await??;

        // Make sure we got the amount of response messages matches the amount
        // of messages we requested to have deleted.
        let response_messages = response.into_response_messages();
        validate_response_message_count(&response_messages, self.ews_ids.len())?;

        // Check every response message for an error.
        response_messages
            .into_iter()
            .zip(self.ews_ids.iter())
            .try_for_each(|(response_message, ews_id)| {
                if let Err(err) = process_response_message_class(
                    DeleteItem::NAME,
                    response_message
                ) {
                    if matches!(err, XpComEwsError::ResponseError( ResponseError { response_code: ResponseCode::ErrorItemNotFound, .. })) {
                        // Something happened in a previous attempt that caused
                        // the message to be deleted on the EWS server but not
                        // in the database. In this case, we don't want to force
                        // a zombie message in the folder, so we ignore the
                        // error and move on with the local deletion.
                        log::warn!("found message that was deleted from the EWS server but not the local db: {ews_id}");
                        Ok(())
                    } else {
                        // We've already checked that there are as many elements in
                        // `response_messages` as in `message_ews_ids`, so we
                        // shouldn't be able to get out of bounds here.
                        Err(XpComEwsError::Processing {
                            message: format!(
                                "error while attempting to delete message {ews_id}: {err:?}"
                            ),
                        })
                    }
                } else {
                    Ok(())
                }
            })?;

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    pub async fn delete_messages(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        ews_ids: ThinVec<nsCString>,
    ) {
        let operation = DoDeleteMessages { ews_ids };
        operation.handle_operation(&self, &listener).await;
    }
}
