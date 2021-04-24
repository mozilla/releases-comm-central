/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKeyUsability"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

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
        key = EnigmailKeyRing.getKeyById(keySpec);
      } else {
        key = EnigmailKeyRing.getSecretKeyByEmail(keySpec);
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

    let keySpecList = [];

    for (let ac of MailServices.accounts.accounts) {
      for (let id of ac.identities) {
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

    let numDays = Services.prefs.getIntPref(
      "temp.openpgp.warnKeyExpiryNumDays"
    );
    if (numDays < 1) {
      return null;
    }

    let now = Date.now();

    let lastResult = {
      expiredList: [],
      lastCheck: 0,
    };

    let lastRes = Services.prefs.getCharPref("temp.openpgp.keyCheckResult");
    if (lastRes.length > 0) {
      lastResult = JSON.parse(lastRes);
    }

    if (now - lastResult.lastCheck < DAY * 1000) {
      return null;
    }

    let keys = this.getKeysSpecForIdentities();

    if (keys.length === 0) {
      lastResult.lastCheck = now;
      Services.prefs.setCharPref(
        "temp.openpgp.keyCheckResult",
        JSON.stringify(lastResult)
      );
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

    Services.prefs.setCharPref(
      "temp.openpgp.keyCheckResult",
      JSON.stringify(newResult)
    );

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

    let numDays = Services.prefs.getIntPref(
      "temp.openpgp.warnKeyExpiryNumDays"
    );

    if (expiredKeys.length === 1) {
      return l10n.formatValueSync("expiry-key-expires-soon", {
        desc: getKeyDesc(expiredKeys[0]),
        days: numDays,
      });
    }

    let keyDesc = "";
    for (let i = 0; i < expiredKeys.length; i++) {
      keyDesc += "- " + getKeyDesc(expiredKeys[i]) + "\n";
    }
    return l10n.formatValueSync("expiry-keys-expire-soon", {
      desc: keyDesc,
      days: numDays,
    });
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
        key = EnigmailKeyRing.getKeyById(keySpec);
        if (!key) {
          return p;
        }
      } else {
        key = EnigmailKeyRing.getSecretKeyByEmail(keySpec);
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
      return l10n.formatValueSync("expiry-key-missing-owner-trust", {
        desc: keyDesc,
      });
    }

    let keyDesc = "";
    for (let i = 0; i < keysMissingOwnertrust.length; i++) {
      keyDesc += "- " + getKeyDesc(keysMissingOwnertrust[i]) + "\n";
    }
    return l10n.formatValueSync("expiry-keys-missing-owner-trust", {
      desc: keyDesc,
    });
  },

  /**
   * Run the check for Ownertrust ("You rely on certifications") and
   * Display a message if something needs to be done
   */
  async checkOwnertrust() {
    EnigmailLog.DEBUG("keyUsability.jsm: checkOwnertrust\n");

    var resultObj = {};
    let msg = this.keyOwnerTrustCheck(resultObj);

    if (
      msg &&
      msg.length > 0 &&
      Services.prefs.getBoolPref("temp.openpgp.warnOnMissingOwnerTrust")
    ) {
      let actionButtonText = "";

      if (resultObj && resultObj.Count === 1) {
        // single key is concerned
        actionButtonText = await l10n.formatValue("expiry-open-key-properties");
      } else {
        // Multiple keys concerned
        actionButtonText = await l10n.formatValue("expiry-open-key-manager");
      }

      let checkedObj = {};
      let r = EnigmailDialog.msgBox(
        null,
        {
          msgtext: msg,
          dialogTitle: await l10n.formatValue("enig-info"),
          checkboxLabel: await l10n.formatValue("dlg-no-prompt"),
          button1: await l10n.formatValue("dlg-button-close"),
          button2: actionButtonText,
          iconType: EnigmailConstants.ICONTYPE_INFO,
        },
        checkedObj
      );
      if (r >= 0 && checkedObj.value) {
        // Do not show me this dialog again
        Services.prefs.setBoolCharPref(
          "temp.openpgp.warnOnMissingOwnerTrust",
          false
        );
      }
      if (r == 1) {
        if (resultObj && resultObj.Count === 1) {
          // single key is concerned, open key details dialog
          EnigmailWindows.openKeyDetails(null, resultObj.keyId, false);
        } else {
          // Multiple keys concerned, open Key Manager
          EnigmailWindows.openKeyManager(null);
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
