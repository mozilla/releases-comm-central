/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to call the send method.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::{Error, Operation};
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
    format!("{endpoint}/me/messages/{message_id}/send")
}
#[doc = "Invoke action send\n\nSend an existing draft message. The draft message can be a new message draft, reply draft, reply-all draft, or a forward draft. This method saves the message in the Sent Items folder. Alternatively, send a new message in a single operation.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/message-send?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Post {
    template_expressions: TemplateExpressions,
}
impl Post {
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
impl Operation for Post {
    const METHOD: Method = Method::POST;
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
