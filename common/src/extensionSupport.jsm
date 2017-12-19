/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [ "extensionDefaults" ];

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
// Cu.import("resource://gre/modules/Deprecated.jsm") - needed for warning.
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");
Cu.import("resource:///modules/IOUtils.js");

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

  function walkExtensionPrefs(addon) {
    let prefPath = addon.getResourceURI("defaults/preferences");
    let foundPrefStrings = [];
    if (prefPath.schemeIs("file")) {
      let prefFilePath = prefPath.QueryInterface(Components.interfaces.nsIFileURL).file;
      if (!prefFilePath.exists() || !prefFilePath.isDirectory())
        return [];

      for (let file of fixIterator(prefFilePath.directoryEntries, Components.interfaces.nsIFile)) {
        if (file.isFile() && file.leafName.toLowerCase().endsWith(".js")) {
          foundPrefStrings.push(IOUtils.loadFileToString(file));
        }
      }
    } else if (prefPath.schemeIs("jar")) {
      let handler = Services.io.getProtocolHandler("jar").QueryInterface(Components.interfaces.nsIJARProtocolHandler);
      let jarUri = prefPath.QueryInterface(Components.interfaces.nsIJARURI);
      let jarFile = jarUri.JARFile.QueryInterface(Components.interfaces.nsIFileURL).file;
      let zipReader = handler.JARCache.getZip(jarFile);
      let entries = zipReader.findEntries(jarUri.JAREntry + "/*.js");

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

  function loadAddonPrefs(addon) {
    let sandbox = new Components.utils.Sandbox(null);
    sandbox.pref = setPref.bind(undefined, true);
    sandbox.user_pref = setPref.bind(undefined, false);

    let prefDataStrings = walkExtensionPrefs(addon);
    for (let prefDataString of prefDataStrings) {
      try {
        Components.utils.evalInSandbox(prefDataString, sandbox);
      } catch (e) {
        Components.utils.reportError("Error reading default prefs of addon " + addon.name + ": " + e);
      }
    }

    /*
    TODO: decide whether we need to warn the user/make addon authors to migrate away from these pref files.
    if (prefDataStrings.length > 0) {
      Deprecated.warning(addon.name + " uses defaults/preferences/*.js files to load prefs",
                         "https://bugzilla.mozilla.org/show_bug.cgi?id=1414398");
    }
    */
  }

  function initAddonListener() {
    let done = false;
    let count = 0;
    AddonManager.getAddonsByTypes(["extension"], (addons) => {
      for (let addon of addons) {
        if (!addon.userDisabled && !addon.appDisabled && !addon.softDisabled &&
            // Skip bootstrapped add-ons.
            addon.operationsRequiringRestart != AddonManager.OP_NEEDS_RESTART_NONE) {
          loadAddonPrefs(addon);
        }
      }
      done = true;
    });
    let thread = Components.classes["@mozilla.org/thread-manager;1"].
                 getService().currentThread;
    while (!done && count++ < 100) {
      thread.processNextEvent(true);
    }

    if (!done)
      Components.utils.reportError("Add-on preferences not loaded");
  }

  if (AddonManager.isReady) {
    initAddonListener();
  } else {
    AddonManager.addManagerListener({
      onStartup() {
        initAddonListener();
      }
    });
  }
}
