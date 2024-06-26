/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::Deref;

use base64::prelude::*;
use cstr::cstr;

use nserror::nsresult;
use nsstring::{nsCString, nsString};
use xpcom::{
    create_instance,
    interfaces::{msgIOAuth2Module, nsIMsgIncomingServer, nsMsgAuthMethod, nsMsgAuthMethodValue},
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
                // Format credentials per the "Basic" authentication scheme. See
                // https://datatracker.ietf.org/doc/html/rfc7617 for details.
                let auth_string = BASE64_STANDARD.encode(format!("{username}:{password}"));

                Ok(format!("Basic {auth_string}"))
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

/// An entity which can provide details to use for authentication.
pub(crate) trait AuthenticationProvider {
    /// Indicates the authentication method to use.
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult>;

    /// Retrieves the username to use if using Basic auth.
    fn username(&self) -> Result<nsCString, nsresult>;

    /// Retrieves the password to use if using Basic auth.
    fn password(&self) -> Result<nsCString, nsresult>;

    /// Creates and initializes an OAuth2 module.
    ///
    /// `None` is returned if OAuth2 is not supported for the provider's domain.
    fn oauth2_module(&self) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult>;

    /// Creates an instance of [`Credentials`] from this provider.
    fn get_credentials(&self) -> Result<Credentials, nsresult> {
        match self.auth_method()? {
            nsMsgAuthMethod::passwordCleartext => Ok(Credentials::Basic {
                username: self.username()?.to_utf8().into(),
                password: self.password()?.to_utf8().into(),
            }),
            nsMsgAuthMethod::OAuth2 => {
                // Ensure the OAuth2 module indicated it can support this provider.
                match self.oauth2_module()? {
                    Some(module) => Ok(Credentials::OAuth2(module)),
                    None => {
                        log::error!(
                            "preferred auth method is set to OAuth2, but it is not supported for this domain"
                        );
                        return Err(nserror::NS_ERROR_FAILURE);
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

impl AuthenticationProvider for &nsIMsgIncomingServer {
    fn username(&self) -> Result<nsCString, nsresult> {
        let mut username = nsCString::new();

        unsafe { self.GetUsername(&mut *username) }.to_result()?;

        Ok(username)
    }

    fn password(&self) -> Result<nsCString, nsresult> {
        let mut buf = nsString::new();

        unsafe { self.GetPassword(&mut *buf) }.to_result()?;

        // nsIMsgIncomingServer::password is an nsAString (and not an
        // nsACString) because we have a hot crush on inconsistency.
        let mut password = nsCString::new();
        password.assign_utf16_to_utf8(buf.as_ref());

        Ok(password)
    }

    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let mut auth_method: nsMsgAuthMethodValue = 0;

        unsafe { self.GetAuthMethod(&mut auth_method) }.to_result()?;

        Ok(auth_method)
    }

    fn oauth2_module(&self) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(cstr!("@mozilla.org/mail/oauth2-module;1")).ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe { oauth2_module.InitFromMail(self.coerce(), &mut oauth2_supported) }.to_result()?;

        let ret = match oauth2_supported {
            true => Some(oauth2_module),
            false => None,
        };

        Ok(ret)
    }
}
