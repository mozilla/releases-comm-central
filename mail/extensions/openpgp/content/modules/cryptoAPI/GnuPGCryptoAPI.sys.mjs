/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

Services.scriptloader.loadSubScript(
  "chrome://openpgp/content/modules/cryptoAPI/interface.js",
  null,
  "UTF-8"
);

/* global CryptoAPI */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailLog: "chrome://openpgp/content/modules/log.sys.mjs",
});

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
   *
   * @param {Array of String} onlyKeys: [optional] only load data for specified key IDs
   *
   * @returns {Promise<Array of Object>}
   */
  async getKeys() {
    throw new Error("Not implemented");
  }

  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {string}  keyId:            space-separated list of key IDs
   * @param {boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @returns {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeySignatures(keyId) {
    lazy.EnigmailLog.DEBUG(`gnupg.js: getKeySignatures: ${keyId}\n`);
    throw new Error("Not implemented");
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {KeyObj}  keyObj:           the signatures of this key will be returned
   * @param {boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @returns {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeyObjSignatures() {
    throw new Error("Not implemented");
  }

  /**
   * Export the minimum key for the public key object:
   * public key, primary user ID, newest encryption subkey
   *
   * @param {string} fpr: - a single FPR
   * @param {string} email: - [optional] the email address of the desired user ID.
   *                                     If the desired user ID cannot be found or is not valid, use the primary UID instead
   * @param {Array<number>} subkeyDates: [optional] remove subkeys with specific creation Dates
   *
   * @returns {Promise<object>}:
   *    - exitCode (0 = success)
   *    - errorMsg (if exitCode != 0)
   *    - keyData: BASE64-encded string of key data
   */
  async getMinimalPubKey(fpr) {
    lazy.EnigmailLog.DEBUG(`gnupg.js: getMinimalPubKey: ${fpr}\n`);
    throw new Error("Not implemented");
  }

  /**
   * Export secret key(s) to a file
   *
   * @param {string}  keyId      Specification by fingerprint or keyID
   * @param {boolean} minimalKey - if true, reduce key to minimum required
   *
   * @returns {object}:
   *   - {Number} exitCode:  result code (0: OK)
   *   - {String} keyData:   ASCII armored key data material
   *   - {String} errorMsg:  error message in case exitCode !== 0
   */

  async extractSecretKey() {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {byte} byteData - The encrypted data
   *
   * @returns {String or null} - the name of the attached file
   */

  async getFileName() {
    lazy.EnigmailLog.DEBUG(`gnupg.js: getFileName()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {Path} filePath - The signed file
   * @param {Path} sigPath - The signature to verify
   *
   * @returns {Promise<string>} - A message from the verification.
   *
   * Use Promise.catch to handle failed verifications.
   * The message will be an error message in this case.
   */

  async verifyAttachment() {
    lazy.EnigmailLog.DEBUG(`gnupg.js: verifyAttachment()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {Bytes}  encrypted     The encrypted data
   *
   * @returns {Promise<object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decryptAttachment() {
    lazy.EnigmailLog.DEBUG(`gnupg.js: decryptAttachment()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {string} encrypted - The encrypted data
   * @param {object} options - Decryption options
   *
   * @returns {Promise<object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decrypt() {
    lazy.EnigmailLog.DEBUG(`gnupg.js: decrypt()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {string} encrypted - The encrypted data
   * @param {object} options - Decryption options
   *
   * @returns {Promise<object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decryptMime(encrypted, options) {
    lazy.EnigmailLog.DEBUG(`gnupg.js: decryptMime()\n`);

    // write something to gpg such that the process doesn't get stuck
    if (encrypted.length === 0) {
      encrypted = "NO DATA\n";
    }

    options.noOutput = false;
    options.verifyOnly = false;
    options.uiFlags = lazy.EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(encrypted, options);
  }

  /**
   *
   * @param {string} signed - The signed data
   * @param {object} options - Decryption options
   *
   * @returns {Promise<object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async verifyMime(signed, options) {
    lazy.EnigmailLog.DEBUG(`gnupg.js: verifyMime()\n`);

    options.noOutput = true;
    options.verifyOnly = true;
    options.uiFlags = lazy.EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(signed, options);
  }

  async getKeyListFromKeyBlockAPI() {
    throw new Error("Not implemented");
  }

  async genKey() {
    throw new Error("GnuPG genKey() not implemented");
  }

  async deleteKey() {
    return null;
  }

  async encryptAndOrSign() {
    return null;
  }
}

export function getGnuPGAPI() {
  return new GnuPGCryptoAPI();
}
