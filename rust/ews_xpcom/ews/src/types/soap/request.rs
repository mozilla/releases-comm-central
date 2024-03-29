/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use xml_struct::XmlSerialize;

use crate::{
    types::{SOAP_NS_URI, TYPES_NS_URI},
    OperationRequest,
};

#[derive(Debug, XmlSerialize)]
#[xml_struct(ns = ("soap", SOAP_NS_URI), ns = ("t", TYPES_NS_URI))]
pub struct Envelope {
    #[xml_struct(ns_prefix = "soap")]
    pub body: Body,
}

#[derive(Debug, XmlSerialize)]
pub struct Body(pub OperationRequest);
