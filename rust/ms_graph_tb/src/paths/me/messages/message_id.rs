/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the messages property of the microsoft.graph.user entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
pub mod r#move;
pub mod send;
pub mod value;
use crate::odata::{ExpansionList, Selection};
use crate::types::message::{Message, MessageExpand, MessageSelection};
use crate::{Error, Expand, Operation, OperationBody, Select};
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
    format!("{endpoint}/me/messages/{message_id}")
}
#[doc = "Get eventMessage\n\nGet the properties and relationships of the eventMessage object. Apply the `$expand` parameter on the event navigation property to get the associated event in an attendee's calendar. Currently, this operation returns event message bodies in only HTML format.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/eventmessage-get?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<MessageSelection>,
    expansion: ExpansionList<MessageExpand>,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String, message_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                message_id,
            },
            selection: Selection::default(),
            expansion: ExpansionList::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response<'response> = Message<'response>;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut params = Serializer::new(String::new());
        if let Some((select, selection)) = self.selection.pair() {
            params.append_pair(select, &selection);
        }
        if let Some((expand, expansion)) = self.expansion.pair() {
            params.append_pair(expand, &expansion);
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
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .body(vec![])?;
        Ok(request)
    }
}
impl Select for Get {
    type Properties = MessageSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend_selection<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
impl Expand for Get {
    type Properties = MessageExpand;
    fn expand<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.expansion.expand(properties);
    }
    fn extend_expand<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.expansion.extend(properties);
    }
}
#[doc = "Update eventMessage\n\nUpdate the properties of an eventMessage object.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/eventmessage-update?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Patch<'body> {
    template_expressions: TemplateExpressions,
    body: OperationBody<Message<'body>>,
}
impl<'body> Patch<'body> {
    #[must_use]
    pub fn new(endpoint: String, message_id: String, body: OperationBody<Message<'body>>) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                message_id,
            },
            body,
        }
    }
}
impl Operation for Patch<'_> {
    const METHOD: Method = Method::PATCH;
    type Response<'response> = Message<'response>;
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
