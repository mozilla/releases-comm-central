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
  /**
   * Check availability of valid keys for passed email addresses (or keys).
   * @param {String} emailsOrKeys - comma separated list
   * @param {Object} details - holds details for invalid keys, see
   *                           EnigmailKeyRing.getValidKeysForAllRecipients
   * @return {Boolean} - false on failure
   */
  async validKeysForAllRecipients(emailsOrKeys, details) {
    let keyMissing = true;
    try {
      // create array of address elements (email or key)
      let addresses = [];
      try {
        addresses = EnigmailFuncs.stripEmail(emailsOrKeys).split(",");
      } catch (ex) {}

      // resolve all the email addresses if possible:
      keyMissing = await EnigmailKeyRing.getValidKeysForAllRecipients(
        addresses,
        details
      );
    } catch (ex) {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeHelper.js: validKeysForAllRecipients(): return null (exception: " +
          ex.message +
          "\n" +
          ex.stack +
          ")\n"
      );
    }
    if (keyMissing) {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeHelper.js: validKeysForAllRecipients(): return null (key missing)\n"
      );
    }
    return !keyMissing;
  },
};
