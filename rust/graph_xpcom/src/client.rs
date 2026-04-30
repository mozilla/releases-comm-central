/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::Cell, cmp, fmt::Debug, ops::ControlFlow, sync::Arc, time::Duration};

use http::{Method, Request};
use moz_http::{Response, StatusCode};
use ms_graph_tb::{
    Operation,
    batching::{BatchRequest, BatchResponse, GRAPH_BATCH_ENDPOINT},
};
use operation_queue::{OperationQueue, QueuedOperation};
use protocol_shared::{
    ServerType,
    client::ProtocolClient,
    error::ProtocolError,
    operation_sender::{OperationRequestOptions, OperationSender, ResponseProcessor},
};
use url::Url;
use uuid::Uuid;
use xpcom::RefPtr;

use crate::error::XpComGraphError;

mod check_connectivity;
mod create_folder;
mod create_message;
mod get_message;
mod move_folders;
mod move_message;
mod send_message;
mod sync_folder_hierarchy;
mod sync_messages_for_folder;
mod update_folder;

// Graph only supports a single maximum batch size.
// See <https://learn.microsoft.com/en-us/graph/json-batching>
const GRAPH_MAXIMUM_BATCH_SIZE: usize = 20;

/// The minimum amont of time to wait before retrying a request that's being
/// throttled/rate-limited. Set to 30s.
const MIN_BACKOFF: Duration = Duration::from_secs(30);

/// The maximum amont of time to wait before retrying a request that's being
/// throttled/rate-limited. Set to 1h.
const MAX_BACKOFF: Duration = Duration::from_secs(3600);

/// The factor by which to multiply the amount of time to wait between retries
/// for a request that's being throttled/rate-limited.
const EXP_BACKOFF_FACTOR: u32 = 2;

/// A [`ResponseProcessor`] that calculates the amount of time to wait if the
/// request is being rate-limited (as indicated by a 429 status code).
///
/// Graph servers don't seem to include any information regarding the amount of
/// time to wait in 429 responses, so we make the [`OperationSender`] perform
/// [exponential backoff] instead. This backoff starts at [`MIN_BACKOFF`], and
/// is capped at [`MAX_BACKOFF`], increasing each time using the multiplication
/// factor defined in [`EXP_BACKOFF_FACTOR`].
///
/// [exponential backoff]: https://en.wikipedia.org/wiki/Exponential_backoff
struct GraphResponseProcessor {
    next_backoff: Duration,
}

impl GraphResponseProcessor {
    pub fn new() -> GraphResponseProcessor {
        GraphResponseProcessor {
            next_backoff: MIN_BACKOFF,
        }
    }

    /// Calculates the amount of time to wait before performing the next retry.
    ///
    /// This function also ensures the delay doesn't exceed [`MAX_BACKOFF`], and
    /// updates the current [`GraphResponseProcessor`] so the next backoff delay
    /// (if necessary) is correctly calculated.
    fn backoff_delay(&mut self) -> Duration {
        let backoff_delay = self.next_backoff;

        let next_backoff = backoff_delay.saturating_mul(EXP_BACKOFF_FACTOR);
        let next_backoff = cmp::min(next_backoff, MAX_BACKOFF);
        self.next_backoff = next_backoff;

        backoff_delay
    }
}

impl ResponseProcessor for GraphResponseProcessor {
    type ReturnValue = Response;
    type Error = XpComGraphError;

    fn handles_error_status(&self, status: StatusCode) -> bool {
        // The only error for which we have any specific logic is rate-limiting.
        status.0 == 429
    }

    async fn check_response_for_error(
        &mut self,
        name: &str,
        resp: Response,
    ) -> Result<std::ops::ControlFlow<Self::ReturnValue, Duration>, Self::Error> {
        let code = resp.status()?;

        // If we're getting rate-limited, calculate the next backoff delay and
        // instruct the `OperationSender` to wait for that amount of time.
        // Otherwise, check if the response code indicates an error and return
        // the response if not.
        let ret = if let StatusCode(429) = code {
            log::debug!("Rate-limit hit: {name}");
            let backoff_delay = self.backoff_delay();
            ControlFlow::Continue(backoff_delay)
        } else {
            log::debug!("Request is not being rate-limited: {name}");
            resp.error_from_status().map(ControlFlow::Break)?
        };

        Ok(ret)
    }
}

/// The result from a Graph operation, containing either the HTTP response or an
/// error.
type GraphOperationResult = Result<Response, XpComGraphError>;

/// The Graph implementation of the [`QueuedOperation`] trait. It wraps around a
/// [`Request`].
pub struct QueuedGraphOperation<ServerT: ServerType + 'static> {
    operation_id: Uuid,
    request: Request<Vec<u8>>,
    sender: Cell<Option<oneshot::Sender<GraphOperationResult>>>,
    options: OperationRequestOptions,
    op_sender: Arc<OperationSender<ServerT>>,
}

impl<ServerT> QueuedGraphOperation<ServerT>
where
    ServerT: ServerType + 'static,
{
    /// Create a new [`QueuedGraphOperation`] and return it, along a channel
    /// [`Receiver`] that will be used to communicate the operation's result to
    /// the consumer.
    ///
    /// [`Receiver`]: oneshot::Receiver
    pub fn new(
        request: Request<Vec<u8>>,
        options: OperationRequestOptions,
        op_sender: Arc<OperationSender<ServerT>>,
    ) -> (Self, oneshot::Receiver<GraphOperationResult>) {
        let (snd, rcv) = oneshot::channel();

        let operation_id = Uuid::new_v4();
        let op = QueuedGraphOperation {
            operation_id,
            request,
            sender: Cell::new(Some(snd)),
            options,
            op_sender,
        };

        (op, rcv)
    }

    /// The unique ID associated with this operation.
    ///
    /// In general, this is useful for tracing an operation through application phases.
    pub fn id(&self) -> &Uuid {
        &self.operation_id
    }

    /// The name for this operation.
    ///
    /// Generated by concatenating the request's method and URI, e.g. "GET /me".
    pub fn name(&self) -> String {
        format!("{} {}", self.request.method(), self.request.uri())
    }

    /// Communicates the given [`QueuedGraphOperation`] to the listener through
    /// the channel that was created by [`QueuedGraphOperation::new`].
    fn send_result(&self, res: GraphOperationResult) {
        match self.sender.take() {
            Some(sender) => {
                if let Err(err) = sender.send(res) {
                    log::error!("error communicating the result of a queued request: {err}");
                }
            }
            None => log::error!(
                "trying to send result for operation {} on already used oneshot channel",
                self.name()
            ),
        }
    }
}

impl<ServerT> QueuedOperation for QueuedGraphOperation<ServerT>
where
    ServerT: ServerType + 'static,
{
    async fn perform(&self) {
        let resp_processor = GraphResponseProcessor::new();

        let res = self
            .op_sender
            .send_request(
                &self.operation_id,
                &self.name(),
                &self.request,
                &self.options,
                resp_processor,
            )
            .await;

        self.send_result(res);
    }
}

// `Cell` only implements `Debug` if the inner type also implements `Copy`
// (which isn't the case here), so we need a custom implementation that leaves
// it out of the debug output.
impl<ServerT> Debug for QueuedGraphOperation<ServerT>
where
    ServerT: ServerType + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("QueuedEwsOperation")
            .field("operation_id", &self.operation_id)
            .field("request", &self.request)
            .field("options", &self.options)
            .finish()
    }
}

pub(crate) struct XpComGraphClient<ServerT: ServerType + 'static> {
    queue: OperationQueue,
    op_sender: Arc<OperationSender<ServerT>>,
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    pub fn new(
        server: RefPtr<ServerT>,
        base_url: Url,
    ) -> Result<XpComGraphClient<ServerT>, XpComGraphError> {
        let op_sender = OperationSender::new(base_url.clone(), server)?;
        let op_sender = Arc::new(op_sender);

        // Start the queue with a few runners. We're picking 5 here as an
        // arbitrary number, without a strong reason for it (beyond being higher
        // than 1). In the future, we could maybe move
        // `maximumConnectionsNumber` from `nsIImapIncomingServer` to
        // `nsIMsgIncomingServer` and use its value here.
        let queue =
            OperationQueue::new(|fut| moz_task::spawn_local("graph_operation_queue", fut).detach());
        queue.start(5).map_err(ProtocolError::from)?;

        Ok(XpComGraphClient { queue, op_sender })
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

    /// Returns the [`Url`] currently used as the base URL to build request
    /// with.
    pub fn base_url(&self) -> Url {
        self.op_sender.base_url()
    }

    async fn send_request<Op>(
        &self,
        operation: Op,
        options: OperationRequestOptions,
    ) -> Result<Response, XpComGraphError>
    where
        Op: Operation,
    {
        let request = operation.build_request()?;
        self.send_raw_request_with_queue(request, options).await
    }

    async fn send_batch_request_json_response<'a, Op>(
        &self,
        operations: Vec<Op>,
        options: OperationRequestOptions,
    ) -> Result<Vec<Op::Response<'a>>, XpComGraphError>
    where
        Op: Operation,
    {
        let mut results: Vec<Op::Response<'a>> = Vec::new();

        // Consume the vector into a vector of blocks with the correct blocksize.
        let mut iter = operations.into_iter();
        let blocks: Vec<Vec<_>> = std::iter::from_fn(|| {
            let block: Vec<_> = iter.by_ref().take(GRAPH_MAXIMUM_BATCH_SIZE).collect();
            if block.is_empty() { None } else { Some(block) }
        })
        .collect();

        // Send each block.
        for block in blocks {
            let batch_request = BatchRequest::new(block);

            let resource_url = self
                .op_sender
                .base_url()
                .join(GRAPH_BATCH_ENDPOINT)
                .map_err(ProtocolError::from)?;
            let body = serde_json::to_vec(&batch_request).map_err(XpComGraphError::Json)?;

            let request = Request::builder()
                .method(Method::POST)
                .uri(resource_url.as_str())
                .header("Content-Type", "application/json")
                .body(body)
                .map_err(ProtocolError::from)?;

            let batch_response = self.send_raw_request_with_queue(request, options).await?;

            let batch_response: BatchResponse<Op::Response<'a>> =
                BatchResponse::new_from_json_slice(batch_response.body())
                    .map_err(XpComGraphError::Json)?;

            let responses = batch_response
                .responses
                .into_iter()
                .filter(|response| response.status.is_success())
                .map(|response| response.body);

            results.extend(responses);
        }

        Ok(results)
    }

    async fn send_request_json_response<Op>(
        &self,
        operation: Op,
        options: OperationRequestOptions,
    ) -> Result<Op::Response<'_>, XpComGraphError>
    where
        Op: Operation,
    {
        let response = self.send_request(operation, options).await?;
        let mut response_body = response.body();
        if response_body.is_empty() {
            // If the endpoint returns an empty (0 bytes) response, we'll
            // hit a parse error because `serde_json` doesn't know how to
            // handle empty byte slices. In this case, we give it something
            // that parses as the unit type (`()`), since that's the only
            // case in which an empty body would be a valid response.
            response_body = "null".as_bytes();
        }

        let value: Op::Response<'_> =
            serde_json::from_slice(response_body).map_err(XpComGraphError::Json)?;
        Ok(value)
    }

    async fn send_raw_request_with_queue(
        &self,
        request: Request<Vec<u8>>,
        options: OperationRequestOptions,
    ) -> Result<Response, XpComGraphError> {
        let (queued_op, rcv) = QueuedGraphOperation::new(request, options, self.op_sender.clone());

        let operation_id = *queued_op.id();
        let operation_name = queued_op.name();

        log::info!("Enqueueing operation {operation_id}: type = {operation_name}",);

        self.queue
            .enqueue(Box::new(queued_op))
            .await
            .map_err(ProtocolError::from)?;
        let result = rcv.await;

        log::info!("Queued operation {operation_id} completed: type = {operation_name}",);

        result.map_err(ProtocolError::from)?
    }
}

impl<ServerT: ServerType> ProtocolClient for XpComGraphClient<ServerT> {
    fn protocol_identifier(&self) -> String {
        String::from("graph")
    }

    async fn shutdown(self: Arc<XpComGraphClient<ServerT>>) {
        // Tell the queue to stop its workers.
        self.queue.stop().await;

        // Send the shutdown signal to the operation sender so it can start
        // cleaning up.
        self.op_sender.shutdown().await;
    }
}
