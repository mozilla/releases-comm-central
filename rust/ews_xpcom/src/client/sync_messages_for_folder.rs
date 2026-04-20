/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    FlagStatus, ItemShape, Operation, OperationResponse, PathToElement,
    server_version::ExchangeServerVersion,
    sync_folder_items::{self, SyncFolderItems},
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::SafeEwsMessageSyncListener;
use std::sync::Arc;

use crate::headerblock;
use xpcom::{RefPtr, interfaces::IHeaderBlock};

use super::{
    BaseFolderId, BaseShape, ServerType, XpComEwsClient, XpComEwsError,
    process_response_message_class, single_response_or_error,
};

struct DoSyncMessagesForFolder<'a> {
    pub listener: &'a SafeEwsMessageSyncListener,
    pub folder_id: String,
    pub sync_state_token: Option<String>,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoSyncMessagesForFolder<'_>
{
    const NAME: &'static str = SyncFolderItems::NAME;
    type Okay = ();
    type Listener = SafeEwsMessageSyncListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        // We may need to call the SyncFolderItems operation multiple times to
        // ensure that all changes are returned, as EWS caps the number of
        // results. Loop until we have no more changes.
        loop {
            let mut fields_to_fetch = vec![
                "message:IsRead",
                "message:InternetMessageId",
                "item:InternetMessageHeaders",
                "item:DateTimeSent",
                "message:From",
                "message:ReplyTo",
                "message:Sender",
                "item:Subject",
                "message:ToRecipients",
                "message:CcRecipients",
                "message:BccRecipients",
                "item:HasAttachments",
                "item:Importance",
                "message:References",
                "item:Size",
            ];

            if client.version_handler.get_version() >= ExchangeServerVersion::Exchange2013 {
                fields_to_fetch.push("item:Preview");
                fields_to_fetch.push("item:Flag");
            }

            let additional_properties: Vec<_> = fields_to_fetch
                .iter()
                .map(|&field| PathToElement::FieldURI {
                    field_URI: String::from(field),
                })
                .collect();

            let op = SyncFolderItems {
                item_shape: ItemShape {
                    // Microsoft's guidance is that the sync call should only
                    // fetch IDs for server load reasons.  See
                    // <https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/how-to-synchronize-items-by-using-ews-in-exchange>
                    // However, Microsoft's suggested approach requires 10x as
                    // many requests over requesting all fields at once, so
                    // despite individual requests being faster, overall
                    // performance is 2-3x worse. Therefore, we request the
                    // message fields we need to support CRUD operations in a
                    // single request.
                    base_shape: BaseShape::IdOnly,
                    additional_properties: Some(additional_properties),
                    ..Default::default()
                },
                sync_folder_id: BaseFolderId::FolderId {
                    id: self.folder_id.clone(),
                    change_key: None,
                },
                sync_state: self.sync_state_token.clone(),
                ignore: None,
                max_changes_returned: 256,
                sync_scope: None,
            };

            let response_messages = client
                .enqueue_and_send(op, Default::default())
                .await?
                .into_response_messages();

            let response_class = single_response_or_error(response_messages)?;
            let message = process_response_message_class(SyncFolderItems::NAME, response_class)?;

            // Iterate over each change we got from the server. We expect that
            // the server has ordered these changes in chronological order. This
            // means if, for a same given EWS ID, a message was created, then
            // deleted, then created again (which isn't really something that
            // should happen anywhere outside of our tests), it should be
            // represented in the response as a `Create`, then a `Delete`, then
            // another `Create`, in that order.
            for change in message.changes.inner.into_iter() {
                match change {
                    sync_folder_items::Change::Create { item } => {
                        let item_id = &item
                            .inner_message()
                            .item_id
                            .as_ref()
                            .ok_or_else(|| XpComEwsError::MissingIdInResponse)?
                            .id;

                        log::info!("Processing Create change with ID {item_id}");

                        let msg = item.inner_message();

                        // Collect the headers into an IHeaderBlock object to pass
                        // out to the C++ side.
                        let headers: RefPtr<IHeaderBlock> = headerblock::extract_headers(msg)
                            .query_interface::<IHeaderBlock>()
                            .ok_or(nserror::NS_ERROR_FAILURE)?;

                        // Collect any non-header metadata we can get.
                        let message_size = msg.size.unwrap_or_default() as u32;
                        let is_read = msg.is_read.unwrap_or_default();
                        let is_flagged = msg
                            .flag
                            .as_ref()
                            .map(|f| matches!(f.flag_status, Some(FlagStatus::Flagged)))
                            .unwrap_or_default();
                        let preview = match &msg.preview {
                            Some(p) => p.as_str(),
                            None => "",
                        };

                        self.listener.on_message_created(
                            item_id,
                            headers,
                            message_size,
                            is_read,
                            is_flagged,
                            preview,
                        )?;
                    }

                    sync_folder_items::Change::Update { item } => {
                        let item_id = &item
                            .inner_message()
                            .item_id
                            .as_ref()
                            .ok_or_else(|| XpComEwsError::MissingIdInResponse)?
                            .id;

                        log::info!("Processing Update change with ID {item_id}");

                        let msg = item.inner_message();

                        log::debug!("Updating message with item ID {item_id}");
                        // Collect the headers into an IHeaderBlock object to pass
                        // out to the C++ side.
                        let headers: RefPtr<IHeaderBlock> = headerblock::extract_headers(msg)
                            .query_interface::<IHeaderBlock>()
                            .ok_or(nserror::NS_ERROR_FAILURE)?;

                        // Collect any non-header metadata we can get.
                        let message_size = msg.size.unwrap_or_default() as u32;
                        let is_read = msg.is_read.unwrap_or_default();
                        let is_flagged = msg
                            .flag
                            .as_ref()
                            .map(|f| matches!(f.flag_status, Some(FlagStatus::Flagged)))
                            .unwrap_or_default();
                        let preview = match &msg.preview {
                            Some(p) => p.as_str(),
                            None => "",
                        };

                        let result = self.listener.on_message_updated(
                            item_id,
                            headers.clone(),
                            message_size,
                            is_read,
                            is_flagged,
                            preview,
                        );
                        if let Err(rv) = result {
                            if rv != nserror::NS_MSG_MESSAGE_NOT_FOUND {
                                return Ok(result?);
                            }
                            // We're trying to update a message that isn't in the DB.
                            // Let's fall back to creating it instead.
                            log::warn!(
                                "Tried to update a message not in the DB. Creating as new message instead. ewsId={item_id}"
                            );
                            self.listener.on_message_created(
                                item_id,
                                headers,
                                message_size,
                                is_read,
                                is_flagged,
                                preview,
                            )?;
                        }
                    }

                    sync_folder_items::Change::Delete { item_id } => {
                        // The message id that was deleted
                        let id = item_id.id;

                        // Delete the messages from the folder's database.
                        self.listener.on_message_deleted(id)?;
                    }

                    sync_folder_items::Change::ReadFlagChange { item_id, is_read } => {
                        //The message id that has been read
                        let id = item_id.id;

                        // Mark the messages as read in the folder's database.
                        self.listener.on_read_status_changed(id, is_read)?;
                    }
                }
            }

            // Update sync state after pushing each batch of messages so that,
            // if we're interrupted, we resume from roughly the same place.
            self.listener
                .on_sync_state_token_changed(&message.sync_state)?;

            if message.includes_last_item_in_range {
                // EWS has signaled to us that there are no more changes at this
                // time.
                break;
            }

            self.sync_state_token = Some(message.sync_state);
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}
    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    pub(crate) async fn sync_messages_for_folder(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsMessageSyncListener,
        folder_id: String,
        sync_state_token: Option<String>,
    ) {
        let operation = DoSyncMessagesForFolder {
            listener: &listener,
            folder_id,
            sync_state_token,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
