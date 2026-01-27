/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ptr;

use nserror::nsresult;
use nsstring::{nsCString, nsString};
use xpcom::interfaces::{
    nsIIOService, nsIMsgIncomingServer, nsIMsgOutgoingServer, nsIURI, nsMsgAuthMethod,
    nsMsgAuthMethodValue,
};
use xpcom::{RefPtr, getter_addrefs};

/// The outcome of a password prompt.
pub enum PasswordPromptResult {
    /// The user has cancelled the prompt.
    Cancelled,

    /// The user has answered the prompt with a new password. Note the new
    /// password might be the same as the previous one, this just means the user
    /// has not cancelled the prompt.
    NewPassword,
}

/// A server capable of prompting the user for a password.
pub trait UserInteractiveServer {
    /// Get the server's authentication method.
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult>;

    /// Get the server's parsed URI.
    fn uri(&self) -> Result<RefPtr<nsIURI>, nsresult>;

    /// Get the server's display name.
    fn display_name(&self) -> Result<String, nsresult>;

    /// Get the server's host name.
    fn host_name(&self) -> Result<String, nsresult>;

    /// Get the username of the relevant account on the server.
    fn username(&self) -> Result<String, nsresult>;

    /// Get the password of the relevant account on the server. This might be an
    /// empty string if the server's authentication method isn't password-based.
    fn password(&self) -> Result<String, nsresult>;

    /// Forget the password associated with the relevant account on the server.
    fn forget_password(&self) -> Result<(), nsresult>;

    /// Prompt the user to enter a new password for the relevant account on the
    /// server.
    ///
    /// The prompt is shown to the user with the given title and message, and
    /// the password field is pre-filled with the provided previous password for
    /// the account (though obscured).
    fn prompt_for_password(
        &self,
        message: String,
        title: String,
        old_password: String,
    ) -> Result<PasswordPromptResult, nsresult>;
}

impl UserInteractiveServer for nsIMsgIncomingServer {
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let mut auth_method = nsMsgAuthMethod::none;
        unsafe { self.GetAuthMethod(&mut auth_method) }.to_result()?;
        Ok(auth_method)
    }

    fn uri(&self) -> Result<RefPtr<nsIURI>, nsresult> {
        let mut uri = nsCString::new();
        unsafe { self.GetServerURI(&mut *uri) }.to_result()?;

        let io_service = xpcom::get_service::<nsIIOService>(c"@mozilla.org/network/io-service;1")
            .ok_or(nserror::NS_ERROR_FAILURE)?;

        getter_addrefs(|p| unsafe { io_service.NewURI(&*uri, ptr::null(), ptr::null(), p) })
    }

    fn display_name(&self) -> Result<String, nsresult> {
        let mut display_name = nsCString::new();
        unsafe { self.GetPrettyName(&mut *display_name) }.to_result()?;
        Ok(display_name.to_string())
    }

    fn host_name(&self) -> Result<String, nsresult> {
        let mut host_name = nsCString::new();
        unsafe { self.GetHostName(&mut *host_name) }.to_result()?;
        Ok(host_name.to_string())
    }

    fn username(&self) -> Result<String, nsresult> {
        let mut username = nsCString::new();
        unsafe { self.GetUsername(&mut *username) }.to_result()?;
        Ok(username.to_string())
    }

    fn password(&self) -> Result<String, nsresult> {
        let mut password = nsString::new();
        unsafe { self.GetPassword(&mut *password) }.to_result()?;
        Ok(password.to_string())
    }

    fn forget_password(&self) -> Result<(), nsresult> {
        unsafe { self.ForgetPassword() }.to_result()
    }

    fn prompt_for_password(
        &self,
        message: String,
        title: String,
        old_password: String,
    ) -> Result<PasswordPromptResult, nsresult> {
        let message = nsString::from(&message);
        let title = nsString::from(&title);
        let mut old_password = nsString::from(&old_password);

        // Get the `nsresult` without turning it into a `Result` just yet. We
        // need it to compare it to `NS_MSG_PASSWORD_PROMPT_CANCELLED`, which is
        // a success.
        let status = unsafe { self.GetPasswordWithUI(&*message, &*title, &mut *old_password) };

        // Bail now if the status is an error. `nsresult` implements `Copy`, so
        // we don't need to clone despite `to_result()` taking ownership.
        status.to_result()?;

        let res = if status == nserror::NS_MSG_PASSWORD_PROMPT_CANCELLED {
            PasswordPromptResult::Cancelled
        } else {
            PasswordPromptResult::NewPassword
        };

        Ok(res)
    }
}

impl UserInteractiveServer for nsIMsgOutgoingServer {
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let mut auth_method = nsMsgAuthMethod::none;
        unsafe { self.GetAuthMethod(&mut auth_method) }.to_result()?;
        Ok(auth_method)
    }

    fn uri(&self) -> Result<RefPtr<nsIURI>, nsresult> {
        getter_addrefs(|p| unsafe { self.GetServerURI(p) })
    }

    fn display_name(&self) -> Result<String, nsresult> {
        let mut display_name = nsCString::new();
        unsafe { self.GetDisplayname(&mut *display_name) }.to_result()?;
        Ok(display_name.to_string())
    }

    fn host_name(&self) -> Result<String, nsresult> {
        let uri = getter_addrefs(|p| unsafe { self.GetServerURI(p) })?;
        let mut host_name = nsCString::new();
        unsafe { uri.GetHost(&mut *host_name) }.to_result()?;
        Ok(host_name.to_string())
    }

    fn username(&self) -> Result<String, nsresult> {
        let mut username = nsCString::new();
        unsafe { self.GetUsername(&mut *username) }.to_result()?;
        Ok(username.to_string())
    }

    fn password(&self) -> Result<String, nsresult> {
        let mut password = nsCString::new();
        unsafe { self.GetPassword(&mut *password) }.to_result()?;
        Ok(password.to_string())
    }

    fn forget_password(&self) -> Result<(), nsresult> {
        unsafe { self.ForgetPassword() }.to_result()
    }

    fn prompt_for_password(
        &self,
        message: String,
        title: String,
        current_password: String,
    ) -> Result<PasswordPromptResult, nsresult> {
        let message = nsCString::from(&message);
        let title = nsCString::from(&title);
        let mut old_password = nsCString::from(&current_password);

        // Get the `nsresult` without turning it into a `Result` just yet. We
        // need it to compare it to `NS_MSG_PASSWORD_PROMPT_CANCELLED`, which is
        // a success.
        let status = unsafe { self.GetPasswordWithUI(&*message, &*title, &mut *old_password) };

        // Bail now if the status is an error. `nsresult` implements `Copy`, so
        // we don't need to clone despite `to_result()` taking ownership.
        status.to_result()?;

        let res = if status == nserror::NS_MSG_PASSWORD_PROMPT_CANCELLED {
            PasswordPromptResult::Cancelled
        } else {
            PasswordPromptResult::NewPassword
        };

        Ok(res)
    }
}
