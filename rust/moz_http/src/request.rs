/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;
use std::ptr;

use http::Method;
use nserror::nsresult;
use url::Url;

use nsstring::{nsCString, nsString};
use xpcom::XpCom;
use xpcom::interfaces::{
    nsContentPolicyType, nsIChannel, nsIContentPolicy, nsIHttpAuthManager, nsIHttpChannel,
    nsIIOService, nsILoadInfo, nsINSSErrorsService, nsINode, nsIPrincipal,
    nsIScriptSecurityManager, nsIStringInputStream, nsITransportSecurityInfo, nsIURI,
    nsIUploadChannel, nsSecurityFlags,
};
use xpcom::{RefPtr, getter_addrefs};
use xpcom_async_glue::AsyncChannelOpener;

use crate::AuthIdentity;
use crate::error::{Error, TransportSecurityInfo};
use crate::response::Response;

unsafe extern "C" {
    /// Defined and documented in `mailnews_ffi_glue.h`.
    unsafe fn new_loadinfo_with_cookie_settings(
        aLoadingPrincipal: *const nsIPrincipal,
        aTriggeringPrincipal: *const nsIPrincipal,
        aLoadingNode: *const nsINode,
        aSecurityFlags: nsSecurityFlags,
        aContentPolicyType: nsContentPolicyType,
        aSandboxFlags: u32,
        outLoadInfo: *mut *const nsILoadInfo,
    ) -> nsresult;
}

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
///
/// Ideally this would also have a `build()` method that returns a request-like
/// struct, however this isn't trivial to support in contexts when acquiring
/// ownership of the request's body without cloning is difficult.
#[must_use]
pub struct RequestBuilder<'rb> {
    url: &'rb Url,
    method: &'rb Method,
    auth_identity: Option<&'rb AuthIdentity<'rb>>,
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
    pub(crate) fn new(method: &'rb Method, url: &'rb Url) -> crate::Result<RequestBuilder<'rb>> {
        // We only support HTTP(S) URLs.
        // url.scheme() is always lower-cased.
        if url.scheme() != "http" && url.scheme() != "https" {
            return Err(Error::UnsupportedScheme(url.scheme().into()));
        }

        if url.host().is_none() {
            return Err(Error::MissingHost);
        }

        let builder = RequestBuilder {
            url,
            method,
            auth_identity: None,
            headers: HashMap::new(),
            body: None,
        };

        Ok(builder)
    }

    /// Adds an HTTP header to the request.
    pub fn header(mut self, key: &'rb str, value: &'rb str) -> RequestBuilder<'rb> {
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
        mut self,
        body: T,
        content_type: &'rb str,
    ) -> RequestBuilder<'rb> {
        self.body = Some(RequestBody {
            content: body.into(),
            content_type,
        });

        self
    }

    /// Sets the authentication identity to store in Necko's authentication
    /// cache before sending the request.
    pub fn auth_identity(mut self, auth_identity: &'rb AuthIdentity) -> RequestBuilder<'rb> {
        self.auth_identity = Some(auth_identity);
        self
    }

    /// Builds and sends an HTTP request from the builder's configuration.
    pub async fn send(&self) -> crate::Result<Response> {
        // Get the nsIScriptSecurityManager service to retrieve an nsIPrincipal we can use in
        // NewChannel.
        let script_sec_mgr =
            xpcom::get_service::<nsIScriptSecurityManager>(c"@mozilla.org/scriptsecuritymanager;1")
                .ok_or(Error::XpComOperationFailure(
                    "failed to get service nsIScriptSecurityManager",
                ))?;

        let principal: RefPtr<nsIPrincipal> =
            getter_addrefs(unsafe { |p| script_sec_mgr.GetSystemPrincipal(p) })?;

        // Get the nsIIOService service to generate the nsIChannel.
        let io_service = xpcom::get_service::<nsIIOService>(c"@mozilla.org/network/io-service;1")
            .ok_or(Error::XpComOperationFailure(
            "failed to get service nsIIOService",
        ))?;

        let url = nsCString::from(self.url.as_str());
        let uri: RefPtr<nsIURI> = getter_addrefs(|p| unsafe {
            io_service.NewURI(&raw const *url, ptr::null(), ptr::null(), p)
        })?;

        // Instantiate an `nsILoadInfo` that's configured to allow cookies
        // (unless the user settings say otherwise). We need to take this extra
        // step, as opposed to just creating a new channel with
        // `nsIIOService::NewChannel`, because `NewChannel` creates the
        // channel's `nsILoadInfo` in such a way that cookies cannot be
        // persisted if we don't have an `nsINode` to give it.
        //
        // SAFETY: `new_loadinfo_with_cookie_settings` is expected to return an
        // error if it wasn't able to build an `nsILoadInfo`, rather than return
        // a null pointer.
        let load_info: RefPtr<nsILoadInfo> = getter_addrefs(|p| unsafe {
            new_loadinfo_with_cookie_settings(
                principal.coerce(),
                ptr::null(),
                ptr::null(),
                nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                nsIContentPolicy::TYPE_OTHER,
                0,
                p,
            )
        })?;

        let channel: RefPtr<nsIChannel> = getter_addrefs(|p| unsafe {
            io_service.NewChannelFromURIWithLoadInfo(uri.coerce(), load_info.coerce(), p)
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
                    .SetRequestHeader(&raw const *key, &raw const *value, false)
                    .to_result()?;
            }
        }

        // Set the method. We need to do this after setting the request's body
        // because nsIUploadChannel::SetUploadStream() used on an HTTP channel
        // sets the channel's method depending on the content of its arguments,
        // which might not match the method we want to use.
        let method: nsCString = self.method.as_str().into();
        unsafe {
            http_channel
                .SetRequestMethod(&raw const *method)
                .to_result()?;
        }

        // Set the auth identity if there is one.
        self.set_auth_identity()?;

        // Send the request through the `nsIChannel`. When the request finishes,
        // we replace the channel with the one provided by the
        // `AsyncChannelOpener`. This is important because Necko might have
        // replaced the original channel if e.g. it encountered a redirection or
        // had to retry a request; keeping the old channel around means we'd end
        // up with the `Response` reading things like status codes for the wrong
        // request.
        let (channel, bytes) = match AsyncChannelOpener::from(channel.clone()).await {
            Ok((channel, bytes)) => (channel, bytes),
            Err(err) => {
                // If we got an error back from Necko, ask the NSS errors
                // service if it's a security error.
                let nss_service =
                    xpcom::get_service::<nsINSSErrorsService>(c"@mozilla.org/nss_errors_service;1")
                        .ok_or(Error::XpComOperationFailure(
                            "failed to get service nsINSSErrorsService",
                        ))?;

                let sec_info: Option<RefPtr<nsITransportSecurityInfo>> =
                    match getter_addrefs(|p| unsafe { channel.GetSecurityInfo(p) }) {
                        Ok(sec_info) => Some(sec_info),
                        Err(err) => match err {
                            // A null pointer will cause `getter_addrefs` to
                            // return `Err(NS_OK)`. This might be expected here
                            // if e.g. a secure connection couldn't be
                            // established due to the server not being
                            // available.
                            nserror::NS_OK => None,
                            _ => return Err(err.into()),
                        },
                    };

                // If there isn't an `nsITransportSecurityInfo` attached to the
                // channel, then the error is probably not security-related but
                // rather represents a connectivity issue.
                let Some(sec_info) = sec_info else {
                    return Err(err.into());
                };

                let mut err_code: i32 = 0;
                unsafe { sec_info.GetErrorCode(&raw mut err_code) }.to_result()?;

                let mut is_nss_error: bool = false;
                unsafe { nss_service.IsNSSErrorCode(err_code, &raw mut is_nss_error) }
                    .to_result()?;

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

        // `Response` needs an `nsIHttpChannel`, let's give it one.
        let http_channel =
            channel
                .query_interface::<nsIHttpChannel>()
                .ok_or(Error::XpComOperationFailure(
                    "failed to query response channel as nsIHttpChannel",
                ))?;

        // Store the nsIHttpChannel in the `Response` for convenience (since
        // `Response` only uses methods from `nsIHttpChannel`).
        let res = Response {
            channel: http_channel,
            body: bytes.to_vec(),
        };

        log::debug!("Response from request: {}", res.status()?);

        Ok(res)
    }

    /// Sets the configured request body on the given channge,
    fn set_body(&self, channel: &RefPtr<nsIChannel>) -> crate::Result<()> {
        // Bail out immediately if no body is available.
        if self.body.is_none() {
            return Ok(());
        }

        // Create an input stream for the body.
        let body_stream = xpcom::create_instance::<nsIStringInputStream>(
            c"@mozilla.org/io/string-input-stream;1",
        )
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
        let len = <i64>::try_from(body.content.0.len())?;
        let content_type = nsCString::from(body.content_type);

        unsafe {
            // Set the data for the stream.
            //
            // SAFETY: SetByteStringData() makes a copy of the provided buffer
            // to ensure it's always reading from valid and allocated memory.
            // This isn't ideal because it means all request bodies are
            // duplicated in memory.
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
            let body_content = nsCString::from(body.content.0);
            body_stream
                .SetByteStringData(&raw const *body_content)
                .to_result()?;

            // Set the stream as the channel's upload stream.
            upload_channel
                .SetUploadStream(body_stream.coerce(), &raw const *content_type, len)
                .to_result()?;
        }

        Ok(())
    }

    /// Set the auth identity for this request using the inner [`AuthIdentity`]
    /// if set (otherwise this is a no-op).
    ///
    /// TODO: We currently set this on a per-request basis, meaning we reset the
    /// auth cache for our server on every request, but we should move to a more
    /// conservative approach - see
    /// https://bugzilla.mozilla.org/show_bug.cgi?id=2058544
    fn set_auth_identity(&self) -> crate::Result<()> {
        let Some(auth_identity) = self.auth_identity else {
            return Ok(());
        };

        let auth_manager: RefPtr<nsIHttpAuthManager> =
            xpcom::get_service(c"@mozilla.org/network/http-auth-manager;1").ok_or(
                Error::XpComOperationFailure("failed to create instance of nsIHttpAuthManager"),
            )?;

        let scheme = self.url.scheme();

        // We should be able to unwrap here, because a missing host would have
        // caused `RequestBuilder::new` to fail. It doesn't hurt to be extra
        // safe though, so let's check it here too.
        let host = self.url.host().ok_or(Error::MissingHost)?.to_string();

        // Necko uses -1 when the port isn't clearly specified in the URI. We
        // use the same URI to infer the port as we use to instantiate the
        // channel, so we shouldn't be able to get in a situation where one has
        // a port and the other doesn't.
        let port: i32 = self.url.port().map_or(-1, Into::into);

        let realm: nsCString = moz_string_from_option(&auth_identity.realm);
        let path: nsCString = moz_string_from_option(&auth_identity.path);
        let domain: nsString = moz_string_from_option(&auth_identity.domain);
        let auth_type = nsCString::from(auth_identity.auth_type.to_string());

        // SAFETY: We've ensured the pointers we use here point to valid data.
        // This data is copied (via `ns[C]String::Assign`) before
        // `SetAuthIdentity` returns.
        unsafe {
            // Set the auth identity in Necko's auth cache. We need to make sure
            // we supply the same scheme, host and port (also path and realm, if
            // non-empty), otherwise we'll get a cache miss.
            auth_manager.SetAuthIdentity(
                &raw const *nsCString::from(scheme),
                &raw const *nsCString::from(host),
                port,
                // Note: we supply the auth type because the XPIDL has it (and
                // we know it), but the actual implementation ignores it.
                &raw const *auth_type,
                &raw const *realm,
                &raw const *path,
                &raw const *domain,
                &raw const *nsString::from(auth_identity.username),
                &raw const *nsString::from(auth_identity.password),
                // Optional parameters.
                false,
                ptr::null(),
            )
        }
        .to_result()?;

        Ok(())
    }
}

/// Takes an [`Option<String>`] and turns it into the relevant [`nsstring`]
/// type. If the `Option` is [`None`], returns an empty string.
fn moz_string_from_option<'s, OutT>(opt: &'s Option<&'s str>) -> OutT
where
    OutT: From<&'s str>,
{
    // Technically we could do this with `Option::map_or_else`, but that method
    // takes ownership over the option and we want to limit the amount of
    // cloning.
    if let Some(str) = opt {
        OutT::from(str)
    } else {
        // Ideally we'd use `ns[C]String::new` here but that cannot be
        // represented as a trait bound.
        OutT::from("")
    }
}
