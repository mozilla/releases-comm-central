/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{env, sync::Arc};

use http::{HeaderMap, HeaderName, HeaderValue, Method};
use moz_http::Response;
use ms_graph_tb::{
    Operation,
    batching::{BatchRequest, BatchResponse, GRAPH_BATCH_ENDPOINT},
};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider, client::ProtocolClient,
    error::ProtocolError,
};
use url::Url;
use uuid::Uuid;
use xpcom::{RefCounted, RefPtr};

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

// The environment variable that controls whether to include request/response
// payloads when logging. We only check for the variable's presence, not any
// specific value.
pub(crate) const LOG_NETWORK_PAYLOADS_ENV_VAR: &str = "THUNDERBIRD_LOG_NETWORK_PAYLOADS";

// Graph only supports a single maximum batch size.
// See <https://learn.microsoft.com/en-us/graph/json-batching>
const GRAPH_MAXIMUM_BATCH_SIZE: usize = 20;

pub(crate) struct XpComGraphClient<ServerT: AuthenticationProvider + RefCounted + 'static> {
    server: RefPtr<ServerT>,
    endpoint: Url,
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub fn new(server: RefPtr<ServerT>, endpoint: Url) -> Self {
        XpComGraphClient { server, endpoint }
    }

    async fn send_request<Op>(&self, operation: Op) -> Result<Response, XpComGraphError>
    where
        Op: Operation,
    {
        let request = operation.build_request()?;
        let resource_url =
            Url::parse(&request.uri().to_string()).map_err(|_| XpComGraphError::Uri)?;
        let method = request.method();
        let headers = request.headers();
        let body = request.body();

        self.send_raw_request(&resource_url, &method, &headers, &body)
            .await
    }

    async fn send_batch_request_json_response<'a, Op>(
        &self,
        operations: Vec<Op>,
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
                .endpoint
                .join(GRAPH_BATCH_ENDPOINT)
                .map_err(|_| XpComGraphError::Uri)?;
            let method = Method::POST;
            let headers = HeaderMap::from_iter([(
                HeaderName::from_static("content-type"),
                HeaderValue::from_static("application/json"),
            )]);
            let body = serde_json::to_vec(&batch_request).map_err(|e| XpComGraphError::Json(e))?;

            let batch_response = self
                .send_raw_request(&resource_url, &method, &headers, &body)
                .await?;

            let batch_response: BatchResponse<Op::Response<'a>> =
                BatchResponse::new_from_json_slice(batch_response.body())
                    .map_err(|e| XpComGraphError::Json(e))?;

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
    ) -> Result<Op::Response<'_>, XpComGraphError>
    where
        Op: Operation,
    {
        let response = self.send_request(operation).await?;
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

    async fn send_raw_request(
        &self,
        resource_url: &Url,
        method: &Method,
        headers: &HeaderMap,
        body: &Vec<u8>,
    ) -> Result<Response, XpComGraphError> {
        let client = moz_http::Client::new();

        let credentials = self.server.get_credentials()?;
        let auth_header_value = credentials.to_auth_header_value().await?;

        // Generate random id for logging purposes.
        let request_id = Uuid::new_v4();
        log::info!("Making operation request {request_id}: {method} {resource_url}");

        let mut request_builder = client.request(method, &resource_url)?;

        if let Some(ref hdr_value) = auth_header_value {
            // Only set an `Authorization` header if necessary.
            request_builder = request_builder.header("Authorization", hdr_value);
        }

        // Only add a body if not empty.
        if !body.is_empty() {
            // If we have a body, we expect a valid `Content-Type` header to be
            // set as well. Searching through a `http::HeaderMap` (as returned
            // by `request.headers`) is case-insensitive.
            let content_type = headers
                .get("content-type")
                .ok_or(XpComGraphError::Processing {
                    message: "Missing Content-Type header for request with body".to_string(),
                })?
                .to_str()
                .map_err(|_| XpComGraphError::Processing {
                    message: "Invalid Content-Type header in request".to_string(),
                })?;

            if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
                // Also log the request body if requested.
                log::info!("C: {}", String::from_utf8_lossy(body.as_slice()));
            }

            request_builder = request_builder.body(body.as_slice(), content_type);
        }

        let response = request_builder.send().await.map_err(ProtocolError::Http)?;

        let response_body = response.body();
        let response_status = response.status()?;

        log::info!(
            "Response received for request {request_id} (status {response_status}): {method} {resource_url}"
        );

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the response body if requested.
            log::info!("S: {}", String::from_utf8_lossy(response_body));
        }

        if response_status.is_client_error() || response_status.is_server_error() {
            Err(ProtocolError::Http(moz_http::Error::StatusCode {
                status: response_status,
                response,
            })
            .into())
        } else {
            Ok(response)
        }
    }
}

impl<ServerT: AuthenticationProvider + RefCounted> ProtocolClient for XpComGraphClient<ServerT> {
    fn protocol_identifier(&self) -> String {
        String::from("graph")
    }

    async fn shutdown(self: Arc<Self>) {}
}
