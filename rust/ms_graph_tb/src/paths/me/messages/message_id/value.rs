/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the media for the user entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::{Error, Operation, OperationBody};
use http::method::Method;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
    message_id: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions {
        endpoint,
        message_id,
    } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/me/messages/{message_id}/$value")
}
#[doc = "Get open extension\n\nGet an open extension (openTypeExtension object) identified by name or fully qualified name. The table in the Permissions section lists the resources that support open extensions. The following table lists the three scenarios where you can get an open extension from a supported resource instance.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/opentypeextension-get?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String, message_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                message_id,
            },
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response<'response> = Vec<u8>;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let uri = format_path(&self.template_expressions)
            .parse::<http::uri::Uri>()
            .unwrap();
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .body(vec![])?;
        Ok(request)
    }
}
#[doc = "Update eventMessage\n\nUpdate the properties of an eventMessage object.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/eventmessage-update?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Put {
    template_expressions: TemplateExpressions,
    body: OperationBody<Vec<u8>>,
}
impl Put {
    #[must_use]
    pub fn new(endpoint: String, message_id: String, body: OperationBody<Vec<u8>>) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                message_id,
            },
            body,
        }
    }
}
impl Operation for Put {
    const METHOD: Method = Method::PUT;
    type Response<'response> = ();
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
#[doc = "Delete eventMessage\n\nDelete eventMessage.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/eventmessage-delete?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Delete {
    template_expressions: TemplateExpressions,
}
impl Delete {
    #[must_use]
    pub fn new(endpoint: String, message_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                message_id,
            },
        }
    }
}
impl Operation for Delete {
    const METHOD: Method = Method::DELETE;
    type Response<'response> = ();
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let uri = format_path(&self.template_expressions)
            .parse::<http::uri::Uri>()
            .unwrap();
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .body(vec![])?;
        Ok(request)
    }
}
