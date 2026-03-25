/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the messages property of the microsoft.graph.mailFolder entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::pagination::Paginated;
use crate::types::message::Message;
use crate::types::message_collection_response::{
    MessageCollectionResponse, MessageCollectionResponseSelection,
};
use crate::{Error, Operation, OperationBody, Select, Selection};
use form_urlencoded::Serializer;
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
    format!("{endpoint}/me/mailFolders/{mail_folder_id}/messages")
}
#[doc = "List messages\n\nGet all the messages in the specified user's mailbox, or those messages in a specified folder in the mailbox.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/mailfolder-list-messages?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<MessageCollectionResponseSelection>,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String, mail_folder_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                mail_folder_id,
            },
            selection: Selection::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response<'response> = Paginated<MessageCollectionResponse<'response>>;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut params = Serializer::new(String::new());
        let (select, selection) = self.selection.pair();
        params.append_pair(select, &selection);
        let params = params.finish();
        let path = format_path(&self.template_expressions);
        let uri = format!("{path}?{params}")
            .parse::<http::uri::Uri>()
            .unwrap();
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .body(vec![])?;
        Ok(request)
    }
}
impl Select for Get {
    type Properties = MessageCollectionResponseSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
#[doc = "Create message in a mailfolder\n\nUse this API to create a new Message in a mailfolder.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/mailfolder-post-messages?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Post<'body> {
    template_expressions: TemplateExpressions,
    body: OperationBody<Message<'body>>,
}
impl<'body> Post<'body> {
    #[must_use]
    pub fn new(
        endpoint: String,
        mail_folder_id: String,
        body: OperationBody<Message<'body>>,
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
