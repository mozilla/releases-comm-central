/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::RefCell, env, ops::ControlFlow, sync::Arc};

use ews::{
    OperationResponse, ResponseClass, response::ResponseError,
    server_version::ExchangeServerVersion, soap,
};
use mailnews_ui_glue::{
    AuthErrorOutcome, handle_auth_failure, handle_transport_sec_failure,
    maybe_handle_connection_error, report_connection_success,
};
use moz_http::Response;
use protocol_shared::{
    authentication::{
        credentials::{AuthValidationOutcome, Credentials},
        ntlm::{self, NTLMAuthOutcome},
    },
    error::ProtocolError,
};
use url::Url;
use uuid::Uuid;
use xpcom::{RefCounted, RefPtr};

use crate::{
    client::ServerType,
    error::XpComEwsError,
    line_token::{AcquireOutcome, Line},
    observers::UrlPrefObserver,
    server_version::ServerVersionHandler,
};

pub(crate) mod observable_server;

// The environment variable that controls whether to include request/response
// payloads when logging. We only check for the variable's presence, not any
// specific value.
pub(crate) const LOG_NETWORK_PAYLOADS_ENV_VAR: &str = "THUNDERBIRD_LOG_NETWORK_PAYLOADS";

/// Options to to control the behavior of
/// [`OperationSender::make_and_send_request`].
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct OperationRequestOptions {
    /// Behavior to follow when an authentication failure arises.
    pub auth_failure_behavior: AuthFailureBehavior,

    /// Behavior to follow when a transport security failure arises.
    pub transport_sec_failure_behavior: TransportSecFailureBehavior,
}

/// The behavior to follow when an operation request results in an
/// authentication failure.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) enum AuthFailureBehavior {
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
pub(crate) enum TransportSecFailureBehavior {
    /// Immediately alert the user about the security failure.
    #[default]
    Alert,

    /// Don't alert the user and propagate the failure to the consumer (which
    /// might or might not alert the user).
    Silent,
}

/// The central data structure for performing operations against an EWS server.
pub(crate) struct OperationSender<ServerT: RefCounted + 'static> {
    endpoint: Arc<RefCell<Url>>,
    server: RefPtr<ServerT>,
    client: moz_http::Client,
    version_handler: Arc<ServerVersionHandler>,
    error_handling_line: Line,
}

impl<ServerT: ServerType + 'static> OperationSender<ServerT> {
    // See the design consideration section from `operation_queue.rs` regarding
    // the use of `Arc`.
    #[allow(clippy::arc_with_non_send_sync)]
    pub fn new(
        endpoint: Url,
        server: RefPtr<ServerT>,
        version_handler: Arc<ServerVersionHandler>,
    ) -> Result<OperationSender<ServerT>, XpComEwsError> {
        // Note: semantically `endpoint` should be wrapped in a `Cell` (not a
        // `RefCell`) since we never borrow, but `Cell` relies on the inner type
        // implementing `Copy` which `Url` doesn't do.
        let endpoint = Arc::new(RefCell::new(endpoint));

        // Subscribe to changes to the EWS URL property on the server, so we get
        // updated when it changes.
        let observer = UrlPrefObserver::new_observer(endpoint.clone())?;
        server.observe_property("ews_url", observer.clone())?;

        Ok(OperationSender {
            endpoint,
            server,
            client: moz_http::Client::new(),
            version_handler,
            error_handling_line: Line::new(),
        })
    }

    pub fn server_version(&self) -> ExchangeServerVersion {
        self.version_handler.get_version()
    }

    /// Returns the [`Url`] currently used as the endpoint to send requests to.
    pub fn url(&self) -> Url {
        (*self.endpoint).clone().into_inner()
    }

    /// Builds and sends an HTTP request for the operation.
    ///
    /// Also handles retries as required (e.g. for authentication failures, or
    /// if we're being throttled) if the request fails.
    pub async fn make_and_send_request<OpResp: OperationResponse>(
        &self,
        name: &str,
        content: &[u8],
        options: &OperationRequestOptions,
    ) -> Result<OpResp, XpComEwsError> {
        let mut token = None;

        loop {
            let response = match self.send_http_request(name, content).await {
                Ok(response) => response,
                Err(err) => {
                    token = match self.error_handling_line.try_acquire_token().or_token(token) {
                        AcquireOutcome::Success(new_token) => {
                            self.handle_early_failure(err, options).await?;
                            Some(new_token)
                        }
                        AcquireOutcome::Failure(shared) => {
                            log::debug!("early failure: waiting for another runner to handle");
                            shared.await?;
                            None
                        }
                    };

                    continue;
                }
            };

            // If we managed to connect to the server, but the response's HTTP
            // status code is an error (e.g. because the server encountered an
            // internal error, the path is invalid, etc.), we should also raise
            // a connection error. From manual testing, it does not look like
            // throttling results in actual 429 responses (but instead in 200
            // responses with the relevant response message).
            let response = match response.error_from_status() {
                Ok(response) => {
                    report_connection_success(self.server.clone())?;
                    response
                }
                Err(moz_http::Error::StatusCode { status, response }) if status.0 == 500 => {
                    log::error!("Request FAILED with status 500, attempting to parse for backoff");
                    response
                }
                Err(err) => {
                    if let moz_http::Error::StatusCode { ref response, .. } = err {
                        log::error!("Request FAILED with status {}: {err}", response.status()?);
                    } else {
                        log::error!(
                            "moz_http::Response::error_from_status returned an unexpected error: {err:?}"
                        );
                    }

                    maybe_handle_connection_error((&err).into(), self.server.clone())?;
                    return Err(err.into());
                }
            };

            match self.check_envelope_for_error(name, &response).await? {
                ControlFlow::Continue(delay_ms) => {
                    token = match self.error_handling_line.try_acquire_token().or_token(token) {
                        AcquireOutcome::Success(new_token) => {
                            xpcom_async::sleep(delay_ms).await?;
                            Some(new_token)
                        }
                        AcquireOutcome::Failure(shared) => {
                            log::debug!(
                                "failure from envelope: waiting for another runner to handle"
                            );
                            shared.await?;
                            None
                        }
                    };

                    continue;
                }
                ControlFlow::Break(resp) => return Ok(resp),
            };
        }
    }

    /// Send an EWS HTTP request with the given body.
    ///
    /// If relevant with the chosen authentication method, an `Authorization`
    /// header is added to the outgoing request.
    ///
    /// The `op_name` parameter is only used for logging.
    async fn send_http_request(
        &self,
        op_name: &str,
        request_body: &[u8],
    ) -> Result<Response, XpComEwsError> {
        // Get a new `Credentials` for the request.
        //
        // We used to reuse the same instance for each operation, but this does
        // not scale well now that we're reusing the same client/sender for
        // every operation (because there are a bunch of places that manage
        // credentials for an account, and they don't all use the same
        // identifiers). Getting a new `Credentials` for each request is the
        // easiest way to ensure we're always using up-to-date credentials, for
        // (hopefully) a minimal overhead (currently, the only difference this
        // currently makes is we now get a new one if an auth failure can be
        // solved by refreshing the cookie).
        //
        // If this ever becomes an issue, we can always either add a
        // `Credentials` instance to each of `QueuedOperation`'s variants, or
        // add one to `OperationSender` with some carefully crafted and
        // configured observers.
        let credentials = self.server.get_credentials()?;
        let auth_header_value = credentials.to_auth_header_value().await?;

        // Generate random id for logging purposes.
        let request_id = Uuid::new_v4();
        log::info!("Making operation request {request_id}: {op_name}");

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the request body if requested.
            log::info!("C: {}", String::from_utf8_lossy(request_body));
        }

        // We want to clone here rather than borrow because we don't want to
        // panic if the value changes (e.g. if the user changed the URL in their
        // settings) while we're borrowing.
        let endpoint = (*self.endpoint).clone().into_inner();
        let mut request_builder = self.client.post(&endpoint)?;

        if let Some(ref hdr_value) = auth_header_value {
            // Only set an `Authorization` header if necessary.
            request_builder = request_builder.header("Authorization", hdr_value);
        }

        let response = request_builder
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
            Err(XpComEwsError::Protocol(ProtocolError::Authentication))
        } else {
            Ok(response)
        }
    }

    /// Handles failures which do not require the response body to be
    /// deserialized, such as authentication, HTTP and TLS issues.
    ///
    /// This method returns `Ok(())` if the failure has been handled and the
    /// request is ready to be retried.
    ///
    /// If the request shouldn't be retried (e.g. if the user cancelled from a
    /// prompt, or if another error came up), an error result is returned. If
    /// the cancellation originates from the user, the error returned is the one
    /// that was passed as input.
    async fn handle_early_failure(
        &self,
        err: XpComEwsError,
        options: &OperationRequestOptions,
    ) -> Result<(), XpComEwsError> {
        log::warn!("handling early failure: {err}");

        match err {
            // If the error is an authentication failure, try to authenticate
            // again (as far as the operation's configuration allows us to).
            XpComEwsError::Protocol(ProtocolError::Authentication) => {
                match self
                    .handle_authentication_failure(&options.auth_failure_behavior)
                    .await?
                {
                    // We should continue with the authentication
                    // attempts, and retry the request with
                    // refreshed credentials.
                    ControlFlow::Continue(_) => Ok(()),

                    // We've been instructed to abort the request
                    // here (either because the user asked us to, or
                    // because the selected authentication method
                    // does not support retrying at this stage).
                    ControlFlow::Break(_) => Err(err),
                }
            }

            // If the error is a transport security failure (e.g. an
            // invalid certificate), handle it here by alerting the
            // user, but only if the consumer asked us to.
            XpComEwsError::Protocol(ProtocolError::Http(
                moz_http::Error::TransportSecurityFailure {
                    status: _,
                    ref transport_security_info,
                },
            )) if matches!(
                options.transport_sec_failure_behavior,
                TransportSecFailureBehavior::Alert
            ) =>
            {
                handle_transport_sec_failure(
                    self.server.clone(),
                    transport_security_info.0.clone(),
                )?;
                Err(err)
            }

            // If the error is network-related, optionally alert the
            // user (depending on which specific error it is) before
            // propagating it.
            XpComEwsError::Protocol(ProtocolError::Http(ref http_error)) => {
                maybe_handle_connection_error(http_error.into(), self.server.clone())?;
                Err(err)
            }

            _ => Err(err),
        }
    }

    /// Handles an authentication failure from the server.
    ///
    /// This method instructs its consumer on whether to retry
    /// ([`ControlFlow::Continue`]) or cancel the request
    /// ([`ControlFlow::Break`]) based on the configured behavior, user input
    /// and the authentication method.
    async fn handle_authentication_failure(
        &self,
        behavior: &AuthFailureBehavior,
    ) -> Result<ControlFlow<()>, XpComEwsError> {
        let credentials = self.server.get_credentials()?;

        if let Credentials::Ntlm {
            username,
            password,
            ews_url,
        } = &credentials
        {
            // NTLM is a bit special since it authenticates through additional
            // requests to complete a challenge, and the result of this flow is
            // persisted through a cookie. This means we might be getting a 401
            // response because the cookie expired, or hasn't been set yet (e.g.
            // if we're running the connectivity check), so we should try
            // refreshing it before prompting for a new password. This step
            // should be completely silent, so we run it even if the configured
            // behaviour isn't to re-auth.
            match ntlm::authenticate(username, password, ews_url).await? {
                NTLMAuthOutcome::Success => return Ok(ControlFlow::Continue(())),
                NTLMAuthOutcome::Failure => (),
            }
        }

        // If this is an operation for which we should always silently fail on
        // authentication failure, this is as far as we can go so bail out now.
        // `mailnews_ui_glue::handle_auth_failure` might not always prompt the
        // user to re-auth, but it will in a number of cases.
        if let AuthFailureBehavior::Silent = behavior {
            return Ok(ControlFlow::Break(()));
        }

        loop {
            let outcome = handle_auth_failure(self.server.clone())?;

            // Refresh the credentials before potentially retrying, because they
            // might have changed (e.g. if the user entered a new password after
            // being prompted for one), and should we emit more requests using
            // this client, we should be using up to date credentials.
            let credentials = self.server.get_credentials()?;

            match outcome {
                AuthErrorOutcome::RETRY => {
                    log::debug!("retrying auth with new credentials");

                    match credentials.validate().await? {
                        // The credentials work, let's move on.
                        AuthValidationOutcome::Valid => break,

                        // The credentials are still invalid, let's prompt the
                        // user for more info.
                        AuthValidationOutcome::Invalid => continue,
                    }
                }

                // The user has cancelled from the password prompt, or the
                // selected authentication method does not support retrying at
                // this stage, let's stop here.
                AuthErrorOutcome::ABORT => {
                    log::debug!("aborting attempt to re-authenticate");
                    return Ok(ControlFlow::Break(()));
                }
            }
        }

        Ok(ControlFlow::Continue(()))
    }

    /// Deserialize the body of a response to see if it contains an error.
    ///
    /// If deserialization failed, the response body is checked for a SOAP fault
    /// describing a throttling error (since some servers might represent those
    /// as such), and the error is propagated if none could be found.
    ///
    /// If successful, this returns a [`ControlFlow`] indicating whether the
    /// request should be retried or if a response can be shared with the
    /// consumer.
    ///
    /// If the request should be retried, the number of milliseconds to wait
    /// before retrying is returned inside the [`ControlFlow::Continue`].
    async fn check_envelope_for_error<OpResp: OperationResponse>(
        &self,
        op_name: &str,
        resp: &Response,
    ) -> Result<ControlFlow<OpResp, u32>, XpComEwsError> {
        let op_result: Result<soap::Envelope<OpResp>, _> =
            soap::Envelope::from_xml_document(resp.body());

        match op_result {
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
                    self.version_handler.update_server_version(header)?;
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
                    return Ok(ControlFlow::Continue(delay_ms));
                }

                Ok(ControlFlow::Break(envelope.body))
            }
            Err(err) => {
                // Check first to see if the request has been throttled and
                // needs to be retried.
                let backoff_delay_ms = maybe_get_backoff_delay_ms(&err);
                if let Some(backoff_delay_ms) = backoff_delay_ms {
                    log::debug!(
                        "{op_name} request throttled, will retry after {backoff_delay_ms} milliseconds"
                    );

                    return Ok(ControlFlow::Continue(backoff_delay_ms));
                }

                // If not, propagate the error.
                Err(err.into())
            }
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
