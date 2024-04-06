/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use quick_xml::{
    events::{BytesDecl, BytesEnd, BytesStart, Event},
    Writer,
};
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{Error, SOAP_NS_URI, TYPES_NS_URI};

/// A SOAP envelope wrapping an EWS operation.
#[derive(Debug)]
pub struct Envelope<B> {
    pub body: B,
}

impl<B> Envelope<B>
where
    B: XmlSerialize,
{
    /// Serializes the SOAP envelope as a complete XML document.
    pub fn as_xml_document(&self) -> Result<Vec<u8>, Error> {
        let mut writer = {
            let inner: Vec<u8> = Default::default();
            Writer::new(inner)
        };

        // All EWS examples use XML 1.0 with UTF-8, so stick to that for now.
        writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("utf-8"), None)))?;

        // To get around having to make `Envelope` itself implement
        // `XmlSerialize`
        writer.write_event(Event::Start(
            BytesStart::new("soap:Envelope")
                .with_attributes([("xmlns:soap", SOAP_NS_URI), ("xmlns:t", TYPES_NS_URI)]),
        ))?;

        self.body.serialize_as_element(&mut writer, "soap:Body")?;

        writer.write_event(Event::End(BytesEnd::new("soap:Envelope")))?;

        Ok(writer.into_inner())
    }
}

impl<B> Envelope<B>
where
    B: for<'de> Deserialize<'de>,
{
    /// Populates an [`Envelope`] from raw XML.
    pub fn from_xml_document(document: &str) -> Result<Self, Error> {
        #[derive(Deserialize)]
        #[serde(rename_all = "PascalCase")]
        struct DummyEnvelope<T> {
            body: DummyBody<T>,
        }

        #[derive(Deserialize)]
        struct DummyBody<T> {
            #[serde(rename = "$value")]
            inner: T,
        }

        let envelope: DummyEnvelope<B> = quick_xml::de::from_str(document)?;

        Ok(Envelope {
            body: envelope.body.inner,
        })
    }
}
