/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{marker::PhantomData, ops::ControlFlow, sync::Arc, time::Duration};

use ews::{OperationResponse, ResponseClass, response::ResponseError, soap};
use moz_http::{Response, StatusCode};
use protocol_shared::operation_sender::ResponseProcessor;

use crate::{error::XpComEwsError, server_version::ServerVersionHandler};

/// A [`ResponseProcessor`] for an EWS response.
pub(crate) struct EwsResponseProcessor<RespT: OperationResponse> {
    // We need a handle on the version handler to record the server version
    // that's located in the response.
    version_handler: Arc<ServerVersionHandler>,

    // We need to parameterize `EwsResponseProcessor` on the concrete response
    // type to set the `ResponseProcessor::ReturnValue` associated type.
    resp_type: PhantomData<RespT>,
}

impl<RespT: OperationResponse> EwsResponseProcessor<RespT> {
    pub fn new(version_handler: Arc<ServerVersionHandler>) -> EwsResponseProcessor<RespT> {
        EwsResponseProcessor {
            version_handler,
            resp_type: PhantomData,
        }
    }
}

impl<RespT> ResponseProcessor for EwsResponseProcessor<RespT>
where
    RespT: OperationResponse,
{
    type ReturnValue = RespT;
    type Error = XpComEwsError;

    fn handles_error_status(&self, status: StatusCode) -> bool {
        // EWS does not indicate things like rate-limiting in HTTP status codes;
        // it typically responds with a 500 error that we need to parse to
        // figure out why our request is being rejected.
        status.0 == 500
    }

    async fn check_response_for_error(
        &mut self,
        name: &str,
        resp: Response,
    ) -> Result<ControlFlow<Self::ReturnValue, Duration>, Self::Error> {
        let op_result: Result<soap::Envelope<RespT>, _> =
            soap::Envelope::from_xml_document(resp.body());

        match op_result {
            Ok(envelope) => {
                // If the server responded with a version identifier, store
                // it so we can use it later.
                if let Some(header) = envelope
                    .headers
                    .into_iter()
                    // Filter out headers we don't care about.
                    .find_map(|hdr| match hdr {
                        soap::Header::ServerVersionInfo(server_version_info) => {
                            Some(server_version_info)
                        }
                        _ => None,
                    })
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
                    log::debug!("Rate-limit hit (from ResponseMessage): {name}");
                    let delay = Duration::from_millis(server_busy.back_off_milliseconds as u64);
                    return Ok(ControlFlow::Continue(delay));
                }

                log::debug!("Request is not being rate-limited: {name}");
                Ok(ControlFlow::Break(envelope.body))
            }
            Err(err) => {
                // Check first to see if the request has been throttled and
                // needs to be retried.
                let backoff_delay_ms = maybe_get_backoff_delay_ms(&err);
                if let Some(backoff_delay_ms) = backoff_delay_ms {
                    log::debug!("Rate-limit hit (from Fault): {name}");
                    let delay = Duration::from_millis(backoff_delay_ms as u64);
                    return Ok(ControlFlow::Continue(delay));
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
