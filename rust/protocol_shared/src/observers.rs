/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{ffi::c_char, sync::Arc};

use mailnews_string_glue::{parse_utf8_lossy, parse_utf16_lossy};
use nserror::{NS_OK, nsresult};
use xpcom::{
    RefPtr, components,
    interfaces::{nsIObserver, nsIObserverService, nsISupports},
    xpcom_method,
};

use crate::client::ProtocolClient;

/// An observer that subscribes to notification of outgoing server removal, and
/// shuts down the configured client if the removal is for the configured key.
#[xpcom::xpcom(implement(nsIObserver), atomic)]
pub(super) struct OutgoingRemovalObserver<ClientT: ProtocolClient + 'static> {
    client: Arc<ClientT>,
    key: String,
}

impl<ClientT: ProtocolClient + 'static> OutgoingRemovalObserver<ClientT> {
    /// Creates a new [`OutgoingRemovalObserver`], and converts it into the more generic
    /// type [`nsIObserver`] before returning.
    pub fn new_observer(
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

        if topic == "message-smtpserver-removed" && data == self.key {
            moz_task::spawn_local("shutdown", self.client.clone().shutdown()).detach();

            // Our job here is done, remove ourselves from the observer service
            // so we can get dropped and return to nothingness.
            let observer_service = components::Observer::service::<nsIObserverService>()?;
            unsafe {
                observer_service
                    .RemoveObserver(self.coerce(), c"message-smtpserver-removed".as_ptr())
            }
            .to_result()?;
        }

        Ok(())
    }
}
