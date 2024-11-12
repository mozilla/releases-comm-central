/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use quick_xml::{
    events::{BytesDecl, BytesEnd, BytesStart, Event},
    Reader, Writer,
};

use crate::{
    types::sealed, Error, MessageXml, Operation, OperationResponse, ResponseCode, SOAP_NS_URI,
    TYPES_NS_URI,
};

mod de;
use self::de::DeserializeEnvelope;

/// A SOAP envelope containing the body of an EWS operation or response.
///
/// See <https://www.w3.org/TR/2000/NOTE-SOAP-20000508/#_Toc478383494>
#[derive(Clone, Debug)]
pub struct Envelope<B> {
    pub body: B,
}

impl<B> Envelope<B>
where
    B: Operation,
{
    /// Serializes the SOAP envelope as a complete XML document.
    pub fn as_xml_document(&self) -> Result<Vec<u8>, Error> {
        const SOAP_ENVELOPE: &str = "soap:Envelope";
        const SOAP_BODY: &str = "soap:Body";

        let mut writer = {
            let inner: Vec<u8> = Default::default();
            Writer::new(inner)
        };

        // All EWS examples use XML 1.0 with UTF-8, so stick to that for now.
        writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("utf-8"), None)))?;

        // We manually write these elements in order to control the name we
        // write the body with.
        writer.write_event(Event::Start(
            BytesStart::new(SOAP_ENVELOPE)
                .with_attributes([("xmlns:soap", SOAP_NS_URI), ("xmlns:t", TYPES_NS_URI)]),
        ))?;
        writer.write_event(Event::Start(BytesStart::new(SOAP_BODY)))?;

        // Write the operation itself.
        self.body
            .serialize_as_element(&mut writer, <B as sealed::EnvelopeBodyContents>::name())?;

        writer.write_event(Event::End(BytesEnd::new(SOAP_BODY)))?;
        writer.write_event(Event::End(BytesEnd::new(SOAP_ENVELOPE)))?;

        Ok(writer.into_inner())
    }
}

impl<B> Envelope<B>
where
    B: OperationResponse,
{
    /// Populates an [`Envelope`] from raw XML.
    pub fn from_xml_document(document: &[u8]) -> Result<Self, Error> {
        // The body of an envelope can contain a fault, indicating an error with
        // a request. We want to parse that and return it as the `Err` portion
        // of a result. However, Microsoft includes a field in their fault
        // responses called `MessageXml` which is explicitly documented as
        // containing `xs:any`, meaning there is no documented schema for its
        // contents. However, it may contain details relevant for debugging, so
        // we want to capture it. Since we don't know what it contains, we
        // settle for capturing it as XML text, but serde doesn't give us a nice
        // way of doing that, so we perform this step separately.
        let fault = extract_maybe_fault(document)?;
        if let Some(fault) = fault {
            return Err(Error::RequestFault(Box::new(fault)));
        }

        let de = &mut quick_xml::de::Deserializer::from_reader(document);

        // `serde_path_to_error` ensures that we get sufficient information to
        // debug errors in deserialization. serde's default errors only provide
        // the immediate error with no context; this gives us a description of
        // the context within the structure.
        let envelope: DeserializeEnvelope<B> = serde_path_to_error::deserialize(de)?;

        Ok(Envelope {
            body: envelope.body,
        })
    }
}

/// Builds a structured representation of the SOAP fault contained in an
/// [`Envelope`]-containing XML document, if any.
///
/// # Errors
///
/// An error will be returned if the input is not a valid XML document or if the
/// document's encoding is not supported.
fn extract_maybe_fault(document: &[u8]) -> Result<Option<Fault>, Error> {
    let mut reader = ScopedReader::from_bytes(document);

    // Any fault in the response will always be contained within the body of the
    // SOAP envelope.
    let mut envelope_reader = reader
        .maybe_get_subreader_for_element("Envelope")?
        .ok_or_else(|| unexpected_response(document))?;
    let mut body_reader = envelope_reader
        .maybe_get_subreader_for_element("Body")?
        .ok_or_else(|| unexpected_response(document))?;

    let fault_reader = body_reader.maybe_get_subreader_for_element("Fault")?;
    let fault = if let Some(mut reader) = fault_reader {
        let mut fault_code = None;
        let mut fault_string = None;
        let mut fault_actor = None;
        let mut detail = None;

        while let Some((name, subreader)) = reader.maybe_get_next_subreader()? {
            match name.as_slice() {
                b"faultcode" => {
                    fault_code.replace(subreader.to_string()?);
                }

                b"faultstring" => {
                    fault_string.replace(subreader.to_string()?);
                }

                b"faultactor" => {
                    fault_actor.replace(subreader.to_string()?);
                }

                b"detail" => {
                    detail.replace(parse_detail(subreader)?);
                }

                _ => {
                    // Hitting this implies that Microsoft is breaking the SOAP
                    // spec. We don't want to error and lose the other error
                    // information we're looking for, but we should log so we
                    // know it happened.
                    log::warn!(
                        "encountered unexpected element {} in soap:Fault containing body `{}'",
                        subreader.reader.decoder().decode(&name)?,
                        subreader.to_string()?
                    )
                }
            }
        }

        // The SOAP spec requires that `faultcode` and `faultstring` be present.
        // `faultactor` and `detail` are optional.
        let fault_code = fault_code.ok_or_else(|| unexpected_response(document))?;
        let fault_string = fault_string.ok_or_else(|| unexpected_response(document))?;

        Some(Fault {
            fault_code,
            fault_string,
            fault_actor,
            detail,
        })
    } else {
        None
    };

    Ok(fault)
}

/// Deserializes the contents of a `<detail>` element.
fn parse_detail(mut reader: ScopedReader) -> Result<FaultDetail, Error> {
    let mut detail = FaultDetail::default();

    while let Some((name, subreader)) = reader.maybe_get_next_subreader()? {
        match name.as_slice() {
            b"ResponseCode" => {
                detail.response_code.replace(subreader.to_string()?.into());
            }

            b"Message" => {
                detail.message.replace(subreader.to_string()?);
            }

            b"MessageXml" => {
                detail.message_xml.replace(parse_message_xml(subreader)?);
            }

            // Because the EWS documentation does not cover the contents of the
            // `detail` field, we're limited to deserializing the field's we've
            // already encountered. We want to be able to capture any fields we
            // _don't_ know about as well, though.
            _ => {
                // If we've already stored a copy of the full content, we don't
                // need to replace it.
                if detail.content.is_none() {
                    detail.content.replace(reader.to_string()?);
                }
            }
        }
    }

    Ok(detail)
}

/// Deserializes the contents of a `<MessageXml>` element.
fn parse_message_xml(mut reader: ScopedReader) -> Result<MessageXml, Error> {
    let back_off_milliseconds = loop {
        // We can't use the subreader methods here without some adaptation, as
        // we need the `BytesStart` value for reading attributes.
        match reader.reader.read_event()? {
            Event::Start(start) => {
                if start.local_name().as_ref() == b"Value" {
                    let is_back_off = start.attributes().any(|attr_result| match attr_result {
                        Ok(attr) => {
                            attr.key.local_name().as_ref() == b"Name"
                                && attr.value.as_ref() == b"BackOffMilliseconds"
                        }
                        Err(_) => false,
                    });

                    if is_back_off {
                        let text = reader.reader.read_text(start.name())?;
                        if let Ok(value) = text.parse::<usize>() {
                            break Some(value);
                        }
                    }
                }
            }

            Event::Eof => break None,

            _ => continue,
        }
    };

    Ok(MessageXml {
        content: reader.to_string()?,
        back_off_milliseconds,
    })
}

/// Creates an `UnexpectedResponse` error from the provided XML bytes.
fn unexpected_response(document: &[u8]) -> Error {
    Error::UnexpectedResponse(Vec::from(document))
}

/// An XML reader interface for the contents of single nodes.
///
/// The intent of this interface is to provide a convenient means of processing
/// XML documents without deep nesting by guaranteeing that only the contents of
/// a single XML node and its children are processed.
struct ScopedReader<'content> {
    /// An event-based reader interface for low-level processing.
    reader: Reader<&'content [u8]>,

    /// The bytes provided to the reader interface.
    // quick-xml may not retain a reference to the full content provided to it,
    // so we need to maintain our own.
    content: &'content [u8],
}

impl<'content> ScopedReader<'content> {
    /// Creates a new reader from bytes representing a portion of an XML
    /// document.
    fn from_bytes(content: &'content [u8]) -> Self {
        Self {
            reader: Reader::from_reader(content),
            content,
        }
    }

    /// Gets a new reader representing the contents of the next element
    /// contained within the current reader with a matching name, if any.
    ///
    /// The name provided for the element must be the local name, i.e. the name
    /// of the element without any namespace prefix.
    fn maybe_get_subreader_for_element(&mut self, local_name: &str) -> Result<Option<Self>, Error> {
        loop {
            match self.reader.read_event()? {
                Event::Start(start) => {
                    if start.local_name().as_ref() == local_name.as_bytes() {
                        return self.get_subreader_from_start(&start).map(Some);
                    }
                }

                Event::Eof => break,

                _ => continue,
            }
        }

        Ok(None)
    }

    /// Gets a new reader representing the contents of the next element found
    /// within the current reader, if any, as well as the local name of that
    /// element.
    fn maybe_get_next_subreader(&mut self) -> Result<Option<(Vec<u8>, Self)>, Error> {
        loop {
            match self.reader.read_event()? {
                Event::Start(start) => {
                    let reader = self.get_subreader_from_start(&start)?;
                    let local_name = start.local_name();

                    return Ok(Some((local_name.as_ref().to_owned(), reader)));
                }

                Event::Eof => break,

                _ => continue,
            }
        }

        Ok(None)
    }

    /// Gets a new reader representing the contents of the element specified by
    /// the element start event provided.
    fn get_subreader_from_start(&mut self, start: &BytesStart<'content>) -> Result<Self, Error> {
        let span = self.reader.read_to_end(start.name())?;
        let content = &self.content[span];

        // Notably, in doing this, we throw away any encoding information we may
        // have had from the original reader. However, Microsoft _appears_ to
        // send all responses as UTF-8. We'll encounter bigger problems
        // elsewhere if we run into a non-UTF-8 document, most notably that we
        // currently don't enable the `encoding` feature for quick-xml.
        return Ok(Self::from_bytes(content));
    }

    /// Gets a string representation of the contents of the current reader.
    fn to_string(&self) -> Result<String, Error> {
        Ok(self.reader.decoder().decode(self.content)?.into_owned())
    }
}

/// A structured representation of a SOAP fault, indicating an error in an EWS
/// request.
///
/// See <https://www.w3.org/TR/2000/NOTE-SOAP-20000508/#_Toc478383507>
#[derive(Clone, Debug, PartialEq)]
pub struct Fault {
    /// An error code indicating the fault in the original request.
    // While `faultcode` is defined in the SOAP spec as a `QName`, we avoid
    // using `quick_xml::name::QName` as it borrows from the input and does not
    // allow for containing a string representation. We could use the `QName`
    // type to parse the contents of the field and store them in our own type if
    // we found value in this field beyond debug output.
    pub fault_code: String,

    /// A human-readable description of the error.
    pub fault_string: String,

    /// A URI indicating the SOAP actor responsible for the error.
    // This may be unused for EWS.
    pub fault_actor: Option<String>,

    /// Clarifying information about EWS-specific errors.
    pub detail: Option<FaultDetail>,
}

/// EWS-specific details regarding a SOAP fault.
///
/// This element is not documented in the EWS reference.
#[derive(Clone, Debug, Default, PartialEq)]
#[non_exhaustive]
pub struct FaultDetail {
    /// An error code indicating the nature of the issue.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/responsecode>
    // May always be present. We have insufficient information on this at
    // present.
    pub response_code: Option<ResponseCode>,

    /// A human-readable description of the error.
    ///
    /// This element is not documented in the EWS reference.
    // May always be present. We have insufficient information on this at
    // present.
    pub message: Option<String>,

    /// Error-specific information to aid in understanding or responding to the
    /// error.
    pub message_xml: Option<MessageXml>,

    /// A text representation of the XML contained in the `<detail>` element.
    ///
    /// This field will be populated if and only if the element contains XML not
    /// otherwise represented by this struct.
    pub content: Option<String>,
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use crate::{types::sealed::EnvelopeBodyContents, Error, OperationResponse};

    use super::Envelope;

    #[test]
    fn deserialize_envelope_with_content() {
        #[derive(Clone, Debug, Deserialize)]
        struct SomeStruct {
            text: String,

            #[serde(rename = "other_field")]
            _other_field: (),
        }

        impl OperationResponse for SomeStruct {}

        impl EnvelopeBodyContents for SomeStruct {
            fn name() -> &'static str {
                "Foo"
            }
        }

        // This XML is contrived, with a custom structure defined in order to
        // test the generic behavior of the interface.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><foo:Foo><text>testing content</text><other_field/></foo:Foo></s:Body></s:Envelope>"#;

        let actual: Envelope<SomeStruct> =
            Envelope::from_xml_document(xml.as_bytes()).expect("deserialization should succeed");

        assert_eq!(
            actual.body.text,
            String::from("testing content"),
            "text field should match original document"
        );
    }

    #[test]
    fn deserialize_envelope_with_schema_fault() {
        #[derive(Clone, Debug, Deserialize)]
        struct Foo;

        impl OperationResponse for Foo {}

        impl EnvelopeBodyContents for Foo {
            fn name() -> &'static str {
                "Foo"
            }
        }

        // This XML is drawn from testing data for `evolution-ews`.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode xmlns:a="http://schemas.microsoft.com/exchange/services/2006/types">a:ErrorSchemaValidation</faultcode><faultstring xml:lang="en-US">The request failed schema validation: The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.</faultstring><detail><e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorSchemaValidation</e:ResponseCode><e:Message xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">The request failed schema validation.</e:Message><t:MessageXml xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"><t:LineNumber>2</t:LineNumber><t:LinePosition>630</t:LinePosition><t:Violation>The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.</t:Violation></t:MessageXml></detail></s:Fault></s:Body></s:Envelope>"#;

        let err = <Envelope<Foo>>::from_xml_document(xml.as_bytes())
            .expect_err("should return error when body contains fault");

        if let Error::RequestFault(fault) = err {
            assert_eq!(
                fault.fault_code, "a:ErrorSchemaValidation",
                "fault code should match original document"
            );
            assert_eq!(fault.fault_string, "The request failed schema validation: The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.", "fault string should match original document");
            assert!(
                fault.fault_actor.is_none(),
                "fault actor should not be present"
            );

            let detail = fault.detail.expect("fault detail should be present");
            assert_eq!(
                detail.response_code,
                Some("ErrorSchemaValidation".into()),
                "response code should match original document"
            );
            assert_eq!(
                detail.message,
                Some("The request failed schema validation.".to_string()),
                "error message should match original document"
            );

            let message_xml = detail.message_xml.expect("message XML should be present");
            assert_eq!(&message_xml.content, "<t:LineNumber>2</t:LineNumber><t:LinePosition>630</t:LinePosition><t:Violation>The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.</t:Violation>", "message XML content should contain full body of MessageXml tag");
            assert!(
                message_xml.back_off_milliseconds.is_none(),
                "back off milliseconds should not be present"
            );
        } else {
            panic!("error should be request fault");
        }
    }

    #[test]
    fn deserialize_envelope_with_server_busy_fault() {
        #[derive(Clone, Debug, Deserialize)]
        struct Foo;

        impl OperationResponse for Foo {}

        impl EnvelopeBodyContents for Foo {
            fn name() -> &'static str {
                "Foo"
            }
        }

        // This XML is contrived based on what's known of the shape of
        // `ErrorServerBusy` responses. It should be replaced when we have
        // real-life examples.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode xmlns:a="http://schemas.microsoft.com/exchange/services/2006/types">a:ErrorServerBusy</faultcode><faultstring xml:lang="en-US">I made this up because I don't have real testing data. 🙃</faultstring><detail><e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorServerBusy</e:ResponseCode><e:Message xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">Who really knows?</e:Message><t:MessageXml xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"><t:Value Name="BackOffMilliseconds">25</t:Value></t:MessageXml></detail></s:Fault></s:Body></s:Envelope>"#;

        let err = <Envelope<Foo>>::from_xml_document(xml.as_bytes())
            .expect_err("should return error when body contains fault");

        // The testing here isn't as thorough as the invalid schema test due to
        // the contrived nature of the example. We don't want it to break if we
        // can get real-world examples.
        if let Error::RequestFault(fault) = err {
            assert_eq!(
                fault.fault_code, "a:ErrorServerBusy",
                "fault code should match original document"
            );
            assert!(
                fault.fault_actor.is_none(),
                "fault actor should not be present"
            );

            let detail = fault.detail.expect("fault detail should be present");
            assert_eq!(
                detail.response_code,
                Some("ErrorServerBusy".into()),
                "response code should match original document"
            );

            let message_xml = detail.message_xml.expect("message XML should be present");
            assert_eq!(message_xml.back_off_milliseconds, Some(25));
        } else {
            panic!("error should be request fault");
        }
    }
}
