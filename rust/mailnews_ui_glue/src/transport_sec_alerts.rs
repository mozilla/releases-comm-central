/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use xpcom::interfaces::{nsIMsgIncomingServer, nsIMsgMailSession, nsITransportSecurityInfo};
use xpcom::{get_service, RefCounted, RefPtr};

use crate::UserInteractiveServer;

/// Handle a transport security failure (e.g. bad certificate) that came from
/// the given [`nsIMsgIncomingServer`].
pub unsafe extern "C" fn handle_transport_sec_failure_from_incoming_server(
    incoming_server: *const nsIMsgIncomingServer,
    transport_sec_info: *const nsITransportSecurityInfo,
) -> nsresult {
    if incoming_server.is_null() || transport_sec_info.is_null() {
        return nserror::NS_ERROR_NULL_POINTER;
    }

    // SAFETY: We have already ensured the provided pointers aren't null, and
    // the function's call contract implies consumers should ensure they're
    // valid. `RefPtr::from_raw` only returns `None` if the pointer is null, and
    // we have already ensured all of our pointers are non-null, so unwrapping
    // shouldn't panic here.
    let incoming_server = RefPtr::from_raw(incoming_server).unwrap();
    let transport_sec_info = RefPtr::from_raw(transport_sec_info).unwrap();

    match handle_transport_sec_failure(incoming_server, transport_sec_info) {
        Ok(_) => nserror::NS_OK,
        Err(status) => status,
    }
}

/// Handles a transport security failure by showing an error to the user
/// informing them about an issue with the server's certificate.
pub fn handle_transport_sec_failure<ServerT>(
    server: RefPtr<ServerT>,
    sec_info: RefPtr<nsITransportSecurityInfo>,
) -> Result<(), nsresult>
where
    ServerT: UserInteractiveServer + RefCounted,
{
    let uri = server.uri()?;

    let mail_session =
        get_service::<nsIMsgMailSession>(c"@mozilla.org/messenger/services/session;1")
            .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

    unsafe { mail_session.AlertCertError(sec_info.coerce(), uri.coerce()) }.to_result()
}
