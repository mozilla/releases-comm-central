/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{ops::Deref, ptr};

use base64::prelude::*;
use url::Url;

use nserror::nsresult;
use nsstring::{nsCString, nsString};
use xpcom::{
    RefPtr, create_instance, getter_addrefs,
    interfaces::{
        IExchangeLanguageInteropFactory, IOAuth2CustomDetails, msgIOAuth2Module,
        nsIHttpAuthManager, nsIMsgIncomingServer, nsIMsgOutgoingServer, nsMsgAuthMethod,
        nsMsgAuthMethodValue,
    },
};

use crate::{
    authentication::oauth_listener::OAuthListener, error::ProtocolError,
    operation_sender::pref_based_server::PrefBasedServer, safe_xpcom::SafeUri,
};

/// The name of the server property in which the authentication realm is stored.
pub(crate) const REALM_SERVER_PROPERTY_NAME: &str = "realm";

/// An entity which can provide details to use for authentication.
#[allow(async_fn_in_trait)]
pub trait AuthenticationProvider {
    /// Indicates the authentication method to use.
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult>;

    /// Retrieves the username to authenticate with.
    fn username(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the password to authenticate with. May be empty, e.g. if using
    /// OAuth2.
    fn password(&self) -> Result<nsString, nsresult>;

    /// Retrieves the hostname for the provider.
    fn hostname(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the server's type string.
    fn server_type(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the realm to authenticate against. May be empty, e.g. if using
    /// OAuth2 or NTLM, or if no realm is currently known for this server.
    fn realm(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the server's base URL for HTTP(S) requests.
    ///
    /// This can be [`None`] if the server does not have a URL set, or if its
    /// protocol does not use HTTP.
    fn base_http_url(&self) -> Result<Option<Url>, nsresult>;

    /// Creates and initializes an OAuth2 module.
    ///
    /// `None` is returned if OAuth2 is not supported for the provider's domain.
    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult>;

    /// Creates an instance of [`IOAuth2CustomDetails`] for this server.
    fn oauth2_override_details(&self) -> Result<RefPtr<IOAuth2CustomDetails>, nsresult> {
        let server_type = self.server_type()?;
        let hostname = self.hostname()?;
        let username = self.username()?;

        let interop_factory = create_instance::<IExchangeLanguageInteropFactory>(
            c"@mozilla.org/messenger/exchange-interop;1",
        )
        .ok_or(Err::<RefPtr<IExchangeLanguageInteropFactory>, _>(
            nserror::NS_ERROR_FAILURE,
        ))?;

        getter_addrefs(|p| unsafe {
            interop_factory.CreateOAuth2Details(
                &raw const *server_type,
                &raw const *hostname,
                &raw const *username,
                p,
            )
        })
    }

    /// Generate the value for the `Authorization` header, if relevant for the
    /// server's authentication method.
    async fn auth_header_value(&self) -> Result<Option<String>, ProtocolError> {
        let hdr_value = match self.auth_method()? {
            // Build Basic auth tokens ourselves until
            // https://bugzilla.mozilla.org/show_bug.cgi?id=2059739 is fixed.
            nsMsgAuthMethod::passwordCleartext => {
                let username = self.username()?;
                let password = self.password()?;

                let token = BASE64_STANDARD.encode(format!("{username}:{password}"));
                Some(format!("Basic {token}"))
            }

            // We defer NTLM auth to Necko.
            nsMsgAuthMethod::NTLM => None,

            // Get the OAuth2 module and get a Bearer token.
            nsMsgAuthMethod::OAuth2 => {
                // Ensure the OAuth2 module indicated it can support this provider.
                let override_details = self.oauth2_override_details()?;
                let module = match self.oauth2_module(&override_details)? {
                    Some(module) => module,
                    None => {
                        return Err(ProtocolError::Processing { message: "preferred auth method is set to OAuth2, but it is not supported for this domain".to_string() });
                    }
                };

                // Retrieve a bearer token from the OAuth2 module.
                let listener = OAuthListener::new();
                unsafe { module.GetAccessToken(listener.coerce()) }.to_result()?;
                let bearer_token = match listener.deref().await {
                    Ok(token) => token,

                    // The OAuth2 module will return `NS_ERROR_ABORT` if it's
                    // failed to get credentials even after prompting the user
                    // again, which qualifies as an authentication error.
                    Err(nserror::NS_ERROR_ABORT) => {
                        return Err(ProtocolError::Authentication(None));
                    }

                    Err(err) => return Err(err.into()),
                };

                Some(format!("Bearer {bearer_token}"))
            }
            _ => {
                return Err(ProtocolError::Processing {
                    message: "the preferred auth method is not supported".to_string(),
                });
            }
        };

        Ok(hdr_value)
    }

    /// Create an entry for the server in Necko's HTTP auth cache, if relevant
    /// for the server's authentication method.
    ///
    /// This method expects the server's base URL to be set, and to use an
    /// HTTP(S) scheme.
    fn maybe_set_necko_auth_cache(&self) -> Result<(), nsresult> {
        let realm = self.realm()?;
        let password = self.password()?;

        // `nsIHttpAuthManager::SetAuthIdentity` annoyingly requires the
        // username to be an `nsString`, whereas we typically treat it as an
        // `nsCString` in Thunderbird. So we convert it into a `String` here so
        // it can be turned into an `nsString` later (`nsstring` doesn't
        // currently provide conversion utilities between `nsString` and
        // `nsCString`).
        let username = self.username()?.to_string();

        // Set the auth type, domain and username, but also (and maybe more
        // importantly) filter out the auth types for which we should no-op
        // here.
        let (auth_type, domain, username) = match self.auth_method()? {
            nsMsgAuthMethod::NTLM => {
                // NTLM usernames might come in the form `domain\username`. Note
                // that they might also come in the form `username@domain`, but
                // this is done in order to work around the 15-character limit
                // for domain length and such usernames should be sent to the
                // server as is.
                let (domain, username) =
                    username.split_once('\\').unwrap_or(("", username.as_str()));

                ("ntlm", domain, username)
            }

            // Other authentication methods are either implemented on our side
            // or unsupported. Eventually we'll want to defer Basic auth to
            // Necko as well, but we need to fix
            // https://bugzilla.mozilla.org/show_bug.cgi?id=2059739 first.
            _ => return Ok(()),
        };

        // We're setting Necko's HTTP auth cache here, which happens first on
        // client setup (which itself happens when we try performing the
        // server's first operation), so we expect the server to be ready to
        // send HTTP requests by this point.
        let Some(url) = self.base_http_url()? else {
            log::error!("trying to set the HTTP auth cache for server without a URL");
            return Err(nserror::NS_ERROR_UNEXPECTED);
        };

        // If the URL doesn't have a port, we need to set it to -1, which is the
        // default for `nsIURI`. We can't use `port_or_known_default()` because
        // a URL without an explicit port will match an entry with -1 but not
        // one with 80 or 443.
        let port = url.port().map_or(-1, i32::from);
        let scheme = nsCString::from(url.scheme());

        let Some(hostname) = url.host() else {
            log::error!("invalid URL: missing hostname: {}", url.as_str());
            return Err(nserror::NS_ERROR_UNEXPECTED);
        };
        let hostname = nsCString::from(hostname.to_string());

        log::debug!(
            "adding or updating Necko's auth cache - \
                auth_type={auth_type}, \
                realm={realm}, \
                domain={domain}, \
                username={username}, \
                hostname={hostname}, \
                port={port}"
        );

        let auth_manager: RefPtr<nsIHttpAuthManager> =
            xpcom::get_service(c"@mozilla.org/network/http-auth-manager;1")
                .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        // SAFETY: We've ensured the pointers we use here point to valid data. This
        // data is copied (via `ns[C]String::Assign`) before `SetAuthIdentity`
        // returns.
        unsafe {
            // Set the auth identity in Necko's auth cache. We need to make sure we
            // supply the same scheme, host and port (also path and realm, if
            // non-empty) that will be used in requests, otherwise we'll get a cache
            // miss.
            auth_manager.SetAuthIdentity(
                &raw const *scheme,
                &raw const *hostname,
                port,
                // Note: we supply the auth type because the XPIDL has it (and
                // we know it), but the actual implementation ignores it.
                &raw const *nsCString::from(auth_type),
                &raw const *realm,
                // We currently don't set a path, so that the auth cache entry
                // applies to the entire domain (for this scheme and username).
                // In the future, there might be edge cases in which setting a
                // path (e.g. the Graph subpath or EWS endpoint) is desirable,
                // but we can address those later on.
                &raw const *nsCString::new(),
                &raw const *nsString::from(domain),
                &raw const *nsString::from(username),
                &raw const *password,
                // Optional parameters.
                false,
                ptr::null(),
            )
        }
        .to_result()
    }
}

impl AuthenticationProvider for nsIMsgIncomingServer {
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let mut auth_method: nsMsgAuthMethodValue = 0;

        unsafe { self.GetAuthMethod(&raw mut auth_method) }.to_result()?;

        Ok(auth_method)
    }

    fn username(&self) -> Result<nsCString, nsresult> {
        let mut username = nsCString::new();

        unsafe { self.GetUsername(&raw mut *username) }.to_result()?;

        Ok(username)
    }

    fn password(&self) -> Result<nsString, nsresult> {
        let mut password = nsString::new();

        unsafe { self.GetPassword(&raw mut *password) }.to_result()?;

        Ok(password)
    }

    fn server_type(&self) -> Result<nsCString, nsresult> {
        let mut server_type = nsCString::new();

        unsafe { self.GetType(&raw mut *server_type) }.to_result()?;

        Ok(server_type)
    }

    fn hostname(&self) -> Result<nsCString, nsresult> {
        let mut hostname = nsCString::from("");
        unsafe { self.GetHostname(&raw mut *hostname) }.to_result()?;
        Ok(hostname)
    }

    fn realm(&self) -> Result<nsCString, nsresult> {
        let realm = self.get_string_property(REALM_SERVER_PROPERTY_NAME)?;
        Ok(nsCString::from(realm))
    }

    fn base_http_url(&self) -> Result<Option<Url>, nsresult> {
        let mut url = nsCString::new();
        unsafe { self.GetStringValue(c"ews_url".as_ptr(), &raw mut *url) }.to_result()?;

        // Unlike `nsIPrefBranch`, `nsMsgIncomingServer` returns an empty string
        // if the pref is missing, so we don't need to handle that case
        // separately.
        if url.is_empty() {
            return Ok(None);
        }

        let url = Url::parse(&url.to_string()).map_err(|err| {
            log::error!("failed to parse base URL: {err}");
            nserror::NS_ERROR_UNEXPECTED
        })?;

        Ok(Some(url))
    }

    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(c"@mozilla.org/mail/oauth2-module;1").ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe {
            oauth2_module.InitFromMail(self.coerce(), override_details, &raw mut oauth2_supported)
        }
        .to_result()?;

        let ret = oauth2_supported.then_some(oauth2_module);

        Ok(ret)
    }
}

impl AuthenticationProvider for nsIMsgOutgoingServer {
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let mut auth_method: nsMsgAuthMethodValue = 0;

        unsafe { self.GetAuthMethod(&raw mut auth_method) }.to_result()?;

        Ok(auth_method)
    }

    fn username(&self) -> Result<nsCString, nsresult> {
        let mut username = nsCString::new();

        unsafe { self.GetUsername(&raw mut *username) }.to_result()?;

        Ok(username)
    }

    fn password(&self) -> Result<nsString, nsresult> {
        let mut password = nsCString::new();

        unsafe { self.GetPassword(&raw mut *password) }.to_result()?;

        let password = password.to_string();
        let password = nsString::from(password.as_str());
        Ok(password)
    }

    fn server_type(&self) -> Result<nsCString, nsresult> {
        let mut server_type = nsCString::new();

        unsafe { self.GetType(&raw mut *server_type) }.to_result()?;

        Ok(server_type)
    }

    fn hostname(&self) -> Result<nsCString, nsresult> {
        let uri = getter_addrefs(|p| unsafe { self.GetServerURI(p) })?;
        let mut hostname = nsCString::from("");
        unsafe { uri.GetHost(&raw mut *hostname) }.to_result()?;
        Ok(hostname)
    }

    fn realm(&self) -> Result<nsCString, nsresult> {
        let realm = self.get_string_property(REALM_SERVER_PROPERTY_NAME)?;
        Ok(nsCString::from(realm))
    }

    fn base_http_url(&self) -> Result<Option<Url>, nsresult> {
        let url = getter_addrefs(|p| unsafe { self.GetServerURI(p) })?;
        let url = SafeUri::from(url);
        let url = String::try_from(url)?;

        // Unlike `nsIPrefBranch`, `nsMsgIncomingServer` returns an empty string
        // if the pref is missing, so we don't need to handle that case
        // separately.
        if url.is_empty() {
            return Ok(None);
        }

        let url = Url::parse(&url).map_err(|err| {
            log::error!("failed to parse base URL: {err}");
            nserror::NS_ERROR_UNEXPECTED
        })?;

        // The return value from this method might be used to infer connection
        // security settings, port, etc., which other protocols might
        // expose/treat differently from HTTP URLs, so we want to make sure to
        // only capture HTTP URLs here.
        let scheme = url.scheme();
        if scheme == "http" || scheme == "https" {
            Ok(Some(url))
        } else {
            Ok(None)
        }
    }

    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(c"@mozilla.org/mail/oauth2-module;1").ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe {
            oauth2_module.InitFromOutgoing(
                self.coerce(),
                override_details,
                &raw mut oauth2_supported,
            )
        }
        .to_result()?;

        Ok(oauth2_supported.then_some(oauth2_module))
    }
}
