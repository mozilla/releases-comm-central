/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailConfigure"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  // EnigmailApp: "chrome://openpgp/content/modules/app.jsm",
  // EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  // EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  // EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  // EnigmailLocale: "chrome://openpgp/content/modules/locale.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  // EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  // EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  // EnigmailPrefs: "chrome://openpgp/content/modules/prefs.jsm"
});

var EnigmailConfigure = {
  /**
   * configureEnigmail: main function for configuring Enigmail during the first run
   * this method is called from core.jsm if Enigmail has not been set up before
   * (determined via checking the configuredVersion in the preferences)
   *
   * @param {nsIWindow} win:                 The parent window. Null if no parent window available
   * @param {Boolean}   startingPreferences: if true, called while switching to new preferences
   *                        (to avoid re-check for preferences)
   *
   * @return {Promise<null>}
   */
  async configureEnigmail(win, startingPreferences) {
    EnigmailLog.DEBUG("configure.jsm: configureEnigmail()\n");
    // TODO: one time migration from enigmail

    //EnigmailPrefs.setPref("configuredVersion", EnigmailApp.getVersion());
    //EnigmailPrefs.savePrefs();
  },
};
