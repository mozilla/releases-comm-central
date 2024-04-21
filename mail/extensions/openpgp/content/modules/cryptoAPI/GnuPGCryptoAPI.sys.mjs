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
   * Get the list of all known keys (including their secret keys).
   *
   * @param {string[]} [_onlyKeys] - Only load data for specified key IDs.
   * @returns {Promise<object[]>}
   */
  async getKeys(_onlyKeys) {
    throw new Error("getKeys not implemented");
  }

  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {string} _keyIds - Space-separated list of key IDs.
   * @param {boolean} _ignoreUnknownUid - If true, filter out unknown signer's UIDs.
   * @returns {Promise<object[]>} - see extractSignatures()
   */
  async getKeySignatures(_keyIds, _ignoreUnknownUid) {
    throw new Error("getKeySignatures not implemented");
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {KeyObj} _keyObj - The signatures of this key will be returned.
   * @param {boolean} _ignoreUnknownUid - If true, filter out unknown signer's UIDs
   * @returns {Promise<object[]>} - see extractSignatures()
   */
  async getKeyObjSignatures(_keyObj, _ignoreUnknownUid) {
    throw new Error("getKeyObjSignatures not implemented");
  }

  /**
   * Export the minimum key for the public key object:
   * public key, primary user ID, newest encryption subkey
   *
   * @param {string} _fpr - A single fingerprint.
   * @param {string} [_email] - The email address of the desired user ID.
   *   If the desired user ID cannot be found or is not valid, use the primary
   *   UID instead
   * @param {integer[]} [_subkeyDates] - Remove subkeys with specific creation
   *   dates.
   * @returns {Promise<object>} object
   * @returns {integer} object.exitCode - 0 = success.
   * @returns {string} object.errorMsg - Error message, if exitCode != 0.
   * @returns {string} object.keyData - BASE64-encoded string of key data.
   */
  async getMinimalPubKey(_fpr, _email, _subkeyDates) {
    throw new Error("getMinimalPubKey not implemented");
  }

  /**
   * Export secret key(s) to a file
   *
   * @param {string} _keyId - Specification by fingerprint or keyID.
   * @param {boolean} _minimalKey - If true, reduce key to minimum required.
   * @returns {Promise<object>} object
   * @returns {integer} object.exitCode - 0 = success
   * @returns {string} object.errorMsg - Error message, if exitCode != 0.
   * @returns {string} object.keyData - ASCII armored key data material.
   */
  async extractSecretKey(_keyId, _minimalKey) {
    throw new Error("extractSecretKey not implemented");
  }

  /**
   * @param {byte} _byteData - The encrypted data
   * @returns {?string} the name of the attached file.
   */
  async getFileName(_byteData) {
    throw new Error("getFileName not implemented");
  }

  /**
   * Verify attachment.
   */
  async verifyAttachment() {
    throw new Error("verifyAttachment not implemented");
  }

  /**
   * Decrypt attachment.
   */
  async decryptAttachment() {
    throw new Error("decryptAttachment not implemented");
  }

  /**
   *
   * Decrypt.
   */
  async decrypt() {
    throw new Error("Decrypt not implemented");
  }

  /**
   * @param {string} encrypted - The encrypted data.
   * @param {object} options - Decryption options.
   * @returns {Promise<object>} - Return object with decryptedData and
   *   status information.
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */
  async decryptMime(encrypted, options) {
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
   * @param {string} signed - The signed data.
   * @param {object} options - Decryption options.
   * @returns {Promise<object>} - Return object with decryptedData and
   *   status information.
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */
  async verifyMime(signed, options) {
    options.noOutput = true;
    options.verifyOnly = true;
    options.uiFlags = lazy.EnigmailConstants.UI_PGP_MIME;
    return this.decrypt(signed, options);
  }

  async getKeyListFromKeyBlockAPI() {
    throw new Error("getKeyListFromKeyBlockAPI not implemented");
  }

  async genKey() {
    throw new Error("genKey not implemented");
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
