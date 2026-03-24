/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ffi::c_void;

use nserror::nsresult;
use protocol_shared::outgoing::OutgoingServer;
use xpcom::{interfaces::nsIMsgOutgoingServer, nsIID};

use crate::client::XpComEwsClient;

#[unsafe(no_mangle)]
pub unsafe extern "C" fn nsEwsOutgoingServerConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance_result = OutgoingServer::new(|server| {
        let url = server.endpoint_url()?;

        let outgoing_server = server
            .query_interface::<nsIMsgOutgoingServer>()
            .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        let client = XpComEwsClient::new(url, outgoing_server)?;

        Ok(client)
    });

    match instance_result {
        Ok(instance) => unsafe { instance.QueryInterface(iid, result) },
        Err(rv) => rv,
    }
}
