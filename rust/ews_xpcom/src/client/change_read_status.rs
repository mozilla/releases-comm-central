/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ews::{
    BaseItemId, Message, MessageDisposition, Operation, OperationResponse, PathToElement,
    update_item::{
        ConflictResolution, ItemChange, ItemChangeDescription, ItemChangeInner, UpdateItem, Updates,
    },
};
use nsstring::nsCString;
use protocol_shared::{
    client::DoOperation,
    safe_xpcom::{
        SafeEwsSimpleOperationListener, SafeListener, SimpleOperationSuccessArgs,
        UseLegacyFallback, handle_error,
    },
};
use thin_vec::ThinVec;

use crate::client::{ServerType, XpComEwsClient, XpComEwsError, process_response_message_class};

struct DoChangeReadStatus<'a> {
    listener: &'a SafeEwsSimpleOperationListener,
    message_ids: ThinVec<nsCString>,
    is_read: bool,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoChangeReadStatus<'_>
{
    const NAME: &'static str = "change read status";
    type Okay = ();
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        // Create the structure for setting the messages as read/unread.
        let item_changes: Vec<ItemChange> = self
            .message_ids
            .clone()
            .into_iter()
            .map(|message_id| {
                let updates = Updates {
                    inner: vec![ItemChangeDescription::SetItemField {
                        field_uri: PathToElement::FieldURI {
                            field_URI: "message:IsRead".to_string(),
                        },
                        message: Message {
                            is_read: Some(self.is_read),
                            ..Default::default()
                        },
                    }],
                };

                ItemChange {
                    item_change: ItemChangeInner {
                        item_id: BaseItemId::ItemId {
                            id: message_id.to_string(),
                            // TODO: We should be able to get the change key from the
                            // database or server, but we don't have a way to do that yet.
                            change_key: None,
                        },
                        updates,
                    },
                }
            })
            .collect();

        let update_item = UpdateItem {
            item_changes,
            message_disposition: MessageDisposition::SaveOnly,
            // If we don't provide a ChangeKey as part of the ItemChange, then
            // we cannot use the default value of `AutoResolve` for
            // `ConflictResolution`. Instead, we will use `AlwaysOverwrite` for now.
            conflict_resolution: Some(ConflictResolution::AlwaysOverwrite),
        };

        let response = client.make_update_item_request(update_item).await?;
        let response_messages = response.into_response_messages();

        let (successes, errors): (Vec<_>, Vec<_>) = response_messages
            .into_iter()
            .map(|r| process_response_message_class(UpdateItem::NAME, r))
            .enumerate()
            .partition(|(_index, result)| result.is_ok());

        let successes: ThinVec<nsCString> = successes
            .into_iter()
            .flat_map(|(_, success)| {
                let message = success.expect("partition should only populate this with okays");
                message.items.inner.into_iter()
            })
            .filter_map(|item| item.into_inner_message().item_id)
            .map(|item_id| item_id.id.into())
            .collect();

        let ret = if !successes.is_empty() {
            self.listener
                .on_success((successes, UseLegacyFallback::No).into())
        } else {
            // This branch only happens if no messages were requested,
            // or we're about to return an aggregated error in the next block.
            Ok(())
        };

        // If there were errors, return an aggregated error.
        if !errors.is_empty() {
            let num_errs = errors.len();
            let (index, ref first_err) = errors[0];
            let first_error = first_err
                .as_ref()
                .expect_err("partition should only populate this with errs");
            return Err(XpComEwsError::Processing {
                message: format!(
                    "response contained {num_errs} errors; the first error (at index {index}) was: {first_error:?}"
                ),
            });
        }

        Ok(ret?)
    }

    fn into_success_arg(self, _ok: Self::Okay) -> SimpleOperationSuccessArgs {
        // this isn't actually used in this case
        (ThinVec::<nsCString>::new(), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(self) {}

    /// This uses a custom implementation, since this operation has the unusual
    /// behavior of returning any successful responses to the success listener,
    /// even if the operation had failures.
    async fn handle_operation(
        mut self,
        client: &XpComEwsClient<ServerT>,
        listener: &Self::Listener,
    ) {
        match self.do_operation(client).await {
            Ok(()) => {
                // the operation has already called on_success
            }
            Err(err) => {
                let name = <Self as DoOperation<XpComEwsClient<ServerT>, _>>::NAME;
                handle_error(listener, name, &err, ());
            }
        }
    }
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Mark a message as read or unread by performing an [`UpdateItem` operation] via EWS.
    ///
    /// [`UpdateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    pub async fn change_read_status(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        message_ids: ThinVec<nsCString>,
        is_read: bool,
    ) {
        let operation = DoChangeReadStatus {
            listener: &listener,
            message_ids,
            is_read,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
