/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
   * @param {Promise} promise - the promise to wait for
   *
   * @returns {Variant} whatever the promise returns.
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
        console.warn("CryptoAPI.sync() failed result: %o", gotResult);
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
   * @param {string}  _keyId - Space separated list of key IDs.
   * @param {boolean} [_ignoreUnknownUid] - If true, filter out unknown signer's UIDs.
   *
   * @returns {Promise<object[]>}
   */
  async getKeySignatures(_keyId, _ignoreUnknownUid = false) {
    return null;
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {KeyObj}  _keyObj - The signatures of this key will be returned.
   * @param {boolean} [_ignoreUnknownUid] - if true, filter out unknown signer's UIDs.
   *
   * @returns {Promise<object[]>}
   */
  async getKeyObjSignatures(_keyObj, _ignoreUnknownUid = false) {
    return null;
  }

  /**
   * Export the minimum key for the public key object:
   * public key, user ID, newest encryption subkey
   *
   * @param {string} _fpr - A single FPR
   * @param {string} _email - The email address of the desired user ID.
   *   If the desired user ID cannot be found or is not valid, use the primary
   *   UID instead
   *
   * @returns {Promise<object>} object
   * @returns {integer} object.exitCode - 0 = success
   * @returns {string} object.errorMsg - Error message, if exitCode != 0.
   * @returns {string} object.keyData - BASE64-encded string of key data.
   */
  async getMinimalPubKey(_fpr, _email) {
    return {
      exitCode: -1,
      errorMsg: "",
      keyData: "",
    };
  }

  /**
   * Get the list of all known keys (including their secret keys)
   *
   * @param {string[]} [_onlyKeys] - Only load data for specified key IDs.
   *
   * @returns {Promise<object[]>}
   */
  async getKeys(_onlyKeys = null) {
    return [];
  }

  async importPubkeyBlockAutoAccept(_keyBlock) {
    return null;
  }

  // return bool success
  async importRevBlockAPI(_data) {
    return null;
  }

  /**
   * Export secret key(s) to a file
   *
   * @param {string}  _keyId       Specification by fingerprint or keyID
   * @param {boolean} _minimalKey - if true, reduce key to minimum required
   *
   * @returns {object} object
   * @returns {integer} object.exitCode - 0 = success
   * @returns {string} object.errorMsg - Error message, if exitCode != 0.
   * @returns {string} object.keyData - ASCII armored key data material.
   */

  async extractSecretKey(_keyId, _minimalKey) {
    return null;
  }

  /**
   * Determine the file name from OpenPGP data.
   *
   * @param {byte} _byteData - The encrypted data.
   *
   * @returns {string} the name of the attached file
   */
  async getFileName(_byteData) {
    return null;
  }

  /**
   * Verify the detached signature of an attachment (or in other words,
   * check the signature of a file, given the file and the signature).
   *
   * @param {Path} _filePath - The signed file
   * @param {Path} _sigPath - The signature to verify
   *
   * @returns {Promise<string>} - A message from the verification.
   *
   * Use Promise.catch to handle failed verifications.
   * The message will be an error message in this case.
   */
  async verifyAttachment(_filePath, _sigPath) {
    return null;
  }

  /**
   * Decrypt an attachment.
   *
   * @param {Bytes} _encrypted -The encrypted data
   *
   * @returns {Promise<object>} an object with decryptedData and
   *   status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */
  async decryptAttachment(_encrypted) {
    return null;
  }

  /**
   * Generic function to decrypt and/or verify an OpenPGP message.
   *
   * @param {string} _encrypted - The encrypted data
   * @param {object} _options - Decryption options
   *
   * @returns {Promise<object>} an object with decryptedData and
   *   status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */
  async decrypt(_encrypted, _options) {
    return null;
  }

  /**
   * Decrypt a PGP/MIME-encrypted message
   *
   * @param {string} _encrypted - The encrypted data
   * @param {object} _options - Decryption options
   *
   * @returns {Promise<object>} am object with decryptedData and
   *   status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */
  async decryptMime(_encrypted, _options) {
    return null;
  }

  /**
   * Verify a PGP/MIME-signed message
   *
   * @param {string} _signed - The signed data
   * @param {object} _options - Decryption options
   *
   * @returns {Promise<object>} an object with decryptedData and
   *   status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */
  async verifyMime(_signed, _options) {
    return null;
  }

  /**
   * Get details (key ID, UID) of the data contained in a OpenPGP key block
   *
   * @param {string} _keyBlockStr - String: the contents of one or more public keys
   *
   * @returns {Promise<object[]>} objects
   * @returns {integer} objects.id - Key ID.
   * @returns {string} objects.fpr - Fingerprint.
   * @returns {string} objects.name - UID of the key.
   */
  async getKeyListFromKeyBlockAPI(_keyBlockStr) {
    return null;
  }

  /**
   * Create a new private key pair, including appropriate sub key pair,
   * and store the new keys in the default keyrings.
   *
   * @param {string} _userId - User ID string, with name and email.
   * @param {"RSA"|"ECC"} _keyType - "RSA" or "ECC".
   *   ECC uses EDDSA and ECDH/Curve25519.
   * @param {number} _keySize - RSA key size. Ignored for ECC.
   * @param {number} _expiryTime The number of days the key will remain valid
   *   (after the creation date). Set to zero for no expiration.
   * @param {string} _passphrase The passphrase to protect the new key.
   *   Set to null to use an empty passphrase.
   *
   * @returns {Promise<string>} the new KeyID
   */
  async genKey(_userId, _keyType, _keySize, _expiryTime, _passphrase) {
    return null;
  }

  async deleteKey(_keyFingerprint, _deleteSecret) {
    return null;
  }

  async encryptAndOrSign(_plaintext, _args, _resultStatus) {
    return null;
  }

  async unlockAndGetNewRevocation(_id, _pass) {
    return null;
  }

  async getPublicKey(_id) {
    return null;
  }
}
