/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod change_flag_status;
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

use std::{cell::Cell, collections::VecDeque, fmt::Debug, sync::Arc};

use ews::{
    BaseFolderId, BaseItemId, BaseShape, Folder, FolderId, FolderShape, ItemResponseMessage,
    ItemShape, Operation, OperationResponse, PathToElement, RealItem,
    create_item::CreateItem,
    get_folder::{GetFolder, GetFolderResponseMessage},
    get_item::GetItem,
    response::{ResponseClass, ResponseError},
    soap,
    update_item::{UpdateItem, UpdateItemResponse},
};
use log::info;
use mail_parser::MessageParser;
use mailnews_ui_glue::UserInteractiveServer;
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{SafeEwsMessageCreateListener, StaleMsgDbHeader, UpdatedMsgDbHeader},
};
use url::Url;
use uuid::Uuid;
use xpcom::{RefCounted, RefPtr};

use crate::{
    error::XpComEwsError,
    operation_queue::{OperationQueue, QueuedOperation},
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

/// Shorthand for the most common server type constraints.
pub(crate) trait ServerType:
    AuthenticationProvider + UserInteractiveServer + ObservableServer + RefCounted
{
}
impl<T> ServerType for T where
    T: AuthenticationProvider + UserInteractiveServer + ObservableServer + RefCounted
{
}

/// The result from an EWS operation, containing either the operation's response
/// or an error.
type EwsOperationResult<T> = Result<<T as Operation>::Response, XpComEwsError>;

/// The EWS implementation of the [`QueuedOperation`] trait. It wraps around a
/// type that implements [`ews::Operation`].
pub struct QueuedEwsOperation<Op: Operation> {
    operation_id: Uuid,
    inner: Op,
    sender: Cell<Option<oneshot::Sender<EwsOperationResult<Op>>>>,
    options: OperationRequestOptions,
}

impl<Op: Operation> QueuedEwsOperation<Op> {
    /// Create a new [`QueuedEwsOperation`] and return it, along a channel
    /// [`Receiver`] that will be used to communicate the operation's result to
    /// the consumer.
    ///
    /// [`Receiver`]: oneshot::Receiver
    pub fn new(
        op: Op,
        options: OperationRequestOptions,
    ) -> (Self, oneshot::Receiver<EwsOperationResult<Op>>) {
        let (snd, rcv) = oneshot::channel();

        let operation_id = Uuid::new_v4();
        let op = QueuedEwsOperation {
            operation_id,
            inner: op,
            sender: Cell::new(Some(snd)),
            options,
        };

        (op, rcv)
    }

    /// Return the unique ID associated with this operation.
    ///
    /// In general, this is useful for tracing an operation through application phases.
    pub fn id(&self) -> &Uuid {
        &self.operation_id
    }

    /// Communicates the given [`EwsOperationResult`] to the listener through
    /// the channel that was created by [`QueuedEwsOperation::new`].
    fn send_result(&self, res: EwsOperationResult<Op>) {
        match self.sender.take() {
            Some(sender) => {
                if let Err(err) = sender.send(res) {
                    log::error!("error communicating the result of a queued request: {err}")
                }
            }
            None => log::error!(
                "trying to send result for operation {} on already used oneshot channel",
                <Op as Operation>::NAME
            ),
        }
    }
}

impl<Op, ServerT> QueuedOperation<ServerT> for QueuedEwsOperation<Op>
where
    Op: Operation,
    ServerT: ServerType + 'static,
{
    async fn perform(&self, op_sender: Arc<OperationSender<ServerT>>) {
        let op_name = <Op as Operation>::NAME;
        let version = op_sender.server_version();
        let envelope = soap::Envelope {
            headers: vec![soap::Header::RequestServerVersion { version }],
            body: &self.inner,
        };
        let request_body = match envelope.as_xml_document() {
            Ok(body) => body,
            Err(err) => return self.send_result(Err(err.into())),
        };

        let res = op_sender
            .make_and_send_request(&self.operation_id, op_name, &request_body, &self.options)
            .await;

        self.send_result(res);
    }
}

// `Cell` only implements `Debug` if the inner type also implements `Copy`
// (which isn't the case here), so we need a custom implementation that leaves
// it out of the debug output.
impl<Op: Operation> Debug for QueuedEwsOperation<Op> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("QueuedEwsOperation")
            .field("operation_id", &self.operation_id)
            .field("inner", &self.inner)
            .field("options", &self.options)
            .finish()
    }
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

        // Start the queue with a few runners. We're picking 5 here as an
        // arbitrary number, without a strong reason for it (beyond being higher
        // than 1). In the future, we could maybe move
        // `maximumConnectionsNumber` from `nsIImapIncomingServer` to
        // `nsIMsgIncomingServer` and use its value here.
        let queue = OperationQueue::new(op_sender.clone());
        queue.clone().start(5);

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

    /// `Op` needs a static lifetime, because it needs to be dispatch-able to a
    /// runner at *some* point in the future. In practice, this mainly means the
    /// underlying implementation must have ownership of its own data (or only
    /// borrow long-lived objects).
    pub(crate) async fn enqueue_and_send<Op: Operation + 'static>(
        &self,
        op: Op,
        options: OperationRequestOptions,
    ) -> Result<Op::Response, XpComEwsError> {
        let (queued_op, rcv) = QueuedEwsOperation::new(op, options);

        let operation_id = *queued_op.id();

        info!(
            "Enqueueing operation {operation_id}: type = {}",
            <Op as Operation>::NAME
        );

        self.queue.enqueue(Box::new(queued_op)).await?;
        let result = rcv.await;

        info!(
            "Queued operation {operation_id} completed: type = {}",
            <Op as Operation>::NAME
        );

        result?
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

            let response = self.enqueue_and_send(op, Default::default()).await?;

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
        let response = self
            .enqueue_and_send(
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

        let response = self
            .enqueue_and_send(update_item, Default::default())
            .await?;

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
