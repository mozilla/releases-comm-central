/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::Deref;

use base64::prelude::*;
use url::Url;

use nserror::nsresult;
use nsstring::{nsCString, nsString};
use xpcom::{
    RefPtr, create_instance, getter_addrefs,
    interfaces::{
        IExchangeLanguageInteropFactory, IOAuth2CustomDetails, msgIOAuth2Module,
        nsIMsgIncomingServer, nsIMsgOutgoingServer, nsMsgAuthMethod, nsMsgAuthMethodValue,
    },
};

use crate::{
    authentication::{auth_cache_manager::AUTH_CACHE_MANAGER, oauth_listener::OAuthListener},
    error::ProtocolError,
    operation_sender::pref_based_server::{PrefBasedServer, ServerProperty},
    safe_xpcom::SafeUri,
};

/// The location from which the password should be read, specifically when
/// updating Necko's HTTP auth cache.
pub enum PasswordLocationForCache {
    /// The password should be read from the password manager rather than
    /// memory.
    ///
    /// As an implementation detail, this does not mean that the auth cache
    /// manager will actually read form the password manager, but rather that it
    /// will call [`AuthenticationProvider::forget_session_password`] so to
    /// force the server to do so on the next call to
    /// [`AuthenticationProvider::password`].
    Storage,

    /// The auth cache manager should use the password stored in-memory by the
    /// server, without trying to "refresh" it.
    Memory,
}

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

    /// Retrieves the server's key.
    fn key(&self) -> Result<nsCString, nsresult>;

    /// Forgets the server's in-memory copy of its password.
    fn forget_session_password(&self) -> Result<(), nsresult>;

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

    fn maybe_set_necko_auth_cache(
        &self,
        pw_location: PasswordLocationForCache,
    ) -> Result<(), nsresult> {
        AUTH_CACHE_MANAGER.with(|manager| {
            manager.remove_from_cache(self)?;
            manager.add_or_update_cache(self, pw_location)
        })?;
        Ok(())
    }

    fn maybe_remove_necko_auth_cache_entry(&self) -> Result<(), nsresult> {
        AUTH_CACHE_MANAGER.with(|manager| manager.remove_from_cache(self))?;
        Ok(())
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
        let realm = self.get_string_property(ServerProperty::Realm)?;
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

    fn key(&self) -> Result<nsCString, nsresult> {
        let mut key = nsCString::new();
        unsafe { self.GetKey(&raw mut *key) }.to_result()?;
        Ok(key)
    }

    fn forget_session_password(&self) -> Result<(), nsresult> {
        unsafe { self.ForgetSessionPassword(false) }.to_result()
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
        let realm = self.get_string_property(ServerProperty::Realm)?;
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

    fn key(&self) -> Result<nsCString, nsresult> {
        let mut key = nsCString::new();
        unsafe { self.GetKey(&raw mut *key) }.to_result()?;
        Ok(key)
    }

    fn forget_session_password(&self) -> Result<(), nsresult> {
        unsafe { self.ForgetSessionPassword() }.to_result()
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
