/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailConfigure"];

const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
/*
const { EnigmailPrefs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
);
const { EnigmailApp } = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
);
const { EnigmailLocale } = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
);
const { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);
const { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailCore } = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
);
const { EnigmailStdlib } = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib.jsm"
);
const { EnigmailLazy } = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
);
const { EnigmailAutoSetup } = ChromeUtils.import(
  "chrome://openpgp/content/modules/autoSetup.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
*/

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
