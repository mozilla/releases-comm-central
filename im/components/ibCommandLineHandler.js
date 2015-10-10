/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/ibCore.jsm");

function ibCommandLineHandler() { }

ibCommandLineHandler.prototype = {
  handle: function clh_handle(cmdLine) {
    if (cmdLine.handleFlag("preferences", false)) {
      Core.showPreferences();
      cmdLine.preventDefault = true;
      return;
    }

    if (cmdLine.handleFlag("n", false)) {
      Services.accounts.autoLoginStatus =
        Ci.imIAccountsService.AUTOLOGIN_USER_DISABLED;
    }

    // Initialize the core only at the first real startup,
    // not when clicking the dock.
    if (cmdLine.state == cmdLine.STATE_INITIAL_LAUNCH) {
      // If the core failed to init, don't show the buddy list
      if (!Core.init())
        cmdLine.preventDefault = true;
#ifdef XP_MACOSX
      else {
        // If we have no reason to show the account manager and the
        // buddy list is not shown because of the -silent flag, we
        // should avoid an early exit.
        // The code in nsAppStartup::Run won't start the event loop if
        // we don't have at least one window or one call to
        // enterLastWindowClosingSurvivalArea.
        let as = Components.classes["@mozilla.org/toolkit/app-startup;1"]
                           .getService(Ci.nsIAppStartup);
        as.enterLastWindowClosingSurvivalArea();
        // We can exitLastWindowClosingSurvivalArea as soon as the
        // load of our application provided hiddenWindow has begun.
        executeSoon(function() { as.exitLastWindowClosingSurvivalArea(); });
      }
#endif
    }
  },

  // 3 tabs here because there is a misalignment with only 2
  helpInfo: "  -n                 Disables auto-login.\n" +
            "  -preferences       Open only the preferences window.\n" +
            "  -silent            Do not open the contacts list.\n",

  classDescription: "Instantbird Command Line Handler",
  classID: Components.ID("{cd6763b7-df9a-4b64-9d06-2b77c755d9c1}"),
  contractID: "@instantbird.org/command-line-handler;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ibCommandLineHandler]);
