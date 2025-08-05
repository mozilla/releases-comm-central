/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{collections::HashMap, ffi::CStr};

use nserror::nsresult;
use nsstring::nsCString;
use url::Url;

use ews::server_version::{ExchangeServerVersion, ServerVersionInfo};
use xpcom::interfaces::{nsIPrefBranch, nsIPrefService};
use xpcom::{get_service, RefCounted, RefPtr, XpCom};

use super::{XpComEwsClient, XpComEwsError};

/// The Exchange Server version to use in requests when we cannot figure out
/// which one to use (e.g. if the server hasn't provided us with a version
/// identifier yet). We default to Exchange Server 2007 SP1, which ensures
/// compatibility with older servers, while ensuring the server's behaviour
/// stays stable enough if we need to update that version number later on. SP1
/// specifically updates the format of EWS IDs to the one that is still used by
/// more modern servers, so it is preferable over plain Exchange Server 2007.
const DEFAULT_EWS_SERVER_VERSION: ExchangeServerVersion = ExchangeServerVersion::Exchange2007_SP1;

/// The name of the pref in which we store the map associating an EWS endpoint
/// with its version. This map is stored as a string-ified JSON.
const EWS_SERVER_VERSIONS_PREF: &CStr = c"mail.ews.server_versions";

/// Retrieve the "root" pref branch, i.e. the one from which all prefs are
/// defined (as opposed to one retrieved from `nsIPrefService::GetBranch()` with
/// a prefix).
fn get_root_pref_branch() -> Result<RefPtr<nsIPrefBranch>, nsresult> {
    let pref_svc = get_service::<nsIPrefService>(c"@mozilla.org/preferences-service;1")
        .ok_or(nserror::NS_ERROR_FAILURE)?;

    // The underlying implementation of `nsIPrefService` also implements
    // `nsIPrefBranch`. While this relationship isn't strictly specified or
    // explictly documented in the XPIDL files, most JS services rely on it
    // (through e.g. `Services.prefs.get[...]Pref`) so it should be safe to rely
    // on this here too.
    pref_svc
        .query_interface::<nsIPrefBranch>()
        .ok_or(nserror::NS_ERROR_FAILURE)
}

/// Attempts to parse the pref in which the mapping between EWS endpoints and
/// the corresponding versions is stored.
///
/// If the pref is empty or nonexistent, [`None`] is returned.
///
/// [`None`] is also returned if the pref does not contain any valid JSON. The
/// rationale for doing so is we expect the server will respond with a version
/// identifier, which will cause [`XpComEwsClient::update_server_version`] to
/// rewrite the pref with valid JSON.
fn parse_server_version_pref() -> Result<Option<HashMap<String, String>>, XpComEwsError> {
    let pref_branch = get_root_pref_branch()?;

    let mut pref_value = nsCString::new();
    match unsafe { pref_branch.GetCharPref(EWS_SERVER_VERSIONS_PREF.as_ptr(), &mut *pref_value) }
        .to_result()
    {
        Ok(_) => {}
        Err(err) => {
            return match err {
                // `GetIntPref` returns `NS_ERROR_UNEXPECTED` if the pref does
                // not have a value.
                nserror::NS_ERROR_UNEXPECTED => Ok(None),
                _ => Err(err.into()),
            };
        }
    };

    let pref_value = pref_value.to_utf8();
    let de = &mut serde_json::Deserializer::from_str(&pref_value);

    let known_versions: HashMap<String, String> = match serde_path_to_error::deserialize(de) {
        Ok(value) => value,
        Err(err) => {
            // The entire content of the pref cannot be parsed from JSON. In
            // this case, we replicate the same behaviour as if the pref was
            // empty.
            log::error!("failed to parse the Exchange server versions pref: {err}");

            return Ok(None);
        }
    };

    Ok(Some(known_versions))
}

/// Reads the version stored for a given EWS endpoint from the relevant pref.
///
/// If no version could be read for this endpoint (the pref is empty, or does
/// not contain valid JSON), the default version is used.
///
/// If a version could be read but is unknown, [`XpComEwsError::Ews`] is
/// returned.
pub(super) fn read_server_version(endpoint: &Url) -> Result<ExchangeServerVersion, XpComEwsError> {
    let known_versions = match parse_server_version_pref()? {
        Some(known_versions) => known_versions,
        // No map could be extracted from the prefs. In this case, we can take
        // the easy way out and use the default version.
        None => return Ok(DEFAULT_EWS_SERVER_VERSION),
    };

    // Check if we have a version identifier stored for the endpoint; if not
    // we'll use the default version.
    let version: ExchangeServerVersion = match known_versions.get(&endpoint.to_string()) {
        // We expect the version read from the prefs to be one we know about,
        // because if the server gave us an unknown version then we'll have
        // defaulted to a known one when storing it. So we propagate errors
        // about unknown versions, because it means something has gone wrong
        // somewhere else.
        Some(version) => version.as_str().try_into()?,
        None => DEFAULT_EWS_SERVER_VERSION,
    };

    Ok(version)
}

impl<ServerT> XpComEwsClient<ServerT>
where
    ServerT: RefCounted,
{
    /// Updates the server version associated with the client's current endpoint
    /// in the relevant pref.
    pub(super) fn update_server_version(
        &self,
        header: ServerVersionInfo,
    ) -> Result<(), XpComEwsError> {
        let version = match header.version {
            Some(version) if !version.is_empty() => version,
            // If the server did not include a version identifier in the
            // response header (either by not including a `Version` attribute,
            // or by setting it to an empty string), there's nothing to do here.
            _ => return Ok(()),
        };

        let version = match ExchangeServerVersion::try_from(version.as_str()) {
            Ok(version) => version,
            // If the server included a version identifier in the response
            // header, but we don't know it, then it very likely means it's a
            // version that's more recent than the ones we know (e.g. Exchange
            // Online), so we default to the most recent version we know about.
            Err(_) => ExchangeServerVersion::Exchange2013_SP1,
        };

        // Update the in-memory representation of the server version, in case
        // the client will be reused later.
        self.server_version.set(version);

        let mut known_versions = parse_server_version_pref()?.unwrap_or_default();
        let endpoint = self.endpoint.to_string();
        let version: String = version.into();

        // If we already know the version from the current endpoint and it
        // matches what the server told us, then we can skip rewriting the pref.
        if let Some(stored_version) = known_versions.get(&endpoint) {
            if stored_version == &version {
                return Ok(());
            }
        }

        // Add the version to the known versions map, serialize it into JSON,
        // and store the result in the pref.
        known_versions.insert(self.endpoint.to_string(), version);

        let known_versions = serde_json::to_string(&known_versions)?;
        let known_versions = nsCString::from(known_versions);

        let pref_branch = get_root_pref_branch()?;
        unsafe { pref_branch.SetCharPref(EWS_SERVER_VERSIONS_PREF.as_ptr(), &*known_versions) }
            .to_result()?;

        Ok(())
    }
}
