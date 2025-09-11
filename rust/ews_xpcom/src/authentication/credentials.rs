/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::Deref;

use base64::prelude::*;
use cstr::cstr;

use nserror::nsresult;
use nsstring::{nsCString, nsString};
use thin_vec::ThinVec;
use xpcom::{
    create_instance,
    interfaces::{
        msgIOAuth2Module, nsIMsgIncomingServer, nsIMsgOutgoingServer, nsMsgAuthMethod,
        nsMsgAuthMethodValue,
    },
    RefPtr,
};

use crate::authentication::oauth_listener::OAuthListener;

/// The credentials to use when authenticating against a server.
#[derive(Clone)]
pub(crate) enum Credentials {
    /// The username and password to use for Basic authentication.
    Basic { username: String, password: String },

    /// The XPCOM OAuth2 module to use for negotiating OAuth2 and retrieving an
    /// authentication token.
    OAuth2(RefPtr<msgIOAuth2Module>),
}

impl Credentials {
    /// Formats credentials to be used as the value of an HTTP Authorization
    /// header.
    pub async fn to_auth_header_value(&self) -> Result<String, nsresult> {
        match &self {
            Self::Basic { username, password } => {
                if password.is_empty() {
                    // TODO: Some attempt should be made to ask for a username and password, but
                    // since we don't have one, don't set an Authorization header.
                    Ok(String::new())
                } else {
                    // Format credentials per the "Basic" authentication scheme. See
                    // https://datatracker.ietf.org/doc/html/rfc7617 for details.
                    let auth_string = BASE64_STANDARD.encode(format!("{username}:{password}"));

                    Ok(format!("Basic {auth_string}"))
                }
            }
            Self::OAuth2(oauth_module) => {
                // Retrieve a bearer token from the OAuth2 module.
                let listener = OAuthListener::new();
                unsafe { oauth_module.GetAccessToken(listener.coerce()) }.to_result()?;
                let bearer_token = listener.deref().await?;

                Ok(format!("Bearer {bearer_token}"))
            }
        }
    }
}

pub(crate) struct OAuthOverrides {
    pub application_id: String,
    pub tenant_id: String,
    pub redirect_uri: String,
    pub endpoint_host: String,
    pub scopes: String,
}

impl OAuthOverrides {
    fn to_key_value_pairs(&self) -> Vec<nsCString> {
        let endpoint_host = if !self.endpoint_host.trim().is_empty() {
            &self.endpoint_host
        } else {
            &"login.microsoftonline.com".to_string()
        };
        let auth_endpoint = format!(
            "https://{endpoint_host}/{0}/oauth2/v2.0/authorize",
            self.tenant_id
        );
        let token_endpoint = format!(
            "https://{endpoint_host}/{0}/oauth2/v2.0/token",
            self.tenant_id
        );
        vec![
            nsCString::from("clientId".to_string()),
            nsCString::from(&self.application_id),
            nsCString::from("authorizationEndpoint".to_string()),
            nsCString::from(auth_endpoint),
            nsCString::from("tokenEndpoint".to_string()),
            nsCString::from(token_endpoint),
            nsCString::from("redirectionEndpoint"),
            nsCString::from(&self.redirect_uri),
        ]
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

    /// Creates and initializes an OAuth2 module.
    ///
    /// `None` is returned if OAuth2 is not supported for the provider's domain.
    fn oauth2_module(
        &self,
        override_details: Option<OAuthOverrides>,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult>;

    /// Creates an instance of [`Credentials`] from this provider.
    fn get_credentials(
        &self,
        override_details: Option<OAuthOverrides>,
    ) -> Result<Credentials, nsresult> {
        match self.auth_method()? {
            nsMsgAuthMethod::passwordCleartext => Ok(Credentials::Basic {
                username: self.username()?.to_string(),
                password: self.password()?.to_string(),
            }),
            nsMsgAuthMethod::OAuth2 => {
                // Ensure the OAuth2 module indicated it can support this provider.
                match self.oauth2_module(override_details)? {
                    Some(module) => Ok(Credentials::OAuth2(module)),
                    None => {
                        log::error!(
                            "preferred auth method is set to OAuth2, but it is not supported for this domain"
                        );
                        Err(nserror::NS_ERROR_FAILURE)
                    }
                }
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

    fn oauth2_module(
        &self,
        override_details: Option<OAuthOverrides>,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(cstr!("@mozilla.org/mail/oauth2-module;1")).ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let (issuer, scopes, parameter_override_values) =
            if let Some(ref details) = override_details {
                (
                    nsCString::from(details.endpoint_host.trim()),
                    nsCString::from(details.scopes.trim()),
                    details.to_key_value_pairs(),
                )
            } else {
                (nsCString::new(), nsCString::new(), vec![])
            };

        let parameter_override_values: ThinVec<nsCString> =
            parameter_override_values.into_iter().collect();
        let mut oauth2_supported = false;
        unsafe {
            oauth2_module.InitFromMailWithOptionalOverrides(
                self.coerce(),
                override_details.is_some(),
                &*issuer,
                &*scopes,
                &parameter_override_values,
                &mut oauth2_supported,
            )
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

    fn oauth2_module(
        &self,
        _override_details: Option<OAuthOverrides>,
    ) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(cstr!("@mozilla.org/mail/oauth2-module;1")).ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        // TODO https://bugzilla.mozilla.org/show_bug.cgi?id=1987797 Use the
        // currently unused _override_details parameter to provide OAuth issuer
        // details override values to the OAuth2 module.
        unsafe { oauth2_module.InitFromOutgoing(self.coerce(), &mut oauth2_supported) }
            .to_result()?;

        Ok(oauth2_supported.then_some(oauth2_module))
    }
}
