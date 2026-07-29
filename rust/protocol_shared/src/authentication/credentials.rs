/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::Deref;

use moz_http::{AuthIdentity, AuthType};
use nserror::nsresult;
use nsstring::{nsCString, nsString};
use xpcom::{
    RefPtr, create_instance, getter_addrefs,
    interfaces::{
        IExchangeLanguageInteropFactory, IOAuth2CustomDetails, msgIOAuth2Module,
        nsIMsgIncomingServer, nsIMsgOutgoingServer, nsMsgAuthMethod, nsMsgAuthMethodValue,
    },
};

use crate::{authentication::oauth_listener::OAuthListener, error::ProtocolError};

/// The credentials to use when authenticating against a server.
#[derive(Clone)]
pub enum Credentials {
    /// The username and password to use for Basic authentication.
    Basic { username: String, password: String },

    /// The XPCOM OAuth2 module to use for negotiating OAuth2 and retrieving an
    /// authentication token.
    OAuth2 {
        oauth_module: RefPtr<msgIOAuth2Module>,
    },

    // The domain, username and password to use for NTLM authentication.
    Ntlm {
        domain: String,
        username: String,
        password: String,
    },
}

impl<'ai> From<&'ai Credentials> for Option<AuthIdentity<'ai>> {
    fn from(value: &'ai Credentials) -> Self {
        match value {
            Credentials::Basic { username, password } => Some(AuthIdentity {
                auth_type: AuthType::Basic,
                username: username,
                password: password,
                // TODO: We don't currently support capturing the realm, see
                // https://bugzilla.mozilla.org/show_bug.cgi?id=2058538
                realm: None,
                path: None,
                domain: None,
            }),
            Credentials::Ntlm {
                domain,
                username,
                password,
            } => Some(AuthIdentity {
                auth_type: AuthType::Ntlm,
                // Note: `domain` might be an empty string (which currently
                // doesn't matter since `moz_http` turns `None`s into empty
                // strings anyway).
                domain: Some(domain),
                username: username,
                password: password,
                // NTLM doesn't seem to ever use realms.
                realm: None,
                path: None,
            }),
            // Unlike Basic and NTLM, "OAuth2" isn't a "real" HTTP
            // authentication scheme. In this case, we fall back to generating
            // the `Authorization` header outside of Necko.
            Credentials::OAuth2 { .. } => None,
        }
    }
}

impl Credentials {
    /// Formats credentials to be used as the value of an HTTP Authorization
    /// header.
    pub async fn to_auth_header_value(&self) -> Result<Option<String>, ProtocolError> {
        match &self {
            Self::OAuth2 { oauth_module, .. } => {
                // Retrieve a bearer token from the OAuth2 module.
                let listener = OAuthListener::new();
                unsafe { oauth_module.GetAccessToken(listener.coerce()) }.to_result()?;
                let bearer_token = match listener.deref().await {
                    Ok(token) => token,

                    // The OAuth2 module will return `NS_ERROR_ABORT` if it's
                    // failed to get credentials even after prompting the user
                    // again, which qualifies as an authentication error.
                    Err(nserror::NS_ERROR_ABORT) => return Err(ProtocolError::Authentication),

                    Err(err) => return Err(err.into()),
                };

                Ok(Some(format!("Bearer {bearer_token}")))
            }
            Self::Basic { .. } | Self::Ntlm { .. } => {
                // We defer Basic and NTLM authentication to Necko.
                Ok(None)
            }
        }
    }
}

/// An entity which can provide details to use for authentication.
pub trait AuthenticationProvider {
    /// Indicates the authentication method to use.
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult>;

    /// Retrieves the username to use if using Basic auth.
    fn username(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the password to use if using Basic auth.
    fn password(&self) -> Result<nsString, nsresult>;

    /// Retrieves the hostname for the provider.
    fn hostname(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the server's type string.
    fn server_type(&self) -> Result<nsCString, nsresult>;

    /// Creates and initializes an OAuth2 module.
    ///
    /// `None` is returned if OAuth2 is not supported for the provider's domain.
    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult>;

    /// Creates an instance of [`Credentials`] from this provider.
    fn get_credentials(&self) -> Result<Credentials, nsresult> {
        match self.auth_method()? {
            nsMsgAuthMethod::passwordCleartext => Ok(Credentials::Basic {
                username: self.username()?.to_string(),
                password: self.password()?.to_string(),
            }),
            nsMsgAuthMethod::OAuth2 => {
                // Get the OAuth details.
                let server_type = self.server_type()?;
                let hostname = self.hostname()?;
                let username = self.username()?;
                let interop_factory = create_instance::<IExchangeLanguageInteropFactory>(
                    c"@mozilla.org/messenger/exchange-interop;1",
                )
                .ok_or(Err::<RefPtr<IExchangeLanguageInteropFactory>, _>(
                    nserror::NS_ERROR_FAILURE,
                ))?;
                let override_details = getter_addrefs(|p| unsafe {
                    interop_factory.CreateOAuth2Details(
                        &raw const *server_type,
                        &raw const *hostname,
                        &raw const *username,
                        p,
                    )
                })?;

                // Ensure the OAuth2 module indicated it can support this provider.
                match self.oauth2_module(&override_details)? {
                    Some(module) => Ok(Credentials::OAuth2 {
                        oauth_module: module,
                    }),
                    None => {
                        log::error!(
                            "preferred auth method is set to OAuth2, but it is not supported for this domain"
                        );
                        Err(nserror::NS_ERROR_FAILURE)
                    }
                }
            }
            nsMsgAuthMethod::NTLM => {
                let username = self.username()?.to_string();

                // NTLM usernames might come in the form `domain\username`. Note
                // that they might also come in the form `username@domain`, but
                // this is done in order to work around the 15-character limit
                // for domain length and such usernames should be sent to the
                // server as is.
                let (domain, username) =
                    username.split_once('\\').unwrap_or(("", username.as_str()));

                Ok(Credentials::Ntlm {
                    domain: domain.to_string(),
                    username: username.to_string(),
                    password: self.password()?.to_string(),
                })
            }
            _ => {
                log::error!("the preferred auth method is not supported");
                Err(nserror::NS_ERROR_FAILURE)
            }
        }
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
