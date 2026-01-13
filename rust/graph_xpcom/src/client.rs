/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{paths, types::user, Operation, Select};
use nserror::nsresult;
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    error::ProtocolError,
    safe_xpcom::{uri::SafeUri, SafeUrlListener},
};
use serde::Deserialize;
use url::Url;
use xpcom::{RefCounted, RefPtr};

use crate::error::XpComGraphError;

pub(crate) struct XpComGraphClient<ServerT: AuthenticationProvider + RefCounted + 'static> {
    server: RefPtr<ServerT>,
    endpoint: Url,
}

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub fn new(server: RefPtr<ServerT>, endpoint: Url) -> Self {
        XpComGraphClient { server, endpoint }
    }

    /// Perform a connectivity check by querying the user information endpoint.
    pub async fn check_connectivity(self, listener: SafeUrlListener) -> Result<(), nsresult> {
        let uri = SafeUri::new(self.endpoint.to_string())?;
        log::info!("Start running for URI {}", self.endpoint.to_string());
        listener.on_start_running_url(uri.clone());

        let mut get_me = paths::me::Get::new();
        get_me.select(vec![user::UserSelection::AboutMe]);

        match self
            .send_request::<user::User, paths::me::Get>(get_me)
            .await
        {
            Ok(_) => listener.on_stop_running_url(uri, nserror::NS_OK),
            Err(e) => listener.on_stop_running_url(uri, e.into()),
        };

        Ok(())
    }

    async fn send_request<GraphResponseType, Op>(
        &self,
        operation: Op,
    ) -> Result<GraphResponseType, XpComGraphError>
    where
        GraphResponseType: for<'a> Deserialize<'a>,
        Op: Operation,
    {
        let request = operation.build();

        let credentials = self.server.get_credentials()?;
        let auth_header_value = credentials.to_auth_header_value().await?;

        let client = moz_http::Client::new();

        let mut resource_uri = String::from(self.endpoint.path());
        resource_uri.push('/');
        resource_uri.push_str(request.uri().to_string().as_str());

        let full_uri = self
            .endpoint
            .join(resource_uri.as_str())
            .map_err(|_| XpComGraphError::Uri)?;

        // TODO: Once we support editing, we need to add more ways to build the request here.
        let mut request_builder = client.get(&full_uri)?;

        if let Some(ref hdr_value) = auth_header_value {
            // Only set an `Authorization` header if necessary.
            request_builder = request_builder.header("Authorization", hdr_value);
        }

        let response = request_builder.send().await.map_err(ProtocolError::Http)?;

        let response_body = response.body();
        let response_status = response.status()?;

        if response_status.is_client_error() || response_status.is_server_error() {
            Err(ProtocolError::Http(moz_http::Error::StatusCode {
                status: response_status,
                response,
            })
            .into())
        } else {
            let value: GraphResponseType =
                serde_json::from_slice(response_body).map_err(XpComGraphError::Json)?;
            Ok(value)
        }
    }
}
