/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailKey: "chrome://openpgp/content/modules/key.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

/**
 * Key object.
 */
export class EnigmailKeyObj {
  /** @type {string} - 16 digits (8-byte) public key ID (/not/ preceded with 0x) */
  keyId = "";

  /** @type {string} - Main user ID. */
  userId = "";

  /**
   * Fingerprint. Use `fprFormatted` getter to obtain a formatted version of the
   * fingerprint, like .... .... ....
   *
   * @type {string} - Fingerprint.
   */
  fpr = "";

  /** @type {string} - Expiry date as printable string */
  expiry = "";

  /** @type {integer} - Expiry time as seconds after 01/01/1970. */
  expiryTime = 0;

  /** @type {string} - Key creation date as printable string. */
  created = "";

  /** @type {integer} - Key creation date/time as number */
  keyCreated = 0;

  /** @type {string} - Key trust code as provided by GnuPG (calculated key validity). */
  keyTrust = "";

  /** @type {string} - Key usage type as provided by GnuPG (key capabilities). */
  keyUseFor = "";

  /** @type {string} - Owner trust. */
  ownerTrust = "";

  /** @type {boolean} - True if photo is available. */
  photoAvailable = false;

  /** @type {boolean} - True if secret key is available. */
  secretAvailable = false;

  /** @type {boolean} - Is secret key material available. */
  secretMaterial = false;

  /** @type {string} - Public key algorithm type (e.g. RSA). */
  algoSym = "";

  /** @type {integer} - Size of public key. */
  keySize = 0;

  /** @type {string} - "pub" or "grp" */
  type = "";

  /**
   * Contains all UIDs (including the primary UID).
   *
   * @type {object[]} ids
   * @type {string} ids[].userId - User ID.
   * @type {string} ids[].keyTrust - Trust level of user ID.
   * @type {string} ids[].uidFpr - Fingerprint of the user ID
   * @type {string} ids[].type - one of "uid" (regular user ID), "uat" (photo).
   * @type {integer} ids[].uatNum - Photo number (starting with 0 for each key).
   */
  userIds = [];

  /**
   * Subkeys.
   *
   * @type {object[]} keys
   * @type {string} keys[].keyId - Subkey ID (16 digits (8-byte)).
   * @type {string} keys[].expiry - Expiry date as printable string.
   * @type {integer} keys[].expiryTime - Expiry time as seconds after 01/01/1970.
   * @type {string} keys[].created - Subkey creation date as printable string.
   * @type {integer} keys[].keyCreated - Subkey creation date/time as number.
   * @type {string} keys[].keyTrust - Key trust code as provided by GnuPG.
   * @type {string} keys[].keyUseFor - Key usage type as provided by GnuPG.
   * @type {string} keys[].algoSym - Subkey algorithm type (e.g. RSA).
   * @type {integer} keys[].keySize - Subkey size.
   * @type {"sub"} keys[].type - Type.
   */
  subKeys = [];

  /** @type {Map<string,string>} - Email to minimal keyblock map. */
  minimalKeyBlock = new Map();

  /**
   * Constructor.
   *
   * @param {object} keyData
   */
  constructor(keyData) {
    this.type = keyData.type;
    if ("keyId" in keyData) {
      this.keyId = keyData.keyId;
    }
    if ("expiryTime" in keyData) {
      this.expiryTime = keyData.expiryTime;
      this.expiry = keyData.expiryTime
        ? new Services.intl.DateTimeFormat().format(
            new Date(keyData.expiryTime * 1000)
          )
        : "";
    }
    if ("effectiveExpiryTime" in keyData) {
      this.effectiveExpiryTime = keyData.effectiveExpiryTime;
      this.effectiveExpiry = keyData.effectiveExpiryTime
        ? new Services.intl.DateTimeFormat().format(
            new Date(keyData.effectiveExpiryTime * 1000)
          )
        : "";
    }

    const ATTRS = [
      "created",
      "keyCreated",
      "keyTrust",
      "keyUseFor",
      "ownerTrust",
      "algoSym",
      "keySize",
      "userIds",
      "subKeys",
      "fpr",
      "secretAvailable",
      "secretMaterial",
      "photoAvailable",
      "userId",
      "hasIgnoredAttributes",
    ];
    for (const i of ATTRS) {
      if (i in keyData) {
        this[i] = keyData[i];
      }
    }
  }

  /**
   * Create a copy of the object.
   */
  clone() {
    const cp = new EnigmailKeyObj(["copy"]);
    for (const i in this) {
      if (i !== "fprFormatted") {
        if (typeof this[i] !== "function") {
          if (typeof this[i] === "object") {
            cp[i] = lazy.EnigmailFuncs.cloneObj(this[i]);
          } else {
            cp[i] = this[i];
          }
        }
      }
    }

    return cp;
  }

  /**
   * Does the key have secondary user IDs?
   *
   * @returns {boolean} true if the key has secondary userIDs.
   */
  hasSubUserIds() {
    let nUid = 0;
    for (const i in this.userIds) {
      if (this.userIds[i].type === "uid") {
        ++nUid;
      }
    }
    return nUid >= 2;
  }

  /**
   * Get a formatted version of the fingerprint:
   * 1234 5678 90AB CDEF .... ....
   *
   * @returns {string} the formatted fingerprint.
   */
  get fprFormatted() {
    let f = lazy.EnigmailKey.formatFpr(this.fpr);
    if (f.length === 0) {
      f = this.fpr;
    }
    return f;
  }

  /**
   * Determine if the public key is valid. If not, return a description why it's not
   *
   * @returns {object} validity
   * @returns {boolean} validity.keyValid - true if key is valid.
   * @returns {string} validity.reason - Explanation of invalidity.
   */
  getPubKeyValidity(exceptionReason = null) {
    const retVal = {
      keyValid: false,
      reason: "",
    };
    if (this.keyTrust.search(/r/i) >= 0) {
      // public key revoked
      retVal.reason = lazy.l10n.formatValueSync("key-ring-pub-key-revoked", {
        userId: this.userId,
        keyId: "0x" + this.keyId,
      });
    } else if (
      exceptionReason != "ignoreExpired" &&
      this.keyTrust.search(/e/i) >= 0
    ) {
      // public key expired
      retVal.reason = lazy.l10n.formatValueSync("key-ring-pub-key-expired", {
        userId: this.userId,
        keyId: "0x" + this.keyId,
      });
    } else {
      retVal.keyValid = true;
    }

    return retVal;
  }

  /**
   * Check whether a key can be used for signing and return a description of
   * why not.
   *
   * @returns {object} validity
   * @returns {boolean} validity.keyValid - true if key is valid.
   * @returns {string} validity.reason - Explanation of invalidity
   */
  getSigningValidity(exceptionReason = null) {
    const retVal = this.getPubKeyValidity(exceptionReason);

    if (!retVal.keyValid) {
      return retVal;
    }

    if (!this.secretAvailable) {
      retVal.keyValid = false;
      retVal.reason = lazy.l10n.formatValueSync("key-ring-no-secret-key", {
        userId: this.userId,
        keyId: "0x" + this.keyId,
      });
      return retVal;
    }

    if (/s/.test(this.keyUseFor) && this.secretMaterial) {
      return retVal;
    }

    retVal.keyValid = false;
    let expired = 0;
    let revoked = 0;
    let found = 0;
    let noSecret = 0;

    for (const sk in this.subKeys) {
      if (this.subKeys[sk].keyUseFor.search(/s/) >= 0) {
        if (
          this.subKeys[sk].keyTrust.search(/e/i) >= 0 &&
          exceptionReason != "ignoreExpired"
        ) {
          ++expired;
        } else if (this.subKeys[sk].keyTrust.search(/r/i) >= 0) {
          ++revoked;
        } else if (!this.subKeys[sk].secretMaterial) {
          ++noSecret;
        } else {
          // found subkey usable
          ++found;
        }
      }
    }

    if (!found) {
      if (exceptionReason != "ignoreExpired" && expired) {
        retVal.reason = lazy.l10n.formatValueSync(
          "key-ring-sign-sub-keys-expired",
          {
            userId: this.userId,
            keyId: "0x" + this.keyId,
          }
        );
      } else if (revoked) {
        retVal.reason = lazy.l10n.formatValueSync(
          "key-ring-sign-sub-keys-revoked",
          {
            userId: this.userId,
            keyId: "0x" + this.keyId,
          }
        );
      } else if (noSecret) {
        retVal.reason = lazy.l10n.formatValueSync("key-ring-no-secret-key", {
          userId: this.userId,
          keyId: "0x" + this.keyId,
        });
      } else {
        retVal.reason = lazy.l10n.formatValueSync(
          "key-ring-pub-key-not-for-signing",
          {
            userId: this.userId,
            keyId: "0x" + this.keyId,
          }
        );
      }
    } else {
      retVal.keyValid = true;
    }

    return retVal;
  }

  /**
   * Check whether a key can be used for encryption and return a description of why not
   *
   * @param {boolean} requireDecryptionKey -
   *   If true, require secret key material to be available for at least one
   *   encryption key.
   * @param {?string} exceptionReason -
   *   Can be used to override the requirement to check for
   *   full validity, and accept certain scenarios as valid.
   *   If value is set to "ignoreExpired",
   *   then an expired key isn't treated as invalid.
   *   Set to null to get the default behavior.
   * @param {?string} subId -
   *   A key ID of a subkey or null.
   *   If subId is null, any part of the key will be
   *   considered when looking for a valid encryption key.
   *   If subId is non-null, only this subkey will be checked.
   *
   * @returns {object} validity
   * @returns {boolean} validity.keyValid - true if key is valid
   * @returns {string} validity.reason - explanation of invalidity
   */
  getEncryptionValidity(
    requireDecryptionKey,
    exceptionReason = null,
    subId = null
  ) {
    const retVal = this.getPubKeyValidity(exceptionReason);
    if (!retVal.keyValid) {
      return retVal;
    }

    if (
      !subId &&
      this.keyUseFor.search(/e/) >= 0 &&
      (!requireDecryptionKey || this.secretMaterial)
    ) {
      // We can stop and return the result we already found,
      // because we aren't looking at a specific subkey (!subId),
      // and the primary key is usable for encryption.
      // If we must own secret key material (requireDecryptionKey),
      // in this scenario it's sufficient to have secret material for
      // the primary key.
      return retVal;
    }

    retVal.keyValid = false;

    let expired = 0;
    let revoked = 0;
    let found = 0;
    let noSecret = 0;

    for (const sk of this.subKeys) {
      if (subId && subId != sk.keyId) {
        continue;
      }

      if (sk.keyUseFor.search(/e/) >= 0) {
        if (
          sk.keyTrust.search(/e/i) >= 0 &&
          exceptionReason != "ignoreExpired"
        ) {
          ++expired;
        } else if (sk.keyTrust.search(/r/i) >= 0) {
          ++revoked;
        } else if (requireDecryptionKey && !sk.secretMaterial) {
          ++noSecret;
        } else {
          // found subkey usable
          ++found;
        }
      }
    }

    if (!found) {
      const idToShow = subId ? subId : this.keyId;

      if (exceptionReason != "ignoreExpired" && expired) {
        retVal.reason = lazy.l10n.formatValueSync(
          "key-ring-enc-sub-keys-expired",
          {
            userId: this.userId,
            keyId: "0x" + idToShow,
          }
        );
      } else if (revoked) {
        retVal.reason = lazy.l10n.formatValueSync(
          "key-ring-enc-sub-keys-revoked",
          {
            userId: this.userId,
            keyId: "0x" + idToShow,
          }
        );
      } else if (noSecret) {
        retVal.reason = lazy.l10n.formatValueSync("key-ring-no-secret-key", {
          userId: this.userId,
          keyId: "0x" + idToShow,
        });
      } else {
        retVal.reason = lazy.l10n.formatValueSync(
          "key-ring-pub-key-not-for-encryption",
          {
            userId: this.userId,
            keyId: "0x" + idToShow,
          }
        );
      }
    } else {
      retVal.keyValid = true;
    }

    return retVal;
  }

  /**
   * Determine the next expiry date of the key. This is either the public key expiry date,
   * or the maximum expiry date of a signing or encryption subkey. I.e. this returns the next
   * date at which the key cannot be used for signing and/or encryption anymore
   *
   * @returns {integer} The expiry date as seconds after 01/01/1970
   */
  getKeyExpiry() {
    let expiryDate = Number.MAX_VALUE;
    let encryption = -1;
    let signing = -1;

    // check public key expiry date
    if (this.expiryTime > 0) {
      expiryDate = this.expiryTime;
    }

    for (const sk in this.subKeys) {
      if (this.subKeys[sk].keyUseFor.search(/[eE]/) >= 0) {
        let expiry = this.subKeys[sk].expiryTime;
        if (expiry === 0) {
          expiry = Number.MAX_VALUE;
        }
        encryption = Math.max(encryption, expiry);
      } else if (this.subKeys[sk].keyUseFor.search(/[sS]/) >= 0) {
        let expiry = this.subKeys[sk].expiryTime;
        if (expiry === 0) {
          expiry = Number.MAX_VALUE;
        }
        signing = Math.max(signing, expiry);
      }
    }

    if (expiryDate > encryption) {
      if (this.keyUseFor.search(/[eE]/) < 0) {
        expiryDate = encryption;
      }
    }

    if (expiryDate > signing) {
      if (this.keyUseFor.search(/[Ss]/) < 0) {
        expiryDate = signing;
      }
    }

    return expiryDate;
  }

  /**
   * Export the minimum key for the public key object:
   * public key, desired UID, newest signing/encryption subkey
   *
   * @param {?string} [emailAddr] - The email address of UID to extract.
   *   Use primary UID if null.
   * @returns {object} minimal
   * @returns {integer} minimal.exitCode 0 for success.
   * @returns {string} minimal.errorMsg error message, if exitCode != 0.
   * @returns {string} minimal.keyData BASE64-encded string of key data.
   */
  getMinimalPubKey(emailAddr) {
    if (emailAddr) {
      try {
        emailAddr = lazy.EnigmailFuncs.stripEmail(emailAddr.toLowerCase());
      } catch (x) {
        emailAddr = emailAddr.toLowerCase();
      }

      let foundUid = false,
        uid = "";
      for (const i in this.userIds) {
        try {
          uid = lazy.EnigmailFuncs.stripEmail(
            this.userIds[i].userId.toLowerCase()
          );
        } catch (x) {
          uid = this.userIds[i].userId.toLowerCase();
        }

        if (uid == emailAddr) {
          foundUid = true;
          break;
        }
      }
      if (!foundUid) {
        emailAddr = false;
      }
    }

    if (!emailAddr) {
      emailAddr = this.userId;
    }

    try {
      emailAddr = lazy.EnigmailFuncs.stripEmail(emailAddr.toLowerCase());
    } catch (x) {
      emailAddr = emailAddr.toLowerCase();
    }

    let newestSigningKey = 0,
      newestEncryptionKey = 0,
      subkeysArr = null;

    // search for valid subkeys
    for (const sk in this.subKeys) {
      if (!"indDre".includes(this.subKeys[sk].keyTrust)) {
        if (this.subKeys[sk].keyUseFor.search(/[sS]/) >= 0) {
          // found signing subkey
          if (this.subKeys[sk].keyCreated > newestSigningKey) {
            newestSigningKey = this.subKeys[sk].keyCreated;
          }
        }
        if (this.subKeys[sk].keyUseFor.search(/[eE]/) >= 0) {
          // found encryption subkey
          if (this.subKeys[sk].keyCreated > newestEncryptionKey) {
            newestEncryptionKey = this.subKeys[sk].keyCreated;
          }
        }
      }
    }

    if (newestSigningKey > 0 && newestEncryptionKey > 0) {
      subkeysArr = [newestEncryptionKey, newestSigningKey];
    }

    if (!this.minimalKeyBlock.has(emailAddr)) {
      const cApi = lazy.EnigmailCryptoAPI();
      const pubkey = cApi.sync(
        cApi.getMinimalPubKey(this.fpr, emailAddr, subkeysArr)
      );
      if (pubkey) {
        this.minimalKeyBlock.set(emailAddr, pubkey);
      }
    }
    return this.minimalKeyBlock.get(emailAddr);
  }

  /**
   * Obtain a "virtual" key size that allows to compare different algorithms with each other
   * e.g. elliptic curve keys have small key sizes with high cryptographic strength
   *
   * @returns {integer} a virtual size.
   */
  getVirtualKeySize() {
    switch (this.algoSym) {
      case "DSA":
        return this.keySize / 2;
      case "ECDSA":
        return this.keySize * 8;
      case "EDDSA":
        return this.keySize * 32;
      default:
        return this.keySize;
    }
  }

  /**
   * @param {boolean} minimalKey - If true, reduce key to minimum required.
   *
   * @returns {object} object
   * @returns {integer} object.exitCode - Result code (0: OK)
   * @returns {string} object.keyData - ASCII armored key data material.
   * @returns {string} object.errorMsg - Error message in case exitCode !== 0.
   */
  getSecretKey(minimalKey) {
    const cApi = lazy.EnigmailCryptoAPI();
    return cApi.sync(cApi.extractSecretKey(this.fpr, minimalKey));
  }

  iSimpleOneSubkeySameExpiry() {
    if (this.subKeys.length == 0) {
      return true;
    }

    if (this.subKeys.length > 1) {
      return false;
    }

    const subKey = this.subKeys[0];

    if (!this.expiryTime && !subKey.expiryTime) {
      return true;
    }

    let deltaSeconds = this.expiryTime - subKey.expiryTime;
    if (deltaSeconds < 0) {
      deltaSeconds *= -1;
    }

    // If expiry dates differ by less than a half day, then we
    // treat it as having roughly the same expiry date.
    return deltaSeconds < 12 * 60 * 60;
  }

  /**
   * Obtain the list of alternative email addresses, except the one
   * that is given as the parameter.
   *
   * @param {boolean} exceptThisEmail - an email address that will
   *   be excluded in the result array.
   * @returns {string[]} - an array of all email addresses found in all
   *   of the key's user IDs, excluding exceptThisEmail.
   */
  getAlternativeEmails(exceptThisEmail) {
    const result = [];

    for (const u of this.userIds) {
      let email;
      try {
        email = lazy.EnigmailFuncs.stripEmail(u.userId.toLowerCase());
      } catch (x) {
        email = u.userId.toLowerCase();
      }

      if (email == exceptThisEmail) {
        continue;
      }

      result.push(email);
    }

    return result;
  }

  getUserIdWithEmail(email) {
    email = email.toLowerCase();
    for (const u of this.userIds) {
      let e;
      try {
        e = lazy.EnigmailFuncs.stripEmail(u.userId.toLowerCase());
      } catch (x) {
        e = u.userId.toLowerCase();
      }

      if (email == e) {
        return u;
      }
    }

    return null;
  }
}
