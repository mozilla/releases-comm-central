/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub(crate) mod copy_move_operations;
mod create_folder;
mod mark_as_junk;
mod server_version;

use std::{
    cell::{Cell, RefCell},
    collections::{HashMap, HashSet, VecDeque},
    env,
};

use base64::prelude::{Engine, BASE64_STANDARD};
use ews::{
    create_item::CreateItem,
    delete_folder::DeleteFolder,
    delete_item::DeleteItem,
    get_folder::{GetFolder, GetFolderResponseMessage},
    get_item::GetItem,
    response::{ResponseClass, ResponseCode, ResponseError},
    server_version::ExchangeServerVersion,
    soap,
    sync_folder_hierarchy::{self, SyncFolderHierarchy},
    sync_folder_items::{self, SyncFolderItems},
    update_folder::{FolderChange, FolderChanges, UpdateFolder, Updates as FolderUpdates},
    update_item::{
        ConflictResolution, ItemChange, ItemChangeDescription, ItemChangeInner, UpdateItem, Updates,
    },
    ArrayOfRecipients, BaseFolderId, BaseItemId, BaseShape, DeleteType, ExtendedFieldURI,
    ExtendedProperty, Folder, FolderId, FolderShape, ItemResponseMessage, ItemShape, Message,
    MessageDisposition, MimeContent, Operation, OperationResponse, PathToElement, RealItem,
    Recipient,
};
use fxhash::FxHashMap;
use mail_parser::MessageParser;
use mailnews_ui_glue::{
    handle_auth_failure, handle_transport_sec_failure, maybe_handle_connection_error,
    report_connection_success, AuthErrorOutcome, UserInteractiveServer,
};
use moz_http::Response;
use nserror::nsresult;
use nsstring::nsCString;
use server_version::read_server_version;
use thin_vec::ThinVec;
use thiserror::Error;
use url::Url;
use uuid::Uuid;
use xpcom::{
    interfaces::{
        nsIMsgOutgoingListener, nsIStringInputStream, nsIURI, nsIUrlListener,
        IEwsFallibleOperationListener, IEwsMessageFetchListener, IEwsSimpleOperationListener,
    },
    RefCounted, RefPtr, XpCom,
};

use crate::{
    authentication::credentials::{AuthenticationProvider, Credentials},
    cancellable_request::CancellableRequest,
    safe_xpcom::{
        safe_handle_error, SafeEwsFolderListener, SafeEwsMessageCreateListener,
        SafeEwsMessageSyncListener, SafeListener, StaleMsgDbHeader, UpdatedMsgDbHeader,
    },
};

// Flags to use for setting the `PR_MESSAGE_FLAGS` MAPI property.
//
// See
// <https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property>,
// although the specific values are set in `Mapidefs.h` from the Windows SDK:
// <https://github.com/microsoft/MAPIStubLibrary/blob/1d30c31ebf05ef444371520cd4268d6e1fda8a3b/include/MAPIDefS.h#L2143-L2154>
//
// Message flags are of type `PT_LONG`, which corresponds to i32 (signed 32-bit
// integers) according to
// https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/property-types
const MSGFLAG_READ: i32 = 0x00000001;
const MSGFLAG_UNMODIFIED: i32 = 0x00000002;
const MSGFLAG_UNSENT: i32 = 0x00000008;

const EWS_ROOT_FOLDER: &str = "msgfolderroot";

// The environment variable that controls whether to include request/response
// payloads when logging. We only check for the variable's presence, not any
// specific value.
const LOG_NETWORK_PAYLOADS_ENV_VAR: &str = "THUNDERBIRD_LOG_NETWORK_PAYLOADS";

/// Options to to control the behavior of
/// [`XpComEwsClient::make_operation_request`].
#[derive(Debug, Clone, Copy, Default)]
struct OperationRequestOptions {
    /// Behavior to follow when an authentication failure arises.
    auth_failure_behavior: AuthFailureBehavior,

    /// Behavior to follow when a transport security failure arises.
    transport_sec_failure_behavior: TransportSecFailureBehavior,
}

/// The behavior to follow when an operation request results in an
/// authentication failure.
#[derive(Debug, Clone, Copy, Default)]
enum AuthFailureBehavior {
    /// Attempt to authenticate again or ask the user for new credentials.
    #[default]
    ReAuth,

    /// Fail immediately without attempting to authenticate again or asking the
    /// user for new credentials.
    Silent,
}

/// The behavior to follow when an operation request results in a transport
/// security failure (e.g. because of an invalid certificate). This specifically
/// controls the behaviour of `XpComEwsClient::make_operation_request`.
#[derive(Debug, Clone, Copy, Default)]
enum TransportSecFailureBehavior {
    /// Immediately alert the user about the security failure.
    #[default]
    Alert,

    /// Don't alert the user and propagate the failure to the consumer (which
    /// might or might not alert the user).
    Silent,
}

pub(crate) struct XpComEwsClient<ServerT: RefCounted + 'static> {
    endpoint: Url,
    server: RefPtr<ServerT>,
    credentials: RefCell<Credentials>,
    client: moz_http::Client,
    server_version: Cell<ExchangeServerVersion>,
}

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted + 'static,
{
    pub(crate) fn new(
        endpoint: Url,
        server: RefPtr<ServerT>,
        credentials: Credentials,
    ) -> Result<XpComEwsClient<ServerT>, XpComEwsError> {
        let server_version = read_server_version(&endpoint)?;

        Ok(XpComEwsClient {
            endpoint,
            server,
            credentials: RefCell::new(credentials),
            client: moz_http::Client::new(),
            server_version: Cell::new(server_version),
        })
    }

    /// Performs a connectivity check to the EWS server.
    ///
    /// Because EWS does not have a dedicated endpoint to test connectivity and
    /// authentication, we try to look up the ID of the account's root mail
    /// folder, since it produces a fairly small request and represents the
    /// first operation performed when adding a new account to Thunderbird.
    pub(crate) async fn check_connectivity(
        self,
        uri: RefPtr<nsIURI>,
        listener: RefPtr<nsIUrlListener>,
    ) {
        unsafe { listener.OnStartRunningUrl(uri.coerce()) };

        match self.check_connectivity_inner().await {
            Ok(_) => unsafe {
                listener.OnStopRunningUrl(uri.coerce(), nserror::NS_OK);
            },
            Err(err) => {
                log::error!("connectivity check failed with error: {}", err);

                unsafe {
                    listener.OnStopRunningUrl(uri.coerce(), err.into());
                }
            }
        }
    }

    async fn check_connectivity_inner(self) -> Result<(), XpComEwsError> {
        // Request the EWS ID of the root folder.
        let get_root_folder = GetFolder {
            folder_shape: FolderShape {
                base_shape: BaseShape::IdOnly,
            },
            folder_ids: vec![BaseFolderId::DistinguishedFolderId {
                id: EWS_ROOT_FOLDER.to_string(),
                change_key: None,
            }],
        };

        let response_messages = self
            // Make authentication failure silent, since all we want to know is
            // whether our credentials are valid.
            .make_operation_request(
                get_root_folder,
                OperationRequestOptions {
                    auth_failure_behavior: AuthFailureBehavior::Silent,
                    ..Default::default()
                },
            )
            .await?
            .into_response_messages();

        // Get the first (and only) response message so we can inspect it.
        let response_class = single_response_or_error(response_messages)?;
        let message = process_response_message_class("GetFolder", response_class)?;

        // Any error fetching the root folder is fatal, since it likely means
        // all subsequent request will fail, and that we won't manage to sync
        // the folder list later.
        validate_get_folder_response_message(&message)?;

        Ok(())
    }

    /// Performs a [`SyncFolderHierarchy` operation] via EWS.
    ///
    /// This will fetch a list of remote changes since the specified sync state,
    /// fetch any folder details needed for creating or updating local folders,
    /// and notify the Thunderbird protocol implementation of these changes via
    /// the provided callbacks.
    ///
    /// [`SyncFolderHierarchy` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy-operation
    pub(crate) async fn sync_folder_hierarchy(
        self,
        listener: SafeEwsFolderListener,
        sync_state_token: Option<String>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        match self
            .sync_folder_hierarchy_inner(&listener, sync_state_token)
            .await
        {
            Ok(_) => {
                let _ = listener.on_success(());
            }
            Err(err) => safe_handle_error(&listener, "SyncFolderHierarchy", &err, ()),
        };
    }

    async fn sync_folder_hierarchy_inner(
        self,
        listener: &SafeEwsFolderListener,
        mut sync_state_token: Option<String>,
    ) -> Result<(), XpComEwsError> {
        // If we have received no sync state, assume that this is the first time
        // syncing this account. In that case, we need to determine which
        // folders are "well-known" (e.g., inbox, trash, etc.) so we can flag
        // them.
        let well_known = if sync_state_token.is_none() {
            Some(self.get_well_known_folder_map(listener).await?)
        } else {
            None
        };

        loop {
            // Folder sync returns results in batches, with sync state providing
            // the mechanism by which we can specify the next batch to receive.
            let op = SyncFolderHierarchy {
                folder_shape: FolderShape {
                    base_shape: BaseShape::IdOnly,
                },
                sync_folder_id: Some(BaseFolderId::DistinguishedFolderId {
                    // Folder sync can happen starting with any folder, but we
                    // always choose "msgfolderroot" as sync is recursive and
                    // this simplifies managing sync state. There is a "root"
                    // folder one level up as well, but it includes calendars,
                    // contacts, etc., which we aren't trying to support yet.
                    id: EWS_ROOT_FOLDER.to_string(),
                    change_key: None,
                }),
                sync_state: sync_state_token,
            };

            let response = self
                .make_operation_request(op, Default::default())
                .await?
                .into_response_messages();
            let response = single_response_or_error(response)?;
            let message = process_response_message_class("SyncFolderHierarchy", response)?;

            let mut create_ids = Vec::new();
            let mut update_ids = Vec::new();
            let mut delete_ids = Vec::new();

            // Build lists of all of the changed folder IDs. We'll need to fetch
            // further details when creating or updating folders as well.
            for change in message.changes.inner {
                match change {
                    sync_folder_hierarchy::Change::Create { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            let folder_id = folder_id.ok_or(XpComEwsError::MissingIdInResponse)?;

                            create_ids.push(folder_id.id)
                        }
                    }
                    sync_folder_hierarchy::Change::Update { folder } => {
                        if let Folder::Folder { folder_id, .. } = folder {
                            let folder_id = folder_id.ok_or(XpComEwsError::MissingIdInResponse)?;

                            update_ids.push(folder_id.id)
                        }
                    }
                    sync_folder_hierarchy::Change::Delete { folder_id } => {
                        delete_ids.push(folder_id.id)
                    }
                }
            }

            self.push_sync_state_to_ui(
                listener,
                create_ids,
                update_ids,
                delete_ids,
                &message.sync_state,
                &well_known,
            )
            .await?;

            if message.includes_last_folder_in_range {
                // EWS has signaled to us that there are no more changes at this
                // time.
                break;
            }

            sync_state_token = Some(message.sync_state);
        }

        Ok(())
    }

    pub(crate) async fn sync_messages_for_folder(
        self,
        listener: SafeEwsMessageSyncListener,
        folder_id: String,
        sync_state_token: Option<String>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.

        match self
            .sync_messages_for_folder_inner(&listener, folder_id, sync_state_token)
            .await
        {
            Ok(_) => {
                let _ = listener.on_success(());
            }
            Err(err) => safe_handle_error(&listener, "SyncFolderItems", &err, ()),
        }
    }

    async fn sync_messages_for_folder_inner(
        self,
        listener: &SafeEwsMessageSyncListener,
        folder_id: String,
        mut sync_state_token: Option<String>,
    ) -> Result<(), XpComEwsError> {
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
                    id: folder_id.clone(),
                    change_key: None,
                },
                sync_state: sync_state_token.clone(),
                ignore: None,
                max_changes_returned: 100,
                sync_scope: None,
            };

            let response = self
                .make_operation_request(op, Default::default())
                .await?
                .into_response_messages();
            let response_class = single_response_or_error(response)?;
            let message = process_response_message_class("SyncFolderItems", response_class)?;

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

            let messages_by_id: HashMap<_, _> = self
                .get_items(
                    message_ids_to_fetch,
                    &[
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
                    ],
                    false,
                )
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
                        let result = listener.on_message_created(item_id);

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
                        listener.on_detached_hdr_populated(header)?;
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

                        let mut result = listener.on_message_updated(item_id);

                        let mut hdr_is_detached = false;
                        if let Err(nserror::NS_ERROR_NOT_AVAILABLE) = result {
                            // Something has gone wrong, probably in a previous
                            // sync, and we've missed a new item. So let's try
                            // to gracefully recover from this and create a new
                            // detached entry.
                            log::warn!(
                                "Cannot find existing item to update with ID {item_id}, creating it instead"
                            );

                            result = listener.on_message_created(item_id);

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
                            listener.on_detached_hdr_populated(header)?;
                        } else {
                            listener.on_existing_hdr_changed()?;
                        }
                    }

                    sync_folder_items::Change::Delete { item_id } => {
                        // The message id that was deleted
                        let id = item_id.id;

                        // Delete the messages from the folder's database.
                        listener.on_message_deleted(id)?;
                    }

                    sync_folder_items::Change::ReadFlagChange { item_id, is_read } => {
                        //The message id that has been read
                        let id = item_id.id;

                        // Mark the messages as read in the folder's database.
                        listener.on_read_status_changed(id, is_read)?;
                    }
                }
            }

            // Update sync state after pushing each batch of messages so that,
            // if we're interrupted, we resume from roughly the same place.
            listener.on_sync_state_token_changed(&message.sync_state)?;

            if message.includes_last_item_in_range {
                // EWS has signaled to us that there are no more changes at this
                // time.
                break;
            }

            sync_state_token = Some(message.sync_state);
        }

        Ok(())
    }

    pub(crate) async fn get_message(self, listener: RefPtr<IEwsMessageFetchListener>, id: String) {
        unsafe { listener.OnFetchStart() };

        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        let result = self.get_message_inner(&listener, id.clone()).await;

        let status = match result {
            Ok(_) => nserror::NS_OK,
            Err(err) => {
                log::error!("an unexpected error occurred while fetching message {id}: {err:?}");

                nsresult::from(err)
            }
        };

        unsafe { listener.OnFetchStop(status) };
    }

    async fn get_message_inner(
        self,
        listener: &IEwsMessageFetchListener,
        id: String,
    ) -> Result<(), XpComEwsError> {
        let items = self.get_items([id], &[], true).await?;
        if items.len() != 1 {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "provided single ID to GetItem operation, got {} responses",
                    items.len()
                ),
            });
        }

        // Extract the Internet Message Format content of the message from the
        // response. We've guaranteed above that the iteration will produce
        // at least one element, so unwrapping is okay here.
        let item = items.into_iter().next().unwrap();
        let message = item.inner_message();

        let raw_mime = if let Some(raw_mime) = &message.mime_content {
            &raw_mime.content
        } else {
            return Err(XpComEwsError::Processing {
                message: "item has no content".to_string(),
            });
        };

        // EWS returns the content of the email b64encoded on top of any
        // encoding within the message.
        let mime_content =
            BASE64_STANDARD
                .decode(raw_mime)
                .map_err(|_| XpComEwsError::Processing {
                    message: "MIME content for item is not validly base64 encoded".to_string(),
                })?;

        let len: i32 = mime_content
            .len()
            .try_into()
            .map_err(|_| XpComEwsError::Processing {
                message: format!(
                    "item is of length {}, larger than supported size of 2GiB",
                    mime_content.len()
                ),
            })?;

        let stream = xpcom::create_instance::<nsIStringInputStream>(cstr::cstr!(
            "@mozilla.org/io/string-input-stream;1"
        ))
        .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        // We use `SetByteStringData()` here instead of one of the alternatives
        // to ensure that the data is copied. Otherwise, the pointer may become
        // invalid before the stream is dropped.
        let mime_content = nsCString::from(mime_content);
        unsafe { stream.SetByteStringData(&*mime_content) }.to_result()?;

        unsafe { listener.OnFetchedDataAvailable(stream.coerce(), len as u32) }.to_result()?;

        Ok(())
    }

    /// Builds a map from remote folder ID to distinguished folder ID.
    ///
    /// This allows translating from the folder ID returned by `GetFolder`
    /// calls and well-known IDs associated with special folders.
    async fn get_well_known_folder_map(
        &self,
        listener: &SafeEwsFolderListener,
    ) -> Result<FxHashMap<String, &str>, XpComEwsError> {
        const DISTINGUISHED_IDS: &[&str] = &[
            EWS_ROOT_FOLDER,
            "inbox",
            "deleteditems",
            "drafts",
            "outbox",
            "sentitems",
            "junkemail",
            // The `archive` distinguished id isn't documented at
            // https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/distinguishedfolderid
            // but it does provide the Exchange account's archive folder when
            // requested, while the other documented `archive*` distinguished
            // ids result in folder not found errors.
            "archive",
        ];

        // We should always request the root folder first to simplify processing
        // the response below.
        assert_eq!(
            DISTINGUISHED_IDS[0], EWS_ROOT_FOLDER,
            "expected first fetched folder to be root"
        );

        let ids = DISTINGUISHED_IDS
            .iter()
            .map(|id| BaseFolderId::DistinguishedFolderId {
                id: id.to_string(),
                change_key: None,
            })
            .collect();

        // Fetch all distinguished folder IDs at once, since we have few enough
        // that they fit within Microsoft's recommended batch size of ten.
        let op = GetFolder {
            folder_shape: FolderShape {
                base_shape: BaseShape::IdOnly,
            },
            folder_ids: ids,
        };

        let response = self.make_operation_request(op, Default::default()).await?;

        let response_messages = response.into_response_messages();
        validate_response_message_count(&response_messages, DISTINGUISHED_IDS.len())?;

        // We expect results from EWS to be in the same order as given in the
        // request. EWS docs aren't explicit about response ordering, but
        // responses don't contain another means of mapping requested ID to
        // response.
        let mut message_iter = DISTINGUISHED_IDS.iter().zip(response_messages);

        // Record the root folder for messages before processing the other
        // responses. We're okay to unwrap since we request a static number of
        // folders and we've already checked that we have that number of
        // responses.
        let (_, response_class) = message_iter.next().unwrap();
        let message = process_response_message_class("GetFolder", response_class)?;

        // Any error fetching the root folder is fatal, since we can't correctly
        // set the parents of any folders it contains without knowing its ID.
        let root_folder_id = validate_get_folder_response_message(&message)?;
        listener.on_new_root_folder(root_folder_id)?;

        // Build the mapping for the remaining folders.
        message_iter
            .filter_map(|(&distinguished_id, response_class)| {
                let message = match process_response_message_class("GetFolder", response_class) {
                    Ok(message) => Some(message),

                    // Not every Exchange account will have all queried
                    // well-known folders, so we skip any which were not
                    // found.
                    Err(XpComEwsError::ResponseError(ResponseError {
                        response_code: ResponseCode::ErrorFolderNotFound,
                        ..
                    })) => None,

                    // Return any other error.
                    Err(err) => {
                        return Some(Err(err));
                    }
                };

                message.and_then(|message| {
                    // Validate the message (and propagate any error) if it's
                    // not `None`.
                    match validate_get_folder_response_message(&message) {
                        // Map from EWS folder ID to distinguished ID.
                        Ok(folder_id) => Some(Ok((folder_id.id, distinguished_id))),
                        Err(err) => Some(Err(err)),
                    }
                })
            })
            .collect()
    }

    async fn push_sync_state_to_ui(
        &self,
        listener: &SafeEwsFolderListener,
        create_ids: Vec<String>,
        update_ids: Vec<String>,
        delete_ids: Vec<String>,
        sync_state: &str,
        well_known_map: &Option<FxHashMap<String, &str>>,
    ) -> Result<(), XpComEwsError> {
        if !create_ids.is_empty() {
            let created = self.batch_get_folders(create_ids).await?;
            for folder in created {
                match folder {
                    Folder::Folder {
                        folder_id,
                        parent_folder_id,
                        display_name,
                        ..
                    } => listener.on_folder_created(
                        folder_id,
                        parent_folder_id,
                        display_name,
                        well_known_map,
                    )?,
                    _ => return Err(nserror::NS_ERROR_FAILURE.into()),
                }
            }
        }

        if !update_ids.is_empty() {
            let updated = self.batch_get_folders(update_ids).await?;
            for folder in updated {
                match folder {
                    Folder::Folder {
                        folder_id,
                        parent_folder_id,
                        display_name,
                        ..
                    } => listener.on_folder_updated(folder_id, parent_folder_id, display_name)?,
                    _ => return Err(nserror::NS_ERROR_FAILURE.into()),
                }
            }
        }

        for id in delete_ids {
            listener.on_folder_deleted(id)?;
        }

        listener.on_sync_state_token_changed(sync_state)?;

        Ok(())
    }

    async fn batch_get_folders(&self, ids: Vec<String>) -> Result<Vec<Folder>, XpComEwsError> {
        let mut folders = Vec::with_capacity(ids.len());
        let mut ids = ids.into_iter().peekable();
        let mut buf = Vec::with_capacity(10);

        loop {
            // Per Microsoft's recommendation, we batch `GetFolder` operations
            // in chunks of 10 to avoid throttling.
            //
            // https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/mailbox-synchronization-and-ews-in-exchange
            for _ in 0..10 {
                // This is sort of a terrible way to do this, but
                // `array_chunks()`, `next_chunk()`, etc. are still nightly
                // features on `Iterator` as of this writing and we want to take
                // ownership rather than cloning.
                match ids.next() {
                    Some(value) => buf.push(value),
                    None => break,
                }
            }

            let to_fetch = buf
                .drain(..)
                .map(|id| BaseFolderId::FolderId {
                    id,
                    change_key: None,
                })
                .collect();

            // Execute the request and collect all mail folders found in the
            // response.
            let op = GetFolder {
                folder_shape: FolderShape {
                    base_shape: BaseShape::AllProperties,
                },
                folder_ids: to_fetch,
            };

            let response = self.make_operation_request(op, Default::default()).await?;
            let messages = response.into_response_messages();

            let mut fetched = messages
                .into_iter()
                .filter_map(|response_class| {
                    let message = match process_response_message_class("GetFolder", response_class) {
                        Ok(message) => message,
                        Err(err) => {return Some(Err(err));}
                    };
                    if let Err(err) = validate_get_folder_response_message(&message) {
                        return Some(Err(err));
                    }

                    message
                        .folders
                        .inner
                        .into_iter()
                        .next()
                        .and_then(|folder| match &folder {
                            Folder::Folder {
                                folder_class,
                                display_name,
                                ..
                            } => {
                                let folder_class =
                                    folder_class.as_ref().map(|string| string.as_str());

                                // Filter out non-mail folders. According to EWS
                                // docs, this should be any folder which class
                                // start is "IPF.Note", or starts with
                                // "IPF.Note." (to allow some systems to define
                                // custom mail-derived classes).
                                //
                                // See
                                // <https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/folders-and-items-in-ews-in-exchange>
                                match folder_class {
                                    Some(folder_class) => {
                                        if folder_class == "IPF.Note"
                                            || folder_class.starts_with("IPF.Note.")
                                        {
                                            Some(Ok(folder))
                                        } else {
                                            log::debug!("Skipping folder with unsupported class: {folder_class}");
                                            None
                                        }
                                    }
                                    None => {
                                        log::warn!(
                                            "Skipping folder without a class: {}",
                                            display_name.clone().unwrap_or("unknown".to_string())
                                        );

                                        None
                                    }
                                }
                            }

                            _ => None,
                        })
                })
                .collect::<Result<_, _>>()?;

            folders.append(&mut fetched);

            if ids.peek().is_none() {
                break;
            }
        }

        Ok(folders)
    }

    /// Fetches items from the remote Exchange server.
    async fn get_items<IdColl>(
        &self,
        ids: IdColl,
        fields: &[&str],
        include_mime_content: bool,
    ) -> Result<Vec<RealItem>, XpComEwsError>
    where
        IdColl: IntoIterator<Item = String>,
    {
        // Build a `VecDeque` so that we can drain it from the front. It would
        // be better to do this with `array_chunks()` once we have a suitable
        // MSRV.
        // https://github.com/rust-lang/rust/issues/74985
        let mut ids: VecDeque<_> = ids.into_iter().collect();
        let mut items = Vec::with_capacity(ids.len());

        while !ids.is_empty() {
            let batch_ids: Vec<_> = {
                let range_end = usize::min(10, ids.len());
                ids.drain(0..range_end)
            }
            .map(|id| BaseItemId::ItemId {
                id,
                change_key: None,
            })
            .collect();

            let additional_properties: Vec<_> = fields
                .iter()
                .map(|&field| PathToElement::FieldURI {
                    field_URI: String::from(field),
                })
                .collect();

            let additional_properties = if additional_properties.is_empty() {
                None
            } else {
                Some(additional_properties)
            };

            let op = GetItem {
                item_shape: ItemShape {
                    // We use `IdOnly` with the `AdditionalProperties` field to
                    // get finer control over what we request. `Default`
                    // includes the message body, which we would discard if we
                    // are only getting the message header.
                    base_shape: BaseShape::IdOnly,
                    additional_properties,
                    include_mime_content: Some(include_mime_content),
                },
                item_ids: batch_ids,
            };

            let response = self.make_operation_request(op, Default::default()).await?;
            for response_message in response.into_response_messages() {
                let message = process_response_message_class("GetItem", response_message)?;

                // The expected shape of the list of response messages is
                // underspecified, but EWS always seems to return one message
                // per requested ID, containing the item corresponding to that
                // ID. However, it allows for multiple items per message, so we
                // need to be sure we aren't throwing some away.
                let items_len = message.items.inner.len();
                if items_len != 1 {
                    log::warn!(
                        "GetItemResponseMessage contained {} items, only 1 expected",
                        items_len
                    );
                }

                items.extend(message.items.inner.into_iter());
            }
        }

        Ok(items)
    }

    /// Send a message by performing a [`CreateItem` operation] via EWS.
    ///
    /// All headers except for Bcc are expected to be included in the provided
    /// MIME content.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    pub async fn send_message(
        self,
        mime_content: String,
        message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<Recipient>,
        listener: RefPtr<nsIMsgOutgoingListener>,
        server_uri: RefPtr<nsIURI>,
    ) {
        let cancellable_request = CancellableRequest::new();

        // Notify that the request has started.
        if let Err(err) = unsafe { listener.OnSendStart(cancellable_request.coerce()) }.to_result()
        {
            log::error!("aborting sending: an error occurred while starting the observer: {err}");
            return;
        }

        // Send the request, using an inner method to more easily handle errors.
        // Use the return value to determine which status we should use when
        // notifying the end of the request.
        let (status, sec_info) = match self
            .send_message_inner(mime_content, message_id, should_request_dsn, bcc_recipients)
            .await
        {
            Ok(_) => (nserror::NS_OK, None),
            Err(err) => {
                log::error!("an error occurred while attempting to send the message: {err:?}");

                match err {
                    XpComEwsError::Http(moz_http::Error::TransportSecurityFailure {
                        status,
                        transport_security_info,
                    }) => (status, Some(transport_security_info.0.clone())),
                    _ => (err.into(), None),
                }
            }
        };

        // Notify that the request has finished. We pass in an empty string as
        // the error message because we don't currently generate any user-facing
        // error from here, so it's likely better to let MessageSend generate
        // one.
        let err_msg = nsCString::new();
        let sec_info = match sec_info {
            Some(sec_info) => RefPtr::forget_into_raw(sec_info),
            None => std::ptr::null(),
        };

        if let Err(err) =
            unsafe { listener.OnSendStop(server_uri.coerce(), status, sec_info, &*err_msg) }
                .to_result()
        {
            log::error!("an error occurred while stopping the observer: {err}")
        }
    }

    async fn send_message_inner(
        self,
        mime_content: String,
        message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<Recipient>,
    ) -> Result<(), XpComEwsError> {
        let bcc_recipients = if !bcc_recipients.is_empty() {
            Some(ArrayOfRecipients(bcc_recipients))
        } else {
            None
        };

        // Create a new message using the default values, and set the ones we
        // need.
        let message = Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(&mime_content),
            }),
            is_delivery_receipt_requested: Some(should_request_dsn),
            internet_message_id: Some(message_id),
            bcc_recipients,
            ..Default::default()
        };

        let create_item = CreateItem {
            items: vec![RealItem::Message(message)],

            // We don't need EWS to copy messages to the Sent folder after
            // they've been sent, because the internal MessageSend module
            // already takes care of it and will include additional headers we
            // don't send to EWS (such as Bcc).
            message_disposition: Some(MessageDisposition::SendOnly),
            saved_item_folder_id: None,
        };

        self.make_create_item_request(create_item, TransportSecFailureBehavior::Silent)
            .await?;

        Ok(())
    }

    /// Create a message on the server by performing a [`CreateItem` operation]
    /// via EWS.
    ///
    /// All headers are expected to be included in the provided MIME content.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    pub async fn create_message(
        self,
        folder_id: String,
        is_draft: bool,
        is_read: bool,
        content: Vec<u8>,
        listener: SafeEwsMessageCreateListener,
    ) {
        // Send the request, using an inner method to more easily handle errors.
        // Use the return value to determine which status we should use when
        // notifying the end of the request.
        match self
            .create_message_inner(folder_id, is_draft, is_read, content, &listener)
            .await
        {
            Ok(_) => {
                let _ = listener.on_success(());
            }
            Err(err) => safe_handle_error(&listener, "CreateItem", &err, ()),
        };
    }

    async fn create_message_inner(
        &self,
        folder_id: String,
        is_draft: bool,
        is_read: bool,
        content: Vec<u8>,
        listener: &SafeEwsMessageCreateListener,
    ) -> Result<(), XpComEwsError> {
        // Create a new message from the binary content we got.
        let mut message = Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(&content),
            }),
            is_read: Some(is_read),
            ..Default::default()
        };

        // Set the `PR_MESSAGE_FLAGS` MAPI property. If not set, the EWS server
        // uses `MSGFLAG_UNSENT` | `MSGFLAG_UNMODIFIED` as the default value,
        // which is not what we want.
        //
        // See
        // https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property
        let mut mapi_flags = MSGFLAG_READ;
        if is_draft {
            mapi_flags |= MSGFLAG_UNSENT;
        } else {
            mapi_flags |= MSGFLAG_UNMODIFIED;
        }

        message.extended_property = Some(vec![ExtendedProperty {
            extended_field_URI: ExtendedFieldURI {
                distinguished_property_set_id: None,
                property_set_id: None,
                property_name: None,
                property_id: None,

                // 3591 (0x0E07) is the `PR_MESSAGE_FLAGS` MAPI property.
                property_tag: Some("3591".into()),
                property_type: ews::PropertyType::Integer,
            },
            value: mapi_flags.to_string(),
        }]);

        let create_item = CreateItem {
            items: vec![RealItem::Message(message)],
            message_disposition: Some(MessageDisposition::SaveOnly),
            saved_item_folder_id: Some(BaseFolderId::FolderId {
                id: folder_id,
                change_key: None,
            }),
        };

        let response_message = self
            .make_create_item_request(create_item, Default::default())
            .await?;

        let hdr =
            create_and_populate_header_from_create_response(response_message, &content, listener)?;

        // Let the listeners know of the local key for the newly created message.
        listener.on_new_message_key(&hdr)?;

        Ok(())
    }

    /// Performs a [`CreateItem` operation] and processes its response.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    async fn make_create_item_request(
        &self,
        create_item: CreateItem,
        transport_sec_failure_behavior: TransportSecFailureBehavior,
    ) -> Result<ItemResponseMessage, XpComEwsError> {
        let response = self
            .make_operation_request(
                create_item,
                OperationRequestOptions {
                    transport_sec_failure_behavior,
                    ..Default::default()
                },
            )
            .await?;

        // We have only sent one message, therefore the response should only
        // contain one response message.
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        process_response_message_class("CreateItem", response_message)
    }

    /// Mark a message as read or unread by performing an [`UpdateItem` operation] via EWS.
    ///
    /// [`UpdateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    pub async fn change_read_status(self, message_ids: Vec<String>, is_read: bool) {
        // Send the request, using an inner method to more easily handle errors.
        if let Err(err) = self.change_read_status_inner(message_ids, is_read).await {
            log::error!("an error occurred while attempting to update the read status: {err:?}");
        }
    }

    async fn change_read_status_inner(
        self,
        message_ids: Vec<String>,
        is_read: bool,
    ) -> Result<(), XpComEwsError> {
        // Create the structure for setting the messages as read/unread.
        let item_changes: Vec<ItemChange> = message_ids
            .into_iter()
            .map(|message_id| {
                let updates = Updates {
                    inner: vec![ItemChangeDescription::SetItemField {
                        field_uri: PathToElement::FieldURI {
                            field_URI: "message:IsRead".to_string(),
                        },
                        message: Message {
                            is_read: Some(is_read),
                            ..Default::default()
                        },
                    }],
                };

                ItemChange {
                    item_change: ItemChangeInner {
                        item_id: BaseItemId::ItemId {
                            id: message_id,
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

        self.make_update_item_request(update_item).await?;

        Ok(())
    }

    /// Performs an [`UpdateItem` operation] and processes its response.
    ///
    /// [`UpdateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    async fn make_update_item_request(&self, update_item: UpdateItem) -> Result<(), XpComEwsError> {
        // Make the operation request using the provided parameters.
        let response = self
            .make_operation_request(update_item.clone(), Default::default())
            .await?;

        // Get all response messages.
        let response_messages = response.into_response_messages();
        validate_response_message_count(&response_messages, update_item.item_changes.len())?;

        // Process each response message, checking for errors or warnings.
        let errors: Vec<_> = response_messages
            .into_iter()
            .enumerate()
            .filter_map(|(index, response_message)| {
                match process_response_message_class("UpdateItem", response_message) {
                    Ok(_) => None,
                    Err(err) => Some(format!("failed to process message #{index}: {err}")),
                }
            })
            .collect();

        // If there were errors, return an aggregated error.
        if !errors.is_empty() {
            return Err(XpComEwsError::Processing {
                message: format!("response contained errors: {errors:?}"),
            });
        }

        Ok(())
    }

    pub async fn delete_messages(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        ews_ids: ThinVec<nsCString>,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        match self.delete_messages_inner(ews_ids).await {
            Ok(_) => unsafe {
                listener.OnOperationSuccess(&ThinVec::new(), false);
            },
            Err(err) => handle_error(
                "DeleteItem",
                err,
                listener.query_interface::<IEwsFallibleOperationListener>(),
            ),
        };
    }

    async fn delete_messages_inner(self, ews_ids: ThinVec<nsCString>) -> Result<(), XpComEwsError> {
        let item_ids: Vec<BaseItemId> = ews_ids
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

        let response = self
            .make_operation_request(delete_item, Default::default())
            .await?;

        // Make sure we got the amount of response messages matches the amount
        // of messages we requested to have deleted.
        let response_messages = response.into_response_messages();
        validate_response_message_count(&response_messages, ews_ids.len())?;

        // Check every response message for an error.
        response_messages
            .into_iter()
            .zip(ews_ids.iter())
            .try_for_each(|(response_message, ews_id)| {
                if let Err(err) = process_response_message_class(
                    "DeleteItem",
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

    pub async fn delete_folder(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        folder_id: String,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        match self.delete_folder_inner(folder_id).await {
            Ok(_) => unsafe {
                listener.OnOperationSuccess(&ThinVec::new(), false);
            },
            Err(err) => handle_error(
                "DeleteFolder",
                err,
                listener.query_interface::<IEwsFallibleOperationListener>(),
            ),
        }
    }

    async fn delete_folder_inner(self, folder_id: String) -> Result<(), XpComEwsError> {
        let delete_folder = DeleteFolder {
            folder_ids: vec![BaseFolderId::FolderId {
                id: folder_id.clone(),
                change_key: None,
            }],
            delete_type: DeleteType::HardDelete,
        };
        let response = self
            .make_operation_request(delete_folder, Default::default())
            .await?;

        // We have only sent one message, therefore the response should only
        // contain one response message.
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        match process_response_message_class("DeleteFolder", response_message) {
            Ok(_) => Ok(()),
            Err(err) => match err {
                XpComEwsError::ResponseError(ResponseError {
                    response_code: ResponseCode::ErrorItemNotFound,
                    ..
                }) => {
                    // Something happened in a previous attempt that caused the
                    // folder to be deleted on the EWS server but not in the
                    // database. In this case, we don't want to force a zombie
                    // folder in the account, so we ignore the error and move on
                    // with the local deletion.
                    log::warn!("found folder that was deleted from the EWS server but not the local db: {folder_id}");
                    Ok(())
                }
                _ => Err(err),
            },
        }
    }

    pub async fn update_folder(
        self,
        listener: RefPtr<IEwsSimpleOperationListener>,
        folder_id: String,
        folder_name: String,
    ) {
        // Call an inner function to perform the operation in order to allow us
        // to handle errors while letting the inner function simply propagate.
        match self.update_folder_inner(folder_id, folder_name).await {
            Ok(_) => unsafe {
                listener.OnOperationSuccess(&ThinVec::new(), false);
            },
            Err(err) => handle_error(
                "UpdateFolder",
                err,
                listener.query_interface::<IEwsFallibleOperationListener>(),
            ),
        }
    }

    async fn update_folder_inner(
        self,
        folder_id: String,
        folder_name: String,
    ) -> Result<(), XpComEwsError> {
        let update_folder = UpdateFolder {
            folder_changes: FolderChanges {
                folder_change: FolderChange {
                    folder_id: BaseFolderId::FolderId {
                        id: folder_id,
                        change_key: None,
                    },
                    updates: FolderUpdates::SetFolderField {
                        field_URI: PathToElement::FieldURI {
                            field_URI: "folder:DisplayName".to_string(),
                        },
                        folder: Folder::Folder {
                            display_name: Some(folder_name),
                            folder_id: None,
                            parent_folder_id: None,
                            folder_class: None,
                            total_count: None,
                            child_folder_count: None,
                            extended_property: None,
                            unread_count: None,
                        },
                    },
                },
            },
        };

        let response = self
            .make_operation_request(update_folder, Default::default())
            .await?;
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        process_response_message_class("UpdateFolder", response_message)?;

        Ok(())
    }

    /// Makes a request to the EWS endpoint to perform an operation.
    ///
    /// If the entire request or first response is throttled, the request will
    /// be repeatedly retried (after the delay given in the response) until it
    /// succeeds or some other error occurs.
    async fn make_operation_request<Op>(
        &self,
        op: Op,
        options: OperationRequestOptions,
    ) -> Result<Op::Response, XpComEwsError>
    where
        Op: Operation,
    {
        let op_name = op.name();
        let envelope = soap::Envelope {
            headers: vec![soap::Header::RequestServerVersion {
                version: self.server_version.get(),
            }],
            body: op,
        };
        let request_body = envelope.as_xml_document()?;

        // Loop in case we need to retry the request after a delay.
        loop {
            let response = match self
                .send_authenticated_request(&request_body, op_name)
                .await
            {
                Ok(response) => response,
                Err(err) => {
                    // Handle authentication, network and transport security
                    // failures early because we know how to process them
                    // without requiring more data from the response body.
                    match err {
                        // If the error is an authentication failure, try to
                        // authenticate again (by asking the user for new
                        // credentials if relevant), but only if the consumer
                        // asked us to.
                        XpComEwsError::Authentication
                            if matches!(
                                options.auth_failure_behavior,
                                AuthFailureBehavior::ReAuth
                            ) =>
                        {
                            let outcome = handle_auth_failure(self.server.clone())?;

                            // Refresh the credentials before potentially retrying,
                            // because they might have changed (e.g. if the user
                            // entered a new password after being prompted for one),
                            // and should we emit more requests using this client,
                            // we should be using up to date credentials.
                            let credentials = self.server.get_credentials(None)?;
                            self.credentials.replace(credentials);

                            match outcome {
                                AuthErrorOutcome::RETRY => continue,
                                AuthErrorOutcome::ABORT => return Err(err),
                            }
                        }

                        // If the error is a transport security failure (e.g. an
                        // invalid certificate), handle it here by alerting the
                        // user, but only if the consumer asked us to.
                        XpComEwsError::Http(moz_http::Error::TransportSecurityFailure {
                            status: _,
                            ref transport_security_info,
                        }) if matches!(
                            options.transport_sec_failure_behavior,
                            TransportSecFailureBehavior::Alert
                        ) =>
                        {
                            handle_transport_sec_failure(
                                self.server.clone(),
                                transport_security_info.0.clone(),
                            )?;
                            return Err(err);
                        }

                        // If the error is network-related, optionally alert the
                        // user (depending on which specific error it is) before
                        // propagating it.
                        XpComEwsError::Http(ref http_error) => {
                            maybe_handle_connection_error(http_error.into(), self.server.clone())?;
                            return Err(err);
                        }

                        _ => return Err(err),
                    };
                }
            };

            // If we managed to connect to the server, but the response's HTTP
            // status code is an error (e.g. because the server encountered an
            // internal error, the path is invalid, etc.), we should also raise
            // a connection error. From manual testing, it does not look like
            // throttling results in actual 429 responses (but instead in 200
            // responses with the relevant response message).
            let response = match response.error_from_status() {
                Ok(response) => response,
                Err(err) => {
                    if let moz_http::Error::StatusCode { ref response, .. } = err {
                        log::error!("Request FAILED with status {}: {err}", response.status()?);
                    } else {
                        log::error!("moz_http::Response::error_from_status returned an unexpected error: {err:?}");
                    }

                    maybe_handle_connection_error((&err).into(), self.server.clone())?;
                    return Err(err.into());
                }
            };

            report_connection_success(self.server.clone())?;

            // Don't immediately propagate in case the error represents a
            // throttled request, which we can address with retry.
            let op_result: Result<soap::Envelope<Op::Response>, _> =
                soap::Envelope::from_xml_document(response.body());

            break match op_result {
                Ok(envelope) => {
                    // If the server responded with a version identifier, store
                    // it so we can use it later.
                    if let Some(header) = envelope
                        .headers
                        .into_iter()
                        // Filter out headers we don't care about.
                        .filter_map(|hdr| match hdr {
                            soap::Header::ServerVersionInfo(server_version_info) => {
                                Some(server_version_info)
                            }
                            _ => None,
                        })
                        .next()
                    {
                        self.update_server_version(header)?;
                    }

                    // Check if the first response is a back off message, and
                    // retry if so.
                    if let Some(ResponseClass::Error(ResponseError {
                        message_xml: Some(ews::MessageXml::ServerBusy(server_busy)),
                        ..
                    })) = envelope.body.response_messages().first()
                    {
                        let delay_ms = server_busy.back_off_milliseconds;
                        log::debug!(
                            "{op_name} returned busy message, will retry after {delay_ms} milliseconds"
                        );
                        xpcom_async::sleep(delay_ms).await?;
                        continue;
                    }

                    Ok(envelope.body)
                }
                Err(err) => {
                    // Check first to see if the request has been throttled and
                    // needs to be retried.
                    let backoff_delay_ms = maybe_get_backoff_delay_ms(&err);
                    if let Some(backoff_delay_ms) = backoff_delay_ms {
                        log::debug!(
                            "{op_name} request throttled, will retry after {backoff_delay_ms} milliseconds"
                        );

                        xpcom_async::sleep(backoff_delay_ms).await?;
                        continue;
                    }

                    // If not, propagate the error.
                    Err(err.into())
                }
            };
        }
    }

    /// Send an authenticated EWS operation request with the given body.
    async fn send_authenticated_request(
        &self,
        request_body: &[u8],
        op_name: &str,
    ) -> Result<Response, XpComEwsError> {
        // Fetch the Authorization header value for each request in case of
        // token expiration between requests.
        let credentials = self.credentials.borrow().clone();
        let auth_header_value = match credentials.to_auth_header_value().await {
            Ok(value) => value,
            // The OAuth2 module will return `NS_ERROR_ABORT` if it's failed
            // to get credentials even after prompting the user again. We
            // want to catch this so we can properly process it as an
            // authentication error.
            Err(err) if err == nserror::NS_ERROR_ABORT => {
                return Err(XpComEwsError::Authentication);
            }
            Err(err) => return Err(err.into()),
        };

        // Generate random id for logging purposes.
        let request_id = Uuid::new_v4();
        log::info!("Making operation request {request_id}: {op_name}");

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the request body if requested.
            log::info!("C: {}", String::from_utf8_lossy(request_body));
        }

        let response = self
            .client
            .post(&self.endpoint)?
            .header("Authorization", &auth_header_value)
            .body(request_body, "text/xml; charset=utf-8")
            .send()
            .await?;

        let response_body = response.body();
        let response_status = response.status()?;
        log::info!(
            "Response received for request {request_id} (status {response_status}): {op_name}"
        );

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the response body if requested.
            log::info!("S: {}", String::from_utf8_lossy(response_body));
        }

        // Catch authentication errors quickly so we can react to them
        // appropriately.
        if response_status.0 == 401 {
            Err(XpComEwsError::Authentication)
        } else {
            Ok(response)
        }
    }
}

/// Gets the time to wait before retrying a throttled request, if any.
///
/// When an Exchange server throttles a request, the response will specify a
/// delay which should be observed before the request is retried.
fn maybe_get_backoff_delay_ms(err: &ews::Error) -> Option<u32> {
    if let ews::Error::RequestFault(fault) = err {
        // We successfully sent a request, but it was rejected for some reason.
        // Whatever the reason, retry if we're provided with a backoff delay.
        let message_xml = fault.as_ref().detail.as_ref()?.message_xml.as_ref()?;

        match message_xml {
            ews::MessageXml::ServerBusy(server_busy) => Some(server_busy.back_off_milliseconds),
            _ => None,
        }
    } else {
        None
    }
}

#[derive(Debug, Error)]
pub(crate) enum XpComEwsError {
    #[error("an error occurred in an XPCOM call")]
    XpCom(#[from] nsresult),

    #[error("an error occurred during HTTP transport")]
    Http(#[from] moz_http::Error),

    #[error("an error occurred while (de)serializing EWS traffic")]
    Ews(#[from] ews::Error),

    #[error("an error occurred while (de)serializing JSON")]
    Json(#[from] serde_json::Error),

    #[error("request resulted in an error: {0:?}")]
    ResponseError(#[from] ResponseError),

    #[error("error in processing response")]
    Processing { message: String },

    #[error("missing item or folder ID in response from Exchange")]
    MissingIdInResponse,

    #[error(
        "response contained an unexpected number of response messages: expected {expected}, got {actual}"
    )]
    UnexpectedResponseMessageCount { expected: usize, actual: usize },

    #[error("failed to authenticate")]
    Authentication,
}

impl From<&XpComEwsError> for nsresult {
    fn from(value: &XpComEwsError) -> Self {
        match value {
            XpComEwsError::XpCom(value) => *value,
            XpComEwsError::Http(value) => value.into(),

            _ => nserror::NS_ERROR_UNEXPECTED,
        }
    }
}

impl From<XpComEwsError> for nsresult {
    fn from(value: XpComEwsError) -> Self {
        (&value).into()
    }
}

fn handle_error(
    op_name: &str,
    err: XpComEwsError,
    listener: Option<RefPtr<IEwsFallibleOperationListener>>,
) {
    log::error!("an error occurred when performing operation {op_name}: {err:?}");

    if let Some(listener) = listener {
        match unsafe { listener.OnOperationFailure(err.into()) }.to_result() {
            Ok(_) => {}
            Err(err) => log::error!("the error callback returned a failure ({err})"),
        }
    }
}

/// Look at the response class of a response message, and do nothing, warn or
/// return an error accordingly.
fn process_response_message_class<T>(
    op_name: &str,
    response_class: ResponseClass<T>,
) -> Result<T, XpComEwsError> {
    match response_class {
        ResponseClass::Success(message) => Ok(message),

        ResponseClass::Warning(message) => {
            log::warn!("{op_name} operation encountered unknown warning");
            Ok(message)
        }

        ResponseClass::Error(err) => Err(err.to_owned().into()),
    }
}

/// Verifies that a response message for a GetFolder request is valid for a
/// standard folder.
///
/// Returns the ID of a valid folder for convenience.
fn validate_get_folder_response_message(
    message: &GetFolderResponseMessage,
) -> Result<FolderId, XpComEwsError> {
    if message.folders.inner.len() != 1 {
        return Err(XpComEwsError::Processing {
            message: format!(
                "expected exactly one folder per response message, got {}",
                message.folders.inner.len()
            ),
        });
    }

    // Okay to unwrap as we've verified the length.
    match message.folders.inner.first().unwrap() {
        Folder::Folder { folder_id, .. } => {
            folder_id.clone().ok_or(XpComEwsError::MissingIdInResponse)
        }

        _ => Err(XpComEwsError::Processing {
            message: String::from("expected folder to be of type Folder"),
        }),
    }
}

/// Uses the provided `ItemResponseMessage` to create, populate and commit
/// an `nsIMsgDBHdr` for a newly created message.
fn create_and_populate_header_from_create_response(
    response_message: ItemResponseMessage,
    content: &[u8],
    listener: &SafeEwsMessageCreateListener,
) -> Result<UpdatedMsgDbHeader, XpComEwsError> {
    // If we're saving the message (rather than sending it), we must create a
    // new database entry for it and associate it with the message's EWS ID.
    let items = response_message.items.inner;
    if items.len() != 1 {
        return Err(XpComEwsError::Processing {
            message: String::from("expected only one item in CreateItem response"),
        });
    }

    let item = &items[0];
    let message = item.inner_message();

    let ews_id = &message
        .item_id
        .as_ref()
        .ok_or(XpComEwsError::MissingIdInResponse)?
        .id;

    // Signal that copying the message to the server has succeeded, which will
    // trigger its content to be streamed to the relevant message store.
    let hdr: StaleMsgDbHeader = listener.on_remote_create_successful(ews_id)?;

    // Parse the message and use its headers to populate the `nsIMsgDBHdr`
    // before committing it to the database. We parse the original content
    // rather than use the `Message` from the `CreateItemResponse` because the
    // latter only contains the item's ID, and so is missing the required
    // fields.
    let message = MessageParser::default()
        .parse(content)
        .ok_or(XpComEwsError::Processing {
            message: String::from("failed to parse message"),
        })?;

    let hdr = hdr.populate_from_message_headers(message)?;
    listener.on_hdr_populated(&hdr)?;

    Ok(hdr)
}

fn validate_response_message_count<T>(
    response_messages: &[ResponseClass<T>],
    expected_len: usize,
) -> Result<(), XpComEwsError> {
    if response_messages.len() != expected_len {
        return Err(XpComEwsError::UnexpectedResponseMessageCount {
            expected: expected_len,
            actual: response_messages.len(),
        });
    }

    Ok(())
}

/// For responses where we expect a single message, extract that message. Returns
/// [`XpComEwsError::Processing`] if no messages are available, prints a warning but succesfully
/// returns the first message if more than one message is available.
fn single_response_or_error<T>(responses: Vec<T>) -> Result<T, XpComEwsError> {
    let responses_len = responses.len();
    let Some(message) = responses.into_iter().next() else {
        return Err(XpComEwsError::Processing {
            message: "expected 1 response message, got none".to_string(),
        });
    };
    if responses_len != 1 {
        log::warn!("expected 1 response message, got {responses_len}");
    }
    Ok(message)
}

/// Convert the response into a vector of its message type, or return the first error
/// encountered. Warnings are logged but otherwise considered successes.
fn response_into_messages<OpResponse: OperationResponse>(
    response: OpResponse,
) -> Result<Vec<OpResponse::Message>, ResponseError> {
    response
        .into_response_messages()
        .into_iter()
        .map(|response_class| match response_class {
            ResponseClass::Success(message) => Ok(message),
            ResponseClass::Error(err) => Err(err),
            ResponseClass::Warning(message) => {
                log::warn!("into_messages found a warning!");
                Ok(message)
            }
        })
        .collect()
}
