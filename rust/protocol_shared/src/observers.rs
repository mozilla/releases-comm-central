/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{
    cell::RefCell,
    ffi::{CString, c_char},
    sync::Arc,
};

use mailnews_string_glue::{parse_utf8_lossy, parse_utf16_lossy};
use nserror::{NS_OK, nsresult};
use nsstring::{nsCString, nsString};
use url::Url;
use xpcom::{
    RefCounted, RefPtr, XpCom, components,
    interfaces::{nsILoginInfo, nsIObserver, nsIObserverService, nsIPrefBranch, nsISupports},
    xpcom_method,
};

use crate::{
    authentication::authentication_provider::AuthenticationProvider, client::ProtocolClient,
    operation_sender::pref_based_server::PrefBasedServer,
};

pub(crate) const OBSERVER_TOPIC_PREF: &str = "nsPref:changed";
pub(crate) const OBSERVER_TOPIC_PASSWORDMGR: &str = "passwordmgr-storage-changed";
pub(crate) const OBSERVER_TOPIC_SMTPSERVER_REMOVED: &str = "message-smtpserver-removed";

/// An observer that subscribes to notification of outgoing server removal, and
/// shuts down the configured client if the removal is for the configured key.
#[xpcom::xpcom(implement(nsIObserver), atomic)]
pub(crate) struct OutgoingRemovalObserver<ClientT: ProtocolClient + 'static> {
    client: Arc<ClientT>,
    key: String,
}

impl<ClientT: ProtocolClient + 'static> OutgoingRemovalObserver<ClientT> {
    /// Creates a new [`OutgoingRemovalObserver`], and converts it into the more generic
    /// type [`nsIObserver`] before returning.
    pub(crate) fn new_observer(
        client: Arc<ClientT>,
        key: String,
    ) -> Result<RefPtr<nsIObserver>, nsresult> {
        let obs = OutgoingRemovalObserver::allocate(InitOutgoingRemovalObserver { client, key });

        obs.query_interface::<nsIObserver>()
            .ok_or(nserror::NS_ERROR_UNEXPECTED)
    }

    xpcom_method!(observe => Observe(aSubject: *const nsISupports, aTopic: *const c_char, aData: *const u16));
    fn observe(
        &self,
        _subject: &nsISupports,
        topic: *const c_char,
        data: *const u16,
    ) -> Result<(), nsresult> {
        // SAFETY: From manual testing, it looks like XPCOM ensures strings are
        // null-terminated regardless of their origin.
        let (topic, data) = unsafe { (parse_utf8_lossy(topic), parse_utf16_lossy(data)) };

        if topic == OBSERVER_TOPIC_SMTPSERVER_REMOVED && data == self.key {
            moz_task::spawn_local("shutdown", self.client.clone().shutdown()).detach();

            // Unwrapping should be fine since we're using a known string here.
            let topic = CString::new(OBSERVER_TOPIC_SMTPSERVER_REMOVED).unwrap();

            // Our job here is done, remove ourselves from the observer service
            // so we can get dropped and return to nothingness.
            let observer_service = components::Observer::service::<nsIObserverService>()?;
            unsafe { observer_service.RemoveObserver(self.coerce(), topic.as_ptr()) }
                .to_result()?;
        }

        Ok(())
    }
}

/// An observer which can get subscribed to changes to a preference containing
/// an URL.
///
/// Upon the preference value changing, the preference's new value is parsed as
/// a URL and the inner [`RefCell<Url>`] is updated to contain the resulting
/// value.
#[xpcom::xpcom(implement(nsIObserver), atomic)]
pub(crate) struct UrlPrefObserver {
    inner: Arc<RefCell<Url>>,
}

impl UrlPrefObserver {
    /// Creates a new [`UrlPrefObserver`], and converts it into the more generic
    /// type [`nsIObserver`] before returning.
    pub(crate) fn new_observer(
        endpoint: Arc<RefCell<Url>>,
    ) -> Result<RefPtr<nsIObserver>, nsresult> {
        let obs = UrlPrefObserver::allocate(InitUrlPrefObserver { inner: endpoint });

        obs.query_interface::<nsIObserver>()
            .ok_or(nserror::NS_ERROR_UNEXPECTED)
    }

    xpcom_method!(observe => Observe(aSubject: *const nsISupports, aTopic: *const c_char, aData: *const u16));
    fn observe(
        &self,
        subject: &nsISupports,
        _topic: *const c_char,
        data: *const u16,
    ) -> Result<(), nsresult> {
        // SAFETY: From manual testing, it looks like XPCOM ensures strings are
        // null-terminated regardless of their origin. Additionally, the
        // observer is expected to only be registered against the preferences
        // service, which is implemented in C++.
        let pref_name = unsafe { parse_utf16_lossy(data) };
        let pref_name = CString::new(pref_name).or(Err(nserror::NS_ERROR_INVALID_ARG))?;

        // As per the call contract of `nsIPrefBranch::AddObserverImpl`, which
        // is used to register this observer, `subject` should be the
        // `nsIPrefBranch` that was used to create the subscription.
        let pref_branch = subject
            .query_interface::<nsIPrefBranch>()
            .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        let mut new_value = nsCString::new();
        unsafe { pref_branch.GetCharPref(pref_name.as_ptr(), &raw mut *new_value) }.to_result()?;

        // Attempt to parse the new value into a `Url`.
        let new_value = new_value.to_string();
        let url = Url::parse(&new_value).map_err(|err| {
            log::error!("failed to parse new base URL: {err}");
            nserror::NS_ERROR_UNEXPECTED
        })?;

        // `RefCell::replace` panics if the value is currently being borrowed
        // elsewhere. However, for this reason, `OperationSender` always clones
        // the value of this `RefCell` and never borrows it.
        self.inner.replace(url);

        Ok(())
    }
}

/// What action to perform when the [`HttpAuthObserver`] gets notified.
enum AuthChangeAction {
    /// Refresh the auth cache entry for the current server.
    Refresh,

    /// Ignore the notification.
    Ignore,
}

/// An observer implementation that observes changes to the current server's
/// authentication settings.
///
/// When such a change happens, the observer updates Necko's auth cache, if the
/// server's current authentication method is one we delegate to Necko. If it
/// isn't, the observer doesn't do anything.
///
/// Note that we still want to register the observer even if the server's
/// initial authentication method isn't one we delegate to Necko, in case that
/// changes later on.
#[xpcom::xpcom(implement(nsIObserver), atomic)]
pub(crate) struct HttpAuthObserver<
    ServerT: AuthenticationProvider + PrefBasedServer + RefCounted + 'static,
> {
    server: RefPtr<ServerT>,
}

impl<ServerT: AuthenticationProvider + PrefBasedServer + RefCounted> HttpAuthObserver<ServerT> {
    pub(crate) fn new_observer(server: RefPtr<ServerT>) -> Result<RefPtr<nsIObserver>, nsresult> {
        let obs = HttpAuthObserver::allocate(InitHttpAuthObserver { server });
        obs.query_interface::<nsIObserver>()
            .ok_or(nserror::NS_ERROR_UNEXPECTED)
    }

    xpcom_method!(observe => Observe(aSubject: *const nsISupports, aTopic: *const c_char, aData: *const u16));
    fn observe(
        &self,
        subject: &nsISupports,
        topic: *const c_char,
        data: *const u16,
    ) -> Result<(), nsresult> {
        // SAFETY: From manual testing, it looks like XPCOM ensures strings are
        // null-terminated regardless of their origin.
        let (topic, data) = unsafe { (parse_utf8_lossy(topic), parse_utf16_lossy(data)) };

        // Figure out what to do with this update. We want to refresh the auth
        // cache if the change is either about:
        //  * a login being added to the password/logins manager or changed,
        //    which matches the current server's settings, or
        //  * a property/pref for the current server that's relevant to auth
        //    being changed and the update matches the settings of the current
        //    server.
        let action = match topic.as_str() {
            OBSERVER_TOPIC_PASSWORDMGR => match data.as_str() {
                // TODO: We currently only support `addLogin` and `modifyLogin`
                // updates. Login removal is handled separately, see
                // https://bugzilla.mozilla.org/show_bug.cgi?id=2067736
                "addLogin" | "modifyLogin" => {
                    let login_info: RefPtr<nsILoginInfo> = subject
                        .query_interface()
                        .ok_or(nserror::NS_ERROR_INVALID_ARG)?;

                    self.action_from_login_info(login_info)?
                }
                _ => AuthChangeAction::Ignore,
            },
            // Considering the observer should have been registered to only
            // watch auth-related prefs for our server, a pref-related event
            // should mean we want to refresh the cache.
            OBSERVER_TOPIC_PREF => AuthChangeAction::Refresh,
            _ => AuthChangeAction::Ignore,
        };

        match action {
            AuthChangeAction::Refresh => self.server.maybe_set_necko_auth_cache(),
            AuthChangeAction::Ignore => Ok(()),
        }
    }

    /// Determine what to do about an login addition or change.
    ///
    /// This method compares the data from the provided [`nsILoginInfo`] with
    /// the current server to figure out whether the login being added or
    /// changed is for us.
    fn action_from_login_info(
        &self,
        login_info: RefPtr<nsILoginInfo>,
    ) -> Result<AuthChangeAction, nsresult> {
        let mut origin = nsString::new();
        unsafe { login_info.GetOrigin(&raw mut *origin) }.to_result()?;

        let origin = origin.to_string();
        let origin = Url::parse(&origin).map_err(|_| nserror::NS_ERROR_INVALID_ARG)?;

        let mut username = nsString::new();
        unsafe { login_info.GetUsername(&raw mut *username) }.to_result()?;
        let username = username.to_string();

        let hostname = origin
            .host()
            .ok_or(nserror::NS_ERROR_INVALID_ARG)?
            .to_string();

        let type_matches = self.server.server_type()? == origin.scheme();
        let hostname_matches = hostname == self.server.hostname()?.to_string();
        let username_matches = username == self.server.username()?.to_string();

        let action = if type_matches && hostname_matches && username_matches {
            AuthChangeAction::Refresh
        } else {
            AuthChangeAction::Ignore
        };

        Ok(action)
    }
}
