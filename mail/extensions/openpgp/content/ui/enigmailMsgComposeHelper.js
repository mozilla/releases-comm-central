/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/**
 * helper functions for message composition
 */

var EnigmailCore = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
).EnigmailCore;
var EnigmailFuncs = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
).EnigmailFuncs;
var { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
var EnigmailPrefs = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
).EnigmailPrefs;
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var { EnigmailGpg } = ChromeUtils.import(
  "chrome://openpgp/content/modules/gpg.jsm"
);
var EnigmailTrust = ChromeUtils.import(
  "chrome://openpgp/content/modules/trust.jsm"
).EnigmailTrust;
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var EnigmailConstants = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
).EnigmailConstants;

if (!Enigmail) {
  var Enigmail = {};
}

Enigmail.hlp = {
  /* try to find valid key to passed email addresses (or keys)
   * @return: list of all found key (with leading "0x") or null
   *          details in details parameter
   */
  async validKeysForAllRecipients(emailsOrKeys, details) {
    EnigmailLog.DEBUG("=====> validKeysForAllRecipients()\n");
    EnigmailLog.DEBUG(
      "enigmailMsgComposeHelper.js: validKeysForAllRecipients(): emailsOrKeys='" +
        emailsOrKeys +
        "'\n"
    );

    // use helper to see when we enter and leave this function
    let resultingArray = await this.doValidKeysForAllRecipients(
      emailsOrKeys,
      details
    );

    EnigmailLog.DEBUG(
      "enigmailMsgComposeHelper.js: validKeysForAllRecipients(): return '" +
        resultingArray +
        "'\n"
    );
    EnigmailLog.DEBUG("  <=== validKeysForAllRecipients()\n");
    return resultingArray;
  },

  // helper for validKeysForAllRecipients()
  async doValidKeysForAllRecipients(emailsOrKeys, details) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): emailsOrKeys='" +
        emailsOrKeys +
        "'\n"
    );

    let keyMissing;
    let resultingArray = []; // resulting key list (if all valid)
    try {
      // create array of address elements (email or key)
      let addresses = [];
      try {
        addresses = EnigmailFuncs.stripEmail(emailsOrKeys).split(",");
      } catch (ex) {}

      // resolve all the email addresses if possible:
      keyMissing = await EnigmailKeyRing.getValidKeysForAllRecipients(
        addresses,
        details,
        resultingArray
      );
    } catch (ex) {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return null (exception: " +
          ex.message +
          "\n" +
          ex.stack +
          ")\n"
      );
      return null;
    }
    if (keyMissing) {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return null (key missing)\n"
      );
      return null;
    }
    EnigmailLog.DEBUG(
      'enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return "' +
        resultingArray +
        '"\n'
    );
    return resultingArray;
  },
};
