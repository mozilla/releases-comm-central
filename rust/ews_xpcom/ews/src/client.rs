/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::future::Future;

use quick_xml::events::{BytesDecl, Event};
use xml_struct::XmlSerialize;

use crate::{types::soap::request, OperationRequest};

pub trait EwsClient {
    type Error: CustomError;

    /// Makes an HTTP request to an EWS endpoint with the specified body.
    fn make_request(&self, body: &[u8]) -> impl Future<Output = Result<String, Self::Error>>;
}

pub trait CustomError {
    fn make_custom(error: &str) -> Self;
}

pub(crate) fn prepare_request<E>(operation: OperationRequest) -> Result<Vec<u8>, E>
where
    E: CustomError,
{
    let mut writer = quick_xml::writer::Writer::new(Vec::default());

    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("utf-8"), None)))
        .map_err(|_| E::make_custom("Unable to write XML declaration"))?;

    request::Envelope {
        body: request::Body(operation),
    }
    .serialize_as_element(&mut writer, "soap:Envelope")
    .map_err(|_| E::make_custom("Unable to serialize request body"))?;

    Ok(writer.into_inner())
}
