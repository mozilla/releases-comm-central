/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use xpcom::{
    get_service,
    interfaces::{
        nsIMsgIncomingServer, nsIMsgOutgoingServer, nsIObserver, nsIPrefBranch, nsIPrefService,
    },
    RefPtr, XpCom,
};

/// A server on which an observer can subscribe to changes.
pub(crate) trait ObservableServer {
    /// Registers an `nsIObserver` to be called when a given property of the
    /// server changes.
    fn observe_property(
        &self,
        pref_name: &str,
        observer: RefPtr<nsIObserver>,
    ) -> Result<(), nsresult>;

    /// Registers an `nsIObserver` to be called on changes to a preference or
    /// branch.
    ///
    /// If `name` ends with a trailing `.`, it refers to a branch, and the
    /// observer is subscribed to any change to a property in that branch.
    fn register_observer(name: String, observer: RefPtr<nsIObserver>) -> Result<(), nsresult> {
        let pref_svc = get_service::<nsIPrefService>(c"@mozilla.org/preferences-service;1")
            .ok_or(nserror::NS_ERROR_FAILURE)?;

        // The underlying implementation of `nsIPrefService` also implements
        // `nsIPrefBranch`. While this relationship isn't strictly specified or
        // explictly documented in the XPIDL files, most JS services rely on it
        // (through e.g. `Services.prefs.get[...]Pref`) so it should be safe to
        // rely on this here too.
        //
        // Using the "root" pref branch here means the consumer does not need to
        // hold on to a reference to an `nsIPrefBranch` instance. This would
        // have been necessary otherwise because independent `nsIPrefBranch`
        // instances clear their observer list upon getting dropped. The one
        // we're getting here is special, because it's actually the preferences
        // service which is always around.
        let pref_branch = pref_svc
            .query_interface::<nsIPrefBranch>()
            .ok_or(nserror::NS_ERROR_FAILURE)?;

        let pref_name = nsCString::from(name);
        unsafe { pref_branch.AddObserverImpl(&*pref_name, observer.coerce(), false) }.to_result()
    }
}

impl ObservableServer for nsIMsgIncomingServer {
    fn observe_property(
        &self,
        pref_name: &str,
        observer: RefPtr<nsIObserver>,
    ) -> Result<(), nsresult> {
        let mut key = nsCString::new();
        unsafe { self.GetKey(&mut *key) }.to_result()?;

        let pref_name = format!("mail.server.{key}.{pref_name}");

        Self::register_observer(pref_name, observer)
    }
}

impl ObservableServer for nsIMsgOutgoingServer {
    fn observe_property(
        &self,
        pref_name: &str,
        observer: RefPtr<nsIObserver>,
    ) -> Result<(), nsresult> {
        let mut key = nsCString::new();
        unsafe { self.GetKey(&mut *key) }.to_result()?;

        let pref_name = format!("mail.outgoingserver.{key}.{pref_name}");

        Self::register_observer(pref_name, observer)
    }
}
