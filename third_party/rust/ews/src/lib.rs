/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use thiserror::Error;

mod types;

pub use types::*;

#[derive(Debug, Error)]
pub enum Error {
    #[error("failed to serialize structure as XML")]
    Serialize(#[from] xml_struct::Error),

    #[error("failed to deserialize structure from XML")]
    Deserialize(#[from] quick_xml::DeError),

    #[error("invalid XML document")]
    InvalidXml(#[from] quick_xml::Error),

    #[error("unexpected response body")]
    UnexpectedResponse(Vec<u8>),

    // The `Fault` is boxed so as to keep the in-memory size of the enum itself
    // relatively low.
    #[error("a fault occurred in the request")]
    RequestFault(Box<soap::Fault>),
}
