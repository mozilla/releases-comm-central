/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::env;

use ms_graph_tb::Operation;
use protocol_shared::{authentication::credentials::AuthenticationProvider, error::ProtocolError};
use url::Url;
use uuid::Uuid;
use xpcom::{RefCounted, RefPtr};

use crate::error::XpComGraphError;

mod check_connectivity;

// The environment variable that controls whether to include request/response
// payloads when logging. We only check for the variable's presence, not any
// specific value.
pub(crate) const LOG_NETWORK_PAYLOADS_ENV_VAR: &str = "THUNDERBIRD_LOG_NETWORK_PAYLOADS";

pub(crate) struct XpComGraphClient<ServerT: AuthenticationProvider + RefCounted + 'static> {
    server: RefPtr<ServerT>,
    endpoint: Url,
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub fn new(server: RefPtr<ServerT>, endpoint: Url) -> Self {
        XpComGraphClient { server, endpoint }
    }

    async fn send_request<Op>(&self, operation: Op) -> Result<Op::Response<'_>, XpComGraphError>
    where
        Op: Operation,
    {
        let request = operation.build();

        let credentials = self.server.get_credentials()?;
        let auth_header_value = credentials.to_auth_header_value().await?;

        let client = moz_http::Client::new();

        let mut resource_uri = self.endpoint.clone();
        resource_uri.set_query(request.uri().query());
        {
            let mut resource_uri_path = resource_uri
                .path_segments_mut()
                .map_err(|_| XpComGraphError::Uri)?;
            request.uri().path().split("/").for_each(|path_segment| {
                resource_uri_path.push(path_segment);
            });
        }

        let resource_uri = resource_uri;

        // Generate random id for logging purposes.
        let request_id = Uuid::new_v4();
        log::info!("Making operation request {request_id}: {resource_uri}");

        let full_uri = self
            .endpoint
            .join(resource_uri.as_str())
            .map_err(|_| XpComGraphError::Uri)?;

        log::info!("Full uri {full_uri}");

        // TODO: Once we support editing, we need to add more ways to build the request here.
        let mut request_builder = client.get(&full_uri)?;

        if let Some(ref hdr_value) = auth_header_value {
            // Only set an `Authorization` header if necessary.
            request_builder = request_builder.header("Authorization", hdr_value);
        }

        let response = request_builder.send().await.map_err(ProtocolError::Http)?;

        let response_body = response.body();
        let response_status = response.status()?;

        log::info!(
            "Response received for request {request_id} (status {response_status}): {resource_uri}"
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
            let value: Op::Response<'_> =
                serde_json::from_slice(response_body).map_err(XpComGraphError::Json)?;
            Ok(value)
        }
    }
}
