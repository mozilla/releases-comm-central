/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [ "extensionDefaults" ];

ChromeUtils.import("resource://gre/modules/Services.jsm");
// ChromeUtils.import("resource://gre/modules/Deprecated.jsm") - needed for warning.
ChromeUtils.import("resource://gre/modules/NetUtil.jsm");

ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource:///modules/IOUtils.js");

/**
 * Reads preferences from addon provided locations (defaults/preferences/*.js)
 * and stores them in the default preferences branch.
 */
function extensionDefaults() {

  function setPref(preferDefault, name, value) {
    let branch = Services.prefs.getBranch("");
    if (preferDefault) {
      let defaultBranch = Services.prefs.getDefaultBranch("");
      if (defaultBranch.getPrefType(name) == Ci.nsIPrefBranch.PREF_INVALID) {
        // Only use the default branch if it doesn't already have the pref set.
        // If there is already a pref with this value on the default branch, the
        // extension wants to override a built-in value.
        branch = defaultBranch;
      } else if (defaultBranch.prefHasUserValue(name)) {
        // If a pref already has a user-set value it proper type
        // will be returned (not PREF_INVALID). In that case keep the user's
        // value and overwrite the default.
        branch = defaultBranch;
      }
    }

    if (typeof value == "boolean") {
      branch.setBoolPref(name, value);
    } else if (typeof value == "string") {
      if (value.startsWith("chrome://") && value.endsWith(".properties")) {
        let valueLocal = Cc["@mozilla.org/pref-localizedstring;1"]
                         .createInstance(Ci.nsIPrefLocalizedString);
        valueLocal.data = value;
        branch.setComplexValue(name, Ci.nsIPrefLocalizedString, valueLocal);
      } else {
        branch.setStringPref(name, value);
      }
    } else if (typeof value == "number" && Number.isInteger(value)) {
      branch.setIntPref(name, value);
    } else if (typeof value == "number" && Number.isFloat(value)) {
      // Floats are set as char prefs, then retrieved using getFloatPref
      branch.setCharPref(name, value);
    }
  }

  function walkExtensionPrefs(prefFile) {
    let foundPrefStrings = [];
    if (!prefFile.exists())
      return [];

    if (prefFile.isDirectory()) {
      prefFile.append("defaults");
      prefFile.append("preferences");
      if (!prefFile.exists() || !prefFile.isDirectory())
        return [];

      for (let file of fixIterator(prefFile.directoryEntries, Ci.nsIFile)) {
        if (file.isFile() && file.leafName.toLowerCase().endsWith(".js")) {
          foundPrefStrings.push(IOUtils.loadFileToString(file));
        }
      }
    } else if (prefFile.isFile() && prefFile.leafName.endsWith("xpi")) {
      let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"]
                        .createInstance(Ci.nsIZipReader);
      zipReader.open(prefFile);
      let entries = zipReader.findEntries("defaults/preferences/*.js");

      while (entries.hasMore()) {
        let entryName = entries.getNext();
        let stream = zipReader.getInputStream(entryName);
        let entrySize = zipReader.getEntry(entryName).realSize;
        if (entrySize > 0) {
          let content = NetUtil.readInputStreamToString(stream, entrySize, { charset: "utf-8", replacement: "?" });
          foundPrefStrings.push(content);
        }
      }
    }

    return foundPrefStrings;
  }

  function loadAddonPrefs(addonFile) {
    let sandbox = new Cu.Sandbox(null);
    sandbox.pref = setPref.bind(undefined, true);
    sandbox.user_pref = setPref.bind(undefined, false);

    let prefDataStrings = walkExtensionPrefs(addonFile);
    for (let prefDataString of prefDataStrings) {
      try {
        Cu.evalInSandbox(prefDataString, sandbox);
      } catch (e) {
        Cu.reportError("Error reading default prefs of addon " + addonFile.leafName + ": " + e);
      }
    }

    /*
    TODO: decide whether we need to warn the user/make addon authors to migrate away from these pref files.
    if (prefDataStrings.length > 0) {
      Deprecated.warning(addon.defaultLocale.name + " uses defaults/preferences/*.js files to load prefs",
                         "https://bugzilla.mozilla.org/show_bug.cgi?id=1414398");
    }
    */
  }

  // Fetch enabled non-bootstrapped add-ons.
  let enabledAddons = Services.dirsvc.get("XREExtDL", Ci.nsISimpleEnumerator);
  for (let addonFile of fixIterator(enabledAddons, Ci.nsIFile)) {
    loadAddonPrefs(addonFile);
  }
}
