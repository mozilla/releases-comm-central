/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var ELLIPSIS = Services.prefs.getComplexValue("intl.ellipsis",
                                                Ci.nsIPrefLocalizedString).data;

// We use a preferences whitelist to make sure we only show preferences that
// are useful for support and won't compromise the user's privacy.  Note that
// entries are *prefixes*: for example, "accessibility." applies to all prefs
// under the "accessibility.*" branch.
var PREFS_WHITELIST = [
  // core prefs
  "accessibility.",
  "browser.cache.",
  "browser.display.",
  "browser.fixup.",
  "browser.history_expire_",
  "browser.link.open_newwindow",
  "browser.mousewheel.",
  "browser.places.",
  "browser.privatebrowsing.",
  "browser.search.context.loadInBackground",
  "browser.search.log",
  "browser.search.openintab",
  "browser.search.param",
  "browser.search.searchEnginesURL",
  "browser.search.suggest.enabled",
  "browser.search.update",
  "browser.search.useDBForOrder",
  "browser.sessionstore.",
  "browser.startup.homepage",
  "browser.tabs.",
  "browser.zoom.",
  "dom.",
  "extensions.checkCompatibility",
  "extensions.lastAppVersion",
  "font.",
  "general.autoScroll",
  "general.useragent.",
  "gfx.",
  "html5.",
  "image.mem.",
  "javascript.",
  "keyword.",
  "layers.",
  "layout.css.dpi",
  "media.",
  "mousewheel.",
  "network.",
  "permissions.default.image",
  "places.",
  "plugin.",
  "plugins.",
  "print.",
  "privacy.",
  "security.",
  "svg.",
  "toolkit.startup.recent_crashes",
  "webgl.",
  // mail-specific prefs
  "mail.openMessageBehavior.",
  "mail.spotlight.",
  "mail.winsearch.",
  "mailnews.database.",
];

// The blacklist, unlike the whitelist, is a list of regular expressions.
var PREFS_BLACKLIST = [
  /^network[.]proxy[.]/,
  /[.]print_to_filename$/,
  /[.]lastFolderIndexedUri/,
];

function populatePreferencesSection() {
  let modifiedPrefs = getModifiedPrefs();

  function comparePrefs(pref1, pref2) {
    return pref1.name.localeCompare(pref2.name);
  }

  modifiedPrefs.sort(comparePrefs);

  let trPrefs = [];
  modifiedPrefs.forEach(function (pref) {
    let tdName = createElement("td", pref.name, {"class": "pref-name"});
    let tdValue = createElement("td", formatPrefValue(pref.value),
                                {"class": "pref-value"});
    let tr = createParentElement("tr", [tdName, tdValue]);
    trPrefs.push(tr);
  });

  appendChildren(document.getElementById("prefs-tbody"), trPrefs);
}

function formatPrefValue(prefValue) {
  // Some pref values are really long and don't have spaces.  This can cause
  // problems when copying and pasting into some WYSIWYG editors.  In general
  // the exact contents of really long pref values aren't particularly useful,
  // so we truncate them to some reasonable length.
  let maxPrefValueLen = 120;
  let text = "" + prefValue;
  if (text.length > maxPrefValueLen)
    text = text.substring(0, maxPrefValueLen) + ELLIPSIS;
  return text;
}

function getModifiedPrefs() {
  // We use the low-level prefs API to identify prefs that have been
  // modified, rather than extApplication.js::prefs.all since the latter is
  // much, much slower. extApplication.js::prefs.all also gets slower each
  // time it's called.  See bug 517312.
  function GetPref(name) {
    let type = Services.prefs.getPrefType(name);
    switch (type) {
      case Services.prefs.PREF_STRING:
        return Services.prefs.getCharPref(name);
      case Services.prefs.PREF_INT:
        return Services.prefs.getIntPref(name);
      case Services.prefs.PREF_BOOL:
        return Services.prefs.getBoolPref(name);
      default:
        throw new Error("Unknown type");
    }
  }

  let prefNames = getWhitelistedPrefNames();
  prefNames = prefNames.filter(prefName => (Services.prefs.prefHasUserValue(prefName)
                                            && !isBlacklisted(prefName)));
  let prefs = [];
  prefNames.forEach(prefName =>
                    prefs.push({ name: prefName, value: GetPref(prefName) }));
  return prefs;
}

function getWhitelistedPrefNames() {
  let results = [];
  PREFS_WHITELIST.forEach(function (prefStem) {
    let prefNames = Services.prefs.getChildList(prefStem, {});
    results = results.concat(prefNames);
  });
  return results;
}

function isBlacklisted(prefName) {
  return PREFS_BLACKLIST.some(re => re.test(prefName));
}
