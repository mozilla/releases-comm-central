/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RNP } from "chrome://openpgp/content/modules/RNP.sys.mjs";

Services.scriptloader.loadSubScript(
  "chrome://openpgp/content/modules/cryptoAPI/interface.js",
  null,
  "UTF-8"
);

/* global CryptoAPI */

import { EnigmailConstants } from "chrome://openpgp/content/modules/constants.sys.mjs";

/**
 * RNP implementation of CryptoAPI.
 */
class RNPCryptoAPI extends CryptoAPI {
  constructor() {
    super();
    this.api_name = "RNP";
  }

  /**
   * Get the list of all known keys (including their secret keys).
   *
   * @param {string[]} [onlyKeys] - Only load data for these specified key IDs.
   * @returns {Promise<object[]>} the keys
   */
  async getKeys(onlyKeys = null) {
    return RNP.getKeys(onlyKeys);
  }

  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {string} keyId - Space-separated list of key IDs.
   * @param {boolean} ignoreUnknownUid - If true, filter out unknown signer's UIDs.
   * @returns {Promise<object[]>} signatures. See extractSignatures()
   */
  async getKeySignatures(keyId, ignoreUnknownUid = false) {
    return RNP.getKeySignatures(keyId, ignoreUnknownUid);
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {string} keyId - The signatures of this key will be returned.
   * @param {boolean} [ignoreUnknownUid=false] - If true, filter out unknown signer's UIDs.
   * @returns {Promise<object[]>} signatures. See extractSignatures()
   */
  async getKeyObjSignatures(keyId, ignoreUnknownUid = false) {
    return RNP.getKeyObjSignatures(keyId, ignoreUnknownUid);
  }

  /**
   * Export the minimum key for the public key object:
   * public key, primary user ID, newest encryption subkey
   *
   * @param {string} _fpr - A a single fingerprint.
   * @param {string} [_email] - The email address of the desired user ID.
   *   If the desired user ID cannot be found or is not valid, use the primary
   *   UID instead
   * @param {integer[]} [_subkeyDates] - Remove subkeys with specific creation Dates.
   * @returns {Promise<object>} result
   * @returns {integer} result.exitCode - 0 for success.
   * @returns {string} result.errorMsg - Error message, if exitCode != 0.
   * @returns {string} result.keyData - key data in base64.
   */
  async getMinimalPubKey(_fpr, _email, _subkeyDates) {
    throw new Error("Not implemented");
  }

  /**
   * @param {window} win
   * @param {string} keyBlock - An block of OpenPGP key data.
   * @param {string} acceptance - The key acceptance level that should
   *   be assigned to imported public keys.
   * @param {boolean} permissive - Whether it's allowed to fall back
   *   to a permissive import, if strict import fails.
   *   See RNP documentation for RNP_LOAD_SAVE_PERMISSIVE.
   * @param {string[]} limitedFPRs - This is a filtering parameter.
   *   If the array is empty, all keys will be imported.
   *   If the array contains at least one entry, a key will be imported
   *   only if its fingerprint (of the primary key) is listed in this
   *   array.
   */
  async importPubkeyBlockAutoAcceptAPI(
    win,
    keyBlock,
    acceptance,
    permissive,
    limitedFPRs = []
  ) {
    const res = await RNP.importPubkeyBlockAutoAcceptImpl(
      win,
      keyBlock,
      acceptance,
      permissive,
      limitedFPRs
    );
    return res;
  }

  async importRevBlockAPI(data) {
    return RNP.importRevImpl(data);
  }

  /**
   * Export secret key(s) to a file.
   *
   * @param {string} _keyId - Specification by fingerprint or keyID.
   * @param {boolean} _minimalKey - if true, reduce key to minimum required.
   * @returns {Promise<object>} result
   * @returns {integer} result.exitCode - 0 for success
   * @returns {string} result.errorMsg - Error message, if exitCode != 0.
   * @returns {string} result.keyData - key data in base64
   */
  async extractSecretKey(_keyId, _minimalKey) {
    throw new Error("extractSecretKey not implemented");
  }

  /**
   * @param {byte} _byteData - The encrypted data.
   * @returns {?string} the name of the attached file, or null.
   */
  async getFileName(_byteData) {
    throw new Error("getFileName not implemented");
  }

  /**
   *
   * @param {string} _filePath - The signed file.
   * @param {string} _sigPath - The signature to verify.
   * @returns {Promise<string>} - A message from the verification.
   */
  async verifyAttachment(_filePath, _sigPath) {
    throw new Error("verifyAttachment not implemented");
  }

  /**
   * @param {byte[]} encrypted - The encrypted data.
   *
   * @returns {Promise<object>} the object with decryptedData and
   *   status information
   */
  async decryptAttachment(encrypted) {
    const options = {};
    options.fromAddr = "";
    options.msgDate = null;
    return RNP.decrypt(encrypted, options);
  }

  /**
   * @param {string} encrypted - The encrypted data.
   * @param {object} options - Decryption options.
   * @returns {Promise<object>} the object with decryptedData and
   *   status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   *   XXX: it's not... ^^^ This should be changed to always reject
   *     by throwing an Error (subclass?) for failures to decrypt.
   */
  async decrypt(encrypted, options) {
    return RNP.decrypt(encrypted, options);
  }

  /**
   *
   * @param {string} encrypted - The encrypted data.
   * @param {object} options - Decryption options.
   * @returns {Promise<object>} the object with decryptedData and
   *   status information.
   */
  async decryptMime(encrypted, options) {
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
   * @param {string} signed - The signed data.
   * @param {object} options - Decryption options.
   * @returns {Promise<object>} the object with decryptedData and
   *   status information.
   */
  async verifyMime(signed, options) {
    if (!options.mimeSignatureData) {
      throw new Error("inline verify not yet implemented");
    }
    return RNP.verifyDetached(signed, options);
  }

  async getKeyListFromKeyBlockAPI(
    keyBlockStr,
    pubkey,
    seckey,
    permissive,
    withPubKey
  ) {
    return RNP.getKeyListFromKeyBlockImpl(
      keyBlockStr,
      pubkey,
      seckey,
      permissive,
      withPubKey
    );
  }

  async genKey(userId, keyType, keySize, expiryTime, passphrase) {
    const id = RNP.genKey(userId, keyType, keySize, expiryTime, passphrase);
    await RNP.saveKeyRings();
    return id;
  }

  async deleteKey(keyFingerprint, deleteSecret) {
    return RNP.deleteKey(keyFingerprint, deleteSecret);
  }

  async encryptAndOrSign(plaintext, args, resultStatus) {
    return RNP.encryptAndOrSign(plaintext, args, resultStatus);
  }

  async unlockAndGetNewRevocation(id, pass) {
    return RNP.unlockAndGetNewRevocation(id, pass);
  }

  async getPublicKey(id) {
    return RNP.getPublicKey(id);
  }
}

export function getRNPAPI() {
  return new RNPCryptoAPI();
}
