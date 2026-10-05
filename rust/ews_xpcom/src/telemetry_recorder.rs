/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ffi::c_void;

use firefox_on_glean::metrics::mailnews_ews as glean_ews;
use nserror::{NS_OK, nsresult};
use nsstring::nsACString;
use url::Url;
use xpcom::{nsIID, xpcom_method};

use crate::server_version;

/// The base domains for Office365-hosted accounts. At the time of writing, the
/// only valid domain for Office365 EWS URLs should be `outlook.office365.com`,
/// but we'll throw a few additional Microsoft-owned ones in there in case it
/// changes in the future, as well as anything ending with a `microsoft` TLD.
/// This is currently only used for telemetry.
pub(crate) const OFFICE365_BASE_DOMAINS: [&str; 4] = [
    "office365.com",
    "outlook.com",
    "onmicrosoft.com",
    ".microsoft",
];

#[allow(non_snake_case)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn NS_CreateEwsTelemetryRecorder(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = EwsTelemetryRecorder::allocate(InitEwsTelemetryRecorder {});

    unsafe { instance.QueryInterface(iid, result) }
}

#[xpcom::xpcom(implement(ITelemetryRecorder), atomic)]
struct EwsTelemetryRecorder {}

impl EwsTelemetryRecorder {
    xpcom_method!(record_telemetry => RecordTelemetry(server_url: *const nsACString));
    fn record_telemetry(&self, server_url: &nsACString) -> Result<(), nsresult> {
        // Try to parse the URL.
        let server_url =
            Url::parse(&server_url.to_utf8()).or(Err(nserror::NS_ERROR_INVALID_ARG))?;

        // Try to extract a domain from the URL, so we can compare it with the
        // Offiche365 base domain.
        let domain = server_url.host_str().ok_or(nserror::NS_ERROR_INVALID_ARG)?;

        // See if we know an Exchange Server version for this URL.
        let version = server_version::read_server_version(&server_url)?;

        // We've handled any possible error, let's record some data.
        if let Some(version) = version {
            // Record the version, but only if we have one stored in the prefs, as
            // using the default value here would just skew the data.
            glean_ews::version
                .get(server_version::to_glean_label(&version).into())
                .add(1);
        }

        // Record whether the URL refers to Office365.
        let is_o365 = OFFICE365_BASE_DOMAINS
            .into_iter()
            .any(|o365_base_domain| domain.ends_with(o365_base_domain));

        let server_type_label = if is_o365 {
            glean_ews::ServerTypeLabel::EOffice365
        } else {
            glean_ews::ServerTypeLabel::EOnpremise
        };

        glean_ews::server_type.get(server_type_label.into()).add(1);

        Ok(())
    }
}
