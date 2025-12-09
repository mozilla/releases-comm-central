/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// Adds an operation to the back of the client's queue.
///
/// This macro takes 4 arguments:
///
/// * An instance of [`XpComEwsClient`] (this can be a reference),
/// * The operation type, e.g. [`CreateItem`],
/// * The operation struct, and
/// * The [`OperationRequestOptions`] to use when sending the request.
///
/// It returns a [`oneshot::Receiver`] which can be `await`ed and resolves to
/// the operation's response.
///
/// Note that since an error can come from both the operation's execution *and*
/// the `Receiver` itself, getting a response involves unwrapping two
/// [`Result`]s.
///
/// The type for the operation response **must** be in scope.
///
/// ```rust
///
/// use ews::{
///     get_item::{GetItem, GetItemResponse},
///     BaseItemId, BaseShape, ItemShape,
/// }
///
/// use crate::client::XpComEwsClient;
/// use crate::error::XpComEwsError;
/// use crate::macros::queue_operation;
///
/// async fn get_items(
///     client: &XpComEwsClient,
///     item_ids: Vec<BaseItemId>,
/// ) -> Result<(), XpComEwsError> {
///     let op = GetItem {
///         item_shape: ItemShape {
///             base_shape: BaseShape::IdOnly,
///             additional_properties: None,
///             include_mime_content: Some(false),
///         },
///         item_ids,
///     };
///
///     let rcv = queue_operation!(client, GetItem, op, Default::default());
///     let response = rcv.await??;
///
///     // ...
///
///     Ok(())
/// }
/// ```
///
/// [`XpComEwsClient`]: crate::client::XpComEwsClient
/// [`CreateItem`]: ews::create_item::CreateItem
/// [`OperationRequestOptions`]: crate::client::OperationRequestOptions
macro_rules! queue_operation {
    ($client:expr, $op_type:ident, $op:expr, $options:expr) => {{
        use crate::operation_queue::QueuedOperation;
        use ews::soap;

        paste::paste! {
            let (snd, rcv) = oneshot::channel::<Result<[<$op_type Response>], XpComEwsError>>();
        }

        let envelope = soap::Envelope {
            headers: vec![soap::Header::RequestServerVersion {
                version: $client.version_handler.get_version(),
            }],
            body: $op,
        };

        let content = envelope.as_xml_document()?;

        let queued_op = QueuedOperation::$op_type {
            content,
            options: $options,
            resp_sender: snd,
        };

        $client.queue.enqueue(queued_op).await?;

        rcv
    }};
}

/// Generates the [`QueuedOperation`] enum, which contains a variant for each
/// supported EWS operation.
///
/// The resulting enum is used to represent an operation in the operation queue.
///
/// The type for the response of each operation **must** be in scope.
///
/// ```rust
/// use ews::{
///     get_item::{GetItem, GetItemResponse},
///     create_item::{CreateItem, CreateItemResponse},
/// }
///
/// use crate::macros::queued_operations;
///
/// queued_operations! {
///     GetItem,
///     CreateItem
///     // ...
/// }
/// ```
///
/// [`QueuedOperation`]: crate::operation_queue::QueuedOperation
macro_rules! queued_operations {
    {
        $($op:ident),*
    } => {
        use std::{env, fmt::Debug};
        use crate::operation_sender::{LOG_NETWORK_PAYLOADS_ENV_VAR, OperationRequestOptions};

        paste::paste! {
            /// An operation queued up to be performed against an EWS server.
            pub(crate) enum QueuedOperation {
                $($op{
                    content: Vec<u8>,
                    options: OperationRequestOptions,
                    resp_sender: oneshot::Sender<Result<[<$op Response>], XpComEwsError>>,
                }),*
            }
        }

        impl QueuedOperation {
            /// Performs the operation through the provided [`OperationSender`],
            /// and sends the response back to the consumer.
            pub async fn perform<ServerT: ServerType + 'static>(self, op_sender: Arc<OperationSender<ServerT>>) {
                match self {
                    $(QueuedOperation::$op{content, options, resp_sender} => {
                        let res = op_sender
                            .make_and_send_request(stringify!($op), &content, &options)
                            .await;

                        match resp_sender.send(res) {
                            Ok(_) => (),
                            Err(err) => log::error!("error communicating the result of a queued request: {err}"),
                        };
                    }),*
                }
            }
        }

        impl Debug for QueuedOperation {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                match self {
                    $(QueuedOperation::$op{content, options, resp_sender} => {
                        // Only include the unredacted content in the debug
                        // output if specifically instructed by the user.
                        let content = if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
                            // All of our request bodies should be valid UTF-8
                            // since that's the content type we advertise to the
                            // server.
                            String::from_utf8_lossy(&content)
                        } else {
                            "<REDACTED>".into()
                        };

                        f.debug_struct(stringify!($op))
                        .field("content", &content)
                        .field("options", options)
                        .field("resp_sender", resp_sender)
                        .finish()
                    }),*
                }
            }
        }
    };
}

pub(crate) use queue_operation;
pub(crate) use queued_operations;
