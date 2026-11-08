/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the messages property of the microsoft.graph.mailFolder entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
pub mod delta;
use crate::odata::{ExpansionList, FilterExpression, FilterQuery, Selection};
use crate::pagination::Paginated;
use crate::types::message::{Message, MessageExpand, MessageSelection};
use crate::types::message_collection_response::MessageCollectionResponse;
use crate::{Error, Expand, Filter, Operation, OperationBody, Select};
use form_urlencoded::Serializer;
use http::method::Method;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
    user_id: String,
    mail_folder_id: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions {
        endpoint,
        user_id,
        mail_folder_id,
    } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/users/{user_id}/mailFolders/{mail_folder_id}/messages")
}
#[doc = "Get messages from users\n\nThe collection of messages in the mailFolder."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<MessageSelection>,
    expansion: ExpansionList<MessageExpand>,
    filter: FilterQuery,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String, user_id: String, mail_folder_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                user_id,
                mail_folder_id,
            },
            selection: Selection::default(),
            expansion: ExpansionList::default(),
            filter: FilterQuery::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response = Paginated<MessageCollectionResponse>;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut params = Serializer::new(String::new());
        if let Some((select, selection)) = self.selection.pair() {
            params.append_pair(select, &selection);
        }
        if let Some((expand, expansion)) = self.expansion.pair() {
            params.append_pair(expand, &expansion);
        }
        if let Some((filter, expression)) = self.filter.pair() {
            params.append_pair(filter, &expression);
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
        let request = http::Request::builder().uri(uri).method(Self::METHOD);
        let request = request.body(vec![])?;
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
impl Filter for Get {
    fn filter(&mut self, expression: FilterExpression) {
        self.filter.set(expression);
    }
}
#[doc = "Create new navigation property to messages for users"]
#[derive(Debug)]
pub struct Post {
    template_expressions: TemplateExpressions,
    body: OperationBody<Message>,
    selection: Selection<MessageSelection>,
}
impl Post {
    #[must_use]
    pub fn new(
        endpoint: String,
        user_id: String,
        mail_folder_id: String,
        body: OperationBody<Message>,
    ) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                user_id,
                mail_folder_id,
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
