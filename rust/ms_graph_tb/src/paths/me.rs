/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the user singleton.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::user::*;
use crate::*;
use form_urlencoded::Serializer;
use http::method::Method;
use std::str::FromStr;
const PATH: &str = "/me";
#[doc = "Get a user\n\nRetrieve the properties and relationships of user object. This operation returns by default only a subset of the more commonly used properties for each user. These default properties are noted in the Properties section. To get properties that are not returned by default, do a GET operation for the user and specify the properties in a `$select` OData query option. Because the user resource supports extensions, you can also use the GET operation to get custom properties and extension data in a user instance. Customers through Microsoft Entra ID for customers can also use this API operation to retrieve their details.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/user-get?view=graph-rest-1.0)."]
#[derive(Debug, Default)]
pub struct Get {
    selection: Selection<UserSelection>,
}
impl Get {
    pub fn new() -> Self {
        Self {
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
        let p_and_q = http::uri::PathAndQuery::from_str(&format!("{PATH}?{params}")).unwrap();
        http::Request::builder()
            .uri(p_and_q)
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
#[derive(Debug, Default)]
pub struct Patch<'body> {
    body: User<'body>,
}
impl<'body> Patch<'body> {
    pub fn new(body: User<'body>) -> Self {
        Self { body }
    }
}
impl<'body> Operation for Patch<'body> {
    const METHOD: Method = Method::PATCH;
    type Body = User<'body>;
    type Response<'response> = User<'response>;
    fn build(&self) -> http::Request<Self::Body> {
        let p_and_q = PATH;
        http::Request::builder()
            .uri(p_and_q)
            .method(Self::METHOD)
            .body(self.body.clone())
            .unwrap()
    }
}
