/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Return the set of locales according to LocaleService

use cstr::cstr;
use fluent::FluentResource;
use nserror::nsresult;
use nsstring::nsCString;
use thin_vec::ThinVec;
use unic_langid::LanguageIdentifier;
use xpcom::get_service;
use xpcom::interfaces::mozILocaleService;

static MENUBAR_FILE: &str = include_str!(mozbuild::srcdir_path!(
    "/comm/mail/locales/en-US/messenger/menubar.ftl"
));

static BRANDING_FILE: &str = include_str!(mozbuild::srcdir_path!(
    "/comm/mail/branding/thunderbird/locales/en-US/brand.ftl"
));

// Ask mozILocaleService for the known locale list
fn supported_locales() -> Result<ThinVec<nsCString>, nsresult> {
    let service = get_service::<mozILocaleService>(cstr!("@mozilla.org/intl/localeservice;1"))
        .ok_or(nserror::NS_ERROR_NO_INTERFACE)?;
    let mut locales = ThinVec::new();
    unsafe {
        service.GetAppLocalesAsBCP47(&mut locales).to_result()?;
    }
    Ok(locales)
}

/// Convert mozILocaleService known locales into fluent usable locales
pub(crate) fn app_locales() -> Result<Vec<LanguageIdentifier>, nsresult> {
    let locales = supported_locales()?
        .into_iter()
        .filter_map(|i| LanguageIdentifier::from_bytes(&i).ok())
        .collect::<Vec<_>>();
    Ok(locales)
}

/// Load our fluent resource
pub(crate) fn fl_resource() -> Result<FluentResource, nsresult> {
    let ftl_template = MENUBAR_FILE.to_owned() + BRANDING_FILE;
    let resource = FluentResource::try_new(ftl_template).map_err(|_| nserror::NS_ERROR_FAILURE)?;

    Ok(resource)
}
