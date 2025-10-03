/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{
    server_version::ExchangeServerVersion,
    sync_folder_items::{self, SyncFolderItems},
    ItemShape, Operation, OperationResponse,
};
use mailnews_ui_glue::UserInteractiveServer;
use std::collections::{HashMap, HashSet};
use xpcom::RefCounted;

use super::{
    process_response_message_class, single_response_or_error, BaseFolderId, BaseShape, DoOperation,
    XpComEwsClient, XpComEwsError,
};

use crate::{
    authentication::credentials::AuthenticationProvider, safe_xpcom::SafeEwsMessageSyncListener,
};

struct DoSyncMessagesForFolder<'a> {
    pub listener: &'a SafeEwsMessageSyncListener,
    pub folder_id: String,
    pub sync_state_token: Option<String>,
}

impl DoOperation for DoSyncMessagesForFolder<'_> {
    const NAME: &'static str = SyncFolderItems::NAME;
    type Okay = ();
    type Listener = SafeEwsMessageSyncListener;

    async fn do_operation<ServerT>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    {
        // We may need to call the SyncFolderItems operation multiple times to
        // ensure that all changes are returned, as EWS caps the number of
        // results. Loop until we have no more changes.
        loop {
            let op = SyncFolderItems {
                item_shape: ItemShape {
                    // Microsoft's guidance is that the sync call should only
                    // fetch IDs for server load reasons.
                    // See <https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/how-to-synchronize-items-by-using-ews-in-exchange>
                    base_shape: BaseShape::IdOnly,
                    ..Default::default()
                },
                sync_folder_id: BaseFolderId::FolderId {
                    id: self.folder_id.clone(),
                    change_key: None,
                },
                sync_state: self.sync_state_token.clone(),
                ignore: None,
                max_changes_returned: 100,
                sync_scope: None,
            };

            let response = client
                .make_operation_request(op, Default::default())
                .await?
                .into_response_messages();
            let response_class = single_response_or_error(response)?;
            let message = process_response_message_class(SyncFolderItems::NAME, response_class)?;

            // We only fetch unique messages, as we ignore the `ChangeKey` and
            // simply fetch the latest version.
            let message_ids_to_fetch: HashSet<_> = message
                .changes
                .inner
                .iter()
                .filter_map(|change| {
                    let message = match change {
                        sync_folder_items::Change::Create { item } => item.inner_message(),
                        sync_folder_items::Change::Update { item } => item.inner_message(),

                        // We don't fetch items for anything other than messages,
                        // since we don't have support for other items, and we don't
                        // need to fetch for other types of changes since the ID is
                        // sufficient to do the necessary work.
                        _ => return None,
                    };

                    let result = message
                        .item_id
                        .as_ref()
                        .map(|item_id| item_id.id.clone())
                        // If there is no item ID in a response from Exchange,
                        // something has gone badly wrong. We'll end processing
                        // here.
                        .ok_or(XpComEwsError::MissingIdInResponse);

                    Some(result)
                })
                .collect::<Result<_, _>>()?;

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

            if client.server_version.get() >= ExchangeServerVersion::Exchange2013 {
                fields_to_fetch.push("item:Preview");
            }

            let messages_by_id: HashMap<_, _> = client
                .get_items(message_ids_to_fetch, &fields_to_fetch, false)
                .await?
                .into_iter()
                .map(|item| {
                    let message = item.into_inner_message();
                    message
                        .item_id
                        .clone()
                        .ok_or_else(|| XpComEwsError::MissingIdInResponse)
                        .map(|item_id| (item_id.id.to_owned(), message))
                })
                .collect::<Result<_, _>>()?;

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

                        let msg = messages_by_id.get(item_id).ok_or_else(|| {
                            XpComEwsError::Processing {
                                message: format!("Unable to fetch message with ID {item_id}"),
                            }
                        })?;

                        // Have the database create a new header instance for
                        // us. We don't create it ourselves so that the database
                        // can fill out any fields it wants beforehand. The
                        // header we get back will have its EWS ID already set.
                        let result = self.listener.on_message_created(item_id);

                        if let Err(nserror::NS_ERROR_ILLEGAL_VALUE) = result {
                            // `NS_ERROR_ILLEGAL_VALUE` means a header already
                            // exists for this item ID. We assume here that a
                            // previous sync encountered an error partway
                            // through and skip this item.
                            log::warn!(
                                "Message with ID {item_id} already exists in database, skipping"
                            );
                            continue;
                        }

                        let header = result?.populate_from_message_headers(msg)?;
                        self.listener.on_detached_hdr_populated(header)?;
                    }

                    sync_folder_items::Change::Update { item } => {
                        let item_id = &item
                            .inner_message()
                            .item_id
                            .as_ref()
                            .ok_or_else(|| XpComEwsError::MissingIdInResponse)?
                            .id;

                        log::info!("Processing Update change with ID {item_id}");

                        let msg = messages_by_id.get(item_id).ok_or_else(|| {
                            XpComEwsError::Processing {
                                message: format!("Unable to fetch message with ID {item_id}"),
                            }
                        })?;

                        let mut result = self.listener.on_message_updated(item_id);

                        let mut hdr_is_detached = false;
                        if let Err(nserror::NS_ERROR_NOT_AVAILABLE) = result {
                            // Something has gone wrong, probably in a previous
                            // sync, and we've missed a new item. So let's try
                            // to gracefully recover from this and create a new
                            // detached entry.
                            log::warn!(
                                "Cannot find existing item to update with ID {item_id}, creating it instead"
                            );

                            result = self.listener.on_message_created(item_id);

                            hdr_is_detached = true;
                        }

                        // At some point we might want to restrict what
                        // properties we want to support updating (e.g. do we
                        // want to support changing the message ID, considering
                        // the message might be a draft?). At the time of
                        // writing, it's still unclear which property should
                        // *always* be read-only, which ones have their
                        // readability depend on the context, and which ones can
                        // always be updated, so we copy the remote state onto
                        // the database entry and commit.
                        let header = result?.populate_from_message_headers(msg)?;

                        // Persist the database entry. If it's a new one
                        // (because we've missed the creation event), then we
                        // need to do this as if we're dealing with the
                        // still-detached entry from a `Created` change (which
                        // we kind of are).
                        if hdr_is_detached {
                            self.listener.on_detached_hdr_populated(header)?;
                        } else {
                            self.listener.on_existing_hdr_changed()?;
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

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
{
    pub(crate) async fn sync_messages_for_folder(
        self,
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
