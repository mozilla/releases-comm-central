/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to call the move method.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::mail_folder::MailFolder;
use crate::{Operation, OperationBody};
use http::method::Method;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
    mail_folder_id: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions {
        endpoint,
        mail_folder_id,
    } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/me/mailFolders/{mail_folder_id}/move")
}
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct PostRequestBody<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for PostRequestBody<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> PostRequestBody<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    pub fn destination_id(&self) -> Result<&str, Error> {
        let val = self
            .properties
            .0
            .get("DestinationId")
            .ok_or(Error::NotFound)?;
        val.as_str()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))
    }
    #[must_use]
    pub fn set_destination_id(mut self, val: String) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("DestinationId".to_string(), val.into());
        self
    }
}
#[doc = "Invoke action move\n\nMove a mailfolder and its contents to another mailfolder.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/mailfolder-move?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Post<'body> {
    template_expressions: TemplateExpressions,
    body: OperationBody<PostRequestBody<'body>>,
}
impl<'body> Post<'body> {
    #[must_use]
    pub fn new(
        endpoint: String,
        mail_folder_id: String,
        body: OperationBody<PostRequestBody<'body>>,
    ) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                mail_folder_id,
            },
            body,
        }
    }
}
impl Operation for Post<'_> {
    const METHOD: Method = Method::POST;
    type Response<'response> = MailFolder<'response>;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let uri = format_path(&self.template_expressions)
            .parse::<http::uri::Uri>()
            .unwrap();
        let (body, content_type) = match self.body {
            OperationBody::JSON(body) => {
                (serde_json::to_vec(&body)?, String::from("application/json"))
            }
            OperationBody::Other { body, content_type } => (body, content_type),
        };
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .header("Content-Type", content_type)
            .body(body)?;
        Ok(request)
    }
}
