/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the user singleton.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::user::*;
use crate::*;
use form_urlencoded::Serializer;
use http::method::Method;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions { endpoint } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/me")
}
#[doc = "Get a user\n\nRetrieve the properties and relationships of user object. This operation returns by default only a subset of the more commonly used properties for each user. These default properties are noted in the Properties section. To get properties that are not returned by default, do a GET operation for the user and specify the properties in a `$select` OData query option. Because the user resource supports extensions, you can also use the GET operation to get custom properties and extension data in a user instance. Customers through Microsoft Entra ID for customers can also use this API operation to retrieve their details.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/user-get?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<UserSelection>,
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
    type Response<'response> = User<'response>;
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
    type Properties = UserSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties)
    }
    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties)
    }
}
#[doc = "Update user\n\nUpdate the properties of a user object.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/user-update?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Patch<'body> {
    template_expressions: TemplateExpressions,
    body: User<'body>,
}
impl<'body> Patch<'body> {
    pub fn new(endpoint: String, body: User<'body>) -> Self {
        Self {
            template_expressions: TemplateExpressions { endpoint },
            body,
        }
    }
}
impl<'body> Operation for Patch<'body> {
    const METHOD: Method = Method::PATCH;
    type Body = User<'body>;
    type Response<'response> = User<'response>;
    fn build(&self) -> http::Request<Self::Body> {
        let uri = format_path(&self.template_expressions)
            .parse::<http::uri::Uri>()
            .unwrap();
        http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .body(self.body.clone())
            .unwrap()
    }
}
