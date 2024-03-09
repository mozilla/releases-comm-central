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

import { EnigmailLog } from "chrome://openpgp/content/modules/log.sys.mjs";

import { EnigmailConstants } from "chrome://openpgp/content/modules/constants.sys.mjs";

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
   *
   * @param {Array of String} onlyKeys: [optional] only load data for specified key IDs
   *
   * @returns {Promise<Array of Object>}
   */
  async getKeys(onlyKeys = null) {
    return RNP.getKeys(onlyKeys);
  }

  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {string}  keyId:            space-separated list of key IDs
   * @param {boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @returns {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeySignatures(keyId, ignoreUnknownUid = false) {
    return RNP.getKeySignatures(keyId, ignoreUnknownUid);
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {KeyObj}  keyObj:           the signatures of this key will be returned
   * @param {boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @returns {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeyObjSignatures(keyId, ignoreUnknownUid = false) {
    return RNP.getKeyObjSignatures(keyId, ignoreUnknownUid);
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
  async getMinimalPubKey(fpr, email, subkeyDates) {
    throw new Error("Not implemented");
  }

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

  async extractSecretKey(keyId, minimalKey) {
    throw new Error("extractSecretKey not implemented");
  }

  /**
   *
   * @param {byte} byteData - The encrypted data
   *
   * @returns {String or null} - the name of the attached file
   */

  async getFileName(byteData) {
    throw new Error("getFileName not implemented");
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

  async verifyAttachment(filePath, sigPath) {
    throw new Error("verifyAttachment not implemented");
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

  async decryptAttachment(encrypted) {
    const options = {};
    options.fromAddr = "";
    options.msgDate = null;
    return RNP.decrypt(encrypted, options);
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
   *   XXX: it's not... ^^^ This should be changed to always reject
   *     by throwing an Error (subclass?) for failures to decrypt.
   */

  async decrypt(encrypted, options) {
    EnigmailLog.DEBUG(`rnp-cryptoAPI.js: decrypt()\n`);

    return RNP.decrypt(encrypted, options);
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
    EnigmailLog.DEBUG(`rnp-cryptoAPI.js: verifyMime()\n`);

    //options.noOutput = true;
    //options.verifyOnly = true;
    //options.uiFlags = EnigmailConstants.UI_PGP_MIME;

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
