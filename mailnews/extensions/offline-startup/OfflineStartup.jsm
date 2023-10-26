/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["OfflineStartup"];

var kDebug = false;
var kOfflineStartupPref = "offline.startup_state";
var kRememberLastState = 0;
var kAskForOnlineState = 1;
var kAlwaysOnline = 2;
var kAlwaysOffline = 3;
var kAutomatic = 4;
var gStartingUp = true;
var gOfflineStartupMode; // 0 = remember last state, 1 = ask me, 2 == online, 3 == offline, 4 = automatic
var gDebugLog;

// Debug helper

if (!kDebug) {
  gDebugLog = function (m) {};
} else {
  gDebugLog = function (m) {
    dump("\t *** nsOfflineStartup: " + m + "\n");
  };
}

// nsOfflineStartup : nsIObserver
//
// Check if the user has set the pref to be prompted for
// online/offline startup mode. If so, prompt the user. Also,
// check if the user wants to remember their offline state
// the next time they start up.
// If the user shutdown offline, and is now starting up in online
// mode, we will set the boolean pref "mailnews.playback_offline" to true.

function OfflineStartup() {}
OfflineStartup.prototype = {
  onProfileStartup() {
    gDebugLog("onProfileStartup");

    if (gStartingUp) {
      gStartingUp = false;
      // if checked, the "work offline" checkbox overrides
      if (Services.io.offline && !Services.io.manageOfflineStatus) {
        gDebugLog("already offline!");
        return;
      }
    }

    var manageOfflineStatus = Services.prefs.getBoolPref("offline.autoDetect");
    gOfflineStartupMode = Services.prefs.getIntPref(kOfflineStartupPref);
    const wasOffline = !Services.prefs.getBoolPref("network.online");

    if (gOfflineStartupMode == kAutomatic) {
      // Offline state should be managed automatically
      // so do nothing specific at startup.
    } else if (gOfflineStartupMode == kAlwaysOffline) {
      Services.io.manageOfflineStatus = false;
      Services.io.offline = true;
    } else if (gOfflineStartupMode == kAlwaysOnline) {
      Services.io.manageOfflineStatus = manageOfflineStatus;
      if (wasOffline) {
        Services.prefs.setBoolPref("mailnews.playback_offline", true);
      }
      // If we're managing the offline status, don't force online here... it may
      // be the network really is offline.
      if (!manageOfflineStatus) {
        Services.io.offline = false;
      }
    } else if (gOfflineStartupMode == kRememberLastState) {
      Services.io.manageOfflineStatus = manageOfflineStatus && !wasOffline;
      // If we are meant to be online, and managing the offline status
      // then don't force it - it may be the network really is offline.
      if (!manageOfflineStatus || wasOffline) {
        Services.io.offline = wasOffline;
      }
    } else if (gOfflineStartupMode == kAskForOnlineState) {
      var bundle = Services.strings.createBundle(
        "chrome://messenger/locale/offlineStartup.properties"
      );
      var title = bundle.GetStringFromName("title");
      var desc = bundle.GetStringFromName("desc");
      var button0Text = bundle.GetStringFromName("workOnline");
      var button1Text = bundle.GetStringFromName("workOffline");
      var checkVal = { value: 0 };

      // Set Offline to true by default to prevent new mail checking at startup before
      // the user answers the following question.
      Services.io.manageOfflineStatus = false;
      Services.io.offline = true;
      var result = Services.prompt.confirmEx(
        null,
        title,
        desc,
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING,
        button0Text,
        button1Text,
        null,
        null,
        checkVal
      );
      gDebugLog("result = " + result + "\n");
      Services.io.manageOfflineStatus = manageOfflineStatus && result != 1;
      Services.io.offline = result == 1;
      if (result != 1 && wasOffline) {
        Services.prefs.setBoolPref("mailnews.playback_offline", true);
      }
    }
  },

  observe(aSubject, aTopic, aData) {
    gDebugLog("observe: " + aTopic);

    if (aTopic == "profile-change-net-teardown") {
      gDebugLog("remembering offline state");
      Services.prefs.setBoolPref("network.online", !Services.io.offline);
    } else if (aTopic == "profile-after-change") {
      Services.obs.addObserver(this, "profile-change-net-teardown");
      this.onProfileStartup();
    }
  },

  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};
