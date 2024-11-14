/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

/// A marker trait for EWS operations.
///
/// Types implementing this trait may appear in requests to EWS as the operation
/// to be performed.
///
/// # Usage
///
/// See [`Envelope`] for details.
///
/// [`Envelope`]: crate::soap::Envelope
pub trait Operation: XmlSerialize + sealed::EnvelopeBodyContents + std::fmt::Debug {
    /// The structure returned by EWS in response to requests containing this
    /// operation.
    type Response: OperationResponse;

    /// Gets the name of the operation.
    ///
    /// This is the same as the local part of the name of the XML element used
    /// to represent this option.
    fn name(&self) -> &'static str {
        <Self as sealed::EnvelopeBodyContents>::name()
    }
}

/// A marker trait for EWS operation responses.
///
/// Types implementing this trait may appear in responses from EWS after
/// requesting an operation be performed.
///
/// # Usage
///
/// See [`Envelope`] for details.
///
/// [`Envelope`]: crate::soap::Envelope
pub trait OperationResponse:
    for<'de> Deserialize<'de> + sealed::EnvelopeBodyContents + std::fmt::Debug
{
}

pub(super) mod sealed {
    /// A trait for structures which may appear in the body of a SOAP envelope.
    pub trait EnvelopeBodyContents {
        /// Gets the name of the element enclosing the contents of this
        /// structure when represented in XML.
        fn name() -> &'static str;
    }
}
