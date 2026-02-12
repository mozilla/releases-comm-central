/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the mailFolders property of the microsoft.graph.user entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::mail_folder::*;
use crate::*;
use form_urlencoded::Serializer;
use http::method::Method;
use std::str::FromStr;
#[derive(Debug)]
struct TemplateExpressions {
    mail_folder_id: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions { mail_folder_id } = template_expressions;
    format!("/me/mailFolders/{mail_folder_id}")
}
#[doc = "Get mailFolder\n\nRetrieve the properties and relationships of a message folder object. The following list shows the two existing scenarios where an app can get another user's mail folder:\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/mailfolder-get?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<MailFolderSelection>,
}
impl Get {
    pub fn new(mail_folder_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions { mail_folder_id },
            selection: Selection::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Body = ();
    type Response<'response> = MailFolder<'response>;
    fn build(&self) -> http::Request<Self::Body> {
        let mut params = Serializer::new(String::new());
        let (select, selection) = self.selection.pair();
        params.append_pair(select, &selection);
        let params = params.finish();
        let path = format_path(&self.template_expressions);
        let p_and_q = http::uri::PathAndQuery::from_str(&format!("{path}?{params}")).unwrap();
        http::Request::builder()
            .uri(p_and_q)
            .method(Self::METHOD)
            .body(())
            .unwrap()
    }
}
impl Select for Get {
    type Properties = MailFolderSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties)
    }
    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties)
    }
}
#[doc = "Update mailfolder\n\nUpdate the properties of mailfolder object.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/mailfolder-update?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Patch<'body> {
    template_expressions: TemplateExpressions,
    body: MailFolder<'body>,
}
impl<'body> Patch<'body> {
    pub fn new(mail_folder_id: String, body: MailFolder<'body>) -> Self {
        Self {
            template_expressions: TemplateExpressions { mail_folder_id },
            body,
        }
    }
}
impl<'body> Operation for Patch<'body> {
    const METHOD: Method = Method::PATCH;
    type Body = MailFolder<'body>;
    type Response<'response> = MailFolder<'response>;
    fn build(&self) -> http::Request<Self::Body> {
        let p_and_q = format_path(&self.template_expressions);
        http::Request::builder()
            .uri(p_and_q)
            .method(Self::METHOD)
            .body(self.body.clone())
            .unwrap()
    }
}
