/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use http::Method;
use url::Url;

use crate::request::RequestBuilder;

#[derive(Default)]
pub struct Client {}

impl Client {
    /// Creates a new HTTP client.
    pub fn new() -> Client {
        Client {}
    }

    /// Starts building an HTTP request to the given method and URL.
    pub fn request<'rb>(
        &self,
        method: &'rb Method,
        url: &'rb Url,
    ) -> crate::Result<RequestBuilder<'rb>> {
        RequestBuilder::new(method, url)
    }

    /// Shorthand for [`request`][req] for a GET request.
    ///
    /// [req]: crate::client::Client::request
    pub fn get<'rb>(&self, url: &'rb Url) -> crate::Result<RequestBuilder<'rb>> {
        self.request(&Method::GET, url)
    }

    /// Shorthand for [`request`][req] for a POST request.
    ///
    /// [req]: crate::client::Client::request
    pub fn post<'rb>(&self, url: &'rb Url) -> crate::Result<RequestBuilder<'rb>> {
        self.request(&Method::POST, url)
    }

    /// Shorthand for [`request`][req] for a PUT request.
    ///
    /// [req]: crate::client::Client::request
    pub fn put<'rb>(&self, url: &'rb Url) -> crate::Result<RequestBuilder<'rb>> {
        self.request(&Method::PUT, url)
    }

    /// Shorthand for [`request`][req] for a DELETE request.
    ///
    /// [req]: crate::client::Client::request
    pub fn delete<'rb>(&self, url: &'rb Url) -> crate::Result<RequestBuilder<'rb>> {
        self.request(&Method::DELETE, url)
    }
}
