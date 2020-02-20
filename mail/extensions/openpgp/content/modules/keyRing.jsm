/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKeyRing"];

const EnigmailLog = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
).EnigmailLog;
const EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
const EnigmailFiles = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
).EnigmailFiles;
const EnigmailTrust = ChromeUtils.import(
  "chrome://openpgp/content/modules/trust.jsm"
).EnigmailTrust;
const EnigmailArmor = ChromeUtils.import(
  "chrome://openpgp/content/modules/armor.jsm"
).EnigmailArmor;
const EnigmailLazy = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
).EnigmailLazy;
const newEnigmailKeyObj = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyObj.jsm"
).newEnigmailKeyObj;
const Services = ChromeUtils.import("resource://gre/modules/Services.jsm")
  .Services;
const EnigmailCryptoAPI = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
).EnigmailCryptoAPI;

const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");
const getWindows = EnigmailLazy.loader(
  "enigmail/windows.jsm",
  "EnigmailWindows"
);

const DEFAULT_FILE_PERMS = 0o600;

let gKeyListObj = null;
let gKeyIndex = [];
let gSubkeyIndex = [];
let gLoadingKeys = false;

/*

  This module operates with a Key Store (array) containing objects with the following properties:

  * keyList [Array] of EnigmailKeyObj

  * keySortList [Array]:  used for quickly sorting the keys
    - userId (in lower case)
    - keyId
    - keyNum
  * trustModel: [String]. One of:
            - p: pgp/classical
            - t: always trust
            - a: auto (:0) (default, currently pgp/classical)
            - T: TOFU
            - TP: TOFU+PGP

*/

const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();

var EnigmailKeyRing = {
  /**
   * Get the complete list of all public keys, optionally sorted by a column
   *
   * @param  win           - optional |object| holding the parent window for displaying error messages
   * @param  sortColumn    - optional |string| containing the column name for sorting. One of:
   *                            userid, keyid, keyidshort, fpr, keytype, validity, trust, expiry
   * @param  sortDirection - |number| 1 = ascending / -1 = descending
   *
   * @return keyListObj    - |object| { keyList, keySortList } (see above)
   */
  getAllKeys(win, sortColumn, sortDirection) {
    console.debug("keyring.getAllKeys");
    if (gKeyListObj.keySortList.length === 0) {
      console.debug("keyring.getAllKeys - loadkeylist");
      loadKeyList(win, sortColumn, sortDirection);
      console.debug("keyring.getAllKeys - keymanreloadkeys");
      //getWindows().keyManReloadKeys();
      /* TODO: do we need something similar with TB's future trust behavior?
      if (!gKeyCheckDone) {
        gKeyCheckDone = true;
        runKeyUsabilityCheck();
      }
      */
    } else if (sortColumn) {
      gKeyListObj.keySortList.sort(
        getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection)
      );
    }

    return gKeyListObj;
  },

  /**
   * get a list of all (valid, usable) keys that have a secret key
   *
   * @param Boolean onlyValidKeys: if true, only filter valid usable keys
   *
   * @return Array of KeyObjects containing the found keys (sorted by userId)
   **/

  getAllSecretKeys(onlyValidKeys = false) {
    EnigmailLog.DEBUG("keyRing.jsm: getAllSecretKeys()\n");

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    if (!onlyValidKeys) {
      for (let key of gKeyListObj.keyList) {
        if (key.secretAvailable) {
          res.push(key);
        }
      }
    } else {
      for (let key of gKeyListObj.keyList) {
        if (key.secretAvailable && key.keyUseFor.search(/D/) < 0) {
          // key is not disabled and _usable_ for encryption signing and certification
          if (
            key.keyUseFor.search(/E/) >= 0 &&
            key.keyUseFor.search(/S/) >= 0 &&
            key.keyUseFor.search(/C/) >= 0
          ) {
            res.push(key);
          }
        }
      }
    }

    res.sort(function(a, b) {
      if (a.userId == b.userId) {
        return a.keyId < b.keyId ? -1 : 1;
      }
      return a.userId.toLowerCase() < b.userId.toLowerCase() ? -1 : 1;
    });

    return res;
  },

  /**
   * get 1st key object that matches a given key ID or subkey ID
   *
   * @param keyId      - String: key Id with 16 characters (preferred) or 8 characters),
   *                             or fingerprint (40 or 32 characters).
   *                             Optionally preceeded with "0x"
   * @param noLoadKeys - Boolean [optional]: do not try to load the key list first
   *
   * @return Object - found KeyObject or null if key not found
   */
  getKeyById(keyId, noLoadKeys) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyById: " + keyId + "\n");

    if (!keyId) {
      return null;
    }

    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2);
    }

    if (!noLoadKeys) {
      this.getAllKeys(); // ensure keylist is loaded;
    }

    let keyObj = gKeyIndex[keyId];

    if (keyObj === undefined) {
      keyObj = gSubkeyIndex[keyId];
    }

    return keyObj !== undefined ? keyObj : null;
  },

  /**
   * get all key objects that match a given user ID
   *
   * @param searchTerm   - String: a regular expression to match against all UIDs of the keys.
   *                               The search is always performed case-insensitively
   *                               An empty string will return no result
   * @param onlyValidUid - Boolean: if true (default), invalid (e.g. revoked) UIDs are not matched
   *
   * @return Array of KeyObjects with the found keys (array length is 0 if no key found)
   */
  getKeysByUserId(searchTerm, onlyValidUid = true) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeysByUserId: '" + searchTerm + "'\n");
    let s = new RegExp(searchTerm, "i");

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    if (searchTerm === "") {
      return res;
    }
    console.debug(gKeyListObj.keyList);
    for (let i in gKeyListObj.keyList) {
      let k = gKeyListObj.keyList[i];

      for (let j in k.userIds) {
        if (k.userIds[j].type === "uid" && k.userIds[j].userId.search(s) >= 0) {
          console.debug("found " + k.userIds[j].userId);
          if (
            !onlyValidUid ||
            !EnigmailTrust.isInvalid(k.userIds[j].keyTrust)
          ) {
            res.push(k);
            continue;
          }
        }
      }
    }
    console.debug("getKeysByUserId result: %o", res);
    return res;
  },

  /**
   * Specialized function for getSecretKeyByUserId() that takes into account
   * the specifics of email addresses in UIDs.
   *
   * @param emailAddr: String - email address to search for without any angulars
   *                            or names
   *
   * @return KeyObject with the found key, or null if no key found
   */
  getSecretKeyByEmail(emailAddr) {
    // sanitize email address
    emailAddr = emailAddr.replace(/([\.\[\]\-\\])/g, "\\$1");

    let searchTerm =
      "(<" + emailAddr + ">| " + emailAddr + "$|^" + emailAddr + "$)";

    return this.getSecretKeyByUserId(searchTerm);
  },

  /**
   * get the "best" possible secret key for a given user ID
   *
   * @param searchTerm   - String: a regular expression to match against all UIDs of the keys.
   *                               The search is always performed case-insensitively
   * @return KeyObject with the found key, or null if no key found
   */
  getSecretKeyByUserId(searchTerm) {
    EnigmailLog.DEBUG(
      "keyRing.jsm: getSecretKeyByUserId: '" + searchTerm + "'\n"
    );
    let keyList = this.getKeysByUserId(searchTerm, true);
    console.debug(
      "getSecretKeyByUserId, got result from getKeysByUserId: %o",
      keyList
    );

    let foundKey = null;

    for (let key of keyList) {
      if (
        key.secretAvailable &&
        key.getEncryptionValidity().keyValid &&
        key.getSigningValidity().keyValid
      ) {
        if (!foundKey) {
          foundKey = key;
        } else if (
          foundKey.algoSym === key.algoSym &&
          foundKey.keySize === key.keySize
        ) {
          if (key.expiryTime > foundKey.expiryTime) {
            foundKey = key;
          }
        } else if (
          foundKey.algoSym.search(/^(DSA|RSA)$/) < 0 &&
          key.algoSym.search(/^(DSA|RSA)$/) === 0
        ) {
          // prefer RSA or DSA over ECC (long-term: change this once ECC keys are widely supported)
          foundKey = key;
        } else if (key.getVirtualKeySize() > foundKey.getVirtualKeySize()) {
          foundKey = key;
        }
      }
    }
    console.debug("getSecretKeyByUserId, foundKey: %o", foundKey);
    return foundKey;
  },

  /**
   * get a list of keys for a given set of (sub-) key IDs
   *
   * @param keyIdList: Array of key IDs
                       OR String, with space-separated list of key IDs
   */
  getKeyListById(keyIdList) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyListById: '" + keyIdList + "'\n");
    let keyArr;
    if (typeof keyIdList === "string") {
      keyArr = keyIdList.split(/ +/);
    } else {
      keyArr = keyIdList;
    }

    let ret = [];
    for (let i in keyArr) {
      let r = this.getKeyById(keyArr[i]);
      if (r) {
        ret.push(r);
      }
    }

    return ret;
  },

  importKeyFromFile(inputFile, errorMsgObj, importedKeysObj) {
    EnigmailLog.DEBUG(
      "keyRing.jsm: EnigmailKeyRing.importKeyFromFile: fileName=" +
        inputFile.path +
        "\n"
    );

    const cApi = EnigmailCryptoAPI();
    let res = cApi.sync(cApi.importKeyFromFile(inputFile));
    if (importedKeysObj) {
      importedKeysObj.value = res.importedKeys.join(";");
    }

    if (!res) {
      return 1;
    }

    if (res.importedKeys.length > 0) {
      EnigmailKeyRing.updateKeys(res.importedKeys);
    } else if (res.importSum > res.importUnchanged) {
      EnigmailKeyRing.clearCache();
    }

    return res.exitCode;
  },

  /**
   * empty the key cache, such that it will get loaded next time it is accessed
   *
   * no input or return values
   */
  clearCache() {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.clearCache\n");
    gKeyListObj = {
      keyList: [],
      keySortList: [],
    };

    gKeyIndex = [];
    gSubkeyIndex = [];
  },

  /**
   * Check if the cache is empty
   *
   * @return  Boolean: true: cache cleared
   */
  getCacheEmpty() {
    return gKeyIndex.length === 0;
  },

  /**
   * Get a list of UserIds for a given key.
   * Only the Only UIDs with highest trust level are returned.
   *
   * @param  String  keyId   key, optionally preceeded with 0x
   *
   * @return Array of String: list of UserIds
   */
  getValidUids(keyId) {
    let r = [];
    let keyObj = this.getKeyById(keyId);

    if (keyObj) {
      const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();
      let hideInvalidUid = true;
      let maxTrustLevel = TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust);

      if (EnigmailTrust.isInvalid(keyObj.keyTrust)) {
        // pub key not valid (anymore)-> display all UID's
        hideInvalidUid = false;
      }

      for (let i in keyObj.userIds) {
        if (keyObj.userIds[i].type !== "uat") {
          if (hideInvalidUid) {
            let thisTrust = TRUSTLEVELS_SORTED.indexOf(
              keyObj.userIds[i].keyTrust
            );
            if (thisTrust > maxTrustLevel) {
              r = [keyObj.userIds[i].userId];
              maxTrustLevel = thisTrust;
            } else if (thisTrust === maxTrustLevel) {
              r.push(keyObj.userIds[i].userId);
            }
            // else do not add uid
          } else if (
            !EnigmailTrust.isInvalid(keyObj.userIds[i].keyTrust) ||
            !hideInvalidUid
          ) {
            // UID valid  OR  key not valid, but invalid keys allowed
            r.push(keyObj.userIds[i].userId);
          }
        }
      }
    }

    return r;
  },

  /**
   * Export public and possibly secret key(s) to a file
   *
   * @param includeSecretKey  Boolean  - if true, secret keys are exported
   * @param userId            String   - space or comma separated list of keys to export. Specification by
   *                                     key ID, fingerprint, or userId
   * @param outputFile        String or nsIFile - output file name or Object - or NULL
   * @param exitCodeObj       Object   - o.value will contain exit code
   * @param errorMsgObj       Object   - o.value will contain error message from GnuPG
   *
   * @return String - if outputFile is NULL, the key block data; "" if a file is written
   */
  extractKey(includeSecretKey, id, outputFile, exitCodeObj, errorMsgObj) {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.extractKey: " + id + "\n");
    exitCodeObj.value = -1;

    console.debug(
      "keyRing.jsm: EnigmailKeyRing.extractKey: type of parameter id:"
    );
    console.debug(typeof id);
    console.debug(id);

    if (includeSecretKey) {
      throw new Error("extractKey with secret key not implemented");
    }

    if (!id.length) {
      return "";
    }

    if (id.length > 1) {
      throw new Error(
        "keyRing.jsm: EnigmailKeyRing.extractKey: multiple IDs not yet implemented"
      );
    }

    const cApi = EnigmailCryptoAPI();
    let keyBlock = cApi.sync(cApi.getPublicKey(id[0]));
    if (!keyBlock) {
      errorMsgObj.value = EnigmailLocale.getString("failKeyExtract");
      return "";
    }

    exitCodeObj.value = 0;
    if (outputFile) {
      if (
        !EnigmailFiles.writeFileContents(
          outputFile,
          keyBlock,
          DEFAULT_FILE_PERMS
        )
      ) {
        exitCodeObj.value = -1;
        errorMsgObj.value = EnigmailLocale.getString("fileWriteFailed", [
          outputFile,
        ]);
      }
      return "";
    }
    return keyBlock;
  },

  /**
   * import key from provided key data (synchronous)
   *
   * @param parent          nsIWindow
   * @param isInteractive   Boolean  - if true, display confirmation dialog
   * @param keyBlock        String   - data containing key
   * @param keyId           String   - key ID expected to import (no meaning)
   * @param errorMsgObj     Object   - o.value will contain error message from GnuPG
   * @param importedKeysObj Object   - [OPTIONAL] o.value will contain an array of the FPRs imported
   * @param minimizeKey     Boolean  - [OPTIONAL] minimize key for importing
   * @param limitedUids     Array<String> - [OPTIONAL] restrict importing the key(s) to a given set of UIDs
   *
   * @return Integer -  exit code:
   *      ExitCode == 0  => success
   *      ExitCode > 0   => error
   *      ExitCode == -1 => Cancelled by user
   */
  importKey(
    parent,
    isInteractive,
    keyBlock,
    keyId,
    errorMsgObj,
    importedKeysObj,
    minimizeKey = false,
    limitedUids = []
  ) {
    const cApi = EnigmailCryptoAPI();
    return cApi.sync(
      this.importKeyAsync(
        parent,
        isInteractive,
        keyBlock,
        keyId,
        errorMsgObj,
        importedKeysObj,
        minimizeKey,
        limitedUids
      )
    );
  },

  /**
   * import key from provided key data
   *
   * @param parent          nsIWindow
   * @param isInteractive   Boolean  - if true, display confirmation dialog
   * @param keyBlock        String   - data containing key
   * @param keyId           String   - key ID expected to import (no meaning)
   * @param errorMsgObj     Object   - o.value will contain error message from GnuPG
   * @param importedKeysObj Object   - [OPTIONAL] o.value will contain an array of the FPRs imported
   * @param minimizeKey     Boolean  - [OPTIONAL] minimize key for importing
   * @param limitedUids     Array<String> - [OPTIONAL] restrict importing the key(s) to a given set of UIDs
   *
   * @return Integer -  exit code:
   *      ExitCode == 0  => success
   *      ExitCode > 0   => error
   *      ExitCode == -1 => Cancelled by user
   */
  async importKeyAsync(
    parent,
    isInteractive,
    keyBlock,
    keyId,
    errorMsgObj,
    importedKeysObj,
    minimizeKey = false,
    limitedUids = []
  ) {
    EnigmailLog.DEBUG(
      `keyRing.jsm: EnigmailKeyRing.importKeyAsync('${keyId}', ${isInteractive}, ${minimizeKey})\n`
    );

    const beginIndexObj = {};
    const endIndexObj = {};
    const blockType = EnigmailArmor.locateArmoredBlock(
      keyBlock,
      0,
      "",
      beginIndexObj,
      endIndexObj,
      {}
    );
    if (!blockType) {
      errorMsgObj.value = EnigmailLocale.getString("noPGPblock");
      return 1;
    }

    if (blockType.search(/^(PUBLIC|PRIVATE) KEY BLOCK$/) !== 0) {
      errorMsgObj.value = EnigmailLocale.getString("notFirstBlock");
      return 1;
    }

    const pgpBlock = keyBlock.substr(
      beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1
    );

    if (isInteractive) {
      if (
        !getDialog().confirmDlg(
          parent,
          EnigmailLocale.getString("importKeyConfirm"),
          EnigmailLocale.getString("keyMan.button.import")
        )
      ) {
        errorMsgObj.value = EnigmailLocale.getString("failCancel");
        return -1;
      }
    }

    if (limitedUids.length > 0) {
      throw new Error("importKeyAsync with limitedUids: not implemented");
    }

    if (minimizeKey) {
      throw new Error("importKeyAsync with minimizeKey: not implemented");
    }

    const cApi = EnigmailCryptoAPI();
    cApi.sync(cApi.importKeyBlock(pgpBlock));

    if (!importedKeysObj) {
      importedKeysObj = {};
    }
    importedKeysObj.value = [];

    let exitCode = 0;

    EnigmailKeyRing.clearCache();

    return exitCode;
  },

  /**
   * Generate a new key pair with GnuPG
   *
   * @name:       String     - name part of UID
   * @comment:    String     - comment part of UID (brackets are added)
   * @comment:    String     - email part of UID (<> will be added)
   * @expiryDate: Number     - Unix timestamp of key expiry date; 0 if no expiry
   * @keyLength:  Number     - size of key in bytes (e.g 4096)
   * @keyType:    String     - RSA or ECC
   * @passphrase: String     - password; null if no password
   * @listener:   Object     - {
   *                             function onDataAvailable(data) {...},
   *                             function onStopRequest(exitCode) {...}
   *                           }
   *
   * @return: handle to process
   */
  generateKey(
    name,
    comment,
    email,
    expiryDate,
    keyLength,
    keyType,
    passphrase,
    listener
  ) {
    EnigmailLog.WRITE("keyRing.jsm: generateKey:\n");
    throw new Error("Not implemented");
  },

  /**
   * try to find valid key for encryption to passed email address
   *
   * @param details if not null returns error in details.msg
   *
   * @return: found key ID (without leading "0x") or null
   */
  getValidKeyForRecipient(emailAddr, minTrustLevelIndex, details) {
    EnigmailLog.DEBUG(
      'keyRing.jsm: getValidKeyForRecipient(): emailAddr="' + emailAddr + '"\n'
    );
    const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();
    const fullTrustIndex = TRUSTLEVELS_SORTED.indexOf("f");

    emailAddr = emailAddr.toLowerCase();
    var embeddedEmailAddr = "<" + emailAddr + ">";

    // note: we can't take just the first matched because we might have faked keys as duplicates
    var foundKeyId = null;
    var foundKeyTrustIndex = null;

    let k = this.getAllKeys(null, "validity", -1);
    let keyList = k.keyList;
    let keySortList = k.keySortList;

    // **** LOOP to check against each key
    // - note: we have sorted the keys according to validity
    //         to abort the loop as soon as we reach keys that are not valid enough
    for (var idx = 0; idx < keySortList.length; idx++) {
      var keyObj = keyList[keySortList[idx].keyNum];
      var keyTrust = keyObj.keyTrust;
      var keyTrustIndex = TRUSTLEVELS_SORTED.indexOf(keyTrust);
      //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  check key " + keyObj.keyId + "\n");

      // key trust (our sort criterion) too low?
      // => *** regular END of the loop
      if (keyTrustIndex < minTrustLevelIndex) {
        if (!foundKeyId) {
          if (details) {
            details.msg = "ProblemNoKey";
          }
          let msg =
            "no key with enough trust level for '" + emailAddr + "' found";
          EnigmailLog.DEBUG(
            "keyRing.jsm: getValidKeyForRecipient():  " + msg + "\n"
          );
        }
        return foundKeyId; // **** regular END OF LOOP (return NULL or found single key)
      }

      // key valid for encryption?
      if (!keyObj.keyUseFor.includes("E")) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (not provided for encryption)\n");
        continue; // not valid for encryption => **** CONTINUE the LOOP
      }
      // key disabled?
      if (keyObj.keyUseFor.includes("D")) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (disabled)\n");
        continue; // disabled => **** CONTINUE the LOOP
      }

      // check against the user ID
      var userId = keyObj.userId.toLowerCase();
      if (
        userId &&
        (userId == emailAddr || userId.includes(embeddedEmailAddr))
      ) {
        if (keyTrustIndex < minTrustLevelIndex) {
          EnigmailLog.DEBUG(
            "keyRing.jsm: getValidKeyForRecipient():  matching key=" +
              keyObj.keyId +
              " found but not enough trust\n"
          );
        } else {
          // key with enough trust level found
          EnigmailLog.DEBUG(
            "keyRing.jsm: getValidKeyForRecipient():  key=" +
              keyObj.keyId +
              ' keyTrust="' +
              keyTrust +
              '" found\n'
          );

          // immediately return if a fully or ultimately trusted key is found
          // (faked keys should not be an issue here, so we don't have to check other keys)
          if (keyTrustIndex >= fullTrustIndex) {
            return keyObj.keyId;
          }

          if (foundKeyId != keyObj.keyId) {
            // new matching key found (note: might find same key via subkeys)
            if (foundKeyId) {
              // different matching keys found
              if (foundKeyTrustIndex > keyTrustIndex) {
                return foundKeyId; // OK, previously found key has higher trust level
              }
              // error because we have two keys with same trust level
              // => let the user decide (to prevent from using faked keys with default trust level)
              if (details) {
                details.msg = "ProblemMultipleKeys";
              }
              let msg =
                "multiple matching keys with same trust level found for '" +
                emailAddr +
                "' ";
              EnigmailLog.DEBUG(
                "keyRing.jsm: getValidKeyForRecipient():  " +
                  msg +
                  ' trustLevel="' +
                  keyTrust +
                  '" (0x' +
                  foundKeyId +
                  " and 0x" +
                  keyObj.keyId +
                  ")\n"
              );
              return null;
            }
            // save found key to compare with other matching keys (handling of faked keys)
            foundKeyId = keyObj.keyId;
            foundKeyTrustIndex = keyTrustIndex;
          }
          continue; // matching key found (again) => **** CONTINUE the LOOP (don't check Sub-UserIDs)
        }
      }

      // check against the sub user ID
      // (if we are here, the primary user ID didn't match)
      // - Note: sub user IDs have NO owner trust
      for (var subUidIdx = 1; subUidIdx < keyObj.userIds.length; subUidIdx++) {
        var subUidObj = keyObj.userIds[subUidIdx];
        var subUserId = subUidObj.userId.toLowerCase();
        var subUidTrust = subUidObj.keyTrust;
        var subUidTrustIndex = TRUSTLEVELS_SORTED.indexOf(subUidTrust);
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  check subUid " + subUidObj.keyId + "\n");

        if (
          subUserId &&
          (subUserId == emailAddr || subUserId.includes(embeddedEmailAddr))
        ) {
          if (subUidTrustIndex < minTrustLevelIndex) {
            EnigmailLog.DEBUG(
              "keyRing.jsm: getValidKeyForRecipient():  matching subUid=" +
                keyObj.keyId +
                " found but not enough trust\n"
            );
          } else {
            // subkey with enough trust level found
            EnigmailLog.DEBUG(
              "keyRing.jsm: getValidKeyForRecipient():  matching subUid in key=" +
                keyObj.keyId +
                ' keyTrust="' +
                keyTrust +
                '" found\n'
            );

            if (keyTrustIndex >= fullTrustIndex) {
              // immediately return if a fully or ultimately trusted key is found
              // (faked keys should not be an issue here, so we don't have to check other keys)
              return keyObj.keyId;
            }

            if (foundKeyId != keyObj.keyId) {
              // new matching key found (note: might find same key via different subkeys)
              if (foundKeyId) {
                // different matching keys found
                if (foundKeyTrustIndex > subUidTrustIndex) {
                  return foundKeyId; // OK, previously found key has higher trust level
                }
                // error because we have two keys with same trust level
                // => let the user decide (to prevent from using faked keys with default trust level)
                if (details) {
                  details.msg = "ProblemMultipleKeys";
                }
                let msg =
                  "multiple matching keys with same trust level found for '" +
                  emailAddr +
                  "' ";
                EnigmailLog.DEBUG(
                  "keyRing.jsm: getValidKeyForRecipient():  " +
                    msg +
                    ' trustLevel="' +
                    keyTrust +
                    '" (0x' +
                    foundKeyId +
                    " and 0x" +
                    keyObj.keyId +
                    ")\n"
                );
                return null;
              }
              // save found key to compare with other matching keys (handling of faked keys)
              foundKeyId = keyObj.keyId;
              foundKeyTrustIndex = subUidTrustIndex;
            }
          }
        }
      }
    } // **** LOOP to check against each key

    if (!foundKeyId) {
      EnigmailLog.DEBUG(
        "keyRing.jsm: getValidKeyForRecipient():  no key for '" +
          emailAddr +
          "' found\n"
      );
    }
    return foundKeyId;
  },

  /**
   *  Determine the key ID for a set of given addresses
   *
   * @param {Array<String>} addresses: email addresses
   * @param {String} minTrustLevel:    f for Fully trusted keys / ? for any valid key
   * @param {Object} details:          holds details for invalid keys:
   *                                   - errArray: {
   *                                       * addr {String}: email addresses
   *                                       * msg {String}:  related error
   *                                       }
   *                                   - keyMap {Object<String>}: map of email addr -> keyID
   * @param {Array<String>} resultingArray: list of found key IDs
   *
   * @return {Boolean}: true if at least one key missing; false otherwise
   */
  getValidKeysForAllRecipients(
    addresses,
    minTrustLevel,
    details,
    resultingArray
  ) {
    let minTrustLevelIndex = TRUSTLEVELS_SORTED.indexOf(minTrustLevel);

    // check whether each address is or has a key:
    let keyMissing = false;
    if (details) {
      details.errArray = [];
      details.keyMap = {};
    }
    for (let i = 0; i < addresses.length; i++) {
      let addr = addresses[i];
      // try to find current address in key list:
      let keyId = null;
      var errMsg = null;
      if (addr.includes("@")) {
        // try email match:
        var addrErrDetails = {};
        let foundKeyId = this.getValidKeyForRecipient(
          addr,
          minTrustLevelIndex,
          addrErrDetails
        );
        if (details && addrErrDetails.msg) {
          errMsg = addrErrDetails.msg;
        }
        if (foundKeyId) {
          keyId = "0x" + foundKeyId.toUpperCase();
          resultingArray.push(keyId);
        }
      } else {
        // try key match:
        var keyObj = this.getKeyById(addr);

        if (keyObj) {
          // if found, check whether the trust level is enough
          if (
            TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust) >= minTrustLevelIndex
          ) {
            keyId = "0x" + keyObj.keyId.toUpperCase();
            resultingArray.push(keyId);
          }
        }
      }

      if (keyId) {
        if (details) {
          details.keyMap[addr.toLowerCase()] = keyId;
        }
      } else {
        // no key for this address found
        keyMissing = true;
        if (details) {
          if (!errMsg) {
            errMsg = "ProblemNoKey";
          }
          var detailsElem = {};
          detailsElem.addr = addr;
          detailsElem.msg = errMsg;
          details.errArray.push(detailsElem);
        }
        EnigmailLog.DEBUG(
          'keyRing.jsm: doValidKeysForAllRecipients(): return null (no single valid key found for="' +
            addr +
            '" with minTrustLevel="' +
            minTrustLevel +
            '")\n'
        );
      }
    }
    return keyMissing;
  },

  /**
   * Rebuild the quick access search indexes after the key list was loaded
   */
  rebuildKeyIndex() {
    gKeyIndex = [];
    gSubkeyIndex = [];

    for (let i in gKeyListObj.keyList) {
      let k = gKeyListObj.keyList[i];
      gKeyIndex[k.keyId] = k;
      gKeyIndex[k.fpr] = k;
      gKeyIndex[k.keyId.substr(-8, 8)] = k;

      // add subkeys
      for (let j in k.subKeys) {
        gSubkeyIndex[k.subKeys[j].keyId] = k;
      }
    }
  },

  /**
   * Update specific keys in the key cache. If the key objects don't exist yet,
   * they will be created
   *
   * @param keys: Array of String - key IDs or fingerprints
   */
  updateKeys(keys) {
    EnigmailLog.DEBUG("keyRing.jsm: updateKeys(" + keys.join(",") + ")\n");
    let uniqueKeys = [...new Set(keys)]; // make key IDs unique

    deleteKeysFromCache(uniqueKeys);

    if (gKeyListObj.keyList.length > 0) {
      loadKeyList(null, null, 1, uniqueKeys);
    } else {
      loadKeyList(null, null, 1);
    }

    getWindows().keyManReloadKeys();
  },
}; //  EnigmailKeyRing

/************************ INTERNAL FUNCTIONS ************************/

function sortByUserId(keyListObj, sortDirection) {
  return function(a, b) {
    return a.userId < b.userId ? -sortDirection : sortDirection;
  };
}

const sortFunctions = {
  keyid(keyListObj, sortDirection) {
    return function(a, b) {
      return a.keyId < b.keyId ? -sortDirection : sortDirection;
    };
  },

  keyidshort(keyListObj, sortDirection) {
    return function(a, b) {
      return a.keyId.substr(-8, 8) < b.keyId.substr(-8, 8)
        ? -sortDirection
        : sortDirection;
    };
  },

  fpr(keyListObj, sortDirection) {
    return function(a, b) {
      return keyListObj.keyList[a.keyNum].fpr < keyListObj.keyList[b.keyNum].fpr
        ? -sortDirection
        : sortDirection;
    };
  },

  keytype(keyListObj, sortDirection) {
    return function(a, b) {
      return keyListObj.keyList[a.keyNum].secretAvailable <
        keyListObj.keyList[b.keyNum].secretAvailable
        ? -sortDirection
        : sortDirection;
    };
  },

  validity(keyListObj, sortDirection) {
    return function(a, b) {
      return EnigmailTrust.trustLevelsSorted().indexOf(
        EnigmailTrust.getTrustCode(keyListObj.keyList[a.keyNum])
      ) <
        EnigmailTrust.trustLevelsSorted().indexOf(
          EnigmailTrust.getTrustCode(keyListObj.keyList[b.keyNum])
        )
        ? -sortDirection
        : sortDirection;
    };
  },

  trust(keyListObj, sortDirection) {
    return function(a, b) {
      return EnigmailTrust.trustLevelsSorted().indexOf(
        keyListObj.keyList[a.keyNum].ownerTrust
      ) <
        EnigmailTrust.trustLevelsSorted().indexOf(
          keyListObj.keyList[b.keyNum].ownerTrust
        )
        ? -sortDirection
        : sortDirection;
    };
  },

  expiry(keyListObj, sortDirection) {
    return function(a, b) {
      return keyListObj.keyList[a.keyNum].expiryTime <
        keyListObj.keyList[b.keyNum].expiryTime
        ? -sortDirection
        : sortDirection;
    };
  },
};

function getSortFunction(type, keyListObj, sortDirection) {
  return (sortFunctions[type] || sortByUserId)(keyListObj, sortDirection);
}

/**
 * Load the key list into memory and return it sorted by a specified column
 *
 * @param win        - |object|  holding the parent window for displaying error messages
 * @param sortColumn - |string|  containing the column name for sorting. One of:
 *                               userid, keyid, keyidshort, fpr, keytype, validity, trust, expiry.
 *                              Null will sort by userid.
 * @param sortDirection - |number| 1 = ascending / -1 = descending
 * @param onlyKeys   - |array| of Strings: if defined, only (re-)load selected key IDs
 *
 * no return value
 */
function loadKeyList(win, sortColumn, sortDirection, onlyKeys = null) {
  EnigmailLog.DEBUG("keyRing.jsm: loadKeyList( " + onlyKeys + ")\n");

  if (gLoadingKeys) {
    waitForKeyList();
    return;
  }
  gLoadingKeys = true;

  try {
    const cApi = EnigmailCryptoAPI();
    cApi
      .getKeys(onlyKeys)
      .then(keyList => {
        createAndSortKeyList(
          keyList,
          sortColumn,
          sortDirection,
          onlyKeys === null
        );
        gLoadingKeys = false;
      })
      .catch(e => {
        EnigmailLog.ERROR(`keyRing.jsm: loadKeyList: error ${e}
`);
        gLoadingKeys = false;
      });
    waitForKeyList();
  } catch (ex) {
    EnigmailLog.ERROR("keyRing.jsm: loadKeyList: exception: " + ex.toString());
  }
}

/**
 * Update the global key sort-list (quick index to keys)
 *
 * no return value
 */
function updateSortList() {
  gKeyListObj.keySortList = [];
  for (let i = 0; i < gKeyListObj.keyList.length; i++) {
    let keyObj = gKeyListObj.keyList[i];
    gKeyListObj.keySortList.push({
      userId: keyObj.userId.toLowerCase(),
      keyId: keyObj.keyId,
      fpr: keyObj.fpr,
      keyNum: i,
    });
  }
}

/**
 * Delete a set of keys from the key cache. Does not rebuild key indexes.
 * Not found keys are skipped.
 *
 * @param keyList: Array of Strings: key IDs (or fpr) to delete
 *
 * @return Array of deleted key objects
 */

function deleteKeysFromCache(keyList) {
  EnigmailLog.DEBUG(
    "keyRing.jsm: deleteKeysFromCache(" + keyList.join(",") + ")\n"
  );

  let deleted = [];
  let foundKeys = [];
  for (let keyId of keyList) {
    let k = EnigmailKeyRing.getKeyById(keyId, true);
    if (k) {
      foundKeys.push(k);
    }
  }

  for (let k of foundKeys) {
    let foundIndex = -1;
    for (let i = 0; i < gKeyListObj.keyList.length; i++) {
      if (gKeyListObj.keyList[i].fpr == k.fpr) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex >= 0) {
      gKeyListObj.keyList.splice(foundIndex, 1);
      deleted.push(k);
    }
  }

  return deleted;
}

function createAndSortKeyList(
  keyList,
  sortColumn,
  sortDirection,
  resetKeyCache
) {
  EnigmailLog.DEBUG("keyRing.jsm: createAndSortKeyList()\n");

  if (typeof sortColumn !== "string") {
    sortColumn = "userid";
  }
  if (!sortDirection) {
    sortDirection = 1;
  }

  if (!("keyList" in gKeyListObj) || resetKeyCache) {
    gKeyListObj.keyList = [];
    gKeyListObj.keySortList = [];
    gKeyListObj.trustModel = "?";
  }

  gKeyListObj.keyList = gKeyListObj.keyList.concat(
    keyList.map(k => {
      return newEnigmailKeyObj(k);
    })
  );

  // update the quick index for sorting keys
  updateSortList();

  // create a hash-index on key ID (8 and 16 characters and fingerprint)
  // in a single array

  EnigmailKeyRing.rebuildKeyIndex();

  gKeyListObj.keySortList.sort(
    getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection)
  );
}

/*
function runKeyUsabilityCheck() {
  EnigmailLog.DEBUG("keyRing.jsm: runKeyUsabilityCheck()\n");

  EnigmailTimer.setTimeout(function() {
    try {
      let msg = getKeyUsability().keyExpiryCheck();

      if (msg && msg.length > 0) {
        getDialog().info(null, msg);
      } else {
        getKeyUsability().checkOwnertrust();
      }
    } catch (ex) {
      EnigmailLog.DEBUG(
        "keyRing.jsm: runKeyUsabilityCheck: exception " +
          ex.message +
          "\n" +
          ex.stack +
          "\n"
      );
    }
  }, 60 * 1000); // 1 minute
}
*/

function waitForKeyList() {
  let mainThread = Services.tm.mainThread;
  while (gLoadingKeys) {
    mainThread.processNextEvent(true);
  }
}

EnigmailKeyRing.clearCache();
