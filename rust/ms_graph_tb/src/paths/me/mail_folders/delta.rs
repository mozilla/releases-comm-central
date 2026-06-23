/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to call the delta method.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::odata::{ExpansionList, FilterExpression, FilterQuery, Selection};
use crate::pagination::DeltaResponse;
use crate::types::mail_folder::{MailFolder, MailFolderExpand, MailFolderSelection};
use crate::{Error, Expand, Filter, Operation, Select};
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
    expansion: ExpansionList<MailFolderExpand>,
    filter: FilterQuery,
    max_page_size: Option<u16>,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String) -> Self {
        Self {
            template_expressions: TemplateExpressions { endpoint },
            selection: Selection::default(),
            expansion: ExpansionList::default(),
            filter: FilterQuery::default(),
            max_page_size: None,
        }
    }
    #[doc = r"Sets the page size to request from the server (via the `Prefer:"]
    #[doc = r" odata.maxpagesize=x` header)."]
    pub fn set_max_page_size(&mut self, size: u16) {
        self.max_page_size = Some(size);
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response = DeltaResponse<MailFolder>;
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
        let mut request = http::Request::builder().uri(uri).method(Self::METHOD);
        if let Some(page_size) = self.max_page_size {
            request = request.header("Prefer", format!("odata.maxpagesize={page_size}"));
        }
        let request = request.body(vec![])?;
        Ok(request)
    }
}
impl Select for Get {
    type Properties = MailFolderSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend_selection<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
impl Expand for Get {
    type Properties = MailFolderExpand;
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
#[doc = r"Retrieve delta changes using an opaque token from a previous"]
#[doc = r" delta response. The caller must ensure only tokens from this"]
#[doc = r" path are used."]
#[derive(Debug)]
pub struct GetDelta {
    token: http::Uri,
    max_page_size: Option<u16>,
}
impl GetDelta {
    #[doc = r"Sets the page size to request from the server (via the `Prefer:"]
    #[doc = r" odata.maxpagesize=x` header)."]
    pub fn set_max_page_size(&mut self, size: u16) {
        self.max_page_size = Some(size);
    }
}
impl TryFrom<&str> for GetDelta {
    type Error = Error;
    fn try_from(token: &str) -> Result<Self, Self::Error> {
        let token = http::Uri::from_str(token)?;
        Ok(Self {
            token,
            max_page_size: None,
        })
    }
}
impl Operation for GetDelta {
    const METHOD: Method = Method::GET;
    type Response = DeltaResponse<MailFolder>;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut request = http::Request::builder()
            .uri(&self.token)
            .method(Self::METHOD);
        if let Some(page_size) = self.max_page_size {
            request = request.header("Prefer", format!("odata.maxpagesize={page_size}"));
        }
        let request = request.body(vec![])?;
        Ok(request)
    }
}
