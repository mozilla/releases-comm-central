/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

/**
 * CryptoAPI - abstract interface
 */

var inspector;

class CryptoAPI {
  constructor() {
    this.api_name = "null";
  }

  get apiName() {
    return this.api_name;
  }

  /**
   * Synchronize a promise: wait synchonously until a promise has completed and return
   * the value that the promise returned.
   *
   * @param {Promise} promise: the promise to wait for
   *
   * @returns {Variant} whatever the promise returns
   */
  sync(promise) {
    if (!inspector) {
      inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(
        Ci.nsIJSInspector
      );
    }

    let res = null;
    promise
      .then(gotResult => {
        res = gotResult;
        inspector.exitNestedEventLoop();
      })
      .catch(gotResult => {
        console.log("CryptoAPI.sync() failed result: %o", gotResult);
        if (gotResult instanceof Error) {
          inspector.exitNestedEventLoop();
          throw gotResult;
        }

        res = gotResult;
        inspector.exitNestedEventLoop();
      });

    inspector.enterNestedEventLoop(0);
    return res;
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
    return null;
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {KeyObj}  keyObj:           the signatures of this key will be returned
   * @param {boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @returns {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeyObjSignatures(keyObj, ignoreUnknownUid = false) {
    return null;
  }

  /**
   * Export the minimum key for the public key object:
   * public key, user ID, newest encryption subkey
   *
   * @param {string} fpr - : a single FPR
   * @param {string} email: [optional] the email address of the desired user ID.
   *                        If the desired user ID cannot be found or is not valid, use the primary UID instead
   *
   * @returns {Promise<object>}:
   *    - exitCode (0 = success)
   *    - errorMsg (if exitCode != 0)
   *    - keyData: BASE64-encded string of key data
   */
  async getMinimalPubKey(fpr, email) {
    return {
      exitCode: -1,
      errorMsg: "",
      keyData: "",
    };
  }

  /**
   * Get the list of all known keys (including their secret keys)
   *
   * @param {Array of String} onlyKeys: [optional] only load data for specified key IDs
   *
   * @returns {Promise<Array of Object>}
   */
  async getKeys(onlyKeys = null) {
    return [];
  }

  async importPubkeyBlockAutoAccept(keyBlock) {
    return null;
  }

  // return bool success
  async importRevBlockAPI(data) {
    return null;
  }

  /**
   * Export secret key(s) to a file
   *
   * @param {string}  keyId       Specification by fingerprint or keyID
   * @param {boolean} minimalKey - if true, reduce key to minimum required
   *
   * @returns {object}:
   *   - {Number} exitCode:  result code (0: OK)
   *   - {String} keyData:   ASCII armored key data material
   *   - {String} errorMsg:  error message in case exitCode !== 0
   */

  async extractSecretKey(keyId, minimalKey) {
    return null;
  }

  /**
   * Determine the file name from OpenPGP data.
   *
   * @param {byte} byteData - The encrypted data
   *
   * @returns {string} - the name of the attached file
   */

  async getFileName(byteData) {
    return null;
  }

  /**
   * Verify the detached signature of an attachment (or in other words,
   * check the signature of a file, given the file and the signature).
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
    return null;
  }

  /**
   * Decrypt an attachment.
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
    return null;
  }

  /**
   * Generic function to decrypt and/or verify an OpenPGP message.
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

  async decrypt(encrypted, options) {
    return null;
  }

  /**
   * Decrypt a PGP/MIME-encrypted message
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
    return null;
  }

  /**
   * Verify a PGP/MIME-signed message
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
    return null;
  }

  /**
   * Get details (key ID, UID) of the data contained in a OpenPGP key block
   *
   * @param {string} keyBlockStr - String: the contents of one or more public keys
   *
   * @returns {Promise<Array>}: array of objects with the following structure:
   *          - id (key ID)
   *          - fpr
   *          - name (the UID of the key)
   */

  async getKeyListFromKeyBlockAPI(keyBlockStr) {
    return null;
  }

  /**
   * Create a new private key pair, including appropriate sub key pair,
   * and store the new keys in the default keyrings.
   *
   * @param {string} userId - User ID string, with name and email.
   * @param {string} keyType - "RSA" or "ECC".
   *                            ECC uses EDDSA and ECDH/Curve25519.
   * @param {number} keySize - RSA key size. Ignored for ECC.
   * @param {number} expiryTime The number of days the key will remain valid
   *                            (after the creation date).
   *                            Set to zero for no expiration.
   * @param {string} passphrase The passphrase to protect the new key.
   *                            Set to null to use an empty passphrase.
   *
   * @returns {Promise<string>} - The new KeyID
   */

  async genKey(userId, keyType, keySize, expiryTime, passphrase) {
    return null;
  }

  async deleteKey(keyFingerprint, deleteSecret) {
    return null;
  }

  async encryptAndOrSign(plaintext, args, resultStatus) {
    return null;
  }

  async unlockAndGetNewRevocation(id, pass) {
    return null;
  }

  async getPublicKey(id) {
    return null;
  }
}
