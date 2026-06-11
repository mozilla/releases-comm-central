/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::RefCell, ops::ControlFlow, sync::Arc, time::Duration};

use async_lock::Mutex;
use http::Request;
use mailnews_ui_glue::{
    AuthErrorOutcome, handle_auth_failure, handle_transport_sec_failure,
    maybe_handle_connection_error, report_connection_success,
};
use moz_http::{Response, StatusCode};
use operation_queue::line_token::{AcquireOutcome, Line};
use url::Url;
use uuid::Uuid;
use xpcom::{RefCounted, RefPtr};

use crate::{
    ServerType,
    authentication::{credentials::Credentials, ntlm},
    error::ProtocolError,
    observers::UrlPrefObserver,
    operation_sender::send_request::{OperationRequest, send_request},
};

pub mod observable_server;
pub(crate) mod send_request;

/// A [`ResponseProcessor`] processes protocol-specific parts of the response.
///
/// It's in charge of propagating errors located in the response to the
/// [`OperationSender`], as well as letting it know if the request is being
/// throttled.
///
/// A new [`ResponseProcessor`] instance is provided to the [`OperationSender`]
/// for each request, so it can be correctly parameterized on the response type.
pub trait ResponseProcessor {
    /// The success value returned in a [`ControlFlow::Break`] by
    /// [`check_response_for_error`].
    ///
    /// [`check_response_for_error`]:
    ///     ResponseProcessor::check_response_for_error
    type ReturnValue;

    /// The error value returned by [`check_response_for_error`].
    ///
    /// [`check_response_for_error`]:
    ///     ResponseProcessor::check_response_for_error
    type Error: From<ProtocolError>;

    /// Whether the [`ResponseProcessor`] should handle responses with the given
    /// error status code.
    ///
    /// Whenever this function returns `false`, the [`OperationSender`] will
    /// return the error before [`check_response_for_error`] can be called.
    ///
    /// Note that successes (i.e. 2XX responses) will always result in
    /// `check_response_for_error` being called.
    ///
    /// [`check_response_for_error`]:
    ///     ResponseProcessor::check_response_for_error
    fn handles_error_status(&self, status: StatusCode) -> bool;

    /// Checks a raw [`Response`] for errors.
    ///
    /// If the response does not contain any error, the implementation is free
    /// to return the parsed response, the raw [`Response`] itself, or anything
    /// else the consumer requires, wrapped in a [`ControlFlow::Break`].
    ///
    /// If the response indicates requests are being throttled/rate-limited, the
    /// implementation is expected to return [`ControlFlow::Continue`] with the
    /// duration to wait before the request can be retried.
    #[allow(async_fn_in_trait)]
    async fn check_response_for_error(
        &mut self,
        name: &str,
        resp: Response,
    ) -> Result<ControlFlow<Self::ReturnValue, Duration>, Self::Error>;
}

/// Options to to control the behavior of
/// [`OperationSender::make_and_send_request`].
#[derive(Debug, Clone, Copy, Default)]
pub struct OperationRequestOptions {
    /// Behavior to follow when an authentication failure arises.
    pub auth_failure_behavior: AuthFailureBehavior,

    /// Behavior to follow when a transport security failure arises.
    pub transport_sec_failure_behavior: TransportSecFailureBehavior,
}

/// The behavior to follow when an operation request results in an
/// authentication failure.
#[derive(Debug, Clone, Copy, Default)]
pub enum AuthFailureBehavior {
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
pub enum TransportSecFailureBehavior {
    /// Immediately alert the user about the security failure.
    #[default]
    Alert,

    /// Don't alert the user and propagate the failure to the consumer (which
    /// might or might not alert the user).
    Silent,
}

/// The central data structure for performing operations against an Exchange
/// server.
pub struct OperationSender<ServerT: RefCounted + 'static> {
    base_url: Arc<RefCell<Url>>,
    client: moz_http::Client,
    error_handling_line: Line,

    // Our internal reference on the server, which is wrapped into a
    // `Mutex<Option<...>>` so it can be "dropped" when we receive the signal
    // that the client has shut down. See the documentation for the `shutdown()`
    // method for more information.
    //
    // As a result, checking whether the client has shut down (and whether we
    // should be continuing processing requests) can be done by checking whether
    // this field's inner value is `None`.
    server: Mutex<Option<RefPtr<ServerT>>>,
}

impl<ServerT: ServerType + 'static> OperationSender<ServerT> {
    // We expect the `OperationSender` to be wrapped inside an `Arc` to make
    // sure it's properly managed from a memory point of view. `OperationSender`
    // isn't `Sync` or `Send`, so we could use `Rc` instead; however making it
    // thread-safe is something we want to look into in the future, so using
    // `Arc` right now avoids having to selectively replace a bunch of `Rc`s in
    // the future. See https://bugzilla.mozilla.org/show_bug.cgi?id=2030095
    #[allow(clippy::arc_with_non_send_sync)]
    pub fn new(
        base_url: Url,
        server: RefPtr<ServerT>,
    ) -> Result<OperationSender<ServerT>, ProtocolError> {
        // Note: semantically `endpoint` should be wrapped in a `Cell` (not a
        // `RefCell`) since we never borrow, but `Cell` relies on the inner type
        // implementing `Copy` which `Url` doesn't do.
        let base_url = Arc::new(RefCell::new(base_url));

        // Subscribe to changes to the base URL property on the server (named
        // "ews_url" for historical reasons), so we get updated when it changes.
        let observer = UrlPrefObserver::new_observer(base_url.clone())?;
        server.observe_property("ews_url", observer.clone())?;

        Ok(OperationSender {
            base_url,
            server: Mutex::new(Some(server)),
            client: moz_http::Client::new(),
            error_handling_line: Line::new(),
        })
    }

    /// "Shut down" the operation sender, by dropping the reference it holds on
    /// the server.
    ///
    /// The server holds a reference on the client, and the client (through
    /// `OperationSender`) also holds a reference on the server. Thus, this is
    /// necessary so they don't prevent each other from being dropped (and leak
    /// memory).
    pub async fn shutdown(&self) {
        self.server.lock().await.take();
    }

    /// Returns the [`Url`] currently used as the protocol API's base URL.
    ///
    /// Consumers should use this value to build the full URL for outgoing
    /// requests.
    pub fn base_url(&self) -> Url {
        (*self.base_url).clone().into_inner()
    }

    /// Get a reference on the server, if it's available.
    ///
    /// Returns [`ProtocolError::ClientClosed`] if the shutdown signal has been
    /// received and the reference on the server has already been dropped.
    async fn server(&self) -> Result<RefPtr<ServerT>, ProtocolError> {
        self.server
            .lock()
            .await
            .clone()
            .ok_or(ProtocolError::ClientClosed)
    }

    /// Sends the given HTTP [`Request`].
    ///
    /// [`OperationSender`] takes care of authenticating outgoing requests. As
    /// such, any `Authorization` header on the provided `Request` might get
    /// overwritten.
    ///
    /// This function also handles retries as required (e.g. for authentication
    /// failures, or if we're being throttled) if the request fails.
    ///
    /// `operation_id` and `name` are only used for logging purposes.
    pub async fn send_request<ProcT: ResponseProcessor>(
        &self,
        operation_id: &Uuid,
        name: &str,
        request: &Request<Vec<u8>>,
        options: &OperationRequestOptions,
        mut resp_processor: ProcT,
    ) -> Result<ProcT::ReturnValue, ProcT::Error> {
        // Check if we can get a `RefPtr` on the server; if not it means we've
        // received the shutdown signal and we shouldn't proceed with the
        // request (since we drop our reference on the server upon shutdown, to
        // avoid leaking memory).
        let _ = self.server().await?;

        let mut token = None;

        let op_request = OperationRequest {
            operation_id,
            operation_name: name,
            request,
        };

        loop {
            let response = match self.send_http_request(&op_request).await {
                Ok(response) => response,
                Err(err) => {
                    let resp = match self
                        .error_handling_line
                        .try_acquire_token()
                        .await
                        .or_token(token)
                    {
                        AcquireOutcome::Success(new_token) => {
                            token = Some(new_token);
                            let resp = self.handle_early_failure(err, options, &op_request).await?;
                            Some(resp)
                        }
                        AcquireOutcome::Failure(shared) => {
                            log::debug!("early failure: waiting for another runner to handle");
                            token = None;
                            shared.await.map_err(ProtocolError::from)?;
                            None
                        }
                    };

                    if let Some(resp) = resp {
                        // We've managed to acquire the line and to retry our
                        // request, and it has yielded a response, so we can
                        // move on to inspecting it for further errors.
                        resp
                    } else {
                        // We've waited for the line to be freed; that's
                        // happened, so we should be able to retry the request.
                        continue;
                    }
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
                    report_connection_success(self.server().await?).map_err(ProtocolError::from)?;
                    response
                }
                Err(moz_http::Error::StatusCode { status, response })
                    if resp_processor.handles_error_status(status) =>
                {
                    log::error!(
                        "Request {operation_id} FAILED with status {status}, handing over to response processor"
                    );
                    response
                }
                Err(err) => {
                    if let moz_http::Error::StatusCode { ref response, .. } = err {
                        log::error!(
                            "Request {operation_id} FAILED with status {}: {err}",
                            response.status().map_err(ProtocolError::from)?
                        );
                    } else {
                        log::error!(
                            "Request {operation_id}: moz_http::Response::error_from_status returned an unexpected error: {err:?}"
                        );
                    }

                    maybe_handle_connection_error((&err).into(), self.server().await?)
                        .map_err(ProtocolError::from)?;
                    return Err(ProtocolError::from(err).into());
                }
            };

            match resp_processor
                .check_response_for_error(name, response)
                .await?
            {
                ControlFlow::Continue(sleep_delay) => {
                    token = match self
                        .error_handling_line
                        .try_acquire_token()
                        .await
                        .or_token(token)
                    {
                        AcquireOutcome::Success(new_token) => {
                            log::debug!(
                                "Request {operation_id}: rate-limited: waiting for {}ms before next attempt",
                                sleep_delay.as_millis()
                            );

                            xpcom_async_glue::sleep(sleep_delay)
                                .await
                                .map_err(ProtocolError::from)?;
                            Some(new_token)
                        }
                        AcquireOutcome::Failure(shared) => {
                            log::debug!(
                                "Request {operation_id}: rate-limited: waiting for another runner to handle"
                            );
                            shared.await.map_err(ProtocolError::from)?;
                            None
                        }
                    };

                    continue;
                }
                ControlFlow::Break(response) => return Ok(response),
            };
        }
    }

    /// Send the given HTTP request.
    ///
    /// If relevant with the chosen authentication method, an `Authorization`
    /// header is added to the outgoing request. This means consumers shouldn't
    /// concern themselves with adding authentication to the [`Request`] they
    /// provide.
    ///
    /// The `op_name` and `operation_id` parameters are only used for logging.
    async fn send_http_request<'or>(
        &self,
        op_request: &OperationRequest<'or>,
    ) -> Result<Response, ProtocolError> {
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
        let credentials = self.server().await?.get_credentials()?;
        let auth_header_value = credentials.to_auth_header_value().await?;

        let resp = send_request(&self.client, op_request, auth_header_value).await?;

        // Catch authentication errors quickly so we can react to them
        // appropriately.
        if resp.status()?.0 == 401 {
            Err(ProtocolError::Authentication)
        } else {
            Ok(resp)
        }
    }

    /// Handles failures which do not require the response body to be
    /// deserialized, such as authentication, HTTP and TLS issues.
    ///
    /// When the error is recoverable (e.g. an authentication failure), an
    /// attempt to address it is performed (e.g. asking the user for new
    /// credentials) and the request is retried. If the retry is successful, the
    /// resulting [`Response`] is returned.
    ///
    /// If the error isn't recoverable (e.g. the user cancelled from a prompt,
    /// or we cannot recover even with user input), an error result is returned.
    /// If the cancellation originates from the user, the error returned is the
    /// one that was passed as input.
    async fn handle_early_failure<'or>(
        &self,
        err: ProtocolError,
        options: &OperationRequestOptions,
        op_request: &OperationRequest<'or>,
    ) -> Result<Response, ProtocolError> {
        log::warn!("handling early failure: {err}");

        match err {
            // If the error is an authentication failure, try to authenticate
            // again (as far as the operation's configuration allows us to).
            ProtocolError::Authentication => {
                return self
                    .handle_authentication_failure(&options.auth_failure_behavior, op_request)
                    .await;
            }

            // If the error is a transport security failure (e.g. an
            // invalid certificate), handle it here by alerting the
            // user, but only if the consumer asked us to.
            ProtocolError::Http(moz_http::Error::TransportSecurityFailure {
                status: _,
                ref transport_security_info,
            }) if matches!(
                options.transport_sec_failure_behavior,
                TransportSecFailureBehavior::Alert
            ) =>
            {
                handle_transport_sec_failure(
                    self.server().await?,
                    transport_security_info.0.clone(),
                )?;
                Err(err)
            }

            // If the error is network-related, optionally alert the
            // user (depending on which specific error it is) before
            // propagating it.
            ProtocolError::Http(ref http_error) => {
                maybe_handle_connection_error(http_error.into(), self.server().await?)?;
                Err(err)
            }

            _ => Err(err),
        }
    }

    /// Handles an authentication failure from the server.
    ///
    /// This works by attempting to send the request again with the right
    /// credentials. If the request succeeds (meaning we were able to
    /// successfully re-authenticate), this returns the resulting [`Response`].
    /// Otherwise, this errors with [`ProtocolError::Authentication`].
    async fn handle_authentication_failure<'or>(
        &self,
        behavior: &AuthFailureBehavior,
        op_request: &OperationRequest<'or>,
    ) -> Result<Response, ProtocolError> {
        log::debug!("handling authentication failure");

        let credentials = self.server().await?.get_credentials()?;

        if let Credentials::Ntlm { username, password } = &credentials {
            // NTLM is a bit special since it authenticates through additional
            // requests to complete a challenge, and the result of this flow is
            // persisted through a cookie. This means we might be getting a 401
            // response because the cookie expired, or hasn't been set yet (e.g.
            // if we're running the connectivity check), so we should try
            // refreshing it before prompting for a new password. This step
            // should be completely silent, so we run it even if the configured
            // behaviour isn't to re-auth.
            match ntlm::authenticate(username, password, op_request).await {
                Ok(resp) => return Ok(resp),

                // We haven't managed to authenticate with the current
                // credentials, so fall back to asking the user for credentials
                // (if the request's options allow it).
                Err(ProtocolError::Authentication) => (),
                Err(err) => return Err(err),
            }
        }

        // If this is an operation for which we should always silently fail on
        // authentication failure, this is as far as we can go so bail out now.
        // `mailnews_ui_glue::handle_auth_failure` might not always prompt the
        // user to re-auth, but it will in a number of cases.
        if let AuthFailureBehavior::Silent = behavior {
            return Err(ProtocolError::Authentication);
        }

        loop {
            let outcome = handle_auth_failure(self.server().await?)?;

            // Refresh the credentials before potentially retrying, because they
            // might have changed (e.g. if the user entered a new password after
            // being prompted for one), and should we emit more requests using
            // this client, we should be using up to date credentials.
            let credentials = self.server().await?.get_credentials()?;

            match outcome {
                AuthErrorOutcome::RETRY => {
                    log::debug!("retrying auth with new credentials");

                    match credentials.validate(op_request).await {
                        // The credentials work, let's move on.
                        Ok(resp) => return Ok(resp),

                        // The credentials are still invalid, let's prompt the
                        // user for more info.
                        Err(ProtocolError::Authentication) => continue,

                        // `credentials.validate()` has encountered an error
                        // that isn't auth-related, let's stop here.
                        Err(err) => return Err(err),
                    }
                }

                // The user has cancelled from the password prompt, or the
                // selected authentication method does not support retrying at
                // this stage, let's stop here.
                AuthErrorOutcome::ABORT => {
                    log::debug!("aborting attempt to re-authenticate");
                    return Err(ProtocolError::Authentication);
                }
            }
        }
    }
}
