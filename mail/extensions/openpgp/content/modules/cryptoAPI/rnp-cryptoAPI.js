/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["getRNPAPI"];

const RNP = ChromeUtils.import("chrome://openpgp/content/modules/rnp.jsm").RNP;
var Services = ChromeUtils.import("resource://gre/modules/Services.jsm")
  .Services;

Services.scriptloader.loadSubScript(
  "chrome://openpgp/content/modules/cryptoAPI/interface.js",
  null,
  "UTF-8"
);

/* Globals loaded from openpgp-js.js: */
/* global getOpenPGP: false, EnigmailLog: false */

const EnigmailLog = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
).EnigmailLog;
const EnigmailFiles = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
).EnigmailFiles;
const EnigmailConstants = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
).EnigmailConstants;
const EnigmailTime = ChromeUtils.import(
  "chrome://openpgp/content/modules/time.jsm"
).EnigmailTime;
const EnigmailData = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
).EnigmailData;
const EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;

/*
const {
  obtainKeyList,
  createKeyObj,
  getPhotoFileFromGnuPG,
  extractSignatures,
  getGpgKeyData
} = ChromeUtils.import("chrome://openpgp/content/cryptoAPI/gnupg-keylist.jsm");

const {
  GnuPG_importKeyFromFile,
  GnuPG_extractSecretKey
} = ChromeUtils.import("chrome://openpgp/content/cryptoAPI/gnupg-key.jsm");
*/

/**
 * RNP implementation of CryptoAPI
 */

class RNPCryptoAPI extends CryptoAPI {
  constructor() {
    super();
    this.api_name = "RNP";
  }

  /**
   * Get the list of all knwn keys (including their secret keys)
   * @param {Array of String} onlyKeys: [optional] only load data for specified key IDs
   *
   * @return {Promise<Array of Object>}
   */
  async getKeys(onlyKeys = null) {
    return RNP.getKeys(onlyKeys);
  }

  /**
   * Get groups defined in gpg.conf in the same structure as KeyObject
   *
   * @return {Array of KeyObject} with type = "grp"
   */
  getGroups() {}

  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {String}  keyId:            space-separated list of key IDs
   * @param {Boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @return {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeySignatures(keyId, ignoreUnknownUid = false) {}

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
  async getMinimalPubKey(fpr, email, subkeyDates) {}

  /**
   * Extract a photo ID from a key, store it as file and return the file object.
   *
   * @param {String} keyId:       Key ID / fingerprint
   * @param {Number} photoNumber: number of the photo on the key, starting with 0
   *
   * @return {nsIFile} object or null in case no data / error.
   */
  async getPhotoFile(keyId, photoNumber) {}

  async importKeyBlock(keyBlock) {
    // TODO: get status results
    let res = RNP.importKeyBlock(keyBlock);
    RNP.saveKeyRings();
    return res;
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
  async importKeyFromFile(inputFile) {}

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

  async extractSecretKey(keyId, minimalKey) {}

  /**
   *
   * @param {byte} byteData    The encrypted data
   *
   * @return {String or null} - the name of the attached file
   */

  async getFileName(byteData) {}

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

  async verifyAttachment(filePath, sigPath) {}

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

  async decryptAttachment(encrypted) {}

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
    EnigmailLog.DEBUG(`rnp-cryptoAPI.js: decrypt()\n`);
    console.log("rnp decrypt() options:");
    console.log(options);

    let result = RNP.decrypt(encrypted, options);

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

  decryptMime(encrypted, options) {
    console.log("rnp-cryptoAPI.js: decryptMime()");
    EnigmailLog.DEBUG(`rnp-cryptoAPI.js: decryptMime()\n`);

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
    console.log("rnp-cryptoAPI.js: verifyMime()");
    EnigmailLog.DEBUG(`rnp-cryptoAPI.js: verifyMime()\n`);

    options.noOutput = true;
    options.verifyOnly = true;
    options.uiFlags = EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(signed, options);
  }

  async getKeyListFromKeyBlock(keyBlockStr) {
    return RNP.getKeyListFromKeyBlock(keyBlockStr);
  }

  async genKey(userId, keyType, keySize, expiryTime, passphrase) {
    let id = RNP.genKey(userId, keyType, keySize, expiryTime, passphrase);
    RNP.saveKeyRings();
    return id;
  }
  
  async deleteKey(keyFingerprint, deleteSecret) {
    return RNP.deleteKey(keyId, deleteSecret);
  }
  
}

function getRNPAPI() {
  return new RNPCryptoAPI();
}
