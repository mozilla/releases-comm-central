/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use thin_vec::thin_vec;

use nserror::nsresult;
use std::ptr;
use xpcom::interfaces::{nsIMsgIncomingServer, nsIObserverService};
use xpcom::{components, RefCounted, RefPtr};

use crate::{
    get_formatted_string, get_string_bundle, register_alert, UserInteractiveServer,
    MESSENGER_STRING_BUNDLE,
};

/// Handle a possible connection error that came from the given
/// [`nsIMsgIncomingServer`].
///
/// If the error matches a known connection error, the user is shown an alert
/// notification/modal. Otherwise, this does nothing.
pub unsafe extern "C" fn maybe_handle_connection_error_from_incoming_server(
    error: nsresult,
    incoming_server: *const nsIMsgIncomingServer,
) -> nsresult {
    if incoming_server.is_null() {
        return nserror::NS_ERROR_NULL_POINTER;
    }

    // SAFETY: We have already ensured the provided pointer isn't null, and the
    // function's call contract implies consumers should ensure it's valid.
    // `RefPtr::from_raw` only returns `None` if the pointer is null, and we
    // have already ensured all of our pointers are non-null, so unwrapping
    // shouldn't panic here.
    let incoming_server = RefPtr::from_raw(incoming_server).unwrap();

    match maybe_handle_connection_error(error, incoming_server) {
        Ok(_) => nserror::NS_OK,
        Err(status) => status,
    }
}

/// Handles an error that might represent a connection error.
///
/// If the error matches a known connection error, the user is shown an alert
/// notification/modal. Otherwise, this does nothing.
pub fn maybe_handle_connection_error<ServerT>(
    error: nsresult,
    server: RefPtr<ServerT>,
) -> Result<(), nsresult>
where
    ServerT: UserInteractiveServer + RefCounted,
{
    // Check if we can map the error to a user-facing message.
    let message_name = match error {
        nserror::NS_ERROR_UNKNOWN_HOST | nserror::NS_ERROR_UNKNOWN_PROXY_HOST => {
            c"unknownHostError"
        }
        nserror::NS_ERROR_CONNECTION_REFUSED | nserror::NS_ERROR_PROXY_CONNECTION_REFUSED => {
            c"connectionRefusedError"
        }
        nserror::NS_ERROR_NET_TIMEOUT => c"netTimeoutError",
        nserror::NS_ERROR_NET_RESET => c"netResetError",
        nserror::NS_ERROR_NET_INTERRUPT => c"netInterruptError",
        nserror::NS_ERROR_NET_ERROR_RESPONSE => c"errorResponseError",

        // We couldn't find a message to show the user, in which case we bail
        // early and let the consumer handle the error as usual.
        _ => return Ok(()),
    };

    let bundle = get_string_bundle(MESSENGER_STRING_BUNDLE)?;

    let name = server.host_name()?;
    let message = get_formatted_string(&bundle, message_name, thin_vec![name])?;

    let uri = server.uri()?;
    register_alert(message, uri)
}

pub fn report_connection_success<ServerT>(server: RefPtr<ServerT>) -> Result<(), nsresult>
where
    ServerT: UserInteractiveServer + RefCounted,
{
    let obs_svc: RefPtr<nsIObserverService> = components::Observer::service()?;
    let uri = server.uri()?;
    unsafe {
        obs_svc
            .NotifyObservers(
                uri.coerce(),
                c"server-connection-succeeded".as_ptr(),
                ptr::null(),
            )
            .to_result()
    }
}
