/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::env;

use http::Request;
use moz_http::Response;
use url::Url;
use uuid::Uuid;

use crate::error::ProtocolError;

/// An internal wrapper to carry the metadata we use for logging sending a
/// request (and receiving its response) alongside the request itself.
///
/// This mostly exists for convenience, since that data is usually carried
/// around with the request, and this wrapper allows us to consolidate all of
/// this information in one single argument.
pub(crate) struct OperationRequest<'or> {
    pub operation_id: &'or Uuid,
    pub operation_name: &'or str,
    pub request: &'or Request<Vec<u8>>,
}

// The environment variable that controls whether to include request/response
// payloads when logging. We only check for the variable's presence, not any
// specific value.
pub(crate) const LOG_NETWORK_PAYLOADS_ENV_VAR: &str = "THUNDERBIRD_LOG_NETWORK_PAYLOADS";

/// Sends the given request, using the given client, and waits for its response.
///
/// If an `auth_header_value` is provided, it is used to set the value of the
/// `Authorization` header when sending the request.
pub(crate) async fn send_request<'or>(
    client: &moz_http::Client,
    op_request: &OperationRequest<'or>,
    auth_header_value: Option<String>,
) -> Result<Response, ProtocolError> {
    let OperationRequest {
        operation_id,
        operation_name,
        request,
    } = op_request;

    let method = request.method();
    let url = Url::parse(&request.uri().to_string())?;
    let mut request_builder = client.request(method, &url)?;

    log::info!("Making operation request {operation_id}: {operation_name}");

    // Add any header that was set on the original request.
    let headers = request.headers();
    for (name, value) in headers {
        let value = value
            .to_str()
            .map_err(|_| ProtocolError::InvalidHeaderValue(value.clone()))?;

        request_builder = request_builder.header(name.as_str(), value);
    }

    if let Some(ref hdr_value) = auth_header_value {
        // Only set an `Authorization` header if necessary.
        request_builder = request_builder.header("Authorization", hdr_value);
    }

    // Only add a body if not empty.
    let body = request.body();
    if !body.is_empty() {
        // If we have a body, we expect a valid `Content-Type` header to be
        // set as well. Searching through a `http::HeaderMap` (as returned
        // by `request.headers`) is case-insensitive.
        let content_type = headers
            .get("content-type")
            .ok_or(ProtocolError::Processing {
                message: "Missing Content-Type header for request with body".to_string(),
            })?
            .to_str()
            .map_err(|_| ProtocolError::Processing {
                message: "Invalid Content-Type header in request".to_string(),
            })?;

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the request body if requested.
            log::info!("C: {}", String::from_utf8_lossy(body.as_slice()));
        }

        request_builder = request_builder.body(body.as_slice(), content_type);
    }

    let response = request_builder.send().await?;

    let response_body = response.body();
    let response_status = response.status()?;
    log::info!(
        "Response received for request {operation_id} (status {response_status}): {operation_name}"
    );

    if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
        // Also log the response body if requested.
        log::info!("S: {}", String::from_utf8_lossy(response_body));
    }

    Ok(response)
}
