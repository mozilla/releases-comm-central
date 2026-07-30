/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ffi::CString;

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::{
    RefPtr, XpCom, get_service,
    interfaces::{
        nsIMsgIncomingServer, nsIMsgOutgoingServer, nsIObserver, nsIPrefBranch, nsIPrefService,
    },
};

/// A server which uses prefs to store properties.
pub trait PrefBasedServer {
    /// Registers an [`nsIObserver`] to be called when a given property of the
    /// server changes.
    ///
    /// If `pref_name` ends with a trailing `.`, it refers to a branch, and the
    /// observer is subscribed to any change to a property in that branch.
    fn observe_property(
        &self,
        pref_name: &str,
        observer: RefPtr<nsIObserver>,
    ) -> Result<(), nsresult> {
        let pref_name = self.resolve_full_pref_name(pref_name)?;
        register_observer(pref_name, observer)
    }

    /// Stores the string value of a given property.
    fn set_string_property(&self, pref_name: &str, value: String) -> Result<(), nsresult> {
        let pref_name = self.resolve_full_pref_name(pref_name)?;
        store_string_pref(pref_name, value)
    }

    /// Reads the string value of a given property.
    fn get_string_property(&self, pref_name: &str) -> Result<String, nsresult> {
        let pref_name = self.resolve_full_pref_name(pref_name)?;
        read_string_pref(pref_name)
    }

    /// Maps `pref_name`, which is the name of the property relative to the
    /// server's pref branch, to its full name relative to the root branch.
    ///
    /// For example, this maps "authMethod" to "mail.server.ews1.authMethod".
    fn resolve_full_pref_name(&self, pref_name: &str) -> Result<String, nsresult>;
}

impl PrefBasedServer for nsIMsgIncomingServer {
    fn resolve_full_pref_name(&self, pref_name: &str) -> Result<String, nsresult> {
        let mut key = nsCString::new();
        unsafe { self.GetKey(&raw mut *key) }.to_result()?;

        let pref_name = format!("mail.server.{key}.{pref_name}");
        Ok(pref_name)
    }
}

impl PrefBasedServer for nsIMsgOutgoingServer {
    fn resolve_full_pref_name(&self, pref_name: &str) -> Result<String, nsresult> {
        let mut key: nsCString = nsCString::new();
        unsafe { self.GetKey(&raw mut *key) }.to_result()?;

        let pref_name = format!("mail.outgoingserver.{key}.{pref_name}");
        Ok(pref_name)
    }
}

/// Gets the root pref branch.
fn root_pref_branch() -> Result<RefPtr<nsIPrefBranch>, nsresult> {
    let pref_svc = get_service::<nsIPrefService>(c"@mozilla.org/preferences-service;1")
        .ok_or(nserror::NS_ERROR_FAILURE)?;

    // The underlying implementation of `nsIPrefService` also implements
    // `nsIPrefBranch`. While this relationship isn't strictly specified or
    // explictly documented in the XPIDL files, most JS services rely on it
    // (through e.g. `Services.prefs.get[...]Pref`) so it should be safe to
    // rely on this here too.
    pref_svc
        .query_interface::<nsIPrefBranch>()
        .ok_or(nserror::NS_ERROR_FAILURE)
}

/// Stores the given string value for a given pref.
///
/// [`NS_ERROR_ILLEGAL_VALUE`] is returned if the pref name is 0-terminated.
/// Other errors might be returned if e.g. the pref is already set with a type
/// that isn't string.
///
/// [`NS_ERROR_ILLEGAL_VALUE`]: nserror::NS_ERROR_ILLEGAL_VALUE
fn store_string_pref(full_name: String, value: String) -> Result<(), nsresult> {
    log::debug!("Storing string pref: {full_name} => {value}");

    let pref_branch = root_pref_branch()?;

    let full_name = CString::new(full_name.clone()).map_err(|_| {
        log::error!("unexpected 0 byte in pref name: {full_name}");
        nserror::NS_ERROR_ILLEGAL_VALUE
    })?;
    let value = nsCString::from(value);

    unsafe { pref_branch.SetStringPref(full_name.as_ptr(), &raw const *value) }.to_result()
}

/// Reads the value of the given pref as a string.
///
/// [`NS_ERROR_ILLEGAL_VALUE`] is returned if the pref name is 0-terminated.
/// Other errors might be returned if e.g. the pref's type isn't string.
///
/// [`NS_ERROR_ILLEGAL_VALUE`]: nserror::NS_ERROR_ILLEGAL_VALUE
fn read_string_pref(full_name: String) -> Result<String, nsresult> {
    let pref_branch = root_pref_branch()?;

    let full_name = CString::new(full_name.clone()).map_err(|_| {
        log::error!("unexpected 0 byte in pref name: {full_name}");
        nserror::NS_ERROR_ILLEGAL_VALUE
    })?;
    let mut value = nsCString::new();

    match unsafe { pref_branch.GetCharPref(full_name.as_ptr(), &raw mut *value) }.to_result() {
        Ok(_) => (),
        Err(rv) => {
            return match rv {
                // `GetCharPref` returns `NS_ERROR_UNEXPECTED` if the pref does
                // not have a value.
                nserror::NS_ERROR_UNEXPECTED => Ok(String::new()),
                _ => Err(rv),
            };
        }
    }

    log::debug!(
        "Read string pref: {} => {value}",
        full_name.to_string_lossy()
    );

    Ok(value.to_string())
}

/// Registers an `nsIObserver` to be called on changes to a preference or
/// branch.
///
/// If `name` ends with a trailing `.`, it refers to a branch, and the observer
/// is subscribed to any change to a property in that branch.
fn register_observer(name: String, observer: RefPtr<nsIObserver>) -> Result<(), nsresult> {
    // Using the "root" pref branch here means the consumer does not need to
    // hold on to a reference to an `nsIPrefBranch` instance. This would have
    // been necessary otherwise because independent `nsIPrefBranch` instances
    // clear their observer list upon getting dropped. The one we're getting
    // here is special, because it's actually the preferences service which is
    // always around.
    let pref_branch = root_pref_branch()?;

    let pref_name = nsCString::from(name);
    unsafe { pref_branch.AddObserverImpl(&raw const *pref_name, observer.coerce(), false) }
        .to_result()
}
