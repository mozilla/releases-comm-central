/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to call the move method.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::odata::Selection;
use crate::types::message::{Message, MessageSelection};
use crate::{Error, Operation, OperationBody, Select};
use form_urlencoded::Serializer;
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
    format!("{endpoint}/me/messages/{message_id}/move")
}
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "PascalCase")]
pub struct PostRequestBody {
    pub destination_id: Option<String>,
}
#[doc = "Invoke action move\n\nMove a message to another folder within the specified user's mailbox. This creates a new copy of the message in the destination folder and removes the original message.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/message-move?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Post {
    template_expressions: TemplateExpressions,
    body: OperationBody<PostRequestBody>,
    selection: Selection<MessageSelection>,
}
impl Post {
    #[must_use]
    pub fn new(endpoint: String, message_id: String, body: OperationBody<PostRequestBody>) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                message_id,
            },
            body,
            selection: Selection::default(),
        }
    }
}
impl Operation for Post {
    const METHOD: Method = Method::POST;
    type Response = Message;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut params = Serializer::new(String::new());
        if let Some((select, selection)) = self.selection.pair() {
            params.append_pair(select, &selection);
        }
        let params = params.finish();
        let path = format_path(&self.template_expressions);
        let uri = if params.is_empty() {
            path.parse::<http::uri::Uri>().unwrap()
        } else {
            format!("{path}?{params}")
                .parse::<http::uri::Uri>()
                .unwrap()
        };
        let (body, content_type) = match self.body {
            OperationBody::JSON(body) => {
                (serde_json::to_vec(&body)?, String::from("application/json"))
            }
            OperationBody::Other { body, content_type } => (body, content_type),
        };
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .header("Content-Type", content_type);
        let request = request.body(body)?;
        Ok(request)
    }
}
impl Select for Post {
    type Properties = MessageSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend_selection<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
