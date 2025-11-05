/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{ffi::CString, ops::Deref};

use base64::prelude::*;
use cstr::cstr;

use moz_http::Client;
use nserror::nsresult;
use nsstring::{nsCString, nsString};
use url::Url;
use xpcom::{
    create_instance, get_service, getter_addrefs,
    interfaces::{
        msgIOAuth2Module, nsIMsgIncomingServer, nsIMsgOutgoingServer, nsIPrefService,
        nsMsgAuthMethod, nsMsgAuthMethodValue, IEwsLanguageInteropFactory, IOAuth2CustomDetails,
    },
    RefPtr,
};

use crate::{
    authentication::{
        ntlm::{self, NTLMAuthOutcome},
        oauth_listener::OAuthListener,
    },
    client::XpComEwsError,
};

/// The outcome of [`Credentials::validate`].
pub(crate) enum AuthValidationOutcome {
    /// We've been able to confirm the credentials work with the current server.
    Valid,

    /// We haven't been able to successfully authenticate against the current
    /// server with the credentials.
    Invalid,
}

/// The credentials to use when authenticating against a server.
#[derive(Clone)]
pub(crate) enum Credentials {
    /// The username and password to use for Basic authentication, as well as
    /// the URL to use when validating these credentials.
    Basic {
        username: String,
        password: String,
        ews_url: Url,
    },

    /// The XPCOM OAuth2 module to use for negotiating OAuth2 and retrieving an
    /// authentication token, as well as the URL to use when validating this
    /// token.
    OAuth2 {
        oauth_module: RefPtr<msgIOAuth2Module>,
        ews_url: Url,
    },

    // The username and password to use for NTLM authentication, as well as the
    // URL to request a challenge from.
    Ntlm {
        username: String,
        password: String,
        ews_url: Url,
    },
}

impl Credentials {
    /// Validates the current set of credentials against the current URL.
    pub async fn validate(&self) -> Result<AuthValidationOutcome, nsresult> {
        let res = match &self {
            // Validation for Basic authentication and OAuth2 is done by
            // performing a request against the current URL with the
            // `Authorization` set to the return value of
            // `to_auth_header_value`, and checking that it does not results in a 401
            // Unauthorized response.
            Credentials::Basic { ews_url, .. } | Credentials::OAuth2 { ews_url, .. } => {
                // Get the value for the `Authorization` header.
                let auth_hdr_value = match self.to_auth_header_value().await {
                    Ok(value) => value,

                    // When using OAuth2, `to_auth_header_value` will return an
                    // authentication error if it's failed to get credentials
                    // even after prompting the user again.
                    Err(XpComEwsError::Authentication) => {
                        return Ok(AuthValidationOutcome::Invalid)
                    }

                    Err(err) => return Err(err.into()),
                };

                // We're in the case where we know we should include an
                // `Authorization` header, so we should fail if we don't have
                // one.
                let auth_hdr_value = auth_hdr_value.ok_or(nserror::NS_ERROR_INVALID_ARG)?;

                let resp = Client::new()
                    .get(ews_url)?
                    .header("Authorization", &auth_hdr_value)
                    .send()
                    .await?;

                match resp.status()?.0 {
                    401 => AuthValidationOutcome::Invalid,
                    _ => AuthValidationOutcome::Valid,
                }
            }

            // Validation for NTLM is is done by performing the full NTLM
            // authentication flow and checking if the final response does not
            // include an error code.
            Credentials::Ntlm {
                username,
                password,
                ews_url,
            } => match ntlm::authenticate(username, password, ews_url).await? {
                NTLMAuthOutcome::Success => AuthValidationOutcome::Valid,
                NTLMAuthOutcome::Failure => AuthValidationOutcome::Invalid,
            },
        };

        Ok(res)
    }

    /// Formats credentials to be used as the value of an HTTP Authorization
    /// header.
    pub async fn to_auth_header_value(&self) -> Result<Option<String>, XpComEwsError> {
        match &self {
            Self::Basic {
                username, password, ..
            } => {
                // Format credentials per the "Basic" authentication scheme. See
                // https://datatracker.ietf.org/doc/html/rfc7617 for details.
                let auth_string = BASE64_STANDARD.encode(format!("{username}:{password}"));

                Ok(Some(format!("Basic {auth_string}")))
            }
            Self::OAuth2 { oauth_module, .. } => {
                // Retrieve a bearer token from the OAuth2 module.
                let listener = OAuthListener::new();
                unsafe { oauth_module.GetAccessToken(listener.coerce()) }.to_result()?;
                let bearer_token = match listener.deref().await {
                    Ok(token) => token,

                    // The OAuth2 module will return `NS_ERROR_ABORT` if it's
                    // failed to get credentials even after prompting the user
                    // again, which qualifies as an authentication error.
                    Err(nserror::NS_ERROR_ABORT) => return Err(XpComEwsError::Authentication),

                    Err(err) => return Err(err.into()),
                };

                Ok(Some(format!("Bearer {bearer_token}")))
            }
            Self::Ntlm { .. } => {
                // The flow for NTLM authentication differs from other methods,
                // in such a way that we don't include an `Authorization` header
                // in EWS requests.
                Ok(None)
            }
        }
    }
}

/// An entity which can provide details to use for authentication.
pub(crate) trait AuthenticationProvider {
    /// Indicates the authentication method to use.
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult>;

    /// Retrieves the username to use if using Basic auth.
    fn username(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the password to use if using Basic auth.
    fn password(&self) -> Result<nsString, nsresult>;

    // Retrieves a string representation of the URL for the server's EWS
    // endpoint.
    fn ews_url(&self) -> Result<String, nsresult>;

    /// Creates and initializes an OAuth2 module.
    ///
    /// `None` is returned if OAuth2 is not supported for the provider's domain.
    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult>;

    /// Retrieves the identifer to use for collecting custom OAuth details for the provider.
    fn oauth_details_identifier(&self) -> Result<nsCString, nsresult>;

    /// Creates an instance of [`Credentials`] from this provider.
    fn get_credentials(&self) -> Result<Credentials, nsresult> {
        let ews_url = self.ews_url()?;
        let ews_url = Url::parse(&ews_url).or(Err(nserror::NS_ERROR_INVALID_ARG))?;

        match self.auth_method()? {
            nsMsgAuthMethod::passwordCleartext => Ok(Credentials::Basic {
                username: self.username()?.to_string(),
                password: self.password()?.to_string(),
                ews_url,
            }),
            nsMsgAuthMethod::OAuth2 => {
                // Get the OAuth details.
                let oauth_details_identifier = self.oauth_details_identifier()?;
                let interop_factory = create_instance::<IEwsLanguageInteropFactory>(cstr!(
                    "@mozilla.org/messenger/ews-interop;1"
                ))
                .ok_or(Err::<RefPtr<IEwsLanguageInteropFactory>, _>(
                    nserror::NS_ERROR_FAILURE,
                ))?;
                let override_details = getter_addrefs(|p| unsafe {
                    interop_factory.CreateOAuth2Details(&*oauth_details_identifier, p)
                })?;

                // Ensure the OAuth2 module indicated it can support this provider.
                match self.oauth2_module(&override_details)? {
                    Some(module) => Ok(Credentials::OAuth2 {
                        oauth_module: module,
                        ews_url,
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
                let ews_url = self.ews_url()?;
                let ews_url = Url::parse(&ews_url).or(Err(nserror::NS_ERROR_INVALID_ARG))?;

                Ok(Credentials::Ntlm {
                    username: self.username()?.to_string(),
                    password: self.password()?.to_string(),
                    ews_url,
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

        unsafe { self.GetAuthMethod(&mut auth_method) }.to_result()?;

        Ok(auth_method)
    }

    fn username(&self) -> Result<nsCString, nsresult> {
        let mut username = nsCString::new();

        unsafe { self.GetUsername(&mut *username) }.to_result()?;

        Ok(username)
    }

    fn password(&self) -> Result<nsString, nsresult> {
        let mut password = nsString::new();

        unsafe { self.GetPassword(&mut *password) }.to_result()?;

        Ok(password)
    }

    fn ews_url(&self) -> Result<String, nsresult> {
        let mut ews_url = nsCString::new();

        unsafe { self.GetStringValue(c"ews_url".as_ptr(), &mut *ews_url) }.to_result()?;

        Ok(ews_url.to_string())
    }

    fn oauth_details_identifier(&self) -> Result<nsCString, nsresult> {
        let mut hostname = nsCString::from("");
        unsafe { self.GetHostName(&mut *hostname) }.to_result()?;
        Ok(hostname)
    }

    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(cstr!("@mozilla.org/mail/oauth2-module;1")).ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe {
            oauth2_module.InitFromMail(self.coerce(), override_details, &mut oauth2_supported)
        }
        .to_result()?;

        let ret = match oauth2_supported {
            true => Some(oauth2_module),
            false => None,
        };

        Ok(ret)
    }
}

impl AuthenticationProvider for nsIMsgOutgoingServer {
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let mut auth_method: nsMsgAuthMethodValue = 0;

        unsafe { self.GetAuthMethod(&mut auth_method) }.to_result()?;

        Ok(auth_method)
    }

    fn username(&self) -> Result<nsCString, nsresult> {
        let mut username = nsCString::new();

        unsafe { self.GetUsername(&mut *username) }.to_result()?;

        Ok(username)
    }

    fn password(&self) -> Result<nsString, nsresult> {
        let mut password = nsCString::new();

        unsafe { self.GetPassword(&mut *password) }.to_result()?;

        let password = password.to_string();
        let password = nsString::from(password.as_str());
        Ok(password)
    }

    fn ews_url(&self) -> Result<String, nsresult> {
        let mut key = nsCString::new();
        unsafe { self.GetKey(&mut *key) }.to_result()?;

        // Build the pref root from the key, if set. The root should be
        // in the format `mail.outgoingserver.ewsX.` - note the trailing
        // period.
        let pref_root = format!("mail.outgoingserver.{}.", key.to_utf8());
        let pref_root = CString::new(pref_root).or(Err(nserror::NS_ERROR_FAILURE))?;

        // Retrieve the branch for our root from the pref service.
        let pref_svc = get_service::<nsIPrefService>(cstr!("@mozilla.org/preferences-service;1"))
            .ok_or(nserror::NS_ERROR_FAILURE)?;

        let pref_branch = getter_addrefs(unsafe { |p| pref_svc.GetBranch(pref_root.as_ptr(), p) })?;

        let mut ews_url = nsCString::new();
        unsafe { pref_branch.GetCharPref(c"ews_url".as_ptr(), &mut *ews_url) }.to_result()?;

        Ok(ews_url.to_string())
    }

    fn oauth_details_identifier(&self) -> Result<nsCString, nsresult> {
        let uri = getter_addrefs(|p| unsafe { self.GetServerURI(p) })?;
        let mut hostname = nsCString::from("");
        unsafe { uri.GetHost(&mut *hostname) }.to_result()?;
        Ok(hostname)
    }

    fn oauth2_module(
        &self,
        override_details: &IOAuth2CustomDetails,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(cstr!("@mozilla.org/mail/oauth2-module;1")).ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe {
            oauth2_module.InitFromOutgoing(self.coerce(), override_details, &mut oauth2_supported)
        }
        .to_result()?;

        Ok(oauth2_supported.then_some(oauth2_module))
    }
}
