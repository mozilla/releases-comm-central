/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use de::EnvelopeContent;
use quick_xml::{
    events::{BytesDecl, BytesEnd, BytesStart, Event},
    Writer,
};
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    response::ResponseCode, types::sealed, types::server_version, Error, MessageXml, Operation,
    OperationResponse, SOAP_NS_URI, TYPES_NS_URI,
};

mod de;
use self::de::DeserializeEnvelope;

use super::server_version::ExchangeServerVersion;

/// An element that can be found in the `soap:Header` section of an request or a
/// response.
///
/// See <https://www.w3.org/TR/2000/NOTE-SOAP-20000508/#_Toc478383497>
//
// Currently, request headers are represented as struct variants and response
// headers are represented as tuple variants. Ideally we should use tuple
// variants everywhere, but, right now, doing so for request headers would
// remove their XML attributes due to
// https://github.com/thunderbird/xml-struct-rs/issues/9
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
#[non_exhaustive]
pub enum Header {
    /// The schema version targeted by the attached request.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/requestserverversion>
    RequestServerVersion {
        #[xml_struct(attribute)]
        #[serde(rename = "@Version")]
        version: ExchangeServerVersion,
    },

    /// The version information of the Exchange Server instance that generated
    /// the attached response.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/serverversioninfo>s
    ServerVersionInfo(server_version::ServerVersionInfo),
}

/// A SOAP envelope containing the body of an EWS operation or response.
///
/// See <https://www.w3.org/TR/2000/NOTE-SOAP-20000508/#_Toc478383494>
#[derive(Clone, Debug)]
pub struct Envelope<B> {
    pub headers: Vec<Header>,
    pub body: B,
}

impl<B> Envelope<B>
where
    B: Operation,
{
    /// Serializes the SOAP envelope as a complete XML document.
    pub fn as_xml_document(&self) -> Result<Vec<u8>, Error> {
        const SOAP_ENVELOPE: &str = "soap:Envelope";
        const SOAP_HEADER: &str = "soap:Header";
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

        // Write the SOAP headers.
        self.headers
            .serialize_as_element(&mut writer, SOAP_HEADER)?;

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
        let de = &mut quick_xml::de::Deserializer::from_reader(document);

        // `serde_path_to_error` ensures that we get sufficient information to
        // debug errors in deserialization. serde's default errors only provide
        // the immediate error with no context; this gives us a description of
        // the context within the structure.
        let envelope: DeserializeEnvelope<B> = serde_path_to_error::deserialize(de)?;

        match envelope.body {
            EnvelopeContent::Body(body) => Ok(Envelope {
                headers: envelope
                    .header
                    .expect("all non-fault responses should have headers")
                    .inner,
                body,
            }),
            EnvelopeContent::Fault(fault) => Err(Error::RequestFault(Box::new(fault))),
        }
    }
}

/// A structured representation of a SOAP fault, indicating an error in an EWS
/// request.
///
/// See <https://www.w3.org/TR/2000/NOTE-SOAP-20000508/#_Toc478383507>
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Fault {
    /// An error code indicating the fault in the original request.
    // While `faultcode` is defined in the SOAP spec as a `QName`, we avoid
    // using `quick_xml::name::QName` as it borrows from the input and does not
    // allow for containing a string representation. We could use the `QName`
    // type to parse the contents of the field and store them in our own type if
    // we found value in this field beyond debug output.
    pub faultcode: String,

    /// A human-readable description of the error.
    pub faultstring: String,

    /// A URI indicating the SOAP actor responsible for the error.
    // This may be unused for EWS.
    pub faultactor: Option<String>,

    /// Clarifying information about EWS-specific errors.
    pub detail: Option<FaultDetail>,
}

/// EWS-specific details regarding a SOAP fault.
///
/// This element is not documented in the EWS reference.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
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
    use ews_proc_macros::operation_response;
    use serde::Deserialize;
    use xml_struct::XmlSerialize;

    use crate::{
        get_folder::{GetFolderResponse, GetFolderResponseMessage},
        response::{ResponseClass, ResponseCode, ResponseError, ResponseMessages},
        sync_folder_items::SyncFolderItemsResponse,
        types::{
            common::message_xml::{
                MessageXmlElement, MessageXmlElements, MessageXmlTagged, MessageXmlValue,
                ServerBusy,
            },
            sealed::EnvelopeBodyContents,
        },
        Error, Folder, FolderId, Folders, MessageXml, OperationResponse,
    };

    use super::Envelope;

    #[test]
    fn deserialize_envelope_with_content() {
        #[derive(Clone, Debug, Deserialize)]
        struct SomeStruct {
            text: String,
            other_field: ResponseMessages<()>,
        }

        impl OperationResponse for SomeStruct {
            type Message = ();
            fn response_messages(&self) -> &[ResponseClass<Self::Message>] {
                &self.other_field.response_messages
            }
            fn into_response_messages(self) -> Vec<ResponseClass<Self::Message>> {
                self.other_field.response_messages
            }
        }

        impl EnvelopeBodyContents for SomeStruct {
            fn name() -> &'static str {
                "Foo"
            }
        }

        // This XML is contrived, with a custom structure defined in order to
        // test the generic behavior of the interface.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Header></s:Header><s:Body><foo:Foo><text>testing content</text><other_field/></foo:Foo></s:Body></s:Envelope>"#;

        let actual: Envelope<SomeStruct> =
            Envelope::from_xml_document(xml.as_bytes()).expect("deserialization should succeed");

        assert_eq!(
            actual.body.text,
            String::from("testing content"),
            "text field should match original document"
        );
    }

    /// A meaningless struct.
    #[derive(Clone, Debug, XmlSerialize)]
    #[operation_response(Bar)]
    // We never construct `Foo` directly, but we rely on the generated
    // `FooResponse` class in the tests below.
    #[allow(dead_code)]
    struct Foo {}

    /// A meaningless struct.
    #[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
    pub struct Bar {}

    #[test]
    fn deserialize_envelope_with_schema_fault() {
        // This test will require significant changes if we add SchemaValidation
        // to the MessageXml enum. Right now, it's testing an "unknown" tagged
        // element variant with multiple elements.

        // This XML is drawn from testing data for `evolution-ews`.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode xmlns:a="http://schemas.microsoft.com/exchange/services/2006/types">a:ErrorSchemaValidation</faultcode><faultstring xml:lang="en-US">The request failed schema validation: The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.</faultstring><detail><e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorSchemaValidation</e:ResponseCode><e:Message xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">The request failed schema validation.</e:Message><t:MessageXml xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"><t:LineNumber>2</t:LineNumber><t:LinePosition>630</t:LinePosition><t:Violation>The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.</t:Violation></t:MessageXml></detail></s:Fault></s:Body></s:Envelope>"#;

        let err = <Envelope<FooResponse>>::from_xml_document(xml.as_bytes())
            .expect_err("should return error when body contains fault");

        if let Error::RequestFault(fault) = err {
            assert_eq!(
                fault.faultcode, "a:ErrorSchemaValidation",
                "fault code should match original document"
            );
            assert_eq!(fault.faultstring, "The request failed schema validation: The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.", "fault string should match original document");
            assert!(
                fault.faultactor.is_none(),
                "fault actor should not be present"
            );

            let detail = fault.detail.expect("fault detail should be present");
            assert_eq!(
                detail.response_code,
                Some(ResponseCode::ErrorSchemaValidation),
                "response code should match original document"
            );
            assert_eq!(
                detail.message,
                Some("The request failed schema validation.".to_string()),
                "error message should match original document"
            );

            let message_xml = detail.message_xml.expect("message XML should be present");

            let MessageXml::Other(elements) = message_xml else {
                panic!("this message XML should only have bare tags")
            };
            let expected = MessageXmlElements {
                elements: vec![
                    MessageXmlElement::MessageXmlTagged(MessageXmlTagged {
                        name: "LineNumber".to_string(),
                        value: "2".to_string()
                    }),
                    MessageXmlElement::MessageXmlTagged(MessageXmlTagged {
                        name: "LinePosition".to_string(),
                        value: "630".to_string()
                    }),
                    MessageXmlElement::MessageXmlTagged(MessageXmlTagged {
                        name: "Violation".to_string(),
                        value: "The 'Id' attribute is invalid - The value 'invalidparentid' is invalid according to its datatype 'http://schemas.microsoft.com/exchange/services/2006/types:DistinguishedFolderIdNameType' - The Enumeration constraint failed.".to_string()
                    })
                ]
            };
            assert_eq!(
                elements, expected,
                "message XML should list all tags in order"
            );
        } else {
            panic!("error should be request fault, got: {err:?}");
        }
    }

    #[test]
    fn deserialize_envelope_with_connection_count_fault() {
        // This test will require significant changes if we add
        // ExceededConnectionCount to the MessageXml enum. Right now, it's
        // testing an "unknown" Value variant with multiple Values.

        // This XML is based on https://github.com/OfficeDev/ews-managed-api/issues/293#issuecomment-1506483638
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode xmlns:a="http://schemas.microsoft.com/exchange/services/2006/types">a:ErrorExceededConnectionCount</faultcode>
      <faultstring xml:lang="en-US">You have exceeded the available concurrent connections for your account.  Try again once your other requests have completed.</faultstring>
      <detail>
        <e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorExceededConnectionCount</e:ResponseCode>
        <e:Message xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">You have exceeded the available concurrent connections for your account.  Try again once your other requests have completed.</e:Message>
        <t:MessageXml xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
          <t:Value Name="Policy">MaxConcurrency</t:Value>
          <t:Value Name="MaxConcurrencyLimit">27</t:Value>
          <t:Value Name="ErrorMessage">This operation exceeds the throttling budget for policy part 'MaxConcurrency', policy value '27',  Budget type: 'Ews'.  Suggested backoff time 0 ms.</t:Value>
        </t:MessageXml>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>"#;

        let err = <Envelope<FooResponse>>::from_xml_document(xml.as_bytes())
            .expect_err("should return error when body contains fault");

        // The testing here isn't as thorough as the invalid schema test due to
        // the contrived nature of the example. We don't want it to break if we
        // can get real-world examples.
        if let Error::RequestFault(fault) = err {
            assert_eq!(
                fault.faultcode, "a:ErrorExceededConnectionCount",
                "fault code should match original document"
            );
            assert!(
                fault.faultactor.is_none(),
                "fault actor should not be present"
            );

            let detail = fault.detail.expect("fault detail should be present");
            assert_eq!(
                detail.response_code,
                Some(ResponseCode::ErrorExceededConnectionCount),
                "response code should match original document"
            );

            let message_xml = detail.message_xml.expect("message XML should be present");

            let MessageXml::Other(elements) = message_xml else {
                panic!("this message XML should only have bare tags")
            };

            let expected = MessageXmlElements {
                elements: vec![
                    MessageXmlElement::MessageXmlValue(MessageXmlValue {
                        name: "Policy".to_string(),
                        value: "MaxConcurrency".to_string()
                    }),
                    MessageXmlElement::MessageXmlValue(MessageXmlValue {
                        name: "MaxConcurrencyLimit".to_string(),
                        value: "27".to_string()
                    }),
                    MessageXmlElement::MessageXmlValue(MessageXmlValue {
                        name: "ErrorMessage".to_string(),
                        value: "This operation exceeds the throttling budget for policy part 'MaxConcurrency', policy value '27',  Budget type: 'Ews'.  Suggested backoff time 0 ms.".to_string()
                    })
                ]
            };
            assert_eq!(
                elements, expected,
                "message XML should list all tags in order"
            );
        } else {
            panic!("error should be request fault, got: {err:?}");
        }
    }

    #[test]
    fn deserialize_envelope_with_server_busy_fault() {
        // This XML is contrived based on what's known of the shape of
        // `ErrorServerBusy` responses. It should be replaced when we have
        // real-life examples.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode xmlns:a="http://schemas.microsoft.com/exchange/services/2006/types">a:ErrorServerBusy</faultcode><faultstring xml:lang="en-US">I made this up because I don't have real testing data. 🙃</faultstring><detail><e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorServerBusy</e:ResponseCode><e:Message xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">Who really knows?</e:Message><t:MessageXml xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"><t:Value Name="BackOffMilliseconds">25</t:Value></t:MessageXml></detail></s:Fault></s:Body></s:Envelope>"#;

        let err = <Envelope<FooResponse>>::from_xml_document(xml.as_bytes())
            .expect_err("should return error when body contains fault");

        // The testing here isn't as thorough as the invalid schema test due to
        // the contrived nature of the example. We don't want it to break if we
        // can get real-world examples.
        if let Error::RequestFault(fault) = err {
            assert_eq!(
                fault.faultcode, "a:ErrorServerBusy",
                "fault code should match original document"
            );
            assert!(
                fault.faultactor.is_none(),
                "fault actor should not be present"
            );

            let detail = fault.detail.expect("fault detail should be present");
            assert_eq!(
                detail.response_code,
                Some(ResponseCode::ErrorServerBusy),
                "response code should match original document"
            );

            let message_xml = detail.message_xml.expect("message XML should be present");

            assert_eq!(
                message_xml,
                MessageXml::ServerBusy(ServerBusy {
                    back_off_milliseconds: 25
                })
            );
        } else {
            panic!("error should be request fault, got: {err:?}");
        }
    }

    #[test]
    fn deserialize_envelope_with_server_busy_error() {
        // Similar to the above, except instead of a fault, the server
        // busy message is sent in the body of a response as an error.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
                     <s:Envelope
                         xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
                         <s:Header>
                             <h:ServerVersionInfo MajorVersion="15" MinorVersion="20" MajorBuildNumber="8769" MinorBuildNumber="35" Version="V2018_01_08"
                                                  xmlns:h="http://schemas.microsoft.com/exchange/services/2006/types"
                                                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                                                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                         </s:Header>
                         <s:Body>
                             <m:SyncFolderItemsResponse
                                 xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                                 xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
                                 <m:ResponseMessages>
                                     <m:SyncFolderItemsResponseMessage ResponseClass="Error">
                                         <m:MessageText>The server cannot service this request right now. Try again later., This operation exceeds the throttling budget for policy part 'ConcurrentSyncCalls', policy value '5',  Budget type: 'Ews'.  Suggested backoff time 5000 ms.</m:MessageText>
                                         <m:ResponseCode>ErrorServerBusy</m:ResponseCode>
                                         <m:DescriptiveLinkKey>0</m:DescriptiveLinkKey>
                                         <m:MessageXml>
                                             <t:Value Name="BackOffMilliseconds">5000</t:Value>
                                         </m:MessageXml>
                                         <m:SyncState/>
                                         <m:IncludesLastItemInRange>true</m:IncludesLastItemInRange>
                                     </m:SyncFolderItemsResponseMessage>
                                 </m:ResponseMessages>
                             </m:SyncFolderItemsResponse>
                         </s:Body>
                     </s:Envelope>"#;

        let expected_resp = SyncFolderItemsResponse {
            response_messages: ResponseMessages { response_messages: vec![
                ResponseClass::Error(ResponseError {
                    message_text: "The server cannot service this request right now. Try again later., This operation exceeds the throttling budget for policy part 'ConcurrentSyncCalls', policy value '5',  Budget type: 'Ews'.  Suggested backoff time 5000 ms.".to_string(),
                    response_code: ResponseCode::ErrorServerBusy,
                    message_xml: Some(MessageXml::ServerBusy(ServerBusy { back_off_milliseconds: 5000 }))
                })
            ] }
        };

        let envelope: Envelope<SyncFolderItemsResponse> =
            Envelope::from_xml_document(xml.as_bytes()).expect("deserialization should succeed");
        assert_eq!(envelope.body, expected_resp);
    }

    /// Test that deserializing succeeds when the SOAP body includes attributes.
    /// Serde considers attributes to be the same as nested elements, so our
    /// deserialization code for SOAP bodies needs to explicitly ignore them.
    #[test]
    fn deserialize_envelope_with_attributes_in_body() {
        // This XML comes from a real life request against one of our test
        // accounts, using an Exchange Server 2016 instance.
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
                     <s:Envelope
                         xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
                         <s:Header>
                             <h:ServerVersionInfo MajorVersion="15" MinorVersion="1" MajorBuildNumber="2507" MinorBuildNumber="57" Version="V2017_07_11"
                                 xmlns:h="http://schemas.microsoft.com/exchange/services/2006/types"
                                 xmlns="http://schemas.microsoft.com/exchange/services/2006/types"
                                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                             </s:Header>
                             <s:Body
                                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                                 <m:GetFolderResponse
                                     xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                                     xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
                                     <m:ResponseMessages>
                                         <m:GetFolderResponseMessage ResponseClass="Success">
                                             <m:ResponseCode>NoError</m:ResponseCode>
                                             <m:Folders>
                                                 <t:Folder>
                                                     <t:FolderId Id="AQMkADRiZGNhMWIxLWIwOGMtNDQAZjktODk3OS0zZWIxODJjNmI4NWYALgAAA8ZmIFRjoG9PpiagjztHaIcBAFSUeaisgPtKo3c6hV+VzpcAAAIBCAAAAA==" ChangeKey="AQAAABYAAABUlHmorID7SqN3OoVflc6XAAAAAACW"/>
                                                 </t:Folder>
                                             </m:Folders>
                                         </m:GetFolderResponseMessage>
                                     </m:ResponseMessages>
                                 </m:GetFolderResponse>
                             </s:Body>
                         </s:Envelope>"#;

        let expected_resp = GetFolderResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Success(GetFolderResponseMessage {
                    folders: Folders { inner: vec![
                        Folder::Folder {
                            folder_id: Some(FolderId {
                                id: "AQMkADRiZGNhMWIxLWIwOGMtNDQAZjktODk3OS0zZWIxODJjNmI4NWYALgAAA8ZmIFRjoG9PpiagjztHaIcBAFSUeaisgPtKo3c6hV+VzpcAAAIBCAAAAA==".to_owned(),
                                change_key: Some("AQAAABYAAABUlHmorID7SqN3OoVflc6XAAAAAACW".to_owned())
                            }),
                            parent_folder_id: None,
                            folder_class: None,
                            display_name: None,
                            total_count: None,
                            child_folder_count: None,
                            extended_property: None,
                            unread_count: None
                        }
                    ]},
                })],
            },
        };

        // Check that the XML is successfully deserialized in the first place,
        // with no error caused by the presence of attributes in the `s:Body`
        // element.
        let envelope: Envelope<GetFolderResponse> =
            Envelope::from_xml_document(xml.as_bytes()).expect("deserialization should succeed");

        // Check that the parsed body is in line with what we expect.
        assert_eq!(envelope.body, expected_resp);
    }

    #[test]
    fn deserialize_envelope_with_warning() {
        // This is a fake envelope, because the only warnings known are for types we don't support
        // yet (this one is based on `ResolveNamesResponseMessage` and the XML from
        // deserialize_envelope_with_attributes_in_body above). It's also currently subject to the
        // problems with our Warning variant of ResponseClass (namely, that it can't convey the
        // error fields).
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
                     <s:Envelope
                         xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
                         <s:Header>
                             <h:ServerVersionInfo MajorVersion="15" MinorVersion="1" MajorBuildNumber="2507" MinorBuildNumber="57" Version="V2017_07_11"
                                 xmlns:h="http://schemas.microsoft.com/exchange/services/2006/types"
                                 xmlns="http://schemas.microsoft.com/exchange/services/2006/types"
                                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                             </s:Header>
                             <s:Body
                                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                                 <m:GetFolderResponse
                                     xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                                     xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
                                     <m:ResponseMessages>
                                         <m:GetFolderResponseMessage ResponseClass="Warning">
                                           <m:MessageText>Multiple results were found.</m:MessageText>
                                           <m:ResponseCode>ErrorNameResolutionMultipleResults</m:ResponseCode>
                                           <m:DescriptiveLinkKey>0</m:DescriptiveLinkKey>
                                           <m:Folders>
                                               <t:Folder>
                                                   <t:FolderId Id="AQMkADRiZGNhMWIxLWIwOGMtNDQAZjktODk3OS0zZWIxODJjNmI4NWYALgAAA8ZmIFRjoG9PpiagjztHaIcBAFSUeaisgPtKo3c6hV+VzpcAAAIBCAAAAA==" ChangeKey="AQAAABYAAABUlHmorID7SqN3OoVflc6XAAAAAACW"/>
                                               </t:Folder>
                                           </m:Folders>
                                        </m:GetFolderResponseMessage>
                                     </m:ResponseMessages>
                                 </m:GetFolderResponse>
                             </s:Body>
                         </s:Envelope>"#;

        let expected_resp = GetFolderResponse {
            response_messages: ResponseMessages {
                response_messages: vec![ResponseClass::Warning(GetFolderResponseMessage {
                    folders: Folders { inner: vec![
                        Folder::Folder {
                            folder_id: Some(FolderId {
                                id: "AQMkADRiZGNhMWIxLWIwOGMtNDQAZjktODk3OS0zZWIxODJjNmI4NWYALgAAA8ZmIFRjoG9PpiagjztHaIcBAFSUeaisgPtKo3c6hV+VzpcAAAIBCAAAAA==".to_owned(),
                                change_key: Some("AQAAABYAAABUlHmorID7SqN3OoVflc6XAAAAAACW".to_owned())
                            }),
                            parent_folder_id: None,
                            folder_class: None,
                            display_name: None,
                            total_count: None,
                            child_folder_count: None,
                            extended_property: None,
                            unread_count: None
                        }
                    ]},
                })],
            },
        };

        // Check that the XML is successfully deserialized in the first place,
        // with no error caused by use of the Warning variant.
        let envelope: Envelope<GetFolderResponse> =
            Envelope::from_xml_document(xml.as_bytes()).expect("deserialization should succeed");

        // Check that the parsed body is in line with what we expect.
        assert_eq!(envelope.body, expected_resp);
    }
}
