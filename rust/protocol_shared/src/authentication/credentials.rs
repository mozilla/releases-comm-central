/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::Deref;

use base64::prelude::*;
use cstr::cstr;

use moz_http::{Client, Response};
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
    authentication::{ntlm, oauth_listener::OAuthListener},
    error::ProtocolError,
    operation_sender::send_request::{OperationRequest, send_request},
};

/// The credentials to use when authenticating against a server.
#[derive(Clone)]
pub enum Credentials {
    /// The username and password to use for Basic authentication.
    Basic {
        username: String,
        password: String,
    },

    /// The XPCOM OAuth2 module to use for negotiating OAuth2 and retrieving an
    /// authentication token.
    OAuth2 {
        oauth_module: RefPtr<msgIOAuth2Module>,
    },

    // The username and password to use for NTLM authentication.
    Ntlm {
        username: String,
        password: String,
    },
}

impl Credentials {
    /// Validates the current set of credentials against the current request.
    ///
    /// This involves performing the request again with the current credentials.
    /// This method is expected to be used after asking the user for new
    /// credentials (if relevant).
    ///
    /// If authentication succeeded, the success response is returned, otherwise
    /// [`ProtocolError::Authentication`] is used to indicate an authentication
    /// failure. In this context, an authentication failure is any response with
    /// a 401 status code.
    pub(crate) async fn validate<'or>(
        &self,
        op_request: &OperationRequest<'or>,
    ) -> Result<Response, ProtocolError> {
        let resp = match &self {
            // Validation for Basic authentication and OAuth2 is done by
            // performing the request again with the `Authorization` set to the
            // return value of `to_auth_header_value`, and checking that it does
            // not result in a 401 Unauthorized response.
            Credentials::Basic { .. } | Credentials::OAuth2 { .. } => {
                // Get the value for the `Authorization` header.
                let auth_hdr_value = match self.to_auth_header_value().await {
                    Ok(value) => value,

                    // When using OAuth2, `to_auth_header_value()` returns
                    // `ProtocolError::Authentication` if it failed to get an
                    // authentication token after running its auth flow, and we
                    // propagate it here.
                    Err(err) => return Err(err),
                };

                // We're in the case where we know we should include an
                // `Authorization` header, so we should fail if we don't have
                // one.
                let auth_hdr_value = auth_hdr_value.ok_or(nserror::NS_ERROR_INVALID_ARG)?;

                let resp = send_request(&Client::new(), op_request, Some(auth_hdr_value)).await?;

                if resp.status()?.0 == 401 {
                    return Err(ProtocolError::Authentication);
                }

                resp
            }

            // Validation for NTLM is is done by performing the full NTLM
            // authentication flow and checking if we managed to get a 200
            // response at the end of it.
            Credentials::Ntlm { username, password } => {
                ntlm::authenticate(username, password, op_request).await?
            }
        };

        Ok(resp)
    }

    /// Formats credentials to be used as the value of an HTTP Authorization
    /// header.
    pub async fn to_auth_header_value(&self) -> Result<Option<String>, ProtocolError> {
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
                    Err(nserror::NS_ERROR_ABORT) => return Err(ProtocolError::Authentication),

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
pub trait AuthenticationProvider {
    /// Indicates the authentication method to use.
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult>;

    /// Retrieves the username to use if using Basic auth.
    fn username(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the password to use if using Basic auth.
    fn password(&self) -> Result<nsString, nsresult>;

    /// Retrieves the server's type string.
    fn server_type(&self) -> Result<nsCString, nsresult>;

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
        match self.auth_method()? {
            nsMsgAuthMethod::passwordCleartext => Ok(Credentials::Basic {
                username: self.username()?.to_string(),
                password: self.password()?.to_string(),
            }),
            nsMsgAuthMethod::OAuth2 => {
                // Get the OAuth details.
                let server_type = self.server_type()?;
                let oauth_details_identifier = self.oauth_details_identifier()?;
                let interop_factory = create_instance::<IExchangeLanguageInteropFactory>(cstr!(
                    "@mozilla.org/messenger/exchange-interop;1"
                ))
                .ok_or(Err::<RefPtr<IExchangeLanguageInteropFactory>, _>(
                    nserror::NS_ERROR_FAILURE,
                ))?;
                let override_details = getter_addrefs(|p| unsafe {
                    interop_factory.CreateOAuth2Details(
                        &raw const *server_type,
                        &raw const *oauth_details_identifier,
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
            nsMsgAuthMethod::NTLM => Ok(Credentials::Ntlm {
                username: self.username()?.to_string(),
                password: self.password()?.to_string(),
            }),
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

    fn oauth_details_identifier(&self) -> Result<nsCString, nsresult> {
        let mut hostname = nsCString::from("");
        unsafe { self.GetHostname(&raw mut *hostname) }.to_result()?;
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

    fn oauth_details_identifier(&self) -> Result<nsCString, nsresult> {
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
            create_instance::<msgIOAuth2Module>(cstr!("@mozilla.org/mail/oauth2-module;1")).ok_or(
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
