/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["getGnuPGAPI"];

var Services = Components.utils.import("resource://gre/modules/Services.jsm").Services;

Services.scriptloader.loadSubScript("chrome://openpgp/content/modules/cryptoAPI/interface.js",
  null, "UTF-8"); /* global CryptoAPI */

/* global getOpenPGP: false, EnigmailLog: false */

const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailTime = ChromeUtils.import("chrome://openpgp/content/modules/time.jsm").EnigmailTime;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailPassword = ChromeUtils.import("chrome://openpgp/content/modules/passwords.jsm").EnigmailPassword;
const EnigmailErrorHandling = ChromeUtils.import("chrome://openpgp/content/modules/errorHandling.jsm").EnigmailErrorHandling;
const GnuPGDecryption = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI/gnupg-decryption.jsm").GnuPGDecryption;

const {
  obtainKeyList,
  createKeyObj,
  getPhotoFileFromGnuPG,
  extractSignatures,
  getGpgKeyData
} = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI/gnupg-keylist.jsm");

const {
  GnuPG_importKeyFromFile,
  GnuPG_extractSecretKey
} = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI/gnupg-key.jsm");

/**
 * GnuPG implementation of CryptoAPI
 */

class GnuPGCryptoAPI extends CryptoAPI {
  constructor() {
    super();
    this.api_name = "GnuPG";
  }

  /**
   * Get the list of all knwn keys (including their secret keys)
   * @param {Array of String} onlyKeys: [optional] only load data for specified key IDs
   *
   * @return {Promise<Array of Object>}
   */
  async getKeys(onlyKeys = null) {
    let keyList = await obtainKeyList(onlyKeys);
    return keyList.keys;
  }

  /**
   * Get groups defined in gpg.conf in the same structure as KeyObject
   *
   * @return {Array of KeyObject} with type = "grp"
   */
  getGroups() {
    let groups = EnigmailGpg.getGpgGroups();

    let r = [];
    for (var i = 0; i < groups.length; i++) {

      let keyObj = createKeyObj(["grp"]);
      keyObj.keyTrust = "g";
      keyObj.userId = EnigmailData.convertGpgToUnicode(groups[i].alias).replace(/\\e3A/g, ":");
      keyObj.keyId = keyObj.userId;
      var grpMembers = EnigmailData.convertGpgToUnicode(groups[i].keylist).replace(/\\e3A/g, ":").split(/[,;]/);
      for (var grpIdx = 0; grpIdx < grpMembers.length; grpIdx++) {
        keyObj.userIds.push({
          userId: grpMembers[grpIdx],
          keyTrust: "q"
        });
      }
      r.push(keyObj);
    }

    return r;
  }


  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {String}  keyId:            space-separated list of key IDs
   * @param {Boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @return {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeySignatures(keyId, ignoreUnknownUid = false) {
    EnigmailLog.DEBUG(`gnupg.js: getKeySignatures: ${keyId}\n`);

    const args = EnigmailGpg.getStandardArgs(true).concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-sig"]).concat(keyId.split(" "));

    let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, "");

    if (!(res.statusFlags & EnigmailConstants.BAD_SIGNATURE)) {
      // ignore exit code as recommended by GnuPG authors
      res.exitCode = 0;
    }

    if (res.exitCode !== 0) {
      if (res.errorMsg) {
        res.errorMsg += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
        res.errorMsg += "\n" + res.errorMsg;
      }
      return "";
    }

    if (res.stdoutData.length > 0) {
      return extractSignatures(res.stdoutData, ignoreUnknownUid);
    }
    return null;
  }


  /**
   * Export the minimum key for the public key object:
   * public key, primary user ID, newest encryption subkey
   *
   * @param {String} fpr:                a single FPR
   * @param {String} email:              [optional] the email address of the desired user ID.
   *                                     If the desired user ID cannot be found or is not valid, use the primary UID instead
   * @param {Array<Number>} subkeyDates: [optional] remove subkeys with sepcific creation Dates
   *
   * @return {Promise<Object>}:
   *    - exitCode (0 = success)
   *    - errorMsg (if exitCode != 0)
   *    - keyData: BASE64-encded string of key data
   */
  async getMinimalPubKey(fpr, email, subkeyDates) {
    EnigmailLog.DEBUG(`gnupg.js: getMinimalPubKey: ${fpr}\n`);

    let retObj = {
      exitCode: 0,
      errorMsg: "",
      keyData: ""
    };
    let minimalKeyBlock = null;

    let args = EnigmailGpg.getStandardArgs(true);

    if (EnigmailGpg.getGpgFeature("export-specific-uid")) {
      // Use GnuPG filters if possible
      let dropSubkeyFilter = "usage!~e && usage!~s";

      if (subkeyDates && subkeyDates.length > 0) {
        dropSubkeyFilter = subkeyDates.map(x => `key_created!=${x}`).join(" && ");
      }
      args = args.concat(["--export-options", "export-minimal,no-export-attributes",
        "--export-filter", "keep-uid=" + (email ? "mbox=" + email : "primary=1"),
        "--export-filter", "drop-subkey=" + dropSubkeyFilter,
        "--export", fpr
      ]);
    } else {
      args = args.concat(["--export-options", "export-minimal,no-export-attributes", "-a", "--export", fpr]);
    }

    const statusObj = {};
    const exitCodeObj = {};
    let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args);
    let keyBlock = res.stdoutData;

    // GnuPG 2.1.10+
    if (!EnigmailGpg.getGpgFeature("export-result")) {
      retObj.exitCode = 2;
      retObj.errorMsg = EnigmailLocale.getString("failKeyExtract");
    }

    let r = new RegExp("^\\[GNUPG:\\] EXPORTED " + fpr, "m");
    if (res.stderrData.search(r) < 0) {
      retObj.exitCode = 2;
      retObj.errorMsg = EnigmailLocale.getString("failKeyExtract");
    }

    retObj.keyData = btoa(keyBlock);
    return retObj;
  }

  /**
   * Extract a photo ID from a key, store it as file and return the file object.
   *
   * @param {String} keyId:       Key ID / fingerprint
   * @param {Number} photoNumber: number of the photo on the key, starting with 0
   *
   * @return {nsIFile} object or null in case no data / error.
   */
  async getPhotoFile(keyId, photoNumber) {
    let file = await getPhotoFileFromGnuPG(keyId, photoNumber);
    return file;
  }

  async importKeyBlock(keyBlock) {
    return null;
  }

  /**
   * Import key(s) from a file
   *
   * @param {nsIFile} inputFile:  the file holding the keys
   *
   * @return {Object} or null in case no data / error:
   *   - {Number}          exitCode:        result code (0: OK)
   *   - {Array of String) importedKeys:    imported fingerprints
   *   - {String}          errorMsg:        human readable error message
   *   - {Number}          importSum:       total number of processed keys
   *   - {Number}          importUnchanged: number of unchanged keys
   */
  async importKeyFromFile(inputFile) {
    let keys = await GnuPG_importKeyFromFile(inputFile);
    return keys;
  }

  /**
   * Export secret key(s) to a file
   *
   * @param {String}  keyId      Specification by fingerprint or keyID
   * @param {Boolean} minimalKey  if true, reduce key to minimum required
   *
   * @return {Object}:
   *   - {Number} exitCode:  result code (0: OK)
   *   - {String} keyData:   ASCII armored key data material
   *   - {String} errorMsg:  error message in case exitCode !== 0
   */

  async extractSecretKey(keyId, minimalKey) {
    let ret = await GnuPG_extractSecretKey(keyId, minimalKey);

    if (ret.exitCode !== 0) {
      ret.errorMsg = EnigmailLocale.getString("failKeyExtract") + "\n" + ret.errorMsg;
    }
    return ret;
  }

  /**
   *
   * @param {byte} byteData    The encrypted data
   *
   * @return {String or null} - the name of the attached file
   */

  async getFileName(byteData) {
    EnigmailLog.DEBUG(`gnupg.js: getFileName()\n`);
    const args = EnigmailGpg.getStandardArgs(true).concat(EnigmailPassword.command()).concat(["--decrypt"]);

    let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, byteData + "\n");

    const matches = res.stderrData.match(/^(\[GNUPG:\] PLAINTEXT [0-9]+ [0-9]+ )(.*)$/m);
    if (matches && (matches.length > 2)) {
      var filename = matches[2];
      if (filename.indexOf(" ") > 0) {
        filename = filename.replace(/ .*$/, "");
      }
      return EnigmailData.convertToUnicode(unescape(filename), "utf-8");
    } else {
      return null;
    }
  }

  /**
   *
   * @param {Path} filePath    The signed file
   * @param {Path} sigPath       The signature to verify
   *
   * @return {Promise<String>} - A message from the verification.
   *
   * Use Promise.catch to handle failed verifications.
   * The message will be an error message in this case.
   */

  async verifyAttachment(filePath, sigPath) {
    EnigmailLog.DEBUG(`gnupg.js: verifyAttachment()\n`);
    const args = EnigmailGpg.getStandardArgs(true).concat(["--verify", sigPath, filePath]);
    let result = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args);
    const decrypted = {};
    GnuPGDecryption.decryptMessageEnd(result.stderrData, result.exitCode, 1, true, true, EnigmailConstants.UI_INTERACTIVE, decrypted);
    if (result.exitCode === 0) {
      const detailArr = decrypted.sigDetails.split(/ /);
      const dateTime = EnigmailTime.getDateTime(detailArr[2], true, true);
      const msg1 = decrypted.errorMsg.split(/\n/)[0];
      const msg2 = EnigmailLocale.getString("keyAndSigDate", ["0x" + decrypted.keyId, dateTime]);
      const message = msg1 + "\n" + msg2;
      return (message);
    } else {
      throw (decrypted.errorMsg);
    }
  }


  /**
   *
   * @param {Bytes}  encrypted     The encrypted data
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decryptAttachment(encrypted) {
    EnigmailLog.DEBUG(`gnupg.js: decryptAttachment()\n`);

    let args = EnigmailGpg.getStandardArgs(true);
    args.push("--yes");
    args = args.concat(EnigmailPassword.command());
    args.push("-d");

    let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, encrypted);
    return res;
  }


  /**
   *
   * @param {String} encrypted     The encrypted data
   * @param {Object} options       Decryption options
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decrypt(encrypted, options) {
    EnigmailLog.DEBUG(`gnupg.js: decrypt()\n`);

    options.logFile = EnigmailErrorHandling.getTempLogFile();
    const args = GnuPGDecryption.getDecryptionArgs(options);
    let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, encrypted);
    EnigmailErrorHandling.appendLogFileToDebug(options.logFile);

    if (res.statusFlags & EnigmailConstants.MISSING_PASSPHRASE) {
      EnigmailLog.ERROR("decryption.jsm: decryptMessageStart: Error - no passphrase supplied\n");
      throw {
        errorMsg: EnigmailLocale.getString("noPassphrase")
      };
    }

    const result = {
      exitCode: res.exitCode,
      decryptedData: res.stdoutData
    };
    GnuPGDecryption.decryptMessageEnd(res.stderrData, res.exitCode, res.stdoutData.length, options.verifyOnly, options.noOutput, options.uiFlags, result);

    return result;
  }

  /**
   *
   * @param {String} encrypted     The encrypted data
   * @param {Object} options       Decryption options
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decryptMime(encrypted, options) {
    EnigmailLog.DEBUG(`gnupg.js: decryptMime()\n`);

    // write something to gpg such that the process doesn't get stuck
    if (encrypted.length === 0) {
      encrypted = "NO DATA\n";
    }

    options.noOutput = false;
    options.verifyOnly = false;
    options.uiFlags = EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(encrypted, options);
  }

  /**
   *
   * @param {String} signed        The signed data
   * @param {Object} options       Decryption options
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async verifyMime(signed, options) {
    EnigmailLog.DEBUG(`gnupg.js: verifyMime()\n`);

    options.noOutput = true;
    options.verifyOnly = true;
    options.uiFlags = EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(signed, options);
  }

  async getKeyListFromKeyBlock(keyBlockStr) {
    let res;
    res = await getGpgKeyData(keyBlockStr);
    return res;
  }

  async genKey(userId, keyType, keySize, expiryTime, passphrase) {
    throw "GnuPG genKey() not implemented";
    return null;
  }

  async deleteKey(keyFingerprint, deleteSecret) {
    return null;
  }
}

function getGnuPGAPI() {
  return new GnuPGCryptoAPI();
}
