/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod change_read_status;
mod change_read_status_all;
mod check_connectivity;
pub(crate) mod copy_move_operations;
mod create_folder;
mod create_message;
mod delete_messages;
mod erase_folder;
mod get_message;
mod mark_as_junk;
mod send_message;
mod sync_folder_hierarchy;
mod sync_messages_for_folder;
mod update_folder;

use std::{collections::VecDeque, sync::Arc};

use ews::{
    BaseFolderId, BaseItemId, BaseShape, Folder, FolderId, FolderShape, ItemResponseMessage,
    ItemShape, Operation, OperationResponse, PathToElement, RealItem,
    create_item::{CreateItem, CreateItemResponse},
    get_folder::{GetFolder, GetFolderResponse, GetFolderResponseMessage},
    get_item::{GetItem, GetItemResponse},
    response::{ResponseClass, ResponseCode, ResponseError},
    update_item::{UpdateItem, UpdateItemResponse},
};
use fxhash::FxHashMap;
use mail_parser::MessageParser;
use mailnews_ui_glue::UserInteractiveServer;
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{
        SafeEwsFolderListener, SafeEwsMessageCreateListener, StaleMsgDbHeader, UpdatedMsgDbHeader,
    },
};
use url::Url;
use xpcom::{RefCounted, RefPtr};

use crate::{
    error::XpComEwsError,
    macros::queue_operation,
    operation_queue::OperationQueue,
    operation_sender::{
        OperationRequestOptions, OperationSender, TransportSecFailureBehavior,
        observable_server::ObservableServer,
    },
    server_version::ServerVersionHandler,
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

/// Shorthand for the most common server type constraints.
pub(crate) trait ServerType:
    AuthenticationProvider + UserInteractiveServer + ObservableServer + RefCounted
{
}
impl<T> ServerType for T where
    T: AuthenticationProvider + UserInteractiveServer + ObservableServer + RefCounted
{
}

pub(crate) struct XpComEwsClient<ServerT: ServerType + 'static> {
    version_handler: Arc<ServerVersionHandler>,
    queue: Arc<OperationQueue<ServerT>>,
    op_sender: Arc<OperationSender<ServerT>>,
}

impl<ServerT: ServerType + 'static> XpComEwsClient<ServerT> {
    // See the design consideration section from `operation_queue.rs` regarding
    // the use of `Arc`.
    #[allow(clippy::arc_with_non_send_sync)]
    pub(crate) fn new(
        endpoint: Url,
        server: RefPtr<ServerT>,
    ) -> Result<XpComEwsClient<ServerT>, XpComEwsError> {
        let version_handler = ServerVersionHandler::new(endpoint.clone())?;
        let version_handler = Arc::new(version_handler);

        let op_sender = OperationSender::new(endpoint, server, version_handler.clone())?;
        let op_sender = Arc::new(op_sender);

        let queue = OperationQueue::new(op_sender.clone());
        queue.clone().start(1);

        Ok(XpComEwsClient {
            version_handler,
            queue,
            op_sender,
        })
    }

    /// Shuts the client down by performing the relevant operations on its
    /// fields (e.g. stopping the operation queue).
    pub(crate) fn shutdown(&self) {
        self.queue.stop();
    }

    /// Checks whether the client is still running (i.e. at least one of the
    /// operation queue's runners is still active).
    pub(crate) fn running(&self) -> bool {
        self.queue.running()
    }

    /// Checks whether the client is fully idle, i.e. it's not doing anything
    /// besides waiting for new operations to be triggered.
    pub(crate) fn idle(&self) -> bool {
        self.queue.idle()
    }

    /// Returns the [`Url`] currently used as the endpoint to send requests to.
    pub(crate) fn url(&self) -> Url {
        self.op_sender.url()
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

        let rcv = queue_operation!(self, GetFolder, op, Default::default());
        let response = rcv.await??;

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
        let message = process_response_message_class(GetFolder::NAME, response_class)?;

        // Any error fetching the root folder is fatal, since we can't correctly
        // set the parents of any folders it contains without knowing its ID.
        let root_folder_id = validate_get_folder_response_message(&message)?;
        listener.on_new_root_folder(root_folder_id.id)?;

        // Build the mapping for the remaining folders.
        message_iter
            .filter_map(|(&distinguished_id, response_class)| {
                let message = match process_response_message_class(GetFolder::NAME, response_class)
                {
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

                message.map(|message| {
                    // Validate the message (and propagate any error) if it's
                    // not `None`.
                    match validate_get_folder_response_message(&message) {
                        // Map from EWS folder ID to distinguished ID.
                        Ok(folder_id) => Ok((folder_id.id, distinguished_id)),
                        Err(err) => Err(err),
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
                        folder_id.map(|f| f.id),
                        parent_folder_id.map(|f| f.id),
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
                    } => listener.on_folder_updated(
                        folder_id.map(|f| f.id),
                        parent_folder_id.map(|f| f.id),
                        display_name,
                    )?,
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

            let rcv = queue_operation!(self, GetFolder, op, Default::default());
            let response = rcv.await??;
            let messages = response.into_response_messages();

            let mut fetched = messages
                .into_iter()
                .filter_map(|response_class| {
                    let message = match process_response_message_class(GetFolder::NAME, response_class) {
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
                                        // See https://bugzilla.mozilla.org/show_bug.cgi?id=2009429 .
                                        // Folders without a class do happen, so we still want
                                        // to see those folders even though other clients hide
                                        // certain folders without a class (but not all of them).
                                        Some(Ok(folder))
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

            let rcv = queue_operation!(self, GetItem, op, Default::default());
            let response = rcv.await??;

            for response_message in response.into_response_messages() {
                let message = process_response_message_class(GetItem::NAME, response_message)?;

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

    /// Performs a [`CreateItem` operation] and processes its response.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    async fn make_create_item_request(
        &self,
        create_item: CreateItem,
        transport_sec_failure_behavior: TransportSecFailureBehavior,
    ) -> Result<ItemResponseMessage, XpComEwsError> {
        let rcv = queue_operation!(
            self,
            CreateItem,
            create_item,
            OperationRequestOptions {
                transport_sec_failure_behavior,
                ..Default::default()
            }
        );

        let response = rcv.await??;

        // We have only sent one message, therefore the response should only
        // contain one response message.
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        process_response_message_class(CreateItem::NAME, response_message)
    }

    /// Performs an [`UpdateItem` operation]. The caller must processes the Ok response to check for
    /// any errors.
    ///
    /// [`UpdateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    async fn make_update_item_request(
        &self,
        update_item: UpdateItem,
    ) -> Result<UpdateItemResponse, XpComEwsError> {
        let expected_response_count = update_item.item_changes.len();

        let rcv = queue_operation!(self, UpdateItem, update_item, Default::default());
        let response = rcv.await??;

        // Get all response messages.
        let response_messages = response.response_messages();
        validate_response_message_count(response_messages, expected_response_count)?;

        Ok(response)
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
