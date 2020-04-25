/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load spell-checker module to properly determine language strings
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

function Startup()
{
  SwitchLocales_Load();
  NumberLocales_Load();
}

/**
 * From locale switcher's switch.js:
 * Load available locales into selection menu
 */
function SwitchLocales_Load() {
  var menulist = document.getElementById("switchLocales");

  var cr = Cc["@mozilla.org/chrome/chrome-registry;1"]
             .getService(Ci.nsIToolkitChromeRegistry);

  var langNames = document.getElementById("languageNamesBundle");
  var regNames  = document.getElementById("regionNamesBundle");

  var matched = false;
  var currentLocale = Services.locale.getRequestedLocale() || undefined;
  var locales = cr.getLocalesForPackage("global");

  while (locales.hasMore()) {
    var locale = locales.getNext();

    var parts = locale.split(/-/);

    var displayName;
    try {
      displayName = langNames.getString(parts[0]);
      if (parts.length > 1) {
        try {
          displayName += " (" + regNames.getString(parts[1].toLowerCase()) + ")";
        }
        catch (e) {
          displayName += " (" + parts[1] + ")";
        }
      }
    }
    catch (e) {
      displayName = locale;
    }

    var item = menulist.appendItem(displayName, locale);
    if (!matched && currentLocale && currentLocale == locale) {
      matched = true;
      menulist.selectedItem = item;
    }
  }
  // If somehow we have not found the current locale, select the first in list.
  if (!matched) {
    menulist.selectedIndex = 1;
  }
}

/**
 * Determine the appropriate value to set and set it.
 */
function SelectLocale(aElement) {
  var locale = aElement.value;
  var currentLocale = Services.locale.getRequestedLocale() || undefined;
  if (!currentLocale || (currentLocale && currentLocale != locale)) {
    Services.locale.setRequestedLocales([locale]);
  }
}

/**
 * When starting up, determine application and regional locale settings
 * and add the respective strings to the prefpane labels.
 */
function NumberLocales_Load()
{
  const osprefs =
    Cc["@mozilla.org/intl/ospreferences;1"]
      .getService(Ci.mozIOSPreferences);

  let appLocale = Services.locale.appLocalesAsBCP47[0];
  let rsLocale = osprefs.regionalPrefsLocales[0];
  let names = Services.intl.getLocaleDisplayNames(undefined, [appLocale, rsLocale]);

  let appLocaleRadio = document.getElementById("appLocale");
  let rsLocaleRadio = document.getElementById("rsLocale");
  let prefutilitiesBundle = document.getElementById("bundle_prefutilities");

  let appLocaleLabel = prefutilitiesBundle.getFormattedString("appLocale.label",
                                                              [names[0]]);
  let rsLocaleLabel = prefutilitiesBundle.getFormattedString("rsLocale.label",
                                                             [names[1]]);
  appLocaleRadio.setAttribute("label", appLocaleLabel);
  rsLocaleRadio.setAttribute("label", rsLocaleLabel);
  appLocaleRadio.accessKey = prefutilitiesBundle.getString("appLocale.accesskey");
  rsLocaleRadio.accessKey = prefutilitiesBundle.getString("rsLocale.accesskey");
}
