/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;
use std::ffi::c_char;
use std::ptr;

use cstr::cstr;
use url::Url;

use nsstring::nsCString;
use xpcom::interfaces::{
    nsIChannel, nsIContentPolicy, nsIHttpChannel, nsIIOService, nsILoadInfo, nsINSSErrorsService,
    nsIPrincipal, nsIScriptSecurityManager, nsIStringInputStream, nsITransportSecurityInfo,
    nsIUploadChannel,
};
use xpcom::XpCom;
use xpcom::{getter_addrefs, RefPtr};
use xpcom_async::XpComFuture;

use crate::client::Method;
use crate::error::{Error, TransportSecurityInfo};
use crate::response::Response;

/// The bytes to use as body in a request.
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Body<'bo>(&'bo [u8]);

impl<'bo> From<&'bo [u8]> for Body<'bo> {
    fn from(value: &'bo [u8]) -> Self {
        Body(value)
    }
}

impl<'bo> From<&'bo str> for Body<'bo> {
    fn from(value: &'bo str) -> Self {
        Body(value.as_bytes())
    }
}

/// The representation of a request body, with its content type.
struct RequestBody<'b> {
    content: Body<'b>,
    content_type: &'b str,
}

/// A builder to create and send HTTP requests.
pub struct RequestBuilder<'rb> {
    url: &'rb Url,
    method: Method,
    // Ideally we'd store header keys as nsCString directly, but nsCString does
    // not implement the traits Hash and Eq, which are required to be used as
    // HashMap keys.
    headers: HashMap<&'rb str, &'rb str>,
    body: Option<RequestBody<'rb>>,
}

impl<'rb> RequestBuilder<'rb> {
    /// Instantiates a new [`RequestBuilder`] to create a request to the
    /// specified URL with the specified HTTP method.
    ///
    /// If the URL is not a valid HTTP URL, i.e. if its protocol scheme is
    /// neither HTTP nor HTTPS, an error is returned.
    pub(crate) fn new(method: Method, url: &'rb Url) -> crate::Result<RequestBuilder<'rb>> {
        // We only support HTTP(S) URLs.
        // url.scheme() is always lower-cased.
        if url.scheme() != "http" && url.scheme() != "https" {
            return Err(Error::UnsupportedScheme(url.scheme().into()));
        }

        let builder = RequestBuilder {
            url,
            method,
            headers: HashMap::new(),
            body: None,
        };

        Ok(builder)
    }

    /// Adds an HTTP header to the request.
    pub fn header(&'rb mut self, key: &'rb str, value: &'rb str) -> &'rb mut RequestBuilder<'rb> {
        self.headers.insert(key, value);

        self
    }

    /// Sets the provided content as the request body, and sets its Content-Type
    /// header.
    ///
    /// The content provided must represent a UTF-8 string. If a null byte is
    /// present, it is seen as a terminator and the rest of the data is ignored.
    ///
    /// The body's length cannot exceed [`i32::MAX`] (otherwise an error will be
    /// returned by [`RequestBuilder::send`]).
    pub fn body<T: Into<Body<'rb>>>(
        &'rb mut self,
        body: T,
        content_type: &'rb str,
    ) -> &'rb mut RequestBuilder<'rb> {
        self.body = Some(RequestBody {
            content: body.into(),
            content_type,
        });

        self
    }

    /// Builds and sends an HTTP request from the builder's configuration.
    pub async fn send(&self) -> crate::Result<Response> {
        // Get the nsIScriptSecurityManager service to retrieve an nsIPrincipal we can use in
        // NewChannel.
        let script_sec_mgr = xpcom::get_service::<nsIScriptSecurityManager>(cstr!(
            "@mozilla.org/scriptsecuritymanager;1"
        ))
        .ok_or(Error::XpComOperationFailure(
            "failed to get service nsIScriptSecurityManager",
        ))?;

        let principal: RefPtr<nsIPrincipal> =
            getter_addrefs(unsafe { |p| script_sec_mgr.GetSystemPrincipal(p) })?;

        // Get the nsIIOService service to generate the nsIChannel.
        let io_service =
            xpcom::get_service::<nsIIOService>(cstr!("@mozilla.org/network/io-service;1")).ok_or(
                Error::XpComOperationFailure("failed to get service nsIIOService"),
            )?;

        // Build the nsIChannel to send the request through. Note that we could
        // do this in two parts, with the first one being parsing the url into
        // an nsIURI, but this wouldn't really be much more useful to us, since
        // all we'd do with it would be passing it to
        // io_service.NewChannelFromURI().
        let url = nsCString::from(self.url.as_str());
        let channel: RefPtr<nsIChannel> = getter_addrefs(|p| unsafe {
            io_service.NewChannel(
                &*url,
                ptr::null(),
                ptr::null(),
                ptr::null(),
                principal.coerce(),
                ptr::null(),
                nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                nsIContentPolicy::TYPE_OTHER,
                p,
            )
        })?;

        // Set the request body to the channel, if any.
        self.set_body(&channel)?;

        // Besides sending the request, most of the operations we need to
        // perform belong to nsIHttpChannel.
        let http_channel =
            channel
                .query_interface::<nsIHttpChannel>()
                .ok_or(Error::XpComOperationFailure(
                    "failed to query channel as nsIHttpChannel",
                ))?;

        // Set the headers.
        for (key, value) in &self.headers {
            let key = nsCString::from(*key);
            let value = nsCString::from(*value);

            unsafe {
                http_channel
                    .SetRequestHeader(&*key, &*value, false)
                    .to_result()?;
            }
        }

        // Set the method. We need to do this after setting the request's body
        // because nsIUploadChannel::SetUploadStream() used on an HTTP channel
        // sets the channel's method depending on the content of its arguments,
        // which might not match the method we want to use.
        let method: nsCString = self.method.into();
        unsafe { http_channel.SetRequestMethod(&*method).to_result()? }

        // Send the request through the nsIChannel.
        let bytes = match XpComFuture::from(channel.clone()).await {
            Ok((_channel, bytes)) => bytes,
            Err(err) => {
                // If we got an error back from Necko, ask the NSS errors
                // service if it's a security error.
                let nss_service = xpcom::get_service::<nsINSSErrorsService>(cstr!(
                    "@mozilla.org/nss_errors_service;1"
                ))
                .ok_or(Error::XpComOperationFailure(
                    "failed to get service nsINSSErrorsService",
                ))?;

                let sec_info: RefPtr<nsITransportSecurityInfo> =
                    getter_addrefs(|p| unsafe { channel.GetSecurityInfo(p) })?;

                let mut err_code: i32 = 0;
                unsafe { sec_info.GetErrorCode(&mut err_code) }.to_result()?;

                let mut is_nss_error: bool = false;
                unsafe { nss_service.IsNSSErrorCode(err_code, &mut is_nss_error) }.to_result()?;

                // If the NSS service has identified the error as relating to
                // transport security, include the `nsITransportSecurityInfo`
                // from the channel in the `Error`.
                let err = if is_nss_error {
                    Error::TransportSecurityFailure {
                        status: err,
                        transport_security_info: TransportSecurityInfo(sec_info),
                    }
                } else {
                    err.into()
                };

                return Err(err);
            }
        };

        // Store the nsIHttpChannel in the `Response` for convenience (since
        // `Response` only uses methods from `nsIHttpChannel`).
        let res = Response {
            channel: http_channel,
            body: bytes.to_vec(),
        };

        Ok(res)
    }

    /// Sets the configured request body on the given channge,
    fn set_body(&self, channel: &RefPtr<nsIChannel>) -> crate::Result<()> {
        // Bail out immediately if no body is available.
        if self.body.is_none() {
            return Ok(());
        }

        // Create an input stream for the body.
        let body_stream = xpcom::create_instance::<nsIStringInputStream>(cstr!(
            "@mozilla.org/io/string-input-stream;1"
        ))
        .ok_or(Error::XpComOperationFailure(
            "failed to create instance of nsIStringInputStream",
        ))?;

        // Cast the channel as nsIUploadChannel so we can set the input stream.
        let upload_channel =
            channel
                .query_interface::<nsIUploadChannel>()
                .ok_or(Error::XpComOperationFailure(
                    "failed to query channel as nsIHttpChannel",
                ))?;

        // We've already checked that self.body is not None, so we can safely
        // unwrap.
        let body = self.body.as_ref().unwrap();
        let len = <i32>::try_from(body.content.0.len())?;
        let content_type = nsCString::from(body.content_type);

        unsafe {
            // Set the data for the stream.
            //
            // SAFETY: SetData() makes a copy of the provided buffer to ensure
            // it's always reading from valid and allocated memory. This isn't
            // ideal because it means all request bodies are duplicated in
            // memory.
            //
            // Ideally we would use ShareData(). However, currently, the
            // nsIChannel is passed to the Response instance (so we can read
            // headers and a status from it) but the body's buffer
            // (body.content) is not (we currently don't need to support e.g.
            // reading the request body from the response). This means the
            // nsIChannel outlives the body's buffer, which creates a possible
            // scenario where we would try to read from the stream after its
            // underlying buffer has been dropped.
            //
            // We also can't use AdoptData() since this would create ambiguity
            // around the buffer's ownership: Rust and C++ would both believe
            // they own the buffer, which could lead to double free bugs.
            //
            // Should the body duplication become an issue, an alternative would
            // be to stick the body onto the Response struct when sending the
            // request, to ensure it stays in scope while the nsIChannel does,
            // and use ShareData() instead.
            body_stream
                .SetData(body.content.0.as_ptr() as *const c_char, len)
                .to_result()?;

            // Set the stream as the channel's upload stream.
            upload_channel
                .SetUploadStream(body_stream.coerce(), &*content_type, len as i64)
                .to_result()?
        }

        Ok(())
    }
}
