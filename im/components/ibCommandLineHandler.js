/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Romain Bezut <romain@bezut.info>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
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
      Components.classes["@instantbird.org/purple/core;1"]
                .getService(Ci.purpleICoreService)
                .autoLoginStatus = Ci.purpleICoreService.AUTOLOGIN_USER_DISABLED;
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

const NSGetFactory = XPCOMUtils.generateNSGetFactory([ibCommandLineHandler]);
