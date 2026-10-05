/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ffi::c_void;

use firefox_on_glean::metrics::mailnews_graph as glean_graph;
use nserror::{NS_OK, nsresult};
use nsstring::nsACString;
use xpcom::{nsIID, xpcom_method};

#[allow(non_snake_case)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn NS_CreateGraphTelemetryRecorder(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = GraphTelemetryRecorder::allocate(InitGraphTelemetryRecorder {});

    unsafe { instance.QueryInterface(iid, result) }
}

#[xpcom::xpcom(implement(ITelemetryRecorder), atomic)]
struct GraphTelemetryRecorder {}

impl GraphTelemetryRecorder {
    xpcom_method!(record_telemetry => RecordTelemetry(server_url: *const nsACString));
    fn record_telemetry(&self, _server_url: &nsACString) -> Result<(), nsresult> {
        glean_graph::graph_accounts.add(1);
        Ok(())
    }
}
