/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

/**
 * helper functions for message composition
 */

var EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
var EnigmailFuncs = ChromeUtils.import("chrome://openpgp/content/modules/funcs.jsm").EnigmailFuncs;
var EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
var EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
var EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
var EnigmailDialog = ChromeUtils.import("chrome://openpgp/content/modules/dialog.jsm").EnigmailDialog;
var EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
var EnigmailTrust = ChromeUtils.import("chrome://openpgp/content/modules/trust.jsm").EnigmailTrust;
var EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
var EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;

if (!Enigmail) var Enigmail = {};

Enigmail.hlp = {

  /* try to find valid key to passed email addresses (or keys)
   * @return: list of all found key (with leading "0x") or null
   *          details in details parameter
   */
  validKeysForAllRecipients: function(emailsOrKeys, details) {
    EnigmailLog.DEBUG("=====> validKeysForAllRecipients()\n");
    EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: validKeysForAllRecipients(): emailsOrKeys='" + emailsOrKeys + "'\n");

    // use helper to see when we enter and leave this function
    let resultingArray = this.doValidKeysForAllRecipients(emailsOrKeys, details);

    EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: validKeysForAllRecipients(): return '" + resultingArray + "'\n");
    EnigmailLog.DEBUG("  <=== validKeysForAllRecipients()\n");
    return resultingArray;
  },


  // helper for validKeysForAllRecipients()
  doValidKeysForAllRecipients: function(emailsOrKeys, details) {
    EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): emailsOrKeys='" + emailsOrKeys + "'\n");

    // check which keys are accepted
    let minTrustLevel;
    let acceptedKeys = EnigmailPrefs.getPref("acceptedKeys");
    switch (acceptedKeys) {
      case 0: // accept valid/authenticated keys only
        minTrustLevel = "f"; // first value for trusted keys
        break;
      case 1: // accept all but revoked/disabled/expired keys
        minTrustLevel = "?"; // value between invalid and unknown keys
        break;
      default:
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: doValidKeysForAllRecipients(): return null (INVALID VALUE for acceptedKeys: \"" + acceptedKeys + "\")\n");
        return null;
    }

    EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): find keys with minTrustLevel=\"" + minTrustLevel + "\"\n");

    let keyMissing;
    let resultingArray = []; // resulting key list (if all valid)
    try {
      // create array of address elements (email or key)
      let addresses = [];
      try {
        addresses = EnigmailFuncs.stripEmail(emailsOrKeys).split(',');
      } catch (ex) {}

      // resolve GnuPG groups
      let gpgGroups = EnigmailGpg.getGpgGroups();
      for (let i = 0; i < addresses.length; i++) {
        let addr = addresses[i].toLowerCase();
        for (let j = 0; j < gpgGroups.length; j++) {
          if (addr == gpgGroups[j].alias.toLowerCase() ||
            "<" + addr + ">" == gpgGroups[j].alias.toLowerCase()) {
            // replace address with keylist
            let grpList = gpgGroups[j].keylist.split(/;/);
            addresses[i] = grpList[0];
            for (let k = 1; k < grpList.length; k++) {
              addresses.push(grpList[k]);
            }
          }
        }
      }

      // resolve all the email addresses if possible:
      keyMissing = EnigmailKeyRing.getValidKeysForAllRecipients(addresses, minTrustLevel, details, resultingArray);
    } catch (ex) {
      EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return null (exception: " + ex.message + "\n" + ex.stack + ")\n");
      return null;
    }
    if (keyMissing) {
      EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return null (key missing)\n");
      return null;
    }
    EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: doValidKeysForAllRecipients(): return \"" + resultingArray + "\"\n");
    return resultingArray;
  },


  /**
   * processConflicts
   * - handle sign/encrypt/pgpMime conflicts if any
   * - NOTE: conflicts result into disabling the feature (0/never)
   * Input parameters:
   *  @encrypt: email would currently get encrypted
   *  @sign:    email would currently get signed
   * @return:  false if error occurred or processing was canceled
   */
  processConflicts: function(encrypt, sign) {
    // process message about whether we still sign/encrypt
    let msg = "";
    msg += "\n- " + EnigmailLocale.getString(encrypt ? "encryptYes" : "encryptNo");
    msg += "\n- " + EnigmailLocale.getString(sign ? "signYes" : "signNo");
    if (EnigmailPrefs.getPref("warnOnRulesConflict") == 2) {
      EnigmailPrefs.setPref("warnOnRulesConflict", 0);
    }
    if (!EnigmailDialog.confirmPref(window, EnigmailLocale.getString("rulesConflict", [msg]), "warnOnRulesConflict")) {
      return false;
    }
    return true;
  },


  /**
   * determine invalid recipients as returned from GnuPG
   *
   * @gpgMsg: output from GnuPG
   *
   * @return: space separated list of invalid addresses
   */
  getInvalidAddress: function(gpgMsg) {
    EnigmailLog.DEBUG("enigmailMsgComposeHelper.js: getInvalidAddress(): gpgMsg=\"" + gpgMsg + "\"\n\n");
    var invalidAddr = [];
    var lines = gpgMsg.split(/[\n\r]+/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(INV_RECP \d+ )(.*)$/);
      if (m && m.length == 3) {
        try {
          invalidAddr.push(EnigmailFuncs.stripEmail(m[2].toLowerCase()));
        } catch (ex) {}
      }
    }
    return invalidAddr.join(" ");
  }

};
