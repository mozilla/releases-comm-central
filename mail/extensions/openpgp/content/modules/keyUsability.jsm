/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKeyUsability"];

const EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
const EnigmailPrefs = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
).EnigmailPrefs;
const EnigmailLog = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
).EnigmailLog;
const EnigmailCore = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
).EnigmailCore;
const EnigmailConstants = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
).EnigmailConstants;
const EnigmailLazy = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
).EnigmailLazy;

const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");
const getWindows = EnigmailLazy.loader(
  "enigmail/windows.jsm",
  "EnigmailWindows"
);
const getKeyRing = EnigmailLazy.loader(
  "enigmail/keyRing.jsm",
  "EnigmailKeyRing"
);

const DAY = 86400; // number of seconds of 1 day

var EnigmailKeyUsability = {
  /**
   * Check whether some key pairs expire in less than N days from now.
   *
   * @param keySpecArr  - Array: list of key IDs or User IDs
   * @param numDay      - Number: number of days from now
   *
   * @return Array      - list of keys that will expire
   */

  getExpiryForKeySpec(keySpecArr, numDays) {
    EnigmailLog.DEBUG("keyUsability.jsm: getExpiryForKeySpec()\n");
    let now = Math.floor(Date.now() / 1000);
    let enigmailSvc = EnigmailCore.getService();
    if (!enigmailSvc) {
      return [];
    }

    let result = keySpecArr.reduce(function(p, keySpec) {
      let key;

      if (keySpec.search(/^(0x)?[0-9A-F]{8,40}$/i) === 0) {
        key = getKeyRing().getKeyById(keySpec);
      } else {
        key = getKeyRing().getSecretKeyByEmail(keySpec);
      }
      if (!key) {
        return p;
      }

      let maxExpiry = Number.MIN_VALUE;
      let maxKey = null;

      let ex = key.getKeyExpiry();
      if (ex > maxExpiry) {
        maxExpiry = ex;
        maxKey = key;
      }

      if (maxExpiry < now + DAY * numDays && maxExpiry >= now) {
        p.push(maxKey);
      }

      return p;
    }, []);

    result = uniqueKeyList(result);
    return result;
  },

  /**
   * Determine the configured key specifications for all identities
   * where Enigmail is enabled
   *
   * @return  Array of Strings - list of keyId and email addresses
   */
  getKeysSpecForIdentities() {
    EnigmailLog.DEBUG("keyUsability.jsm: getKeysSpecForIdentities()\n");
    let accountManager = Cc[
      "@mozilla.org/messenger/account-manager;1"
    ].getService(Ci.nsIMsgAccountManager);

    let keySpecList = [];

    for (let acct = 0; acct < accountManager.accounts.length; acct++) {
      let ac = accountManager.accounts.queryElementAt(acct, Ci.nsIMsgAccount);

      for (let i = 0; i < ac.identities.length; i++) {
        let id = ac.identities.queryElementAt(i, Ci.nsIMsgIdentity);
        if (id.getBoolAttribute("enablePgp")) {
          if (id.getIntAttribute("pgpKeyMode") === 1) {
            keySpecList.push(id.getCharAttribute("pgpkeyId"));
          } else {
            keySpecList.push(id.email);
          }
        }
      }
    }

    return keySpecList;
  },

  /**
   * Check if all keys of all configured identities are still valid in N days.
   * (N is configured via warnKeyExpiryNumDays; 0 = disable the check)
   *
   * @return  Array of keys - the keys that have expired since the last check
   *          null in case no check was performed
   */
  getNewlyExpiredKeys() {
    EnigmailLog.DEBUG("keyUsability.jsm: getNewlyExpiredKeys()\n");

    let numDays = EnigmailPrefs.getPref("warnKeyExpiryNumDays");
    if (numDays < 1) {
      return null;
    }

    let now = Date.now();

    let lastResult = {
      expiredList: [],
      lastCheck: 0,
    };

    let lastRes = EnigmailPrefs.getPref("keyCheckResult");
    if (lastRes.length > 0) {
      lastResult = JSON.parse(lastRes);
    }

    if (now - lastResult.lastCheck < DAY * 1000) {
      return null;
    }

    let keys = this.getKeysSpecForIdentities();

    if (keys.length === 0) {
      lastResult.lastCheck = now;
      EnigmailPrefs.setPref("keyCheckResult", JSON.stringify(lastResult));
      return [];
    }

    let expired = this.getExpiryForKeySpec(keys, numDays);

    let expiredList = expired.reduce(function(p, key) {
      p.push(key.keyId);
      return p;
    }, []);

    let newResult = {
      expiredList,
      lastCheck: now,
    };

    EnigmailPrefs.setPref("keyCheckResult", JSON.stringify(newResult));

    let warnList = expired.reduce(function(p, key) {
      if (!lastResult.expiredList.includes(key.keyId)) {
        p.push(key);
      }
      return p;
    }, []);

    return warnList;
  },

  keyExpiryCheck() {
    EnigmailLog.DEBUG("keyUsability.jsm: keyExpiryCheck()\n");

    let expiredKeys = this.getNewlyExpiredKeys();
    if (!expiredKeys || expiredKeys.length === 0) {
      return "";
    }

    let numDays = EnigmailPrefs.getPref("warnKeyExpiryNumDays");

    if (expiredKeys.length === 1) {
      return EnigmailLocale.getString("expiry.keyExpiresSoon", [
        getKeyDesc(expiredKeys[0]),
        numDays,
      ]);
    }

    let keyDesc = "";
    for (let i = 0; i < expiredKeys.length; i++) {
      keyDesc += "- " + getKeyDesc(expiredKeys[i]) + "\n";
    }
    return EnigmailLocale.getString("expiry.keysExpireSoon", [
      numDays,
      keyDesc,
    ]);
  },

  /**
   * Check whether some key pairs (i.e. key with a secret key) have an
   * ownertrust of less than "ultimate".
   *
   * @param keySpecArr  - Array: list of key IDs or User IDs
   *
   * @return Array      - list of keys that have ownertrust below "ultimate"
   */

  getOwnerTrustForKeySpec(keySpecArr) {
    EnigmailLog.DEBUG("keyUsability.jsm: getOwnerTrustForKeySpec()\n");
    let enigmailSvc = EnigmailCore.getService();
    if (!enigmailSvc) {
      return [];
    }

    let result = keySpecArr.reduce(function(p, keySpec) {
      let key;

      if (keySpec.search(/^(0x)?[0-9A-F]{8,40}$/i) === 0) {
        key = getKeyRing().getKeyById(keySpec);
        if (!key) {
          return p;
        }
      } else {
        key = getKeyRing().getSecretKeyByEmail(keySpec);
        if (!key) {
          return p;
        }
      }

      let ot = key.ownerTrust;
      if (ot !== "u") {
        p.push(key);
      }

      return p;
    }, []);

    result = uniqueKeyList(result);
    return result;
  },

  /**
   * Check if all keys of all configured identities have "ultimate" ownertrust
   *
   * @return  String Message listing the keys that have less ownertrust
   *          resultObj.Count: Number of those keys
   *          resultObj.KeyId: KeyId (only if a single key is concerned)
   */

  keyOwnerTrustCheck(resultObj) {
    EnigmailLog.DEBUG("keyUsability.jsm: keyOwnerTrustCheck()\n");
    resultObj.Count = 0;

    let keys = this.getKeysSpecForIdentities();

    if (keys.length === 0) {
      return "";
    }

    let keysMissingOwnertrust = this.getOwnerTrustForKeySpec(keys);

    if (!keysMissingOwnertrust || keysMissingOwnertrust.length === 0) {
      return "";
    }

    resultObj.Count = keysMissingOwnertrust.length;

    if (keysMissingOwnertrust.length === 1) {
      let keyDesc = getKeyDesc(keysMissingOwnertrust[0]);
      resultObj.keyId = keysMissingOwnertrust[0].keyId;
      return EnigmailLocale.getString("expiry.keyMissingOwnerTrust", keyDesc);
    }

    let keyDesc = "";
    for (let i = 0; i < keysMissingOwnertrust.length; i++) {
      keyDesc += "- " + getKeyDesc(keysMissingOwnertrust[i]) + "\n";
    }
    return EnigmailLocale.getString("expiry.keysMissingOwnerTrust", keyDesc);
  },

  /**
   * Run the check for Ownertrust ("You rely on certifications") and
   * Display a message if something needs to be done
   */
  checkOwnertrust() {
    EnigmailLog.DEBUG("keyUsability.jsm: checkOwnertrust\n");

    var resultObj = {};
    let msg = this.keyOwnerTrustCheck(resultObj);

    if (
      msg &&
      msg.length > 0 &&
      EnigmailPrefs.getPref("warnOnMissingOwnerTrust")
    ) {
      let actionButtonText = "";

      if (resultObj && resultObj.Count === 1) {
        // single key is concerned
        actionButtonText = EnigmailLocale.getString("expiry.OpenKeyProperties");
      } else {
        // Multiple keys concerned
        actionButtonText = EnigmailLocale.getString("expiry.OpenKeyManager");
      }

      let checkedObj = {};
      let r = getDialog().msgBox(
        null,
        {
          msgtext: msg,
          dialogTitle: EnigmailLocale.getString("enigInfo"),
          checkboxLabel: EnigmailLocale.getString("dlgNoPrompt"),
          button1: EnigmailLocale.getString("dlg.button.close"),
          button2: actionButtonText,
          iconType: EnigmailConstants.ICONTYPE_INFO,
        },
        checkedObj
      );
      if (r >= 0 && checkedObj.value) {
        // Do not show me this dialog again
        EnigmailPrefs.setPref("warnOnMissingOwnerTrust", false);
      }
      if (r == 1) {
        if (resultObj && resultObj.Count === 1) {
          // single key is concerned, open key details dialog
          getWindows().openKeyDetails(null, resultObj.keyId, false);
        } else {
          // Multiple keys concerned, open Key Manager
          getWindows().openKeyManager(null);
        }
      }
    }
  },
};

/**
 * Remove duplicate key Object elements from an array
 *
 * @param arr - Array of key Objects to be worked on
 *
 * @return Array - the array without duplicates
 */

function uniqueKeyList(arr) {
  return arr.reduce(function(p, c) {
    let r = p.find(function(e, i, a) {
      return e.keyId === c.keyId;
    });

    if (r === undefined) {
      p.push(c);
    }
    return p;
  }, []);
}

function getKeyDesc(key) {
  return '"' + key.userId + '" (key ID ' + key.fprFormatted + ")";
}
