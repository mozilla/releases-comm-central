/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{
    cell::RefCell,
    ffi::{CString, c_char},
    sync::Arc,
};

use mailnews_string_glue::parse_utf16_lossy;
use nserror::{NS_OK, nsresult};
use nsstring::nsCString;
use url::Url;
use xpcom::{
    RefPtr, XpCom,
    interfaces::{nsIObserver, nsIPrefBranch, nsISupports},
    xpcom_method,
};

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
    pub fn new_observer(endpoint: Arc<RefCell<Url>>) -> Result<RefPtr<nsIObserver>, nsresult> {
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
        unsafe { pref_branch.GetCharPref(pref_name.as_ptr(), &mut *new_value) }.to_result()?;

        // Attempt to parse the new value into a `Url`.
        let new_value = new_value.to_string();
        let url = Url::parse(&new_value).map_err(|err| {
            log::error!("failed to parse new EWS URL: {err}");
            nserror::NS_ERROR_UNEXPECTED
        })?;

        // `RefCell::replace` panics if the value is currently being borrowed
        // elsewhere. However, for this reason, `OperationSender` always clones
        // the value of this `RefCell` and never borrows it.
        self.inner.replace(url);

        Ok(())
    }
}
