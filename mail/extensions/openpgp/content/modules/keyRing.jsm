/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKeyRing"];

const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailTrust = ChromeUtils.import("chrome://openpgp/content/modules/trust.jsm").EnigmailTrust;
const EnigmailArmor = ChromeUtils.import("chrome://openpgp/content/modules/armor.jsm").EnigmailArmor;
const EnigmailTime = ChromeUtils.import("chrome://openpgp/content/modules/time.jsm").EnigmailTime;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const subprocess = ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm").subprocess;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;
const newEnigmailKeyObj = ChromeUtils.import("chrome://openpgp/content/modules/keyObj.jsm").newEnigmailKeyObj;
const EnigmailTimer = ChromeUtils.import("chrome://openpgp/content/modules/timer.jsm").EnigmailTimer;
const Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailCryptoAPI = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI.jsm").EnigmailCryptoAPI;


const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");
const getWindows = EnigmailLazy.loader("enigmail/windows.jsm", "EnigmailWindows");
const getKeyUsability = EnigmailLazy.loader("enigmail/keyUsability.jsm", "EnigmailKeyUsability");

const DEFAULT_FILE_PERMS = 0o600;

let gKeygenProcess = null;
let gKeyListObj = null;
let gKeyIndex = [];
let gSubkeyIndex = [];
let gKeyCheckDone = false;
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
  getAllKeys: function(win, sortColumn, sortDirection) {
    if (gKeyListObj.keySortList.length === 0) {
      loadKeyList(win, sortColumn, sortDirection);
      getWindows().keyManReloadKeys();
      if (!gKeyCheckDone) {
        gKeyCheckDone = true;
        runKeyUsabilityCheck();
      }
    }
    else {
      if (sortColumn) {
        gKeyListObj.keySortList.sort(getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection));
      }
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

  getAllSecretKeys: function(onlyValidKeys = false) {
    EnigmailLog.DEBUG("keyRing.jsm: getAllSecretKeys()\n");

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    if (!onlyValidKeys) {
      for (let key of gKeyListObj.keyList) {
        if (key.secretAvailable) res.push(key);
      }
    }
    else {
      for (let key of gKeyListObj.keyList) {
        if (key.secretAvailable && key.keyUseFor.search(/D/) < 0) {
          // key is not disabled and _usable_ for encryption signing and certification
          if (key.keyUseFor.search(/E/) >= 0 &&
            key.keyUseFor.search(/S/) >= 0 &&
            key.keyUseFor.search(/C/) >= 0) {
            res.push(key);
          }
        }
      }
    }

    res.sort(function(a, b) {
      return a.userId == b.userId ? (a.keyId < b.keyId ? -1 : 1) : (a.userId.toLowerCase() < b.userId.toLowerCase() ? -1 : 1);
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
  getKeyById: function(keyId, noLoadKeys) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyById: " + keyId + "\n");
    let s;

    if (!keyId) return null;

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
  getKeysByUserId: function(searchTerm, onlyValidUid = true) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeysByUserId: '" + searchTerm + "'\n");
    let s = new RegExp(searchTerm, "i");

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    if (searchTerm === "") return res;

    for (let i in gKeyListObj.keyList) {
      let k = gKeyListObj.keyList[i];

      for (let j in k.userIds) {
        if (k.userIds[j].type === "uid" && k.userIds[j].userId.search(s) >= 0) {
          if (!onlyValidUid || (!EnigmailTrust.isInvalid(k.userIds[j].keyTrust))) {
            res.push(k);
            continue;
          }
        }
      }
    }

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
  getSecretKeyByEmail: function(emailAddr) {
    // sanitize email address
    emailAddr = emailAddr.replace(/([\.\[\]\-\\])/g, "\\$1");

    let searchTerm = "(<" + emailAddr + ">| " + emailAddr + "$|^" + emailAddr + "$)";

    return this.getSecretKeyByUserId(searchTerm);
  },

  /**
   * get the "best" possible secret key for a given user ID
   *
   * @param searchTerm   - String: a regular expression to match against all UIDs of the keys.
   *                               The search is always performed case-insensitively
   * @return KeyObject with the found key, or null if no key found
   */
  getSecretKeyByUserId: function(searchTerm) {
    EnigmailLog.DEBUG("keyRing.jsm: getSecretKeyByUserId: '" + searchTerm + "'\n");
    let keyList = this.getKeysByUserId(searchTerm, true);

    let foundKey = null;

    for (let key of keyList) {
      if (key.secretAvailable && key.getEncryptionValidity().keyValid && key.getSigningValidity().keyValid) {
        if (!foundKey) {
          foundKey = key;
        }
        else {
          // prefer RSA or DSA over ECC (long-term: change this once ECC keys are widely supported)
          if (foundKey.algoSym === key.algoSym && foundKey.keySize === key.keySize) {
            if (key.expiryTime > foundKey.expiryTime)
              foundKey = key;
          }
          else if (foundKey.algoSym.search(/^(DSA|RSA)$/) < 0 && key.algoSym.search(/^(DSA|RSA)$/) === 0) {
            foundKey = key;
          }
          else {
            if (key.getVirtualKeySize() > foundKey.getVirtualKeySize())
              foundKey = key;
          }
        }
      }
    }
    return foundKey;
  },

  /**
   * get a list of keys for a given set of (sub-) key IDs
   *
   * @param keyIdList: Array of key IDs
                       OR String, with space-separated list of key IDs
   */
  getKeyListById: function(keyIdList) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyListById: '" + keyIdList + "'\n");
    let keyArr;
    if (typeof keyIdList === "string") {
      keyArr = keyIdList.split(/ +/);
    }
    else {
      keyArr = keyIdList;
    }

    let ret = [];
    for (let i in keyArr) {
      let r = this.getKeyById(keyArr[i]);
      if (r) ret.push(r);
    }

    return ret;
  },

  importKeyFromFile: function(inputFile, errorMsgObj, importedKeysObj) {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.importKeyFromFile: fileName=" + inputFile.path + "\n");

    const cApi = EnigmailCryptoAPI();
    let res = cApi.sync(cApi.importKeyFromFile(inputFile));
    if (importedKeysObj) {
      importedKeysObj.value = res.importedKeys.join(";");
    }

    if (!res) return 1;

    if (res.importedKeys.length > 0) {
      EnigmailKeyRing.updateKeys(res.importedKeys);
    }
    else if (res.importSum > res.importUnchanged) {
      EnigmailKeyRing.clearCache();
    }

    return res.exitCode;
  },


  /**
   * empty the key cache, such that it will get loaded next time it is accessed
   *
   * no input or return values
   */
  clearCache: function() {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.clearCache\n");
    gKeyListObj = {
      keyList: [],
      keySortList: []
    };

    gKeyIndex = [];
    gSubkeyIndex = [];
  },

  /**
   * Check if the cache is empty
   *
   * @return  Boolean: true: cache cleared
   */
  getCacheEmpty: function() {
    return (gKeyIndex.length === 0);
  },

  /**
   * Get a list of UserIds for a given key.
   * Only the Only UIDs with highest trust level are returned.
   *
   * @param  String  keyId   key, optionally preceeded with 0x
   *
   * @return Array of String: list of UserIds
   */
  getValidUids: function(keyId) {
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
            let thisTrust = TRUSTLEVELS_SORTED.indexOf(keyObj.userIds[i].keyTrust);
            if (thisTrust > maxTrustLevel) {
              r = [keyObj.userIds[i].userId];
              maxTrustLevel = thisTrust;
            }
            else if (thisTrust === maxTrustLevel) {
              r.push(keyObj.userIds[i].userId);
            }
            // else do not add uid
          }
          else if (!EnigmailTrust.isInvalid(keyObj.userIds[i].keyTrust) || !hideInvalidUid) {
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
  extractKey: function(includeSecretKey, userId, outputFile, exitCodeObj, errorMsgObj) {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.extractKey: " + userId + "\n");
    let args = EnigmailGpg.getStandardArgs(true).concat(["-a", "--export"]);

    if (userId) {
      args = args.concat(userId.split(/[ ,\t]+/));
    }

    const cmdErrorMsgObj = {};
    let keyBlock = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, {}, {}, cmdErrorMsgObj);

    if ((exitCodeObj.value === 0) && !keyBlock) {
      exitCodeObj.value = -1;
    }

    if (exitCodeObj.value !== 0) {
      errorMsgObj.value = EnigmailLocale.getString("failKeyExtract");

      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    if (includeSecretKey) {

      let keyList;
      if (userId) {
        keyList = userId.split(/[ ,\t]+/);
      }
      else {
        keyList = this.getAllSecretKeys().map(keyObj => {
          return keyObj.keyId;
        });
      }
      let secKeyBlock = keyList.map(uid => {
        let keyObj = EnigmailKeyRing.getKeyById(uid);
        if (keyObj) return keyObj.getSecretKey(false).keyData;

        let k = EnigmailKeyRing.getKeysByUserId(uid);
        if (k && k.length > 0) {
          return k.map(keyObj => {
            return keyObj.getSecretKey(false).keyData;
          }).join("\n");
        }
        else {
          return "";
        }
      }).join("\n");

      keyBlock += "\n" + secKeyBlock;
    }

    if (outputFile) {
      if (!EnigmailFiles.writeFileContents(outputFile, keyBlock, DEFAULT_FILE_PERMS)) {
        exitCodeObj.value = -1;
        errorMsgObj.value = EnigmailLocale.getString("fileWriteFailed", [outputFile]);
      }
      return "";
    }
    return keyBlock;
  },

  /**
   * Export the ownertrust database from GnuPG
   * @param outputFile        String or nsIFile - output file name or Object - or NULL
   * @param exitCodeObj       Object   - o.value will contain exit code
   * @param errorMsgObj       Object   - o.value will contain error message from GnuPG
   *
   * @return String - if outputFile is NULL, the key block data; "" if a file is written
   */
  extractOwnerTrust: function(outputFile, exitCodeObj, errorMsgObj) {
    let args = EnigmailGpg.getStandardArgs(true).concat(["--export-ownertrust"]);

    let trustData = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, {}, {}, errorMsgObj);

    if (outputFile) {
      if (!EnigmailFiles.writeFileContents(outputFile, trustData, DEFAULT_FILE_PERMS)) {
        exitCodeObj.value = -1;
        errorMsgObj.value = EnigmailLocale.getString("fileWriteFailed", [outputFile]);
      }
      return "";
    }

    return trustData;
  },

  /**
   * Import the ownertrust database into GnuPG
   * @param inputFile        String or nsIFile - input file name or Object - or NULL
   * @param errorMsgObj       Object   - o.value will contain error message from GnuPG
   *
   * @return exit code
   */
  importOwnerTrust: function(inputFile, errorMsgObj) {
    let args = EnigmailGpg.getStandardArgs(true).concat(["--import-ownertrust"]);

    let exitCodeObj = {};
    try {
      let trustData = EnigmailFiles.readFile(inputFile);
      EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, trustData, exitCodeObj, {}, {}, errorMsgObj);
    }
    catch (ex) {}

    return exitCodeObj.value;
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
  importKey: function(parent, isInteractive, keyBlock, keyId, errorMsgObj, importedKeysObj, minimizeKey = false, limitedUids = []) {
    const cApi = EnigmailCryptoAPI();
    return cApi.sync(this.importKeyAsync(parent, isInteractive, keyBlock, keyId, errorMsgObj, importedKeysObj, minimizeKey, limitedUids));
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
  importKeyAsync: async function(parent, isInteractive, keyBlock, keyId, errorMsgObj, importedKeysObj, minimizeKey = false, limitedUids = []) {
    EnigmailLog.DEBUG(`keyRing.jsm: EnigmailKeyRing.importKeyAsync('${keyId}', ${isInteractive}, ${minimizeKey})\n`);

    const beginIndexObj = {};
    const endIndexObj = {};
    const blockType = EnigmailArmor.locateArmoredBlock(keyBlock, 0, "", beginIndexObj, endIndexObj, {});
    if (!blockType) {
      errorMsgObj.value = EnigmailLocale.getString("noPGPblock");
      return 1;
    }

    if (blockType.search(/^(PUBLIC|PRIVATE) KEY BLOCK$/) !== 0) {
      errorMsgObj.value = EnigmailLocale.getString("notFirstBlock");
      return 1;
    }

    const pgpBlock = keyBlock.substr(beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1);

    if (isInteractive) {
      if (!(getDialog().confirmDlg(parent, EnigmailLocale.getString("importKeyConfirm"), EnigmailLocale.getString("keyMan.button.import")))) {
        errorMsgObj.value = EnigmailLocale.getString("failCancel");
        return -1;
      }
    }

    let args = EnigmailGpg.getStandardArgs(false).concat(["--no-verbose", "--status-fd", "2"]);
    if (minimizeKey) {
      args = args.concat(["--import-options", "import-minimal"]);
    }

    if (limitedUids.length > 0 && EnigmailGpg.getGpgFeature("export-specific-uid")) {
      let filter = limitedUids.map(i => {
        return `mbox =~ ${i}`;
      }).join(" || ");

      args.push("--import-filter");
      args.push(`keep-uid=${filter}`);
    }
    args = args.concat(["--no-auto-check-trustdb", "--import"]);

    const res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, pgpBlock);

    const statusMsg = res.statusMsg;

    if (!importedKeysObj) {
      importedKeysObj = {};
    }
    importedKeysObj.value = [];

    let exitCode = 1;
    if (statusMsg && (statusMsg.search(/^IMPORT_RES /m) > -1)) {
      let importRes = statusMsg.match(/^IMPORT_RES ([0-9]+) ([0-9]+) ([0-9]+) 0 ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+)/m);

      if (importRes !== null) {
        let secCount = parseInt(importRes[9], 10); // number of secret keys found
        let secImported = parseInt(importRes[10], 10); // number of secret keys imported
        let secDups = parseInt(importRes[11], 10); // number of secret keys already on the keyring

        if (secCount !== secImported + secDups) {
          EnigmailKeyRing.clearCache();
          errorMsgObj.value = EnigmailLocale.getString("import.secretKeyImportError");
          return 1;
        }
      }

      exitCode = 0;
      // Normal return
      if (statusMsg.search(/^IMPORT_OK /m) > -1) {
        let l = statusMsg.split(/\r|\n/);
        for (let i = 0; i < l.length; i++) {
          const matches = l[i].match(/^(IMPORT_OK [0-9]+ )(([0-9a-fA-F]{8}){2,5})/);
          if (matches && (matches.length > 2)) {
            EnigmailLog.DEBUG("enigmail.js: Enigmail.importKey: IMPORTED 0x" + matches[2] + "\n");
            importedKeysObj.value.push(matches[2]);
          }
        }

        if (importedKeysObj.value.length > 0) {
          EnigmailKeyRing.updateKeys(importedKeysObj.value);
        }
      }
    }

    return exitCode;
  },

  isGeneratingKey: function() {
    return gKeygenProcess !== null;
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
  generateKey: function(name, comment, email, expiryDate, keyLength, keyType,
    passphrase, listener) {
    EnigmailLog.WRITE("keyRing.jsm: generateKey:\n");

    if (EnigmailKeyRing.isGeneratingKey()) {
      // key generation already ongoing
      throw Components.results.NS_ERROR_FAILURE;
    }

    const args = EnigmailGpg.getStandardArgs(true).concat(["--gen-key"]);

    EnigmailLog.CONSOLE(EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args));

    let inputData = "%echo Generating key\nKey-Type: ";

    switch (keyType) {
      case "RSA":
        inputData += "RSA\nKey-Usage: sign,auth\nKey-Length: " + keyLength;
        inputData += "\nSubkey-Type: RSA\nSubkey-Usage: encrypt\nSubkey-Length: " + keyLength + "\n";
        break;
      case "ECC":
        inputData += "EDDSA\nKey-Curve: Ed25519\nKey-Usage: sign\n";
        inputData += "Subkey-Type: ECDH\nSubkey-Curve: Curve25519\nSubkey-Usage: encrypt\n";
        break;
      default:
        return null;
    }

    if (name.replace(/ /g, "").length) {
      inputData += "Name-Real: " + name + "\n";
    }
    if (comment && comment.replace(/ /g, "").length) {
      inputData += "Name-Comment: " + comment + "\n";
    }
    inputData += "Name-Email: " + email + "\n";
    inputData += "Expire-Date: " + String(expiryDate) + "\n";

    EnigmailLog.CONSOLE(inputData + " \n");

    if (passphrase.length) {
      inputData += "Passphrase: " + passphrase + "\n";
    }
    else {
      if (EnigmailGpg.getGpgFeature("genkey-no-protection")) {
        inputData += "%echo no-protection\n";
        inputData += "%no-protection\n";
      }
    }

    inputData += "%commit\n%echo done\n";

    let proc = null;

    try {
      proc = subprocess.call({
        command: EnigmailGpg.agentPath,
        arguments: args,
        environment: EnigmailCore.getEnvList(),
        charset: null,
        stdin: function(pipe) {
          pipe.write(inputData);
          pipe.close();
        },
        stderr: function(data) {
          // extract key ID
          if (data.search(/^\[GNUPG:\] KEY_CREATED/m)) {
            let m = data.match(/^(\[GNUPG:\] KEY_CREATED [BPS] )([^ \r\n\t]+)$/m);
            if (m && m.length > 2) {
              listener.keyId = "0x" + m[2];
            }
          }
          listener.onDataAvailable(data);
        },
        done: function(result) {
          gKeygenProcess = null;
          try {
            if (result.exitCode === 0) {
              EnigmailKeyRing.clearCache();
            }
            listener.onStopRequest(result.exitCode);
          }
          catch (ex) {}
        },
        mergeStderr: false
      });
    }
    catch (ex) {
      EnigmailLog.ERROR("keyRing.jsm: generateKey: subprocess.call failed with '" + ex.toString() + "'\n");
      throw ex;
    }

    gKeygenProcess = proc;

    EnigmailLog.DEBUG("keyRing.jsm: generateKey: subprocess = " + proc + "\n");

    return proc;
  },

  /**
   * try to find valid key for encryption to passed email address
   *
   * @param details if not null returns error in details.msg
   *
   * @return: found key ID (without leading "0x") or null
   */
  getValidKeyForRecipient: function(emailAddr, minTrustLevelIndex, details) {
    EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient(): emailAddr=\"" + emailAddr + "\"\n");
    const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();
    const fullTrustIndex = TRUSTLEVELS_SORTED.indexOf("f");

    emailAddr = emailAddr.toLowerCase();
    var embeddedEmailAddr = "<" + emailAddr + ">";

    // note: we can't take just the first matched because we might have faked keys as duplicates
    var foundKeyId = null;
    var foundTrustLevel = null;
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
          let msg = "no key with enough trust level for '" + emailAddr + "' found";
          EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  " + msg + "\n");
        }
        return foundKeyId; // **** regular END OF LOOP (return NULL or found single key)
      }

      // key valid for encryption?
      if (keyObj.keyUseFor.indexOf("E") < 0) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (not provided for encryption)\n");
        continue; // not valid for encryption => **** CONTINUE the LOOP
      }
      // key disabled?
      if (keyObj.keyUseFor.indexOf("D") >= 0) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (disabled)\n");
        continue; // disabled => **** CONTINUE the LOOP
      }

      // check against the user ID
      var userId = keyObj.userId.toLowerCase();
      if (userId && (userId == emailAddr || userId.indexOf(embeddedEmailAddr) >= 0)) {
        if (keyTrustIndex < minTrustLevelIndex) {
          EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  matching key=" + keyObj.keyId + " found but not enough trust\n");
        }
        else {
          // key with enough trust level found
          EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  key=" + keyObj.keyId + " keyTrust=\"" + keyTrust + "\" found\n");

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
              let msg = "multiple matching keys with same trust level found for '" + emailAddr + "' ";
              EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  " + msg +
                " trustLevel=\"" + keyTrust + "\" (0x" + foundKeyId + " and 0x" + keyObj.keyId + ")\n");
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

        if (subUserId && (subUserId == emailAddr || subUserId.indexOf(embeddedEmailAddr) >= 0)) {
          if (subUidTrustIndex < minTrustLevelIndex) {
            EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  matching subUid=" + keyObj.keyId + " found but not enough trust\n");
          }
          else {
            // subkey with enough trust level found
            EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  matching subUid in key=" + keyObj.keyId + " keyTrust=\"" + keyTrust + "\" found\n");

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
                let msg = "multiple matching keys with same trust level found for '" + emailAddr + "' ";
                EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  " + msg +
                  " trustLevel=\"" + keyTrust + "\" (0x" + foundKeyId + " and 0x" + keyObj.keyId + ")\n");
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
      EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  no key for '" + emailAddr + "' found\n");
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
  getValidKeysForAllRecipients: function(addresses, minTrustLevel, details, resultingArray) {

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
      if (addr.indexOf('@') >= 0) {
        // try email match:
        var addrErrDetails = {};
        let foundKeyId = this.getValidKeyForRecipient(addr, minTrustLevelIndex, addrErrDetails);
        if (details && addrErrDetails.msg) {
          errMsg = addrErrDetails.msg;
        }
        if (foundKeyId) {
          keyId = "0x" + foundKeyId.toUpperCase();
          resultingArray.push(keyId);
        }
      }
      else {
        // try key match:
        var keyObj = this.getKeyById(addr);

        if (keyObj) {
          // if found, check whether the trust level is enough
          if (TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust) >= minTrustLevelIndex) {
            keyId = "0x" + keyObj.keyId.toUpperCase();
            resultingArray.push(keyId);
          }
        }
      }

      if (keyId) {
        if (details) {
          details.keyMap[addr.toLowerCase()] = keyId;
        }
      }
      else {
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
        EnigmailLog.DEBUG("keyRing.jsm: doValidKeysForAllRecipients(): return null (no single valid key found for=\"" + addr + "\" with minTrustLevel=\"" + minTrustLevel + "\")\n");
      }
    }
    return keyMissing;
  },

  /**
   * Rebuild the quick access search indexes after the key list was loaded
   */
  rebuildKeyIndex: function() {
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
  updateKeys: function(keys) {
    EnigmailLog.DEBUG("keyRing.jsm: updateKeys(" + keys.join(",") + ")\n");
    let uniqueKeys = [...new Set(keys)]; // make key IDs unique

    deleteKeysFromCache(uniqueKeys);

    if (gKeyListObj.keyList.length > 0) {
      loadKeyList(null, null, 1, uniqueKeys);
    }
    else {
      loadKeyList(null, null, 1);
    }

    getWindows().keyManReloadKeys();
  }
}; //  EnigmailKeyRing


/************************ INTERNAL FUNCTIONS ************************/

function sortByUserId(keyListObj, sortDirection) {
  return function(a, b) {
    return (a.userId < b.userId) ? -sortDirection : sortDirection;
  };
}

const sortFunctions = {
  keyid: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (a.keyId < b.keyId) ? -sortDirection : sortDirection;
    };
  },

  keyidshort: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (a.keyId.substr(-8, 8) < b.keyId.substr(-8, 8)) ? -sortDirection : sortDirection;
    };
  },

  fpr: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (keyListObj.keyList[a.keyNum].fpr < keyListObj.keyList[b.keyNum].fpr) ? -sortDirection : sortDirection;
    };
  },

  keytype: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (keyListObj.keyList[a.keyNum].secretAvailable < keyListObj.keyList[b.keyNum].secretAvailable) ? -sortDirection : sortDirection;
    };
  },

  validity: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (EnigmailTrust.trustLevelsSorted().indexOf(EnigmailTrust.getTrustCode(keyListObj.keyList[a.keyNum])) < EnigmailTrust.trustLevelsSorted().indexOf(EnigmailTrust.getTrustCode(
        keyListObj.keyList[b.keyNum]))) ? -sortDirection : sortDirection;
    };
  },

  trust: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (EnigmailTrust.trustLevelsSorted().indexOf(keyListObj.keyList[a.keyNum].ownerTrust) < EnigmailTrust.trustLevelsSorted().indexOf(keyListObj.keyList[b.keyNum].ownerTrust)) ?
        -
        sortDirection : sortDirection;
    };
  },

  expiry: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (keyListObj.keyList[a.keyNum].expiryTime < keyListObj.keyList[b.keyNum].expiryTime) ? -sortDirection : sortDirection;
    };
  }
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
    cApi.getKeys(onlyKeys)
      .then(keyList => {
        createAndSortKeyList(keyList, sortColumn, sortDirection, onlyKeys === null);
        gLoadingKeys = false;

      })
      .catch(e => {
        EnigmailLog.ERROR(`keyRing.jsm: loadKeyList: error ${e}
`);
        gLoadingKeys = false;
      });
    waitForKeyList();
  }
  catch (ex) {
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
      keyNum: i
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
  EnigmailLog.DEBUG("keyRing.jsm: deleteKeysFromCache(" + keyList.join(",") + ")\n");

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

function createAndSortKeyList(keyList, sortColumn, sortDirection, resetKeyCache) {
  EnigmailLog.DEBUG("keyRing.jsm: createAndSortKeyList()\n");

  if (typeof sortColumn !== "string")
    sortColumn = "userid";
  if (!sortDirection)
    sortDirection = 1;

  if ((!("keyList" in gKeyListObj)) || (resetKeyCache)) {
    gKeyListObj.keyList = [];
    gKeyListObj.keySortList = [];
    gKeyListObj.trustModel = "?";
  }

  gKeyListObj.keyList = gKeyListObj.keyList.concat(keyList.map(k => {
    return newEnigmailKeyObj(k);
  }));

  // update the quick index for sorting keys
  updateSortList();

  // create a hash-index on key ID (8 and 16 characters and fingerprint)
  // in a single array

  EnigmailKeyRing.rebuildKeyIndex();

  gKeyListObj.keySortList.sort(getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection));
}


function runKeyUsabilityCheck() {
  EnigmailLog.DEBUG("keyRing.jsm: runKeyUsabilityCheck()\n");

  EnigmailTimer.setTimeout(function _f() {
    try {
      let msg = getKeyUsability().keyExpiryCheck();

      if (msg && msg.length > 0) {
        getDialog().info(null, msg);
      }
      else {
        getKeyUsability().checkOwnertrust();
      }
    }
    catch (ex) {
      EnigmailLog.DEBUG("keyRing.jsm: runKeyUsabilityCheck: exception " + ex.message + "\n" + ex.stack + "\n");
    }

  }, 60 * 1000); // 1 minute
}

function waitForKeyList() {
  let mainThread = Services.tm.mainThread;
  while (gLoadingKeys)
    mainThread.processNextEvent(true);
}


EnigmailKeyRing.clearCache();
