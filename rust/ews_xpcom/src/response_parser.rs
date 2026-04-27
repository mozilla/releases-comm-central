/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{ops::ControlFlow, sync::Arc};

use ews::{OperationResponse, ResponseClass, response::ResponseError, soap};
use moz_http::Response;

use crate::{
    error::XpComEwsError, operation_sender::ResponseProcessor, server_version::ServerVersionHandler,
};

/// A [`ResponseProcessor`] for an EWS response.
pub(crate) struct EwsResponseProcessor {
    // We need a handle on the version handler to record the server version
    // that's located in the response.
    version_handler: Arc<ServerVersionHandler>,
}

impl EwsResponseProcessor {
    pub fn new(version_handler: Arc<ServerVersionHandler>) -> EwsResponseProcessor {
        EwsResponseProcessor { version_handler }
    }
}

impl<RespT> ResponseProcessor<RespT> for EwsResponseProcessor
where
    RespT: OperationResponse,
{
    async fn check_response_for_error(
        &self,
        name: &str,
        resp: Response,
    ) -> Result<ControlFlow<RespT, u32>, XpComEwsError> {
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
                    let delay_ms = server_busy.back_off_milliseconds;
                    log::debug!(
                        "{name} returned busy message, will retry after {delay_ms} milliseconds"
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
                        "{name} request throttled, will retry after {backoff_delay_ms} milliseconds"
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
