/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to call the delta method.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::mail_folder::*;
use crate::*;
use form_urlencoded::Serializer;
use http::method::Method;
use std::str::FromStr;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions { endpoint } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/me/mailFolders/delta()")
}
#[doc = "Invoke function delta\n\nGet a set of mail folders that have been added, deleted, or removed from the user's mailbox. A delta function call for mail folders in a mailbox is similar to a GET request, except that by appropriately\r\napplying state tokens in one or more of these calls,\r\nyou can query for incremental changes in the mail folders. This allows you to maintain and synchronize\r\na local store of a user's mail folders without having to fetch all the mail folders of that mailbox from the server every time.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/mailfolder-delta?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<MailFolderSelection>,
}
impl Get {
    pub fn new(endpoint: String) -> Self {
        Self {
            template_expressions: TemplateExpressions { endpoint },
            selection: Selection::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Body = ();
    type Response<'response> = DeltaResponse<Vec<MailFolder<'response>>>;
    fn build(&self) -> http::Request<Self::Body> {
        let mut params = Serializer::new(String::new());
        let (select, selection) = self.selection.pair();
        params.append_pair(select, &selection);
        let params = params.finish();
        let path = format_path(&self.template_expressions);
        let uri = format!("{path}?{params}")
            .parse::<http::uri::Uri>()
            .unwrap();
        http::Request::builder()
            .uri(uri)
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
#[doc = r"Retrieve delta changes using an opaque token from a previous"]
#[doc = r" delta response. The caller must ensure only tokens from this"]
#[doc = r" path are used."]
#[derive(Debug)]
pub struct GetDelta {
    token: http::Uri,
}
impl TryFrom<&str> for GetDelta {
    type Error = Error;
    fn try_from(token: &str) -> Result<Self, Self::Error> {
        let token = http::Uri::from_str(token)?;
        Ok(Self { token })
    }
}
impl Operation for GetDelta {
    const METHOD: Method = Method::GET;
    type Body = ();
    type Response<'response> = DeltaResponse<Vec<MailFolder<'response>>>;
    fn build(&self) -> http::Request<Self::Body> {
        http::Request::builder()
            .uri(&self.token)
            .method(Self::METHOD)
            .body(())
            .unwrap()
    }
}
