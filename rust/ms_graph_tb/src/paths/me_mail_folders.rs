/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the mailFolders property of the microsoft.graph.user entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::pagination::Paginated;
use crate::types::mail_folder::MailFolder;
use crate::types::mail_folder_collection_response::{
    MailFolderCollectionResponse, MailFolderCollectionResponseSelection,
};
use crate::{Error, Operation, OperationBody, Select, Selection};
use form_urlencoded::Serializer;
use http::method::Method;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions { endpoint } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/me/mailFolders")
}
#[doc = "List mailFolders\n\nGet the mail folder collection directly under the root folder of the signed-in user. The returned collection includes any mail search folders directly under the root. By default, this operation does not return hidden folders. Use a query parameter includeHiddenFolders to include them in the response. This operation does not return all mail folders in a mailbox, only the child folders of the root folder. To return all mail folders in a mailbox, each child folder must be traversed separately.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/user-list-mailfolders?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<MailFolderCollectionResponseSelection>,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String) -> Self {
        Self {
            template_expressions: TemplateExpressions { endpoint },
            selection: Selection::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response<'response> = Paginated<MailFolderCollectionResponse<'response>>;
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
    type Properties = MailFolderCollectionResponseSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
#[doc = "Create MailFolder\n\nUse this API to create a new mail folder in the root folder of the user's mailbox. If you intend a new folder to be hidden, you must set the isHidden property to true on creation.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/user-post-mailfolders?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Post<'body> {
    template_expressions: TemplateExpressions,
    body: OperationBody<MailFolder<'body>>,
}
impl<'body> Post<'body> {
    #[must_use]
    pub fn new(endpoint: String, body: OperationBody<MailFolder<'body>>) -> Self {
        Self {
            template_expressions: TemplateExpressions { endpoint },
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
