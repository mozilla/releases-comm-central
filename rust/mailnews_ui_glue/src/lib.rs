/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ffi::CStr;

use nserror::nsresult;
use nsstring::nsString;
use thin_vec::ThinVec;
use xpcom::interfaces::{nsIMsgMailSession, nsIStringBundle, nsIStringBundleService, nsIURI};
use xpcom::{RefPtr, get_service, getter_addrefs};

mod authentication_alerts;
mod connection_alerts;
mod transport_sec_alerts;
mod user_interactive_server;

pub use authentication_alerts::*;
pub use connection_alerts::*;
pub use transport_sec_alerts::*;
pub use user_interactive_server::*;

const IMAP_MSG_STRING_BUNDLE: &CStr = c"chrome://messenger/locale/imapMsgs.properties";
const MESSENGER_STRING_BUNDLE: &CStr = c"chrome://messenger/locale/messenger.properties";

/// Get the [`nsIStringBundle`] at the given URL.
fn get_string_bundle(bundle_url: &CStr) -> Result<RefPtr<nsIStringBundle>, nsresult> {
    let bundle_service = get_service::<nsIStringBundleService>(c"@mozilla.org/intl/stringbundle;1")
        .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

    let bundle =
        getter_addrefs(|p| unsafe { bundle_service.CreateBundle(bundle_url.as_ptr(), p) })?;

    Ok(bundle)
}

/// Use the provided [`nsIStringBundle`] to retrieve the string with the given
/// name.
///
/// This function does not take parameters to format the string with, for
/// parameterized strings see [`get_formatted_string`].
fn get_string(bundle: &RefPtr<nsIStringBundle>, string_name: &CStr) -> Result<String, nsresult> {
    let mut message = nsString::new();
    unsafe { bundle.GetStringFromName(string_name.as_ptr(), &raw mut *message) }.to_result()?;

    Ok(message.to_string())
}

/// Use the provided [`nsIStringBundle`] to retrieve the string with the given
/// name, and to replace placeholders with the given parameters.
fn get_formatted_string(
    bundle: &RefPtr<nsIStringBundle>,
    string_name: &CStr,
    params: ThinVec<String>,
) -> Result<String, nsresult> {
    let params: ThinVec<nsString> = params
        .into_iter()
        .map(|param| nsString::from(param.as_str()))
        .collect();

    let mut message = nsString::new();
    unsafe {
        bundle.FormatStringFromName(string_name.as_ptr(), &raw const params, &raw mut *message)
    }
    .to_result()?;

    Ok(message.to_string())
}

/// Whether to raise a notification to the user level or silently handle errors.
#[repr(C)]
pub enum ErrorBehavior {
    Notify,
    Silent,
}

/// Register an alert with the given message associated with the given URI.
///
/// The `behavior` parameter specifies whether the alert should be presented to
/// the user or not.
pub fn register_alert(
    message: String,
    uri: RefPtr<nsIURI>,
    behavior: ErrorBehavior,
) -> Result<(), nsresult> {
    let mail_session =
        get_service::<nsIMsgMailSession>(c"@mozilla.org/messenger/services/session;1")
            .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

    let silent = match behavior {
        ErrorBehavior::Notify => false,
        ErrorBehavior::Silent => true,
    };

    let message = nsString::from(&message);
    unsafe { mail_session.AlertUser(&raw const *message, &raw const *uri, silent) }.to_result()?;

    Ok(())
}
