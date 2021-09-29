/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["RNP"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  ctypes: "resource://gre/modules/ctypes.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  GPGME: "chrome://openpgp/content/modules/GPGME.jsm",
  OpenPGPMasterpass: "chrome://openpgp/content/modules/masterpass.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
  RNPLibLoader: "chrome://openpgp/content/modules/RNPLib.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const str_encrypt = "encrypt";
const str_sign = "sign";
const str_certify = "certify";
const str_authenticate = "authenticate";
const RNP_PHOTO_USERID_ID = "(photo)"; // string is harcoded inside RNP

var RNPLib;

var RNP = {
  hasRan: false,
  libLoaded: false,
  async once() {
    this.hasRan = true;
    try {
      RNPLib = RNPLibLoader.init();
      if (!RNPLib) {
        return;
      }
      if (await RNPLib.init()) {
        //this.initUiOps();
        RNP.libLoaded = true;
      }
    } catch (e) {
      console.log(e);
    }
  },

  async init(opts) {
    opts = opts || {};

    if (!this.hasRan) {
      await this.once();
    }

    return RNP.libLoaded;
  },

  isAllowedPublicKeyAlgo(algo) {
    // see rnp/src/lib/rnp.cpp pubkey_alg_map
    switch (algo) {
      case "SM2":
        return false;

      default:
        return true;
    }
  },

  addKeyAttributes(handle, meta, keyObj, is_subkey, forListing) {
    let algo = new ctypes.char.ptr();
    let bits = new ctypes.uint32_t();
    let key_creation = new ctypes.uint32_t();
    let key_expiration = new ctypes.uint32_t();
    let allowed = new ctypes.bool();

    keyObj.secretAvailable = this.getSecretAvailableFromHandle(handle);

    if (keyObj.secretAvailable) {
      keyObj.secretMaterial = RNPLib.isSecretKeyMaterialAvailable(handle);
    } else {
      keyObj.secretMaterial = false;
    }

    if (is_subkey) {
      keyObj.type = "sub";
    } else {
      keyObj.type = "pub";
    }

    keyObj.keyId = this.getKeyIDFromHandle(handle);
    if (forListing) {
      keyObj.id = keyObj.keyId;
    }

    keyObj.fpr = this.getFingerprintFromHandle(handle);

    if (RNPLib.rnp_key_get_alg(handle, algo.address())) {
      throw new Error("rnp_key_get_alg failed");
    }
    keyObj.algoSym = algo.readString();
    RNPLib.rnp_buffer_destroy(algo);

    if (RNPLib.rnp_key_get_bits(handle, bits.address())) {
      throw new Error("rnp_key_get_bits failed");
    }
    keyObj.keySize = bits.value;

    if (RNPLib.rnp_key_get_creation(handle, key_creation.address())) {
      throw new Error("rnp_key_get_creation failed");
    }
    keyObj.keyCreated = key_creation.value;
    keyObj.created = new Services.intl.DateTimeFormat().format(
      new Date(keyObj.keyCreated * 1000)
    );

    if (RNPLib.rnp_key_get_expiration(handle, key_expiration.address())) {
      throw new Error("rnp_key_get_expiration failed");
    }
    if (key_expiration.value > 0) {
      keyObj.expiryTime = keyObj.keyCreated + key_expiration.value;
    } else {
      keyObj.expiryTime = 0;
    }
    keyObj.expiry = keyObj.expiryTime
      ? new Services.intl.DateTimeFormat().format(
          new Date(keyObj.expiryTime * 1000)
        )
      : "";
    keyObj.keyUseFor = "";

    if (!this.isAllowedPublicKeyAlgo(keyObj.algoSym)) {
      return;
    }

    let key_revoked = new ctypes.bool();
    if (RNPLib.rnp_key_is_revoked(handle, key_revoked.address())) {
      throw new Error("rnp_key_is_revoked failed");
    }

    if (key_revoked.value) {
      keyObj.keyTrust = "r";
      if (forListing) {
        keyObj.revoke = true;
      }
    } else if (this.isExpiredTime(keyObj.expiryTime)) {
      keyObj.keyTrust = "e";
    } else if (keyObj.secretAvailable) {
      keyObj.keyTrust = "u";
    } else {
      keyObj.keyTrust = "o";
    }

    if (RNPLib.rnp_key_allows_usage(handle, str_encrypt, allowed.address())) {
      throw new Error("rnp_key_allows_usage failed");
    }
    if (allowed.value) {
      keyObj.keyUseFor += "e";
      meta.e = true;
    }
    if (RNPLib.rnp_key_allows_usage(handle, str_sign, allowed.address())) {
      throw new Error("rnp_key_allows_usage failed");
    }
    if (allowed.value) {
      keyObj.keyUseFor += "s";
      meta.s = true;
    }
    if (RNPLib.rnp_key_allows_usage(handle, str_certify, allowed.address())) {
      throw new Error("rnp_key_allows_usage failed");
    }
    if (allowed.value) {
      keyObj.keyUseFor += "c";
      meta.c = true;
    }
    if (
      RNPLib.rnp_key_allows_usage(handle, str_authenticate, allowed.address())
    ) {
      throw new Error("rnp_key_allows_usage failed");
    }
    if (allowed.value) {
      keyObj.keyUseFor += "a";
      meta.a = true;
    }
  },

  async getKeys(onlyKeys = null) {
    return this.getKeysFromFFI(RNPLib.ffi, false, onlyKeys, false);
  },

  async getSecretKeys(onlyKeys = null) {
    return this.getKeysFromFFI(RNPLib.ffi, false, onlyKeys, true);
  },

  getProtectedKeysCount() {
    return RNPLib.getProtectedKeysCount();
  },

  async protectUnprotectedKeys() {
    return RNPLib.protectUnprotectedKeys();
  },

  /* Some consumers want a different listing of keys, and expect
   * slightly different attribute names...
   * If forListing is true, we'll set those additional attributes
   * If onlyKeys is given: only returns keys in that array
   */
  async getKeysFromFFI(ffi, forListing, onlyKeys = null, onlySecret = false) {
    if (!!onlyKeys && onlySecret) {
      throw new Error(
        "filtering by both white list and only secret keys isn't supported"
      );
    }

    let keys = [];

    if (onlyKeys) {
      for (let ki = 0; ki < onlyKeys.length; ki++) {
        let handle = await this.getKeyHandleByIdentifier(ffi, onlyKeys[ki]);

        let keyObj = {};
        try {
          // Skip if it is a sub key, it will be processed together with primary key later.
          let ok = this.getKeyInfoFromHandle(
            ffi,
            handle,
            keyObj,
            false,
            forListing,
            false
          );
          if (!ok) {
            continue;
          }
        } catch (ex) {
          console.log(ex);
        } finally {
          RNPLib.rnp_key_handle_destroy(handle);
        }

        if (keyObj) {
          keys.push(keyObj);
        }
      }
    } else {
      let rv;

      let iter = new RNPLib.rnp_identifier_iterator_t();
      let grip = new ctypes.char.ptr();

      rv = RNPLib.rnp_identifier_iterator_create(ffi, iter.address(), "grip");
      if (rv) {
        return null;
      }

      while (!RNPLib.rnp_identifier_iterator_next(iter, grip.address())) {
        if (grip.isNull()) {
          break;
        }

        let handle = new RNPLib.rnp_key_handle_t();

        if (RNPLib.rnp_locate_key(ffi, "grip", grip, handle.address())) {
          throw new Error("rnp_locate_key failed");
        }

        let keyObj = {};
        try {
          if (RNP.isBadKey(handle)) {
            continue;
          }

          // Skip if it is a sub key, it will be processed together with primary key later.
          if (
            !this.getKeyInfoFromHandle(
              ffi,
              handle,
              keyObj,
              false,
              forListing,
              onlySecret
            )
          ) {
            continue;
          }
        } catch (ex) {
          console.log(ex);
        } finally {
          RNPLib.rnp_key_handle_destroy(handle);
        }

        if (keyObj) {
          keys.push(keyObj);
        }
      }

      RNPLib.rnp_identifier_iterator_destroy(iter);
    }

    return keys;
  },

  getFingerprintFromHandle(handle) {
    let fingerprint = new ctypes.char.ptr();
    if (RNPLib.rnp_key_get_fprint(handle, fingerprint.address())) {
      throw new Error("rnp_key_get_fprint failed");
    }
    let result = fingerprint.readString();
    RNPLib.rnp_buffer_destroy(fingerprint);
    return result;
  },

  getKeyIDFromHandle(handle) {
    let ctypes_key_id = new ctypes.char.ptr();
    if (RNPLib.rnp_key_get_keyid(handle, ctypes_key_id.address())) {
      throw new Error("rnp_key_get_keyid failed");
    }
    let result = ctypes_key_id.readString();
    RNPLib.rnp_buffer_destroy(ctypes_key_id);
    return result;
  },

  getSecretAvailableFromHandle(handle) {
    return RNPLib.getSecretAvailableFromHandle(handle);
  },

  // We already know sub_handle is a subkey
  getPrimaryKeyHandleFromSub(ffi, sub_handle) {
    let newHandle = new RNPLib.rnp_key_handle_t();
    // test my expectation is correct
    if (!newHandle.isNull()) {
      throw new Error("unexpected, new handle isn't null");
    }
    let primary_grip = new ctypes.char.ptr();
    if (RNPLib.rnp_key_get_primary_grip(sub_handle, primary_grip.address())) {
      throw new Error("rnp_key_get_primary_grip failed");
    }
    if (primary_grip.isNull()) {
      return newHandle;
    }
    if (RNPLib.rnp_locate_key(ffi, "grip", primary_grip, newHandle.address())) {
      throw new Error("rnp_locate_key failed");
    }
    return newHandle;
  },

  // We don't know if handle is a subkey. If it's not, return null handle
  getPrimaryKeyHandleIfSub(ffi, handle) {
    let is_subkey = new ctypes.bool();
    if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
      throw new Error("rnp_key_is_sub failed");
    }
    if (!is_subkey.value) {
      let nullHandle = new RNPLib.rnp_key_handle_t();
      // test my expectation is correct
      if (!nullHandle.isNull()) {
        throw new Error("unexpected, new handle isn't null");
      }
      return nullHandle;
    }
    return this.getPrimaryKeyHandleFromSub(ffi, handle);
  },

  // return false if handle refers to subkey and should be ignored
  getKeyInfoFromHandle(
    ffi,
    handle,
    keyObj,
    usePrimaryIfSubkey,
    forListing,
    onlyIfSecret
  ) {
    keyObj.ownerTrust = null;
    keyObj.userId = null;
    keyObj.userIds = [];
    keyObj.subKeys = [];
    keyObj.photoAvailable = false;

    let is_subkey = new ctypes.bool();
    let sub_count = new ctypes.size_t();
    let uid_count = new ctypes.size_t();

    if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
      throw new Error("rnp_key_is_sub failed");
    }
    if (is_subkey.value) {
      if (!usePrimaryIfSubkey) {
        return false;
      }
      let rv = false;
      let newHandle = this.getPrimaryKeyHandleFromSub(ffi, handle);
      if (!newHandle.isNull()) {
        // recursively call ourselves to get primary key info
        rv = this.getKeyInfoFromHandle(
          ffi,
          newHandle,
          keyObj,
          false,
          forListing,
          onlyIfSecret
        );
        RNPLib.rnp_key_handle_destroy(newHandle);
      }
      return rv;
    }

    if (onlyIfSecret) {
      let have_secret = new ctypes.bool();
      if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
        throw new Error("rnp_key_have_secret failed");
      }
      if (!have_secret.value) {
        return false;
      }
    }

    let meta = {
      a: false,
      s: false,
      c: false,
      e: false,
    };
    this.addKeyAttributes(handle, meta, keyObj, false, forListing);

    let hasAnySecretKey = keyObj.secretAvailable;

    /* The remaining actions are done for primary keys, only. */
    if (!is_subkey.value) {
      if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
        throw new Error("rnp_key_get_uid_count failed");
      }
      let firstValidUid = null;
      for (let i = 0; i < uid_count.value; i++) {
        let uid_handle = new RNPLib.rnp_uid_handle_t();

        if (RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())) {
          throw new Error("rnp_key_get_uid_handle_at failed");
        }

        // Never allow revoked user IDs
        let uidOkToUse = !this.isRevokedUid(uid_handle);
        if (uidOkToUse) {
          // Usually, we don't allow user IDs reported as not valid
          uidOkToUse = !this.isBadUid(uid_handle);
          if (!uidOkToUse && keyObj.keyTrust == "e") {
            // However, a user might be not valid, because it has
            // expired. If the primary key has expired, we should show
            // some user ID, even if all user IDs have expired,
            // otherwise the user cannot see any text description.
            // We allow showing user IDs with a good self-signature.
            uidOkToUse = this.uidHasGoodSignature(keyObj.keyId, uid_handle);
          }
        }

        if (uidOkToUse) {
          let uid_str = new ctypes.char.ptr();
          if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
            throw new Error("rnp_key_get_uid_at failed");
          }
          let userIdStr = uid_str.readStringReplaceMalformed();
          RNPLib.rnp_buffer_destroy(uid_str);

          if (userIdStr !== RNP_PHOTO_USERID_ID) {
            if (!firstValidUid) {
              firstValidUid = userIdStr;
            }

            if (!keyObj.userId && this.isPrimaryUid(uid_handle)) {
              keyObj.userId = userIdStr;
            }

            let uidObj = {};
            uidObj.userId = userIdStr;
            uidObj.type = "uid";
            uidObj.keyTrust = keyObj.keyTrust;
            uidObj.uidFpr = "??fpr??";

            keyObj.userIds.push(uidObj);
          }
        }

        RNPLib.rnp_uid_handle_destroy(uid_handle);
      }

      if (!keyObj.userId && firstValidUid) {
        // No user ID marked as primary, so let's use the first valid.
        keyObj.userId = firstValidUid;
      }

      if (!keyObj.userId) {
        keyObj.userId = "?";
      }

      if (forListing) {
        keyObj.name = keyObj.userId;
      }

      if (RNPLib.rnp_key_get_subkey_count(handle, sub_count.address())) {
        throw new Error("rnp_key_get_subkey_count failed");
      }
      for (let i = 0; i < sub_count.value; i++) {
        let sub_handle = new RNPLib.rnp_key_handle_t();
        if (RNPLib.rnp_key_get_subkey_at(handle, i, sub_handle.address())) {
          throw new Error("rnp_key_get_subkey_at failed");
        }

        if (!RNP.isBadKey(sub_handle)) {
          let subKeyObj = {};
          this.addKeyAttributes(sub_handle, meta, subKeyObj, true, forListing);
          keyObj.subKeys.push(subKeyObj);
          hasAnySecretKey = hasAnySecretKey || subKeyObj.secretAvailable;
        }

        RNPLib.rnp_key_handle_destroy(sub_handle);
      }

      let haveNonExpiringEncryptionKey = false;
      let haveNonExpiringSigningKey = false;

      let effectiveEncryptionExpiry = keyObj.expiry;
      let effectiveSigningExpiry = keyObj.expiry;
      let effectiveEncryptionExpiryTime = keyObj.expiryTime;
      let effectiveSigningExpiryTime = keyObj.expiryTime;

      if (keyObj.keyUseFor.match(/e/) && !keyObj.expiryTime) {
        haveNonExpiringEncryptionKey = true;
      }

      if (keyObj.keyUseFor.match(/s/) && !keyObj.expiryTime) {
        haveNonExpiringSigningKey = true;
      }

      let mostFutureEncExpiryTime = 0;
      let mostFutureSigExpiryTime = 0;
      let mostFutureEncExpiry = "";
      let mostFutureSigExpiry = "";

      for (let aSub of keyObj.subKeys) {
        if (aSub.keyTrust == "r") {
          continue;
        }

        // Expiring subkeys may shorten the effective expiry,
        // unless the primary key is non-expiring and can be used
        // for a purpose.
        // Subkeys cannot extend the expiry beyond the primary key's.

        // Strategy: If we don't have a non-expiring usable primary key,
        // then find the usable subkey that has the most future
        // expiration date. Stop searching is a non-expiring subkey
        // is found. Then compare with primary key expiry.

        if (!haveNonExpiringEncryptionKey && aSub.keyUseFor.match(/e/)) {
          if (!aSub.expiryTime) {
            haveNonExpiringEncryptionKey = true;
          } else if (!mostFutureEncExpiryTime) {
            mostFutureEncExpiryTime = aSub.expiryTime;
            mostFutureEncExpiry = aSub.expiry;
          } else if (aSub.expiryTime > mostFutureEncExpiryTime) {
            mostFutureEncExpiryTime = aSub.expiryTime;
            mostFutureEncExpiry = aSub.expiry;
          }
        }

        // We only need to calculate the effective signing expiration
        // if it's about a personal key (we require both signing and
        // encryption capability).
        if (
          hasAnySecretKey &&
          !haveNonExpiringSigningKey &&
          aSub.keyUseFor.match(/s/)
        ) {
          if (!aSub.expiryTime) {
            haveNonExpiringSigningKey = true;
          } else if (!mostFutureSigExpiryTime) {
            mostFutureSigExpiryTime = aSub.expiryTime;
            mostFutureSigExpiry = aSub.expiry;
          } else if (aSub.expiryTime > mostFutureEncExpiryTime) {
            mostFutureSigExpiryTime = aSub.expiryTime;
            mostFutureSigExpiry = aSub.expiry;
          }
        }
      }

      if (
        !haveNonExpiringEncryptionKey &&
        mostFutureEncExpiryTime &&
        (!keyObj.expiryTime || mostFutureEncExpiryTime < keyObj.expiryTime)
      ) {
        effectiveEncryptionExpiryTime = mostFutureEncExpiryTime;
        effectiveEncryptionExpiry = mostFutureEncExpiry;
      }

      if (
        !haveNonExpiringSigningKey &&
        mostFutureSigExpiryTime &&
        (!keyObj.expiryTime || mostFutureSigExpiryTime < keyObj.expiryTime)
      ) {
        effectiveSigningExpiryTime = mostFutureSigExpiryTime;
        effectiveSigningExpiry = mostFutureSigExpiry;
      }

      if (!hasAnySecretKey) {
        keyObj.effectiveExpiryTime = effectiveEncryptionExpiryTime;
        keyObj.effectiveExpiry = effectiveEncryptionExpiry;
      } else {
        let effectiveSignOrEncExpiry = "";
        let effectiveSignOrEncExpiryTime = 0;

        if (!effectiveEncryptionExpiryTime) {
          if (effectiveSigningExpiryTime) {
            effectiveSignOrEncExpiryTime = effectiveSigningExpiryTime;
            effectiveSignOrEncExpiry = effectiveSigningExpiry;
          }
        } else if (!effectiveSigningExpiryTime) {
          effectiveSignOrEncExpiryTime = effectiveEncryptionExpiryTime;
          effectiveSignOrEncExpiry = effectiveEncryptionExpiry;
        } else if (effectiveSigningExpiryTime < effectiveEncryptionExpiryTime) {
          effectiveSignOrEncExpiryTime = effectiveSigningExpiryTime;
          effectiveSignOrEncExpiry = effectiveSigningExpiry;
        } else {
          effectiveSignOrEncExpiryTime = effectiveEncryptionExpiryTime;
          effectiveSignOrEncExpiry = effectiveEncryptionExpiry;
        }

        keyObj.effectiveExpiryTime = effectiveSignOrEncExpiryTime;
        keyObj.effectiveExpiry = effectiveSignOrEncExpiry;
      }

      if (meta.s) {
        keyObj.keyUseFor += "S";
      }
      if (meta.a) {
        keyObj.keyUseFor += "A";
      }
      if (meta.c) {
        keyObj.keyUseFor += "C";
      }
      if (meta.e) {
        keyObj.keyUseFor += "E";
      }
    }

    return true;
  },

  isBadKey(handle) {
    let validTill = new ctypes.uint32_t();
    if (RNPLib.rnp_key_valid_till(handle, validTill.address())) {
      throw new Error("rnp_key_valid_till failed");
    }

    // A bad key is invalid for any time
    return !validTill.value;
  },

  isPrimaryUid(uid_handle) {
    let is_primary = new ctypes.bool();

    if (RNPLib.rnp_uid_is_primary(uid_handle, is_primary.address())) {
      throw new Error("rnp_uid_is_primary failed");
    }

    return is_primary.value;
  },

  uidHasGoodSignature(self_key_id, uid_handle) {
    let sig_count = new ctypes.size_t();
    if (RNPLib.rnp_uid_get_signature_count(uid_handle, sig_count.address())) {
      throw new Error("rnp_uid_get_signature_count failed");
    }

    let found_result = false;
    let is_good = false;
    for (let i = 0; !found_result && i < sig_count.value; i++) {
      let sig_handle = new RNPLib.rnp_signature_handle_t();

      if (
        RNPLib.rnp_uid_get_signature_at(uid_handle, i, sig_handle.address())
      ) {
        throw new Error("rnp_uid_get_signature_at failed");
      }

      let sig_id_str = new ctypes.char.ptr();
      if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
        throw new Error("rnp_signature_get_keyid failed");
      }

      if (sig_id_str.readString() == self_key_id) {
        found_result = true;

        let sig_validity = RNPLib.rnp_signature_is_valid(sig_handle, 0);
        is_good =
          sig_validity == RNPLib.RNP_SUCCESS ||
          sig_validity == RNPLib.RNP_ERROR_SIGNATURE_EXPIRED;
      }

      RNPLib.rnp_signature_handle_destroy(sig_handle);
    }

    return is_good;
  },

  isBadUid(uid_handle) {
    let is_valid = new ctypes.bool();

    if (RNPLib.rnp_uid_is_valid(uid_handle, is_valid.address())) {
      throw new Error("rnp_uid_is_valid failed");
    }

    return !is_valid.value;
  },

  isRevokedUid(uid_handle) {
    let is_revoked = new ctypes.bool();

    if (RNPLib.rnp_uid_is_revoked(uid_handle, is_revoked.address())) {
      throw new Error("rnp_uid_is_revoked failed");
    }

    return is_revoked.value;
  },

  getKeySignatures(keyId, ignoreUnknownUid) {
    let handle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      "0x" + keyId
    );
    let mainKeyObj = {};
    this.getKeyInfoFromHandle(
      RNPLib.ffi,
      handle,
      mainKeyObj,
      false,
      true,
      false
    );

    let rList = {};

    try {
      let uid_count = new ctypes.size_t();
      if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
        throw new Error("rnp_key_get_uid_count failed");
      }
      let outputIndex = 0;
      for (let i = 0; i < uid_count.value; i++) {
        let uid_handle = new RNPLib.rnp_uid_handle_t();

        if (RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())) {
          throw new Error("rnp_key_get_uid_handle_at failed");
        }

        if (!this.isBadUid(uid_handle) && !this.isRevokedUid(uid_handle)) {
          let uid_str = new ctypes.char.ptr();
          if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
            throw new Error("rnp_key_get_uid_at failed");
          }
          let userIdStr = uid_str.readStringReplaceMalformed();
          RNPLib.rnp_buffer_destroy(uid_str);

          if (userIdStr !== RNP_PHOTO_USERID_ID) {
            let id = outputIndex;
            ++outputIndex;

            let subList = {};

            subList = {};
            subList.created = mainKeyObj.created;
            subList.fpr = mainKeyObj.fpr;
            subList.keyId = mainKeyObj.keyId;

            subList.userId = userIdStr;
            subList.sigList = [];

            let sig_count = new ctypes.size_t();
            if (
              RNPLib.rnp_uid_get_signature_count(
                uid_handle,
                sig_count.address()
              )
            ) {
              throw new Error("rnp_uid_get_signature_count failed");
            }
            for (let j = 0; j < sig_count.value; j++) {
              let sigObj = {};

              let sig_handle = new RNPLib.rnp_signature_handle_t();
              if (
                RNPLib.rnp_uid_get_signature_at(
                  uid_handle,
                  j,
                  sig_handle.address()
                )
              ) {
                throw new Error("rnp_uid_get_signature_at failed");
              }

              let creation = new ctypes.uint32_t();
              if (
                RNPLib.rnp_signature_get_creation(
                  sig_handle,
                  creation.address()
                )
              ) {
                throw new Error("rnp_signature_get_creation failed");
              }
              sigObj.created = new Services.intl.DateTimeFormat().format(
                new Date(creation.value * 1000)
              );
              sigObj.sigType = "?";

              let sig_id_str = new ctypes.char.ptr();
              if (
                RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())
              ) {
                throw new Error("rnp_signature_get_keyid failed");
              }

              let sigIdStr = sig_id_str.readString();
              sigObj.signerKeyId = sigIdStr;
              RNPLib.rnp_buffer_destroy(sig_id_str);

              let signerHandle = new RNPLib.rnp_key_handle_t();

              if (
                RNPLib.rnp_signature_get_signer(
                  sig_handle,
                  signerHandle.address()
                )
              ) {
                throw new Error("rnp_signature_get_signer failed");
              }

              if (signerHandle.isNull() || this.isBadKey(signerHandle)) {
                if (!ignoreUnknownUid) {
                  sigObj.userId = "?";
                  sigObj.sigKnown = false;
                  subList.sigList.push(sigObj);
                }
              } else {
                let signer_uid_str = new ctypes.char.ptr();
                if (
                  RNPLib.rnp_key_get_primary_uid(
                    signerHandle,
                    signer_uid_str.address()
                  )
                ) {
                  throw new Error("rnp_key_get_primary_uid failed");
                }
                sigObj.userId = signer_uid_str.readStringReplaceMalformed();
                RNPLib.rnp_buffer_destroy(signer_uid_str);
                sigObj.sigKnown = true;
                subList.sigList.push(sigObj);
                RNPLib.rnp_key_handle_destroy(signerHandle);
              }
              RNPLib.rnp_signature_handle_destroy(sig_handle);
            }
            rList[id] = subList;
          }
        }

        RNPLib.rnp_uid_handle_destroy(uid_handle);
      }
    } catch (ex) {
      console.log(ex);
    } finally {
      RNPLib.rnp_key_handle_destroy(handle);
    }
    return rList;
  },

  policyForbidsAlg(alg) {
    // TODO: implement policy
    // Currently, all algorithms are allowed
    return false;
  },

  getKeyIdsFromRecipHandle(recip_handle, resultRecipAndPrimary) {
    resultRecipAndPrimary.keyId = "";
    resultRecipAndPrimary.primaryKeyId = "";

    let c_key_id = new ctypes.char.ptr();
    if (RNPLib.rnp_recipient_get_keyid(recip_handle, c_key_id.address())) {
      throw new Error("rnp_recipient_get_keyid failed");
    }
    let recip_key_id = c_key_id.readString();
    resultRecipAndPrimary.keyId = recip_key_id;
    RNPLib.rnp_buffer_destroy(c_key_id);

    let recip_key_handle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      "0x" + recip_key_id
    );
    if (!recip_key_handle.isNull()) {
      let primary_signer_handle = this.getPrimaryKeyHandleIfSub(
        RNPLib.ffi,
        recip_key_handle
      );
      if (!primary_signer_handle.isNull()) {
        resultRecipAndPrimary.primaryKeyId = this.getKeyIDFromHandle(
          primary_signer_handle
        );
        RNPLib.rnp_key_handle_destroy(primary_signer_handle);
      }
      RNPLib.rnp_key_handle_destroy(recip_key_handle);
    }
  },

  async decrypt(encrypted, options, alreadyDecrypted = false) {
    let input_from_memory = new RNPLib.rnp_input_t();

    let arr = encrypted.split("").map(e => e.charCodeAt());
    var encrypted_array = ctypes.uint8_t.array()(arr);

    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      encrypted_array,
      encrypted_array.length,
      false
    );

    // Allow compressed encrypted messages, max factor 1200, up to 100 MiB.
    const max_decrypted_message_size = 100 * 1024 * 1024;
    let max_out = Math.min(encrypted.length * 1200, max_decrypted_message_size);

    let output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

    let result = {};
    result.decryptedData = "";
    result.statusFlags = 0;
    result.extStatusFlags = 0;

    result.userId = "";
    result.keyId = "";
    result.encToDetails = {};
    result.encToDetails.myRecipKey = {};
    result.encToDetails.allRecipKeys = [];

    if (alreadyDecrypted) {
      result.encToDetails = options.encToDetails;
    }

    let verify_op = new RNPLib.rnp_op_verify_t();
    result.exitCode = RNPLib.rnp_op_verify_create(
      verify_op.address(),
      RNPLib.ffi,
      input_from_memory,
      output_to_memory
    );

    result.exitCode = RNPLib.rnp_op_verify_execute(verify_op);

    let rnpCannotDecrypt = false;
    let queryAllEncryptionRecipients = false;

    let useDecodedData;
    let processSignature;
    switch (result.exitCode) {
      case RNPLib.RNP_SUCCESS:
        useDecodedData = true;
        processSignature = true;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_INVALID:
        result.statusFlags |= EnigmailConstants.BAD_SIGNATURE;
        useDecodedData = true;
        processSignature = false;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_EXPIRED:
        useDecodedData = true;
        processSignature = false;
        result.statusFlags |= EnigmailConstants.EXPIRED_SIGNATURE;
        break;
      case RNPLib.RNP_ERROR_DECRYPT_FAILED:
        rnpCannotDecrypt = true;
        useDecodedData = false;
        processSignature = false;
        queryAllEncryptionRecipients = true;
        result.statusFlags |= EnigmailConstants.DECRYPTION_FAILED;
        break;
      case RNPLib.RNP_ERROR_NO_SUITABLE_KEY:
        rnpCannotDecrypt = true;
        useDecodedData = false;
        processSignature = false;
        queryAllEncryptionRecipients = true;
        result.statusFlags |=
          EnigmailConstants.DECRYPTION_FAILED | EnigmailConstants.NO_SECKEY;
        break;
      default:
        useDecodedData = false;
        processSignature = false;
        console.debug(
          "rnp_op_verify_execute returned unexpected: " + result.exitCode
        );
        break;
    }

    if (useDecodedData && alreadyDecrypted) {
      result.statusFlags |= EnigmailConstants.DECRYPTION_OKAY;
    } else if (useDecodedData && !alreadyDecrypted) {
      let prot_mode_str = new ctypes.char.ptr();
      let prot_cipher_str = new ctypes.char.ptr();
      let prot_is_valid = new ctypes.bool();

      if (
        RNPLib.rnp_op_verify_get_protection_info(
          verify_op,
          prot_mode_str.address(),
          prot_cipher_str.address(),
          prot_is_valid.address()
        )
      ) {
        throw new Error("rnp_op_verify_get_protection_info failed");
      }
      let mode = prot_mode_str.readString();
      let cipher = prot_cipher_str.readString();
      let validIntegrityProtection = prot_is_valid.value;

      if (mode != "none") {
        if (!validIntegrityProtection) {
          useDecodedData = false;
          result.statusFlags |=
            EnigmailConstants.MISSING_MDC | EnigmailConstants.DECRYPTION_FAILED;
        } else if (mode == "null" || this.policyForbidsAlg(cipher)) {
          // don't indicate decryption, because a non-protecting or insecure cipher was used
          result.statusFlags |= EnigmailConstants.UNKNOWN_ALGO;
        } else {
          queryAllEncryptionRecipients = true;

          let recip_handle = new RNPLib.rnp_recipient_handle_t();
          let rv = RNPLib.rnp_op_verify_get_used_recipient(
            verify_op,
            recip_handle.address()
          );
          if (rv) {
            throw new Error("rnp_op_verify_get_used_recipient failed");
          }

          let c_alg = new ctypes.char.ptr();
          rv = RNPLib.rnp_recipient_get_alg(recip_handle, c_alg.address());
          if (rv) {
            throw new Error("rnp_recipient_get_alg failed");
          }

          if (this.policyForbidsAlg(c_alg.readString())) {
            result.statusFlags |= EnigmailConstants.UNKNOWN_ALGO;
          } else {
            this.getKeyIdsFromRecipHandle(
              recip_handle,
              result.encToDetails.myRecipKey
            );
            result.statusFlags |= EnigmailConstants.DECRYPTION_OKAY;
          }
        }
      }
    }

    if (queryAllEncryptionRecipients) {
      let all_recip_count = new ctypes.size_t();
      if (
        RNPLib.rnp_op_verify_get_recipient_count(
          verify_op,
          all_recip_count.address()
        )
      ) {
        throw new Error("rnp_op_verify_get_recipient_count failed");
      }
      if (all_recip_count.value > 1) {
        for (let recip_i = 0; recip_i < all_recip_count.value; recip_i++) {
          let other_recip_handle = new RNPLib.rnp_recipient_handle_t();
          if (
            RNPLib.rnp_op_verify_get_recipient_at(
              verify_op,
              recip_i,
              other_recip_handle.address()
            )
          ) {
            throw new Error("rnp_op_verify_get_recipient_at failed");
          }
          let encTo = {};
          this.getKeyIdsFromRecipHandle(other_recip_handle, encTo);
          result.encToDetails.allRecipKeys.push(encTo);
        }
      }
    }

    if (useDecodedData) {
      let result_buf = new ctypes.uint8_t.ptr();
      let result_len = new ctypes.size_t();
      let rv = RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      );

      // result_len is of type UInt64, I don't know of a better way
      // to convert it to an integer.
      let b_len = parseInt(result_len.value.toString());

      if (!rv) {
        // type casting the pointer type to an array type allows us to
        // access the elements by index.
        let uint8_array = ctypes.cast(
          result_buf,
          ctypes.uint8_t.array(result_len.value).ptr
        ).contents;

        let str = "";
        for (let i = 0; i < b_len; i++) {
          str += String.fromCharCode(uint8_array[i]);
        }

        result.decryptedData = str;
      }

      if (processSignature) {
        // ignore "no signature" result, that's ok
        await this.getVerifyDetails(
          RNPLib.ffi,
          options.fromAddr,
          verify_op,
          result
        );
      }
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);
    RNPLib.rnp_op_verify_destroy(verify_op);

    if (
      rnpCannotDecrypt &&
      !alreadyDecrypted &&
      Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg") &&
      GPGME.allDependenciesLoaded()
    ) {
      // failure processing with RNP, attempt decryption with GPGME
      let r2 = await GPGME.decrypt(encrypted, RNP.enArmor);
      if (!r2.exitCode && r2.decryptedData) {
        // TODO: obtain info which key ID was used for decryption
        //       and set result.decryptKey*
        //       It isn't obvious how to do that with GPGME, because
        //       gpgme_op_decrypt_result provides the list of all the
        //       encryption keys, only.

        // The result may still contain wrapping like compression,
        // and optional signature data. Recursively call ourselves
        // to perform the remaining processing.
        options.encToDetails = result.encToDetails;
        return RNP.decrypt(r2.decryptedData, options, true);
      }
    }

    return result;
  },

  async getVerifyDetails(ffi, fromAddr, verify_op, result) {
    if (!fromAddr) {
      // We cannot correctly verify without knowing the fromAddr.
      // This scenario is reached when quoting an encrypted MIME part.
      return false;
    }

    let sig_count = new ctypes.size_t();
    if (
      RNPLib.rnp_op_verify_get_signature_count(verify_op, sig_count.address())
    ) {
      throw new Error("rnp_op_verify_get_signature_count failed");
    }

    // TODO: How should handle (sig_count.value > 1) ?
    if (sig_count.value == 0) {
      // !sig_count.value didn't work, === also doesn't work
      return false;
    }

    let sig = new RNPLib.rnp_op_verify_signature_t();
    if (RNPLib.rnp_op_verify_get_signature_at(verify_op, 0, sig.address())) {
      throw new Error("rnp_op_verify_get_signature_at failed");
    }

    let sig_handle = new RNPLib.rnp_signature_handle_t();
    if (RNPLib.rnp_op_verify_signature_get_handle(sig, sig_handle.address())) {
      throw new Error("rnp_op_verify_signature_get_handle failed");
    }

    let sig_id_str = new ctypes.char.ptr();
    if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
      throw new Error("rnp_signature_get_keyid failed");
    }
    result.keyId = sig_id_str.readString();
    RNPLib.rnp_buffer_destroy(sig_id_str);
    RNPLib.rnp_signature_handle_destroy(sig_handle);

    let sig_status = RNPLib.rnp_op_verify_signature_get_status(sig);
    if (sig_status != RNPLib.RNP_SUCCESS && !result.exitCode) {
      /* Don't allow a good exit code. Keep existing bad code. */
      result.exitCode = -1;
    }

    let query_times = true;
    let query_signer = true;

    switch (sig_status) {
      case RNPLib.RNP_SUCCESS:
        result.statusFlags |= EnigmailConstants.GOOD_SIGNATURE;
        break;
      case RNPLib.RNP_ERROR_KEY_NOT_FOUND:
        result.statusFlags |=
          EnigmailConstants.UNCERTAIN_SIGNATURE | EnigmailConstants.NO_PUBKEY;
        query_signer = false;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_EXPIRED:
        result.statusFlags |= EnigmailConstants.EXPIRED_SIGNATURE;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_INVALID:
        result.statusFlags |= EnigmailConstants.BAD_SIGNATURE;
        break;
      default:
        result.statusFlags |= EnigmailConstants.BAD_SIGNATURE;
        query_times = false;
        query_signer = false;
        break;
    }

    if (query_times) {
      let created = new ctypes.uint32_t();
      let expires = new ctypes.uint32_t(); //relative

      if (
        RNPLib.rnp_op_verify_signature_get_times(
          sig,
          created.address(),
          expires.address()
        )
      ) {
        throw new Error("rnp_op_verify_signature_get_times failed");
      }
    }

    let signer_key = new RNPLib.rnp_key_handle_t();
    let have_signer_key = false;
    let use_signer_key = false;

    if (query_signer) {
      if (RNPLib.rnp_op_verify_signature_get_key(sig, signer_key.address())) {
        throw new Error("rnp_op_verify_signature_get_key");
      }

      have_signer_key = true;
      use_signer_key = !this.isBadKey(signer_key);
    }

    if (use_signer_key) {
      let keyInfo = {};
      let ok = this.getKeyInfoFromHandle(
        ffi,
        signer_key,
        keyInfo,
        true,
        false,
        false
      );
      if (!ok) {
        throw new Error("getKeyInfoFromHandle failed");
      }

      let fromMatchesAnyUid = false;
      let fromLower = fromAddr ? fromAddr.toLowerCase() : "";

      for (let uid of keyInfo.userIds) {
        if (uid.type !== "uid") {
          continue;
        }

        if (
          EnigmailFuncs.getEmailFromUserID(uid.userId).toLowerCase() ===
          fromLower
        ) {
          fromMatchesAnyUid = true;
          break;
        }
      }

      let useUndecided = true;

      if (keyInfo.secretAvailable) {
        let isPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(
          keyInfo.fpr
        );
        if (isPersonal && fromMatchesAnyUid) {
          result.extStatusFlags |= EnigmailConstants.EXT_SELF_IDENTITY;
          useUndecided = false;
        } else {
          result.statusFlags |= EnigmailConstants.INVALID_RECIPIENT;
          useUndecided = true;
        }
      } else if (result.statusFlags & EnigmailConstants.GOOD_SIGNATURE) {
        if (!fromMatchesAnyUid) {
          /* At the time the user had accepted the key,
           * a different set of email addresses might have been
           * contained inside the key. In the meantime, we might
           * have refreshed the key, a email addresses
           * might have been removed or revoked.
           * If the current from was removed/revoked, we'd still
           * get an acceptance match, but the from is no longer found
           * in the key's UID list. That should get "undecided".
           */
          result.statusFlags |= EnigmailConstants.INVALID_RECIPIENT;
          useUndecided = true;
        } else {
          let acceptanceResult = {};
          try {
            await PgpSqliteDb2.getAcceptance(
              keyInfo.fpr,
              fromLower,
              acceptanceResult
            );
          } catch (ex) {
            console.debug("getAcceptance failed: " + ex);
          }

          // unverified key acceptance means, we consider the signature OK,
          //   but it's not a trusted identity.
          // unverified signature means, we cannot decide if the signature
          //   is ok.

          if (
            "emailDecided" in acceptanceResult &&
            acceptanceResult.emailDecided &&
            "fingerprintAcceptance" in acceptanceResult &&
            acceptanceResult.fingerprintAcceptance.length &&
            acceptanceResult.fingerprintAcceptance != "undecided"
          ) {
            if (acceptanceResult.fingerprintAcceptance == "rejected") {
              result.statusFlags &= ~EnigmailConstants.GOOD_SIGNATURE;
              result.statusFlags |=
                EnigmailConstants.BAD_SIGNATURE |
                EnigmailConstants.INVALID_RECIPIENT;
              useUndecided = false;
            } else if (acceptanceResult.fingerprintAcceptance == "verified") {
              result.statusFlags |= EnigmailConstants.TRUSTED_IDENTITY;
              useUndecided = false;
            } else if (acceptanceResult.fingerprintAcceptance == "unverified") {
              useUndecided = false;
            }
          }
        }
      }

      if (useUndecided) {
        result.statusFlags &= ~EnigmailConstants.GOOD_SIGNATURE;
        result.statusFlags |= EnigmailConstants.UNCERTAIN_SIGNATURE;
      }
    }

    if (have_signer_key) {
      RNPLib.rnp_key_handle_destroy(signer_key);
    }

    return true;
  },

  async verifyDetached(data, options) {
    let result = {};
    result.decryptedData = "";
    result.statusFlags = 0;
    result.exitCode = -1;
    result.extStatusFlags = 0;
    result.userId = "";
    result.keyId = "";

    let sig_arr = options.mimeSignatureData.split("").map(e => e.charCodeAt());
    var sig_array = ctypes.uint8_t.array()(sig_arr);

    let input_sig = new RNPLib.rnp_input_t();
    RNPLib.rnp_input_from_memory(
      input_sig.address(),
      sig_array,
      sig_array.length,
      false
    );

    let input_from_memory = new RNPLib.rnp_input_t();

    let arr = data.split("").map(e => e.charCodeAt());
    var data_array = ctypes.uint8_t.array()(arr);

    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      data_array,
      data_array.length,
      false
    );

    let verify_op = new RNPLib.rnp_op_verify_t();
    if (
      RNPLib.rnp_op_verify_detached_create(
        verify_op.address(),
        RNPLib.ffi,
        input_from_memory,
        input_sig
      )
    ) {
      throw new Error("rnp_op_verify_detached_create failed");
    }

    result.exitCode = RNPLib.rnp_op_verify_execute(verify_op);

    let haveSignature = await this.getVerifyDetails(
      RNPLib.ffi,
      options.fromAddr,
      verify_op,
      result
    );
    if (!haveSignature) {
      if (!result.exitCode) {
        /* Don't allow a good exit code. Keep existing bad code. */
        result.exitCode = -1;
      }
      result.statusFlags |= EnigmailConstants.BAD_SIGNATURE;
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_input_destroy(input_sig);
    RNPLib.rnp_op_verify_destroy(verify_op);

    return result;
  },

  async genKey(userId, keyType, keyBits, expiryDays, passphrase) {
    let newKeyId = "";
    let newKeyFingerprint = "";

    let primaryKeyType;
    let primaryKeyBits = 0;
    let subKeyType;
    let subKeyBits = 0;
    let primaryKeyCurve = null;
    let subKeyCurve = null;
    let expireSeconds = 0;

    if (keyType == "RSA") {
      primaryKeyType = subKeyType = "rsa";
      primaryKeyBits = subKeyBits = keyBits;
    } else if (keyType == "ECC") {
      primaryKeyType = "eddsa";
      subKeyType = "ecdh";
      subKeyCurve = "Curve25519";
    } else {
      return null;
    }

    if (expiryDays != 0) {
      expireSeconds = expiryDays * 24 * 60 * 60;
    }

    let genOp = new RNPLib.rnp_op_generate_t();
    if (
      RNPLib.rnp_op_generate_create(genOp.address(), RNPLib.ffi, primaryKeyType)
    ) {
      throw new Error("rnp_op_generate_create primary failed");
    }

    if (RNPLib.rnp_op_generate_set_userid(genOp, userId)) {
      throw new Error("rnp_op_generate_set_userid failed");
    }

    if (passphrase != null && passphrase.length != 0) {
      if (RNPLib.rnp_op_generate_set_protection_password(genOp, passphrase)) {
        throw new Error("rnp_op_generate_set_protection_password failed");
      }
    }

    if (primaryKeyBits != 0) {
      if (RNPLib.rnp_op_generate_set_bits(genOp, primaryKeyBits)) {
        throw new Error("rnp_op_generate_set_bits primary failed");
      }
    }

    if (primaryKeyCurve != null) {
      if (RNPLib.rnp_op_generate_set_curve(genOp, primaryKeyCurve)) {
        throw new Error("rnp_op_generate_set_curve primary failed");
      }
    }

    if (expireSeconds != 0) {
      if (RNPLib.rnp_op_generate_set_expiration(genOp, expireSeconds)) {
        throw new Error("rnp_op_generate_set_expiration primary failed");
      }
    }

    if (RNPLib.rnp_op_generate_execute(genOp)) {
      throw new Error("rnp_op_generate_execute primary failed");
    }

    let primaryKey = new RNPLib.rnp_key_handle_t();
    if (RNPLib.rnp_op_generate_get_key(genOp, primaryKey.address())) {
      throw new Error("rnp_op_generate_get_key primary failed");
    }

    RNPLib.rnp_op_generate_destroy(genOp);

    newKeyFingerprint = this.getFingerprintFromHandle(primaryKey);
    newKeyId = this.getKeyIDFromHandle(primaryKey);

    if (
      RNPLib.rnp_op_generate_subkey_create(
        genOp.address(),
        RNPLib.ffi,
        primaryKey,
        subKeyType
      )
    ) {
      throw new Error("rnp_op_generate_subkey_create primary failed");
    }

    if (passphrase != null && passphrase.length != 0) {
      if (RNPLib.rnp_op_generate_set_protection_password(genOp, passphrase)) {
        throw new Error("rnp_op_generate_set_protection_password failed");
      }
    }

    if (subKeyBits != 0) {
      if (RNPLib.rnp_op_generate_set_bits(genOp, subKeyBits)) {
        throw new Error("rnp_op_generate_set_bits sub failed");
      }
    }

    if (subKeyCurve != null) {
      if (RNPLib.rnp_op_generate_set_curve(genOp, subKeyCurve)) {
        throw new Error("rnp_op_generate_set_curve sub failed");
      }
    }

    if (expireSeconds != 0) {
      if (RNPLib.rnp_op_generate_set_expiration(genOp, expireSeconds)) {
        throw new Error("rnp_op_generate_set_expiration sub failed");
      }
    }

    let unlocked = false;
    try {
      if (passphrase != null && passphrase.length != 0) {
        if (RNPLib.rnp_key_unlock(primaryKey, passphrase)) {
          throw new Error("rnp_key_unlock failed");
        }
        unlocked = true;
      }

      if (RNPLib.rnp_op_generate_execute(genOp)) {
        throw new Error("rnp_op_generate_execute sub failed");
      }
    } finally {
      if (unlocked) {
        RNPLib.rnp_key_lock(primaryKey);
      }
    }

    RNPLib.rnp_op_generate_destroy(genOp);
    RNPLib.rnp_key_handle_destroy(primaryKey);

    await PgpSqliteDb2.acceptAsPersonalKey(newKeyFingerprint);

    return newKeyId;
  },

  async saveKeyRings() {
    RNPLib.saveKeys();
  },

  importToFFI(ffi, keyBlockStr, usePublic, useSecret, permissive) {
    let input_from_memory = new RNPLib.rnp_input_t();

    if (!keyBlockStr) {
      throw new Error("no keyBlockStr parameter in importToFFI");
    }

    if (typeof keyBlockStr != "string") {
      throw new Error(
        "keyBlockStr of unepected type importToFFI: %o",
        keyBlockStr
      );
    }

    let arr = [];
    arr.length = keyBlockStr.length;
    for (let i = 0; i < keyBlockStr.length; i++) {
      arr[i] = keyBlockStr.charCodeAt(i);
    }
    var key_array = ctypes.uint8_t.array()(arr);

    if (
      RNPLib.rnp_input_from_memory(
        input_from_memory.address(),
        key_array,
        key_array.length,
        false
      )
    ) {
      throw new Error("rnp_input_from_memory failed");
    }

    let jsonInfo = new ctypes.char.ptr();

    let flags = 0;
    if (usePublic) {
      flags |= RNPLib.RNP_LOAD_SAVE_PUBLIC_KEYS;
    }
    if (useSecret) {
      flags |= RNPLib.RNP_LOAD_SAVE_SECRET_KEYS;
    }

    if (permissive) {
      flags |= RNPLib.RNP_LOAD_SAVE_PERMISSIVE;
    }

    let rv = RNPLib.rnp_import_keys(
      ffi,
      input_from_memory,
      flags,
      jsonInfo.address()
    );

    // TODO: parse jsonInfo and return a list of keys,
    // as seen in keyRing.importKeyAsync.
    // (should prevent the incorrect popup "no keys imported".)

    if (rv) {
      console.debug("rnp_import_keys failed with  rv: " + rv);
    }

    RNPLib.rnp_buffer_destroy(jsonInfo);
    RNPLib.rnp_input_destroy(input_from_memory);

    return rv;
  },

  maxImportKeyBlockSize: 5000000,

  async getKeyListFromKeyBlockImpl(
    keyBlockStr,
    pubkey = true,
    seckey = false,
    permissive = true
  ) {
    if (!keyBlockStr) {
      throw new Error(`Invalid parameter; keyblock: ${keyBlockStr}`);
    }

    if (keyBlockStr.length > RNP.maxImportKeyBlockSize) {
      throw new Error("rejecting big keyblock");
    }

    let tempFFI = new RNPLib.rnp_ffi_t();
    if (RNPLib.rnp_ffi_create(tempFFI.address(), "GPG", "GPG")) {
      throw new Error("Couldn't initialize librnp.");
    }

    let keyList = null;
    if (!this.importToFFI(tempFFI, keyBlockStr, pubkey, seckey, permissive)) {
      keyList = await this.getKeysFromFFI(tempFFI, true);
    }

    RNPLib.rnp_ffi_destroy(tempFFI);
    return keyList;
  },

  async importRevImpl(data) {
    if (!data || typeof data != "string") {
      throw new Error("invalid data parameter");
    }

    let arr = data.split("").map(e => e.charCodeAt());
    var key_array = ctypes.uint8_t.array()(arr);

    let input_from_memory = new RNPLib.rnp_input_t();
    if (
      RNPLib.rnp_input_from_memory(
        input_from_memory.address(),
        key_array,
        key_array.length,
        false
      )
    ) {
      throw new Error("rnp_input_from_memory failed");
    }

    let jsonInfo = new ctypes.char.ptr();

    let flags = 0;
    let rv = RNPLib.rnp_import_signatures(
      RNPLib.ffi,
      input_from_memory,
      flags,
      jsonInfo.address()
    );

    // TODO: parse jsonInfo

    if (rv) {
      console.debug("rnp_import_signatures failed with rv: " + rv);
    }

    RNPLib.rnp_buffer_destroy(jsonInfo);
    RNPLib.rnp_input_destroy(input_from_memory);
    await this.saveKeyRings();

    return rv;
  },

  async importKeyBlockImpl(
    win,
    passCB,
    keyBlockStr,
    pubkey,
    seckey,
    permissive = false,
    limitedFPRs = []
  ) {
    return this._importKeyBlockWithAutoAccept(
      win,
      passCB,
      keyBlockStr,
      pubkey,
      seckey,
      null,
      permissive,
      limitedFPRs
    );
  },

  async importPubkeyBlockAutoAcceptImpl(
    win,
    keyBlockStr,
    acceptance,
    permissive = false,
    limitedFPRs = []
  ) {
    return this._importKeyBlockWithAutoAccept(
      win,
      null,
      keyBlockStr,
      true,
      false,
      acceptance,
      permissive,
      limitedFPRs
    );
  },

  async _importKeyBlockWithAutoAccept(
    win,
    passCB,
    keyBlockStr,
    pubkey,
    seckey,
    acceptance,
    permissive = false,
    limitedFPRs = []
  ) {
    if (keyBlockStr.length > RNP.maxImportKeyBlockSize) {
      throw new Error("rejecting big keyblock");
    }

    let newPass = await OpenPGPMasterpass.retrieveOpenPGPPassword();
    /* Explicit comparison, because empty string might potentially
     * be allowed. */
    if (newPass == null || newPass == undefined) {
      throw new Error("unexpected null/undefined OpenPGP password");
    }

    /*
     * Import strategy:
     * - import file into a temporary space, in-memory only (ffi)
     * - if we failed to decrypt the secret keys, return null
     * - change the password of all secret keys
     * - get the key listing of all keys from the temporary space,
     *   which is want we want to return as the import report
     * - export all keys from the temporary space, and import them
     *   into our permanent space.
     */
    let userFlags = { canceled: false };

    let result = {};
    result.exitCode = -1;
    result.importedKeys = [];
    result.errorMsg = "";

    let tempFFI = new RNPLib.rnp_ffi_t();
    if (RNPLib.rnp_ffi_create(tempFFI.address(), "GPG", "GPG")) {
      throw new Error("Couldn't initialize librnp.");
    }

    // TODO: check result
    if (this.importToFFI(tempFFI, keyBlockStr, pubkey, seckey, permissive)) {
      result.errorMsg = "RNP.importToFFI failed";
      return result;
    }

    let keys = await this.getKeysFromFFI(tempFFI, true);
    let recentPass = "";

    // Prior to importing, ensure we can unprotect all keys

    for (let k of keys) {
      let fprStr = "0x" + k.fpr;
      if (limitedFPRs.length && !limitedFPRs.includes(fprStr)) {
        continue;
      }

      let impKey = await this.getKeyHandleByIdentifier(tempFFI, fprStr);
      if (impKey.isNull()) {
        throw new Error("cannot get key handle for imported key: " + k.fpr);
      }

      let unableToUnprotectId = null;

      if (k.secretAvailable) {
        while (!userFlags.canceled) {
          // After we unprotect a key, immediately re-protect it with
          // the new passphrase. If a failure occurrs at some point,
          // all keys remain protected in memory.

          let rv = 0;

          // Don't attempt to unprotect secret keys that are unavailable.
          if (RNPLib.isSecretKeyMaterialAvailable(impKey)) {
            rv = RNPLib.rnp_key_unprotect(impKey, recentPass);
            if (rv == 0) {
              if (
                RNPLib.rnp_key_protect(impKey, newPass, null, null, null, 0)
              ) {
                throw new Error("rnp_key_protect failed");
              }
            }
          }

          if (rv == 0) {
            let sub_count = new ctypes.size_t();
            if (RNPLib.rnp_key_get_subkey_count(impKey, sub_count.address())) {
              throw new Error("rnp_key_get_subkey_count failed");
            }
            for (
              let i = 0;
              i < sub_count.value && !unableToUnprotectId && !rv;
              i++
            ) {
              let sub_handle = new RNPLib.rnp_key_handle_t();
              if (
                RNPLib.rnp_key_get_subkey_at(impKey, i, sub_handle.address())
              ) {
                throw new Error("rnp_key_get_subkey_at failed");
              }

              if (RNPLib.isSecretKeyMaterialAvailable(sub_handle)) {
                rv = RNPLib.rnp_key_unprotect(sub_handle, recentPass);
                if (rv) {
                  // if (!recentPass), we haven't yet asked the user
                  // for a password, or the user hasn't yet entered the
                  // password. That's not yet a failure.
                  if (recentPass) {
                    unableToUnprotectId = RNP.getKeyIDFromHandle(sub_handle);
                  }
                } else if (
                  RNPLib.rnp_key_protect(
                    sub_handle,
                    newPass,
                    null,
                    null,
                    null,
                    0
                  )
                ) {
                  throw new Error("rnp_key_protect failed");
                }
              }

              RNPLib.rnp_key_handle_destroy(sub_handle);
            }

            if (rv == 0) {
              break;
            }
          }

          if (unableToUnprotectId) {
            break;
          }

          if (rv != RNPLib.RNP_ERROR_BAD_PASSWORD || !passCB) {
            unableToUnprotectId = k.fpr;
            break;
          }

          recentPass = passCB(
            win,
            `${k.fpr}, ${k.userId}, ${k.created}`,
            userFlags
          );
        }

        if (unableToUnprotectId) {
          result.errorMsg = "Cannot unprotect key " + unableToUnprotectId;
          console.debug(result.errorMsg);
          return result;
        }
      }

      RNPLib.rnp_key_handle_destroy(impKey);
      if (userFlags.canceled) {
        break;
      }
    }

    if (!userFlags.canceled) {
      for (let k of keys) {
        let fprStr = "0x" + k.fpr;
        if (limitedFPRs.length && !limitedFPRs.includes(fprStr)) {
          continue;
        }

        // We allow importing, if any of the following is true
        // - it contains a secret key
        // - it contains at least one user ID

        if (k.userIds.length == 0 && !k.secretAvailable) {
          continue;
          // TODO: bug 1634524 requests that we import keys without user
          //       ID, if we already have this key.
          //       It hasn't been tested yet how well this works.
          /*
          let existingKey = await this.getKeyHandleByIdentifier(RNPLib.ffi, "0x" + k.fpr);
          if (existingKey.isNull()) {
            continue;
          } else {
            RNPLib.rnp_key_handle_destroy(existingKey);
          }
          */
        }

        let impKey = await this.getKeyHandleByIdentifier(tempFFI, fprStr);

        let exportFlags =
          RNPLib.RNP_KEY_EXPORT_ARMORED | RNPLib.RNP_KEY_EXPORT_SUBKEYS;

        if (pubkey) {
          exportFlags |= RNPLib.RNP_KEY_EXPORT_PUBLIC;
        }
        if (seckey) {
          exportFlags |= RNPLib.RNP_KEY_EXPORT_SECRET;
        }

        let output_to_memory = new RNPLib.rnp_output_t();
        if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
          throw new Error("rnp_output_to_memory failed");
        }

        if (RNPLib.rnp_key_export(impKey, output_to_memory, exportFlags)) {
          throw new Error("rnp_key_export failed");
        }

        let result_buf = new ctypes.uint8_t.ptr();
        let result_len = new ctypes.size_t();
        if (
          RNPLib.rnp_output_memory_get_buf(
            output_to_memory,
            result_buf.address(),
            result_len.address(),
            false
          )
        ) {
          throw new Error("rnp_output_memory_get_buf failed");
        }

        let input_from_memory = new RNPLib.rnp_input_t();

        if (
          RNPLib.rnp_input_from_memory(
            input_from_memory.address(),
            result_buf,
            result_len,
            false
          )
        ) {
          throw new Error("rnp_input_from_memory failed");
        }

        let importFlags = 0;
        if (pubkey) {
          importFlags |= RNPLib.RNP_LOAD_SAVE_PUBLIC_KEYS;
        }
        if (seckey) {
          importFlags |= RNPLib.RNP_LOAD_SAVE_SECRET_KEYS;
        }
        if (permissive) {
          importFlags |= RNPLib.RNP_LOAD_SAVE_PERMISSIVE;
        }

        if (
          RNPLib.rnp_import_keys(
            RNPLib.ffi,
            input_from_memory,
            importFlags,
            null
          )
        ) {
          throw new Error("rnp_import_keys failed");
        }

        let impKey2 = await this.getKeyHandleByIdentifier(
          RNPLib.ffi,
          "0x" + k.fpr
        );
        if (k.secretAvailable) {
          RNPLib.protectKeyWithSubKeys(impKey2, newPass);
        }
        RNPLib.rnp_key_handle_destroy(impKey2);

        result.importedKeys.push("0x" + k.id);

        RNPLib.rnp_input_destroy(input_from_memory);
        RNPLib.rnp_output_destroy(output_to_memory);
        RNPLib.rnp_key_handle_destroy(impKey);

        // For acceptance "undecided", we don't store it, because that's
        // the default if no value is stored.
        let actionableAcceptances = ["rejected", "unverified", "verified"];

        if (
          pubkey &&
          !k.secretAvailable &&
          actionableAcceptances.includes(acceptance)
        ) {
          // For each imported public key and associated email address,
          // update the acceptance to unverified, but only if it's only
          // currently undecided. In other words, we keep the acceptance
          // if it's rejected or verified.

          let currentAcceptance = {};
          await PgpSqliteDb2.getFingerprintAcceptance(
            null,
            k.fpr,
            currentAcceptance
          );

          if (
            !("fingerprintAcceptance" in currentAcceptance) ||
            !currentAcceptance.fingerprintAcceptance ||
            currentAcceptance.fingerprintAcceptance == "undecided"
          ) {
            // Currently undecided, allowed to change.
            let allEmails = [];

            for (let uid of k.userIds) {
              if (uid.type != "uid") {
                continue;
              }

              let uidEmail = EnigmailFuncs.getEmailFromUserID(uid.userId);
              if (uidEmail) {
                allEmails.push(uidEmail);
              }
            }
            await PgpSqliteDb2.updateAcceptance(k.fpr, allEmails, acceptance);
          }
        }
      }

      result.exitCode = 0;
      await this.saveKeyRings();
    }

    RNPLib.rnp_ffi_destroy(tempFFI);
    return result;
  },

  async deleteKey(keyFingerprint, deleteSecret) {
    let handle = new RNPLib.rnp_key_handle_t();
    if (
      RNPLib.rnp_locate_key(
        RNPLib.ffi,
        "fingerprint",
        keyFingerprint,
        handle.address()
      )
    ) {
      throw new Error("rnp_locate_key failed");
    }

    let flags = RNPLib.RNP_KEY_REMOVE_PUBLIC | RNPLib.RNP_KEY_REMOVE_SUBKEYS;
    if (deleteSecret) {
      flags |= RNPLib.RNP_KEY_REMOVE_SECRET;
    }

    if (RNPLib.rnp_key_remove(handle, flags)) {
      throw new Error("rnp_key_remove failed");
    }

    RNPLib.rnp_key_handle_destroy(handle);
    await this.saveKeyRings();
  },

  async revokeKey(keyFingerprint) {
    let handle = new RNPLib.rnp_key_handle_t();
    if (
      RNPLib.rnp_locate_key(
        RNPLib.ffi,
        "fingerprint",
        keyFingerprint,
        handle.address()
      )
    ) {
      throw new Error("rnp_locate_key failed");
    }

    let flags = 0;

    if (RNPLib.rnp_key_revoke(handle, flags, null, null, null)) {
      throw new Error("rnp_key_revoke failed");
    }

    RNPLib.rnp_key_handle_destroy(handle);
    await this.saveKeyRings();
  },

  getKeyHandleByKeyIdOrFingerprint(ffi, id) {
    if (!id.startsWith("0x")) {
      throw new Error("unexpected identifier " + id);
    } else {
      // remove 0x
      id = id.substring(2);
    }

    let type = null;
    if (id.length == 16) {
      type = "keyid";
    } else if (id.length == 40 || id.length == 32) {
      type = "fingerprint";
    } else {
      throw new Error("key/fingerprint identifier of unexpected length: " + id);
    }

    let key = new RNPLib.rnp_key_handle_t();
    if (RNPLib.rnp_locate_key(ffi, type, id, key.address())) {
      throw new Error("rnp_locate_key failed, " + type + ", " + id);
    }

    if (!key.isNull() && this.isBadKey(key)) {
      RNPLib.rnp_key_handle_destroy(key);
      key = new RNPLib.rnp_key_handle_t();
    }

    return key;
  },

  async getKeyHandleByIdentifier(ffi, id) {
    let key = null;

    if (id.startsWith("<")) {
      //throw new Error("search by email address not yet implemented: " + id);
      if (!id.endsWith(">")) {
        throw new Error(
          "if search identifier starts with < then it must end with > : " + id
        );
      }
      key = await this.findKeyByEmail(id);
    } else {
      key = this.getKeyHandleByKeyIdOrFingerprint(ffi, id);
    }
    return key;
  },

  isKeyUsableFor(key, usage) {
    let allowed = new ctypes.bool();
    if (RNPLib.rnp_key_allows_usage(key, usage, allowed.address())) {
      throw new Error("rnp_key_allows_usage failed");
    }
    return allowed.value;
  },

  getSuitableSubkey(primary, usage) {
    let sub_count = new ctypes.size_t();
    if (RNPLib.rnp_key_get_subkey_count(primary, sub_count.address())) {
      throw new Error("rnp_key_get_subkey_count failed");
    }

    // For compatibility with GnuPG, when encrypting to a single subkey,
    // encrypt to the most recently created subkey. (Bug 1665281)
    let newest_created = null;
    let newest_handle = null;

    for (let i = 0; i < sub_count.value; i++) {
      let sub_handle = new RNPLib.rnp_key_handle_t();
      if (RNPLib.rnp_key_get_subkey_at(primary, i, sub_handle.address())) {
        throw new Error("rnp_key_get_subkey_at failed");
      }
      let skip = this.isBadKey(sub_handle) || this.isKeyExpired(sub_handle);
      if (!skip) {
        let key_revoked = new ctypes.bool();
        if (RNPLib.rnp_key_is_revoked(sub_handle, key_revoked.address())) {
          throw new Error("rnp_key_is_revoked failed");
        }
        if (key_revoked.value) {
          skip = true;
        }
      }
      if (!skip) {
        if (!this.isKeyUsableFor(sub_handle, usage)) {
          skip = true;
        }
      }

      if (!skip) {
        let key_creation = new ctypes.uint32_t();
        if (RNPLib.rnp_key_get_creation(sub_handle, key_creation.address())) {
          throw new Error("rnp_key_get_creation failed");
        }
        if (!newest_handle || key_creation.value > newest_created) {
          if (newest_handle) {
            RNPLib.rnp_key_handle_destroy(newest_handle);
          }
          newest_handle = sub_handle;
          sub_handle = null;
          newest_created = key_creation.value;
        }
      }

      if (sub_handle) {
        RNPLib.rnp_key_handle_destroy(sub_handle);
      }
    }

    return newest_handle;
  },

  addSuitableEncryptKey(key, op) {
    // Prefer usable subkeys, because they are always newer
    // (or same age) as primary key.

    let use_sub = this.getSuitableSubkey(key, str_encrypt);
    if (!use_sub && !this.isKeyUsableFor(key, str_encrypt)) {
      throw new Error("no suitable subkey found for " + str_encrypt);
    }

    if (
      RNPLib.rnp_op_encrypt_add_recipient(op, use_sub != null ? use_sub : key)
    ) {
      throw new Error("rnp_op_encrypt_add_recipient sender failed");
    }
    if (use_sub) {
      RNPLib.rnp_key_handle_destroy(use_sub);
    }
  },

  addAliasKeys(aliasKeys, op) {
    for (let ak of aliasKeys) {
      let key = this.getKeyHandleByKeyIdOrFingerprint(RNPLib.ffi, "0x" + ak);
      if (!key || key.isNull()) {
        console.debug(
          "addAliasKeys: cannot find key used by alias rule: " + ak
        );
        return false;
      }
      this.addSuitableEncryptKey(key, op);
      RNPLib.rnp_key_handle_destroy(key);
    }
    return true;
  },

  async addEncryptionKeyForEmail(email, op) {
    let key = await this.findKeyByEmail(email, true);
    if (!key || key.isNull()) {
      return false;
    }
    this.addSuitableEncryptKey(key, op);
    RNPLib.rnp_key_handle_destroy(key);
    return true;
  },

  getEmailWithoutBrackets(email) {
    if (email.startsWith("<") && email.endsWith(">")) {
      return email.substring(1, email.length - 1);
    }
    return email;
  },

  async encryptAndOrSign(plaintext, args, resultStatus) {
    if (args.sign && args.senderKeyIsExternal) {
      if (!GPGME.allDependenciesLoaded()) {
        throw new Error(
          "invalid configuration, request to use external GnuPG key, but GPGME isn't working"
        );
      }
      if (args.encrypt) {
        throw new Error(
          "internal error, unexpected request to sign and encrypt in a single step with external GnuPG key configuration"
        );
      }
      if (!args.sigTypeDetached || args.sigTypeClear) {
        throw new Error(
          "unexpected signing request with external GnuPG key configuration"
        );
      }
      return GPGME.signDetached(plaintext, args, resultStatus);
    }

    resultStatus.exitCode = -1;
    resultStatus.statusFlags = 0;
    resultStatus.statusMsg = "";
    resultStatus.errorMsg = "";

    let arr = plaintext.split("").map(e => e.charCodeAt());
    var plaintext_array = ctypes.uint8_t.array()(arr);

    let input = new RNPLib.rnp_input_t();
    if (
      RNPLib.rnp_input_from_memory(
        input.address(),
        plaintext_array,
        plaintext_array.length,
        false
      )
    ) {
      throw new Error("rnp_input_from_memory failed");
    }

    let output = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output.address(), 0);

    let op;
    if (args.encrypt) {
      op = new RNPLib.rnp_op_encrypt_t();
      if (
        RNPLib.rnp_op_encrypt_create(op.address(), RNPLib.ffi, input, output)
      ) {
        throw new Error("rnp_op_encrypt_create failed");
      }
    } else if (args.sign) {
      op = new RNPLib.rnp_op_sign_t();
      if (args.sigTypeClear) {
        if (
          RNPLib.rnp_op_sign_cleartext_create(
            op.address(),
            RNPLib.ffi,
            input,
            output
          )
        ) {
          throw new Error("rnp_op_sign_cleartext_create failed");
        }
      } else if (args.sigTypeDetached) {
        if (
          RNPLib.rnp_op_sign_detached_create(
            op.address(),
            RNPLib.ffi,
            input,
            output
          )
        ) {
          throw new Error("rnp_op_sign_detached_create failed");
        }
      } else {
        throw new Error(
          "not yet implemented scenario: signing, neither clear nor encrypt, without encryption"
        );
      }
    } else {
      throw new Error("invalid parameters, neither encrypt nor sign");
    }

    let senderKey = null;
    if (args.sign || args.encryptToSender) {
      senderKey = await this.getKeyHandleByIdentifier(RNPLib.ffi, args.sender);
      if (!senderKey || senderKey.isNull()) {
        return null;
      }
      // Manually configured external key overrides the check for
      // a valid personal key.
      if (!args.senderKeyIsExternal) {
        let isPersonal = false;
        let senderKeySecretAvailable = this.getSecretAvailableFromHandle(
          senderKey
        );
        if (senderKeySecretAvailable) {
          let senderFpr = this.getFingerprintFromHandle(senderKey);
          isPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(senderFpr);
        }
        if (!isPersonal) {
          throw new Error(
            "configured sender key " +
              args.sender +
              " isn't accepted as a personal key"
          );
        }
      }

      if (args.encryptToSender) {
        this.addSuitableEncryptKey(senderKey, op);
      }
      if (args.sign) {
        // Prefer usable subkeys, because they are always newer
        // (or same age) as primary key.

        let use_sub = this.getSuitableSubkey(senderKey, str_sign);
        if (!use_sub && !this.isKeyUsableFor(senderKey, str_sign)) {
          throw new Error("no suitable subkey found for " + str_sign);
        }

        if (args.encrypt) {
          if (
            RNPLib.rnp_op_encrypt_add_signature(
              op,
              use_sub != null ? use_sub : senderKey,
              null
            )
          ) {
            throw new Error("rnp_op_encrypt_add_signature failed");
          }
        } else if (
          RNPLib.rnp_op_sign_add_signature(
            op,
            use_sub ? use_sub : senderKey,
            null
          )
        ) {
          throw new Error("rnp_op_sign_add_signature failed");
        }
        if (use_sub) {
          RNPLib.rnp_key_handle_destroy(use_sub);
        }
      }
      RNPLib.rnp_key_handle_destroy(senderKey);
    }

    if (args.encrypt) {
      // If we have an alias definition, it will be used, and the usual
      // lookup by email address will be skipped. Earlier code should
      // have already checked that alias keys are available and usable
      // for encryption, so we fail if a problem is found.

      for (let rcpList of [args.to, args.bcc]) {
        for (let rcpEmail of rcpList) {
          rcpEmail = rcpEmail.toLowerCase();
          let aliasKeys = args.aliasKeys.get(
            this.getEmailWithoutBrackets(rcpEmail)
          );
          if (aliasKeys) {
            if (!this.addAliasKeys(aliasKeys, op)) {
              resultStatus.statusFlags |= EnigmailConstants.INVALID_RECIPIENT;
              return null;
            }
          } else if (!(await this.addEncryptionKeyForEmail(rcpEmail, op))) {
            resultStatus.statusFlags |= EnigmailConstants.INVALID_RECIPIENT;
            return null;
          }
        }
      }

      if (AppConstants.MOZ_UPDATE_CHANNEL != "release") {
        let debugKey = Services.prefs.getStringPref(
          "mail.openpgp.debug.extra_encryption_key"
        );
        if (debugKey) {
          let handle = this.getKeyHandleByKeyIdOrFingerprint(
            RNPLib.ffi,
            debugKey
          );
          if (!handle.isNull()) {
            console.debug("encrypting to debug key " + debugKey);
            this.addSuitableEncryptKey(handle, op);
            RNPLib.rnp_key_handle_destroy(handle);
          }
        }
      }

      // TODO decide if our compatibility requirements allow us to
      // use AEAD
      if (RNPLib.rnp_op_encrypt_set_cipher(op, "AES256")) {
        throw new Error("rnp_op_encrypt_set_cipher failed");
      }

      // TODO, map args.signatureHash string to RNP and call
      //       rnp_op_encrypt_set_hash
      if (RNPLib.rnp_op_encrypt_set_hash(op, "SHA256")) {
        throw new Error("rnp_op_encrypt_set_hash failed");
      }

      if (RNPLib.rnp_op_encrypt_set_armor(op, args.armor)) {
        throw new Error("rnp_op_encrypt_set_armor failed");
      }

      let rv = RNPLib.rnp_op_encrypt_execute(op);
      if (rv) {
        throw new Error("rnp_op_encrypt_execute failed: " + rv);
      }
      RNPLib.rnp_op_encrypt_destroy(op);
    } else {
      RNPLib.rnp_op_sign_set_hash(op, "SHA256");
      // TODO, map args.signatureHash string to RNP and call
      //       rnp_op_encrypt_set_hash

      RNPLib.rnp_op_sign_set_armor(op, args.armor);

      RNPLib.rnp_op_sign_execute(op);
      RNPLib.rnp_op_sign_destroy(op);
    }

    RNPLib.rnp_input_destroy(input);

    let result = null;

    let result_buf = new ctypes.uint8_t.ptr();
    let result_len = new ctypes.size_t();
    if (
      !RNPLib.rnp_output_memory_get_buf(
        output,
        result_buf.address(),
        result_len.address(),
        false
      )
    ) {
      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(output);

    resultStatus.exitCode = 0;

    if (args.encrypt) {
      resultStatus.statusFlags |= EnigmailConstants.END_ENCRYPTION;
    }

    if (args.sign) {
      resultStatus.statusFlags |= EnigmailConstants.SIG_CREATED;
    }

    return result;
  },

  /**
   * @param {number} expiryTime - Time to check, in seconds from the epoch.
   * @return {Boolean} - true if the given time is after now.
   */
  isExpiredTime(expiryTime) {
    if (!expiryTime) {
      return false;
    }
    let nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds > expiryTime;
  },

  isKeyExpired(handle) {
    let expiration = new ctypes.uint32_t();
    if (RNPLib.rnp_key_get_expiration(handle, expiration.address())) {
      throw new Error("rnp_key_get_expiration failed");
    }
    if (!expiration.value) {
      return false;
    }
    let creation = new ctypes.uint32_t();
    if (RNPLib.rnp_key_get_creation(handle, creation.address())) {
      throw new Error("rnp_key_get_creation failed");
    }
    let expirationSeconds = creation.value + expiration.value;
    return this.isExpiredTime(expirationSeconds);
  },

  async findKeyByEmail(id, onlyIfAcceptableAsRecipientKey = false) {
    if (!id.startsWith("<") || !id.endsWith(">") || id.includes(" ")) {
      throw new Error(`Invalid argument; id=${id}`);
    }

    let emailWithoutBrackets = id.substring(1, id.length - 1);

    let iter = new RNPLib.rnp_identifier_iterator_t();
    let grip = new ctypes.char.ptr();

    if (
      RNPLib.rnp_identifier_iterator_create(RNPLib.ffi, iter.address(), "grip")
    ) {
      throw new Error("rnp_identifier_iterator_create failed");
    }

    let foundHandle = null;
    let tentativeUnverifiedHandle = null;

    while (
      !foundHandle &&
      !RNPLib.rnp_identifier_iterator_next(iter, grip.address())
    ) {
      if (grip.isNull()) {
        break;
      }

      let have_handle = false;
      let handle = new RNPLib.rnp_key_handle_t();

      try {
        let is_subkey = new ctypes.bool();
        let uid_count = new ctypes.size_t();

        if (RNPLib.rnp_locate_key(RNPLib.ffi, "grip", grip, handle.address())) {
          throw new Error("rnp_locate_key failed");
        }
        have_handle = true;
        if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
          throw new Error("rnp_key_is_sub failed");
        }
        if (is_subkey.value) {
          continue;
        }
        if (this.isBadKey(handle)) {
          continue;
        }
        let key_revoked = new ctypes.bool();
        if (RNPLib.rnp_key_is_revoked(handle, key_revoked.address())) {
          throw new Error("rnp_key_is_revoked failed");
        }

        if (key_revoked.value) {
          continue;
        }

        if (this.isKeyExpired(handle)) {
          continue;
        }

        if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
          throw new Error("rnp_key_get_uid_count failed");
        }

        let foundUid = false;
        for (let i = 0; i < uid_count.value && !foundUid; i++) {
          let uid_handle = new RNPLib.rnp_uid_handle_t();

          if (
            RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())
          ) {
            throw new Error("rnp_key_get_uid_handle_at failed");
          }

          if (!this.isBadUid(uid_handle) && !this.isRevokedUid(uid_handle)) {
            let uid_str = new ctypes.char.ptr();
            if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
              throw new Error("rnp_key_get_uid_at failed");
            }

            let userId = uid_str.readStringReplaceMalformed();
            RNPLib.rnp_buffer_destroy(uid_str);

            if (
              EnigmailFuncs.getEmailFromUserID(userId).toLowerCase() ==
              emailWithoutBrackets
            ) {
              foundUid = true;

              if (onlyIfAcceptableAsRecipientKey) {
                // a key is acceptable, either:
                // - without secret key, it's accepted verified or unverified
                // - with secret key, must be marked as personal

                let have_secret = new ctypes.bool();
                if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
                  throw new Error("rnp_key_have_secret failed");
                }

                let fingerprint = new ctypes.char.ptr();
                if (RNPLib.rnp_key_get_fprint(handle, fingerprint.address())) {
                  throw new Error("rnp_key_get_fprint failed");
                }
                let fpr = fingerprint.readString();
                RNPLib.rnp_buffer_destroy(fingerprint);

                if (have_secret.value) {
                  let isAccepted = await PgpSqliteDb2.isAcceptedAsPersonalKey(
                    fpr
                  );
                  if (isAccepted) {
                    foundHandle = handle;
                    have_handle = false;
                    if (tentativeUnverifiedHandle) {
                      RNPLib.rnp_key_handle_destroy(tentativeUnverifiedHandle);
                      tentativeUnverifiedHandle = null;
                    }
                  }
                } else {
                  let acceptanceResult = {};
                  try {
                    await PgpSqliteDb2.getAcceptance(
                      fpr,
                      emailWithoutBrackets,
                      acceptanceResult
                    );
                  } catch (ex) {
                    console.debug("getAcceptance failed: " + ex);
                  }

                  if (!acceptanceResult.emailDecided) {
                    continue;
                  }
                  if (acceptanceResult.fingerprintAcceptance == "unverified") {
                    /* keep searching for a better, verified key */
                    if (!tentativeUnverifiedHandle) {
                      tentativeUnverifiedHandle = handle;
                      have_handle = false;
                    }
                  } else if (
                    acceptanceResult.fingerprintAcceptance == "verified"
                  ) {
                    foundHandle = handle;
                    have_handle = false;
                    if (tentativeUnverifiedHandle) {
                      RNPLib.rnp_key_handle_destroy(tentativeUnverifiedHandle);
                      tentativeUnverifiedHandle = null;
                    }
                  }
                }
              } else {
                foundHandle = handle;
                have_handle = false;
              }
            }
          }
          RNPLib.rnp_uid_handle_destroy(uid_handle);
        }
      } catch (ex) {
        console.log(ex);
      } finally {
        if (have_handle) {
          RNPLib.rnp_key_handle_destroy(handle);
        }
      }
    }

    if (!foundHandle && tentativeUnverifiedHandle) {
      foundHandle = tentativeUnverifiedHandle;
      tentativeUnverifiedHandle = null;
    }

    RNPLib.rnp_identifier_iterator_destroy(iter);
    return foundHandle;
  },

  async getPublicKey(id) {
    let result = "";
    let key = await this.getKeyHandleByIdentifier(RNPLib.ffi, id);

    if (key.isNull()) {
      return result;
    }

    let flags =
      RNPLib.RNP_KEY_EXPORT_ARMORED |
      RNPLib.RNP_KEY_EXPORT_PUBLIC |
      RNPLib.RNP_KEY_EXPORT_SUBKEYS;

    let output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), 0);

    if (RNPLib.rnp_key_export(key, output_to_memory, flags)) {
      throw new Error("rnp_key_export failed");
    }

    let result_buf = new ctypes.uint8_t.ptr();
    let result_len = new ctypes.size_t();
    let exitCode = RNPLib.rnp_output_memory_get_buf(
      output_to_memory,
      result_buf.address(),
      result_len.address(),
      false
    );

    if (!exitCode) {
      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(output_to_memory);
    RNPLib.rnp_key_handle_destroy(key);
    return result;
  },

  async getMultiplePublicKeys(idArray) {
    let out_final = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(out_final.address(), 0);

    let out_binary = new RNPLib.rnp_output_t();
    let rv;
    if (
      (rv = RNPLib.rnp_output_to_armor(
        out_final,
        out_binary.address(),
        "public key"
      ))
    ) {
      throw new Error("rnp_output_to_armor failed:" + rv);
    }

    if ((rv = RNPLib.rnp_output_armor_set_line_length(out_binary, 64))) {
      throw new Error("rnp_output_armor_set_line_length failed:" + rv);
    }

    let flags = RNPLib.RNP_KEY_EXPORT_PUBLIC | RNPLib.RNP_KEY_EXPORT_SUBKEYS;

    for (let id of idArray) {
      let key = await this.getKeyHandleByIdentifier(RNPLib.ffi, id);
      if (key.isNull()) {
        continue;
      }

      if (RNPLib.rnp_key_export(key, out_binary, flags)) {
        throw new Error("rnp_key_export failed");
      }

      RNPLib.rnp_key_handle_destroy(key);
    }

    if ((rv = RNPLib.rnp_output_finish(out_binary))) {
      throw new Error("rnp_output_finish failed: " + rv);
    }

    let result_buf = new ctypes.uint8_t.ptr();
    let result_len = new ctypes.size_t();
    let exitCode = RNPLib.rnp_output_memory_get_buf(
      out_final,
      result_buf.address(),
      result_len.address(),
      false
    );

    let result = "";
    if (!exitCode) {
      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;
      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(out_binary);
    RNPLib.rnp_output_destroy(out_final);

    return result;
  },

  async backupSecretKeys(fprs, backupPassword) {
    if (!fprs.length) {
      throw new Error("invalid fprs parameter");
    }

    /*
     * Strategy:
     * - copy keys to a temporary space, in-memory only (ffi)
     * - if we failed to decrypt the secret keys, return null
     * - change the password of all secret keys in the temporary space
     * - export from the temporary space
     */

    let out_final = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(out_final.address(), 0);

    let out_binary = new RNPLib.rnp_output_t();
    let rv;
    if (
      (rv = RNPLib.rnp_output_to_armor(
        out_final,
        out_binary.address(),
        "secret key"
      ))
    ) {
      throw new Error("rnp_output_to_armor failed:" + rv);
    }

    let tempFFI = new RNPLib.rnp_ffi_t();
    if (RNPLib.rnp_ffi_create(tempFFI.address(), "GPG", "GPG")) {
      throw new Error("Couldn't initialize librnp.");
    }

    let internalPassword = await OpenPGPMasterpass.retrieveOpenPGPPassword();

    let exportFlags =
      RNPLib.RNP_KEY_EXPORT_SUBKEYS | RNPLib.RNP_KEY_EXPORT_SECRET;
    let importFlags =
      RNPLib.RNP_LOAD_SAVE_PUBLIC_KEYS | RNPLib.RNP_LOAD_SAVE_SECRET_KEYS;

    for (let fpr of fprs) {
      let fprStr = fpr;
      let expKey = await this.getKeyHandleByIdentifier(RNPLib.ffi, fprStr);

      let output_to_memory = new RNPLib.rnp_output_t();
      if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
        throw new Error("rnp_output_to_memory failed");
      }

      if (RNPLib.rnp_key_unlock(expKey, internalPassword)) {
        throw new Error("rnp_key_unlock failed");
      }

      try {
        if (RNPLib.rnp_key_export(expKey, output_to_memory, exportFlags)) {
          throw new Error("rnp_key_export failed");
        }
      } finally {
        RNPLib.rnp_key_lock(expKey);
      }

      let result_buf = new ctypes.uint8_t.ptr();
      let result_len = new ctypes.size_t();
      if (
        RNPLib.rnp_output_memory_get_buf(
          output_to_memory,
          result_buf.address(),
          result_len.address(),
          false
        )
      ) {
        throw new Error("rnp_output_memory_get_buf failed");
      }

      let input_from_memory = new RNPLib.rnp_input_t();

      if (
        RNPLib.rnp_input_from_memory(
          input_from_memory.address(),
          result_buf,
          result_len,
          false
        )
      ) {
        throw new Error("rnp_input_from_memory failed");
      }

      if (
        RNPLib.rnp_import_keys(tempFFI, input_from_memory, importFlags, null)
      ) {
        throw new Error("rnp_import_keys failed");
      }

      let tempKey = await this.getKeyHandleByIdentifier(tempFFI, fprStr);

      if (RNPLib.rnp_key_unlock(tempKey, internalPassword)) {
        throw new Error("rnp_key_unlock failed");
      }

      try {
        if (
          RNPLib.rnp_key_protect(tempKey, backupPassword, null, null, null, 0)
        ) {
          throw new Error("rnp_key_protect failed");
        }
      } finally {
        RNPLib.rnp_key_lock(tempKey);
      }

      let sub_count = new ctypes.size_t();
      if (RNPLib.rnp_key_get_subkey_count(tempKey, sub_count.address())) {
        throw new Error("rnp_key_get_subkey_count failed");
      }
      for (let i = 0; i < sub_count.value; i++) {
        let sub_handle = new RNPLib.rnp_key_handle_t();
        if (RNPLib.rnp_key_get_subkey_at(tempKey, i, sub_handle.address())) {
          throw new Error("rnp_key_get_subkey_at failed");
        }

        if (RNPLib.rnp_key_unlock(sub_handle, internalPassword)) {
          throw new Error("rnp_key_unlock failed");
        }

        try {
          if (
            RNPLib.rnp_key_protect(
              sub_handle,
              backupPassword,
              null,
              null,
              null,
              0
            )
          ) {
            throw new Error("rnp_key_protect failed");
          }
        } finally {
          RNPLib.rnp_key_lock(sub_handle);
          RNPLib.rnp_key_handle_destroy(sub_handle);
        }
      }

      if (RNPLib.rnp_key_export(tempKey, out_binary, exportFlags)) {
        throw new Error("rnp_key_export failed");
      }
      RNPLib.rnp_key_handle_destroy(tempKey);

      RNPLib.rnp_input_destroy(input_from_memory);
      RNPLib.rnp_output_destroy(output_to_memory);
      RNPLib.rnp_key_handle_destroy(expKey);
    }
    RNPLib.rnp_ffi_destroy(tempFFI);

    if ((rv = RNPLib.rnp_output_finish(out_binary))) {
      throw new Error("rnp_output_finish failed: " + rv);
    }

    let result_buf = new ctypes.uint8_t.ptr();
    let result_len = new ctypes.size_t();
    let exitCode = RNPLib.rnp_output_memory_get_buf(
      out_final,
      result_buf.address(),
      result_len.address(),
      false
    );

    let result = "";
    if (!exitCode) {
      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;
      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(out_binary);
    RNPLib.rnp_output_destroy(out_final);

    return result;
  },

  async getNewRevocation(id) {
    let result = "";
    let key = await this.getKeyHandleByIdentifier(RNPLib.ffi, id);

    if (key.isNull()) {
      return result;
    }

    let out_final = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(out_final.address(), 0);

    let out_binary = new RNPLib.rnp_output_t();
    let rv;
    if (
      (rv = RNPLib.rnp_output_to_armor(
        out_final,
        out_binary.address(),
        "public key"
      ))
    ) {
      throw new Error("rnp_output_to_armor failed:" + rv);
    }

    if (
      (rv = RNPLib.rnp_key_export_revocation(
        key,
        out_binary,
        0,
        null,
        null,
        null
      ))
    ) {
      throw new Error("rnp_key_export_revocation failed: " + rv);
    }

    if ((rv = RNPLib.rnp_output_finish(out_binary))) {
      throw new Error("rnp_output_finish failed: " + rv);
    }

    let result_buf = new ctypes.uint8_t.ptr();
    let result_len = new ctypes.size_t();
    let exitCode = RNPLib.rnp_output_memory_get_buf(
      out_final,
      result_buf.address(),
      result_len.address(),
      false
    );

    if (!exitCode) {
      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;
      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(out_binary);
    RNPLib.rnp_output_destroy(out_final);
    RNPLib.rnp_key_handle_destroy(key);
    return result;
  },

  enArmor(buf, len) {
    let result = "";

    var input_array = ctypes.cast(buf, ctypes.uint8_t.array(len));

    let input_from_memory = new RNPLib.rnp_input_t();
    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      input_array,
      len,
      false
    );

    let max_out = len * 2 + 150; // extra bytes for head/tail/hash lines

    let output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

    if (RNPLib.rnp_enarmor(input_from_memory, output_to_memory, "message")) {
      throw new Error("rnp_enarmor failed");
    }

    let result_buf = new ctypes.uint8_t.ptr();
    let result_len = new ctypes.size_t();
    if (
      !RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      )
    ) {
      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);

    return result;
  },

  // Will change the expiration date of all given keys to newExpiry.
  // fingerprintArray is an array, containing fingerprints, both
  // primary key fingerprints and subkey fingerprints are allowed.
  // Currently, this function assumes that for any subkey that is
  // being changeed, the respective primary key is contained in the
  // array, too. If it isn't, the function will fail, because the
  // primary key must be unlocked, before changing a subkey works.
  async changeExpirationDate(fingerprintArray, newExpiry) {
    let pass = await OpenPGPMasterpass.retrieveOpenPGPPassword();

    for (let fingerprint of fingerprintArray) {
      let handle = this.getKeyHandleByKeyIdOrFingerprint(
        RNPLib.ffi,
        "0x" + fingerprint
      );

      if (handle.isNull()) {
        return false;
      }

      let unlocked = false;
      try {
        if (RNPLib.rnp_key_unlock(handle, pass)) {
          throw new Error("rnp_key_unlock failed");
        }
        unlocked = true;

        if (RNPLib.rnp_key_set_expiration(handle, newExpiry)) {
          throw new Error("rnp_key_set_expiration failed");
        }
      } finally {
        if (unlocked) {
          RNPLib.rnp_key_lock(handle);
        }
        RNPLib.rnp_key_handle_destroy(handle);
      }
    }

    await this.saveKeyRings();
    return true;
  },

  getAutocryptKeyB64(primaryKeyId, subKeyId, uidString) {
    let primHandle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      primaryKeyId
    );
    let subHandle = this.getKeyHandleByKeyIdOrFingerprint(RNPLib.ffi, subKeyId);

    let output_to_memory = new RNPLib.rnp_output_t();
    if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
      throw new Error("rnp_output_to_memory failed");
    }

    let result = "";

    if (!primHandle.isNull() && !subHandle.isNull()) {
      if (
        RNPLib.rnp_key_export_autocrypt(
          primHandle,
          subHandle,
          uidString,
          output_to_memory,
          0
        )
      ) {
        console.debug("rnp_key_export_autocrypt failed");
      } else {
        let result_buf = new ctypes.uint8_t.ptr();
        let result_len = new ctypes.size_t();
        let rv = RNPLib.rnp_output_memory_get_buf(
          output_to_memory,
          result_buf.address(),
          result_len.address(),
          false
        );

        if (!rv) {
          // result_len is of type UInt64, I don't know of a better way
          // to convert it to an integer.
          let b_len = parseInt(result_len.value.toString());

          // type casting the pointer type to an array type allows us to
          // access the elements by index.
          let uint8_array = ctypes.cast(
            result_buf,
            ctypes.uint8_t.array(result_len.value).ptr
          ).contents;

          let str = "";
          for (let i = 0; i < b_len; i++) {
            str += String.fromCharCode(uint8_array[i]);
          }

          result = btoa(str);
        }
      }
    }

    RNPLib.rnp_output_destroy(output_to_memory);

    if (!primHandle.isNull()) {
      RNPLib.rnp_key_handle_destroy(primHandle);
    }
    if (!subHandle.isNull()) {
      RNPLib.rnp_key_handle_destroy(subHandle);
    }
    return result;
  },
};
