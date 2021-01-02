/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const appStartup = Services.startup;

function restartApp() {
  appStartup.quit(appStartup.eForceQuit | appStartup.eRestart);
}

function clearAllPrefs() {
  Services.prefs.resetUserPrefs();

  // Remove the pref-overrides dir, if it exists.
  try {
    var prefOverridesDir = Services.dirsvc.get("PrefDOverride", Ci.nsIFile);
    prefOverridesDir.remove(true);
  } catch (ex) {
    Cu.reportError(ex);
  }
}

function restoreDefaultBookmarks() {
  Services.prefs.setBoolPref("browser.bookmarks.restore_default_bookmarks", true);
}

function deleteLocalstore() {
  // Delete the xulstore file.
  let xulstoreFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  xulstoreFile.append("xulstore.json");
  if (xulstoreFile.exists())
    xulstoreFile.remove(false);
}

function disableAddons() {
  AddonManager.getAllAddons(function(aAddons) {
    aAddons.forEach(function(aAddon) {
      if (aAddon.type == "theme") {
        // Setting userDisabled to false on the default theme activates it,
        // disables all other themes and deactivates the applied persona, if
        // any.
        const DEFAULT_THEME_ID = "{972ce4c6-7e08-4474-a285-3208198ce6fd}";
        if (aAddon.id == DEFAULT_THEME_ID)
          aAddon.userDisabled = false;
      }
      else {
        aAddon.userDisabled = true;
      }
    });

    restartApp();
  });
}

function onOK() {
  try {
    if (document.getElementById("resetUserPrefs").checked)
      clearAllPrefs();
    if (document.getElementById("deleteBookmarks").checked)
      restoreDefaultBookmarks();
    if (document.getElementById("resetToolbars").checked)
      deleteLocalstore();
    if (document.getElementById("restoreSearch").checked)
      Services.search.restoreDefaultEngines();
    if (document.getElementById("disableAddons").checked) {
      disableAddons();
      // disableAddons will asynchronously restart the application
      return false;
    }
  } catch(e) {
  }

  restartApp();
  return false;
}

function onCancel() {
  appStartup.quit(appStartup.eForceQuit);
  return false;
}

function onLoad() {
  document.documentElement.getButton("extra1").focus();
}

function UpdateOKButtonState() {
  document.documentElement.getButton("accept").disabled =
    !document.getElementsByAttribute("checked", "true").item(0);
}
