/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  GPGME: "chrome://openpgp/content/modules/GPGME.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
  OpenPGPMasterpass: "chrome://openpgp/content/modules/masterpass.sys.mjs",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.sys.mjs",
  RNPLibLoader: "chrome://openpgp/content/modules/RNPLib.sys.mjs",
  ctypes: "resource://gre/modules/ctypes.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});

var l10n = new Localization(["messenger/openpgp/openpgp.ftl"]);

const str_encrypt = "encrypt";
const str_sign = "sign";
const str_certify = "certify";
const str_authenticate = "authenticate";
const RNP_PHOTO_USERID_ID = "(photo)"; // string is hardcoded inside RNP

var RNPLib;

/**
 * Opens a prompt, asking the user to enter passphrase for given key id.

 * @param {?nsIWindow} win - Parent window, may be null
 * @param {string} promptString - This message will be shown to the user
 * @param {object} resultFlags - Attribute .canceled is set to true
 *   if the user clicked cancel, other it's set to false.
 * @returns {string} - The passphrase the user entered
 */
function passphrasePromptCallback(win, promptString, resultFlags) {
  const password = { value: "" };
  if (!Services.prompt.promptPassword(win, "", promptString, password)) {
    resultFlags.canceled = true;
    return "";
  }

  resultFlags.canceled = false;
  return password.value;
}

/**
 * Helper class to track resources related to a private/secret key,
 * holding the key handle obtained from RNP, and offering services
 * related to that key and its handle, including releasing the handle
 * when done. Tracking a null handle is allowed.
 */
export class RnpPrivateKeyUnlockTracker {
  #rnpKeyHandle = null;
  #wasUnlocked = false;
  #allowPromptingUserForPassword = false;
  #allowAutoUnlockWithCachedPasswords = false;
  #passwordCache = null;
  #fingerprint = "";
  #passphraseCallback = null;
  #rememberUnlockPasswordForUnprotect = false;
  #unlockPassword = null;
  #isLocked = true;

  /**
   * Initialize this object as a tracker for the private key identified
   * by the given fingerprint. The fingerprint will be looked up in an
   * RNP space (FFI) and the resulting handle will be tracked. The
   * default FFI is used for performing the lookup, unless a specific
   * FFI is given. If no key can be found, the object is initialized
   * with a null handle. If a handle was found, the handle and any
   * additional resources can be freed by calling the object's release()
   * method.
   *
   * @param {string} fingerprint - the fingerprint of a key to look up.
   * @param {rnp_ffi_t} ffi - An optional specific FFI.
   * @returns {RnpPrivateKeyUnlockTracker} - a new instance, which was
   *   either initialized with a found key handle, or with null-
   */
  static constructFromFingerprint(fingerprint, ffi = RNPLib.ffi) {
    if (fingerprint.startsWith("0x")) {
      throw new Error("fingerprint must not start with 0x");
    }

    const handle = RNP.getKeyHandleByKeyIdOrFingerprint(
      ffi,
      `0x${fingerprint}`
    );

    return new RnpPrivateKeyUnlockTracker(handle);
  }

  /**
   * Construct this object as a tracker for the private key referenced
   * by the given handle. The object may also be initialized
   * with null, if no key was found. A valid handle and any additional
   * resources can be freed by calling the object's release() method.
   *
   * @param {?rnp_key_handle_t} handle - the handle of a RNP key, or null
   */
  constructor(handle) {
    if (this.#rnpKeyHandle) {
      throw new Error("Instance already initialized");
    }
    if (!handle) {
      return;
    }
    this.#rnpKeyHandle = handle;

    if (!this.available()) {
      // Not a private key. We tolerate this use to enable automatic
      // handle releasing, for code that sometimes needs to track a
      // secret key, and sometimes only a public key.
      // The only functionality that is allowed on such a key is to
      // call the .available() and the .release() methods.
      this.#isLocked = false;
    } else {
      const is_locked = new lazy.ctypes.bool();
      if (RNPLib.rnp_key_is_locked(this.#rnpKeyHandle, is_locked.address())) {
        throw new Error("rnp_key_is_locked failed");
      }
      this.#isLocked = is_locked.value;
    }

    if (!this.#fingerprint) {
      const fingerprint = new lazy.ctypes.char.ptr();
      if (
        RNPLib.rnp_key_get_fprint(this.#rnpKeyHandle, fingerprint.address())
      ) {
        throw new Error("rnp_key_get_fprint failed");
      }
      this.#fingerprint = fingerprint.readString();
      RNPLib.rnp_buffer_destroy(fingerprint);
    }
  }

  /**
   * @param {Function} cb - Override the callback function that this
   *   object will call to obtain the passphrase to unlock the private
   *   key for tracked key handle, if the object needs to unlock
   *   the key and prompting the user is allowed.
   *   If no alternative callback is set, the global
   *   passphrasePromptCallback function will be used.
   */
  setPassphraseCallback(cb) {
    this.#passphraseCallback = cb;
  }

  /**
   * Allow or forbid prompting the user for a passphrase.
   *
   * @param {boolean} isAllowed - True if allowed, false if forbidden
   */
  setAllowPromptingUserForPassword(isAllowed) {
    this.#allowPromptingUserForPassword = isAllowed;
  }

  /**
   * Allow or forbid automatically using passphrases from a configured
   * cache of passphrase, if it's necessary to obtain a passphrase
   * for unlocking.
   *
   * @param {boolean} isAllowed - True if allowed, false if forbidden
   */
  setAllowAutoUnlockWithCachedPasswords(isAllowed) {
    this.#allowAutoUnlockWithCachedPasswords = isAllowed;
  }

  /**
   * Allow or forbid this object to remember the passphrase that was
   * successfully used to to unlock it. This is necessary when intending
   * to subsequently call the unprotect() function to remove the key's
   * passphrase protection. Care should be taken that a tracker object
   * with a remembered passphrase is held in memory only for a short
   * amount of time, and should be released as soon as a task has
   * completed.
   *
   * @param {boolean} isAllowed - True if allowed, false if forbidden
   */
  setRememberUnlockPassword(isAllowed) {
    this.#rememberUnlockPasswordForUnprotect = isAllowed;
  }

  /**
   * Registers a reference to shared object that implements an optional
   * password cache. Will be used to look up passwords if
   * #allowAutoUnlockWithCachedPasswords is set to true. Will be used
   * to store additional passwords that are found to unlock a key.
   */
  setPasswordCache(cacheObj) {
    this.#passwordCache = cacheObj;
  }

  /**
   * Completely remove the encryption layer that protects the private
   * key. Requires that setRememberUnlockPassword(true) was already
   * called on this object, prior to unlocking the key, because this
   * code requires that the unlock/unprotect passphrase has been cached
   * in this object already, and that the tracked key has already been
   * unlocked.
   */
  unprotect() {
    if (!this.#rnpKeyHandle) {
      return;
    }

    const is_protected = new lazy.ctypes.bool();
    if (
      RNPLib.rnp_key_is_protected(this.#rnpKeyHandle, is_protected.address())
    ) {
      throw new Error("rnp_key_is_protected failed");
    }
    if (!is_protected.value) {
      return;
    }

    if (!this.#wasUnlocked || !this.#rememberUnlockPasswordForUnprotect) {
      // This precondition ensures we have the correct password cached.
      throw new Error("Key should have been unlocked already.");
    }

    if (RNPLib.rnp_key_unprotect(this.#rnpKeyHandle, this.#unlockPassword)) {
      throw new Error(`Failed to unprotect private key ${this.#fingerprint}`);
    }
  }

  /**
   * Attempt to unlock the tracked key with the given passphrase,
   * can also be used with the empty string, which will unlock the key
   * if no passphrase is set.
   *
   * @param {string} pass - try to unlock the key using this passphrase
   */
  unlockWithPassword(pass) {
    if (!this.#rnpKeyHandle || !this.#isLocked) {
      return;
    }
    this.#wasUnlocked = false;

    if (!RNPLib.rnp_key_unlock(this.#rnpKeyHandle, pass)) {
      this.#isLocked = false;
      this.#wasUnlocked = true;
      if (this.#rememberUnlockPasswordForUnprotect) {
        this.#unlockPassword = pass;
      }
    }
  }

  /**
   * Attempt to unlock the tracked key, using the allowed unlock
   * mechanisms that have been configured/allowed for this tracker,
   * which must been configured as desired prior to calling this function.
   * Attempts will potentially be made to unlock using the automatic
   * passphrase, or using password available in the password cache,
   * or by prompting the user for a password, repeatedly prompting
   * until the user enters the correct password or cancels.
   * When prompting the user for a passphrase, and the key is a subkey,
   * it might be necessary to lookup the primary key. A RNP FFI handle
   * is necessary for that potential lookup.
   * Unless a ffi parameter is provided, the default ffi is used.
   *
   * @param {rnp_ffi_t} ffi - An optional specific FFI.
   */
  async unlock(ffi = RNPLib.ffi) {
    if (!this.#rnpKeyHandle || !this.#isLocked) {
      return;
    }
    this.#wasUnlocked = false;
    const autoPassword = await lazy.OpenPGPMasterpass.retrieveOpenPGPPassword();

    if (!RNPLib.rnp_key_unlock(this.#rnpKeyHandle, autoPassword)) {
      this.#isLocked = false;
      this.#wasUnlocked = true;
      if (this.#rememberUnlockPasswordForUnprotect) {
        this.#unlockPassword = autoPassword;
      }
      return;
    }

    if (this.#allowAutoUnlockWithCachedPasswords && this.#passwordCache) {
      for (const pw of this.#passwordCache.passwords) {
        if (!RNPLib.rnp_key_unlock(this.#rnpKeyHandle, pw)) {
          this.#isLocked = false;
          this.#wasUnlocked = true;
          if (this.#rememberUnlockPasswordForUnprotect) {
            this.#unlockPassword = pw;
          }
          return;
        }
      }
    }

    if (!this.#allowPromptingUserForPassword) {
      return;
    }

    const promptString = await RNP.getPassphrasePrompt(this.#rnpKeyHandle, ffi);
    while (true) {
      const userFlags = { canceled: false };
      let pass;
      if (this.#passphraseCallback) {
        pass = this.#passphraseCallback(null, promptString, userFlags);
      } else {
        pass = passphrasePromptCallback(null, promptString, userFlags);
      }
      if (userFlags.canceled) {
        return;
      }

      if (!RNPLib.rnp_key_unlock(this.#rnpKeyHandle, pass)) {
        this.#isLocked = false;
        this.#wasUnlocked = true;
        if (this.#rememberUnlockPasswordForUnprotect) {
          this.#unlockPassword = pass;
        }

        if (this.#passwordCache) {
          this.#passwordCache.passwords.push(pass);
        }
        return;
      }
    }
  }

  /**
   * Check that this tracker has a reference to a private key.
   *
   * @returns {boolean} - true if the tracked key is a secret/private
   */
  isSecret() {
    return (
      this.#rnpKeyHandle &&
      RNPLib.getSecretAvailableFromHandle(this.#rnpKeyHandle)
    );
  }

  /**
   * Check that this tracker has a reference to a valid private key.
   * The check will fail e.g. for offline secret keys, where a
   * primary key is marked as being a secret key, but not having
   * the raw key data available. (In that scenario, the raw key data
   * for subkeys is usually available.)
   *
   * @returns {boolean} - true if the tracked key is a secret/private
   *   key with its key material available.
   */
  available() {
    return (
      this.#rnpKeyHandle &&
      RNPLib.getSecretAvailableFromHandle(this.#rnpKeyHandle) &&
      RNPLib.isSecretKeyMaterialAvailable(this.#rnpKeyHandle)
    );
  }

  /**
   * Obtain the raw RNP key handle managed by this tracker.
   * The returned handle may be temporarily used by the caller,
   * but the caller must not destroy the handle. The returned handle
   * will become invalid as soon as the release() function is called
   * on this tracker object.
   *
   * @returns {rnp_key_handle_t} - the handle of the tracked private key
   *   or null, if no key is tracked by this tracker.
   */
  getHandle() {
    return this.#rnpKeyHandle;
  }

  /**
   * @returns {string} - key fingerprint of the tracked key, or the
   *   empty string.
   */
  getFingerprint() {
    return this.#fingerprint;
  }

  /**
   * @returns {boolean} - true if the tracked key is currently unlocked.
   */
  isUnlocked() {
    return !this.#isLocked;
  }

  /**
   * @returns {string} - the password that was previously used to
   *   unlock the secret key, if a call to setRememberUnlockPassword
   *   allowed remembering it.
   *   May return null if the password isn't available.
   */
  getUnlockPassword() {
    if (!this.#rnpKeyHandle) {
      return null;
    }

    return this.#unlockPassword;
  }

  /**
   * Protect the key with the automatic passphrase mechanism, that is,
   * using the classic mechanism that uses an automatically generated
   * passphrase, which is either unprotected, or protected by the
   * primary password.
   * Requires that the key is unlocked already.
   */
  async setAutoPassphrase() {
    if (!this.#rnpKeyHandle) {
      return;
    }

    const autoPassword = await lazy.OpenPGPMasterpass.retrieveOpenPGPPassword();
    if (
      RNPLib.rnp_key_protect(
        this.#rnpKeyHandle,
        autoPassword,
        null,
        null,
        null,
        0
      )
    ) {
      throw new Error(`rnp_key_protect failed for ${this.#fingerprint}`);
    }
  }

  /**
   * Protect the key with the given passphrase.
   * Requires that the key is unlocked already.
   *
   * @param {string} pass - protect the key with this passphrase
   */
  setPassphrase(pass) {
    if (!this.#rnpKeyHandle) {
      return;
    }

    if (RNPLib.rnp_key_protect(this.#rnpKeyHandle, pass, null, null, null, 0)) {
      throw new Error(`rnp_key_protect failed for ${this.#fingerprint}`);
    }
  }

  /**
   * If this tracker object has unlocked the secret key, switch it to
   * backed to the locked state.
   */
  lockIfUnlocked() {
    if (!this.#rnpKeyHandle) {
      return;
    }

    if (!this.#isLocked && this.#wasUnlocked) {
      RNPLib.rnp_key_lock(this.#rnpKeyHandle);
      this.#isLocked = true;
      this.#wasUnlocked = false;
    }
  }

  /**
   * Drop the reference to the underlying key handle and other sensitive
   * data, without destroying the key handle. This can be used if other
   * code will handle the cleanup.
   */
  forget() {
    this.#rnpKeyHandle = null;
    this.#unlockPassword = null;
  }

  /**
   * Release all data managed by this tracker, if necessary locking the
   * tracked private key, forgetting the remembered unlock password,
   * and destroying the handle.
   * Note that data passed on to a password cache isn't released.
   */
  release() {
    if (!this.#rnpKeyHandle) {
      return;
    }

    this.lockIfUnlocked();
    RNPLib.rnp_key_handle_destroy(this.#rnpKeyHandle);
    this.forget();
  }
}

// The revocation strings are not localized, because the revocation certificate
// will be published to others who may not know the native language of the user.
const revocationFilePrefix1 =
  "This is a revocation certificate for the OpenPGP key:";
const revocationFilePrefix2 = `
A revocation certificate is kind of a "kill switch" to publicly
declare that a key shall no longer be used.  It is not possible
to retract such a revocation certificate once it has been published.

Use it to revoke this key in case of a secret key compromise, or loss of
the secret key, or loss of passphrase of the secret key.

To avoid an accidental use of this file, a colon has been inserted
before the 5 dashes below.  Remove this colon with a text editor
before importing and publishing this revocation certificate.

:`;

/**
 * Object to hold result status of decryption/verification.
 */
export class DecryptVerifyResult {
  /** @type {string} */
  decryptedData = "";
  /** @type {integer} */
  exitCode = -1;
  /** @type {integer} */
  statusFlags = 0;
  /** @type {integer} */
  extStatusFlags = 0;
  /** @type {string} */
  userId = "";
  /** @type {string} */
  keyId = "";
  /** @type {object} */
  sigDetails = { sigDate: null };
  /** @type {object} */
  encToDetails = { myRecipKey: {}, allRecipKeys: [] };
}

export var RNP = {
  hasRan: false,
  libLoaded: false,
  async once() {
    this.hasRan = true;
    try {
      RNPLib = lazy.RNPLibLoader.init();
      if (!RNPLib || !RNPLib.loaded) {
        return;
      }
      if (await RNPLib.init()) {
        //this.initUiOps();
        RNP.libLoaded = true;
        this.warnAboutProblematicKeys();
      }
      await lazy.OpenPGPMasterpass.ensurePasswordIsCached();
    } catch (e) {
      lazy.log.warn("Loading RNP FAILED!", e);
    }
  },

  /**
   * Warn the user about existing secret keys with unsupported feature
   * flags, which were imported in the past, when we weren't yet able
   * to strip those flags. We haven't yet implemented a way to
   * automatically fix them, because fixing them requires
   * unlocking, and we shouldn't introduce code that prompts
   * the user to unlock keys unexpectedly.
   */
  warnAboutProblematicKeys() {
    const iter = new RNPLib.rnp_identifier_iterator_t();
    const grip = new lazy.ctypes.char.ptr();

    if (
      RNPLib.rnp_identifier_iterator_create(RNPLib.ffi, iter.address(), "grip")
    ) {
      throw new Error("rnp_identifier_iterator_create failed");
    }

    while (
      !RNPLib.rnp_identifier_iterator_next(iter, grip.address()) &&
      !grip.isNull()
    ) {
      const handle = new RNPLib.rnp_key_handle_t();
      if (RNPLib.rnp_locate_key(RNPLib.ffi, "grip", grip, handle.address())) {
        throw new Error("rnp_locate_key failed");
      }

      if (this.getSecretAvailableFromHandle(handle)) {
        const is_subkey = new lazy.ctypes.bool();
        if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
          throw new Error("rnp_key_is_sub failed");
        }
        if (!is_subkey.value) {
          if (this.keyHasUnsupportedFeatures(handle)) {
            const fp = this.getFingerprintFromHandle(handle);
            lazy.log.warn(
              `OpenPGP secret key with fingerprint ${fp} advertises unsupported features.`
            );
          }
        }
      }

      RNPLib.rnp_key_handle_destroy(handle);
    }

    RNPLib.rnp_identifier_iterator_destroy(iter);
  },

  getRNPLibStatus() {
    return RNPLib.getRNPLibStatus();
  },

  async init() {
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

  /**
   * returns {integer} - the raw value of the key's creation date
   */
  getKeyCreatedValueFromHandle(handle) {
    const key_creation = new lazy.ctypes.uint32_t();
    if (RNPLib.rnp_key_get_creation(handle, key_creation.address())) {
      throw new Error("rnp_key_get_creation failed");
    }
    return key_creation.value;
  },

  addKeyAttributes(handle, meta, keyObj, is_subkey, forListing) {
    const algo = new lazy.ctypes.char.ptr();
    const bits = new lazy.ctypes.uint32_t();
    const key_expiration = new lazy.ctypes.uint32_t();
    const allowed = new lazy.ctypes.bool();

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

    keyObj.keyCreated = this.getKeyCreatedValueFromHandle(handle);
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

    const key_revoked = new lazy.ctypes.bool();
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

  /**
   * This function inspects the keys contained in the RNP space "ffi",
   * and returns objects of type KeyObj that describe the keys.
   *
   * Some consumers want a different listing of keys, and expect
   * slightly different attribute names.
   * If forListing is true, we'll set those additional attributes.
   * If onlyKeys is given: only returns keys in that array.
   *
   * @param {rnp_ffi_t} ffi - RNP library handle to key storage area
   * @param {boolean} forListing - Request additional attributes
   *   in the returned objects, for backwards compatibility.
   * @param {?string[]} onlyKeys - An array of key IDs or fingerprints.
   *   If non-null, only the given elements will be returned.
   *   If null, all elements are returned.
   * @param {boolean} onlySecret - If true, only information for
   *   available secret keys is returned.
   * @param {boolean} withPubKey - If true, an additional attribute
   *   "pubKey" will be added to each returned KeyObj, which will
   *   contain an ascii armor copy of the public key.
   * @returns {KeyObj[]} an array of KeyObj objects that describe the
   *   available keys.
   */
  async getKeysFromFFI(
    ffi,
    forListing,
    onlyKeys = null,
    onlySecret = false,
    withPubKey = false
  ) {
    if (!!onlyKeys && onlySecret) {
      throw new Error(
        "filtering by both white list and only secret keys isn't supported"
      );
    }

    const keys = [];

    if (onlyKeys) {
      for (const id of onlyKeys) {
        const handle = await this.getKeyHandleByIdentifier(ffi, id);
        if (!handle || handle.isNull()) {
          continue;
        }

        const keyObj = {};
        try {
          // Skip if it is a sub key, it will be processed together with primary key later.
          const ok = this.getKeyInfoFromHandle(
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
          lazy.log.warn(`Get key info from handle FAILED for 0x${id}`);
          continue;
        } finally {
          RNPLib.rnp_key_handle_destroy(handle);
        }

        if (keyObj) {
          if (withPubKey) {
            const pubKey = await this.getPublicKey("0x" + keyObj.id, ffi);
            if (pubKey) {
              keyObj.pubKey = pubKey;
            }
          }
          keys.push(keyObj);
        }
      }
    } else {
      const iter = new RNPLib.rnp_identifier_iterator_t();
      const grip = new lazy.ctypes.char.ptr();

      const rv = RNPLib.rnp_identifier_iterator_create(
        ffi,
        iter.address(),
        "grip"
      );
      if (rv) {
        return null;
      }

      while (!RNPLib.rnp_identifier_iterator_next(iter, grip.address())) {
        if (grip.isNull()) {
          break;
        }

        const handle = new RNPLib.rnp_key_handle_t();

        if (RNPLib.rnp_locate_key(ffi, "grip", grip, handle.address())) {
          throw new Error("rnp_locate_key failed");
        }

        const keyObj = {};
        try {
          if (RNP.isBadKey(handle, null, ffi)) {
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
          const id = RNP.getKeyIDFromHandle(handle);
          lazy.log.warn(`Get key info from handle FAILED for 0x${id}`);
          continue;
        } finally {
          RNPLib.rnp_key_handle_destroy(handle);
        }

        if (keyObj) {
          if (withPubKey) {
            const pubKey = await this.getPublicKey("0x" + keyObj.id, ffi);
            if (pubKey) {
              keyObj.pubKey = pubKey;
            }
          }
          keys.push(keyObj);
        }
      }
      RNPLib.rnp_identifier_iterator_destroy(iter);
    }
    return keys;
  },

  getFingerprintFromHandle(handle) {
    const fingerprint = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_key_get_fprint(handle, fingerprint.address())) {
      throw new Error("rnp_key_get_fprint failed");
    }
    const result = fingerprint.readString();
    RNPLib.rnp_buffer_destroy(fingerprint);
    return result;
  },

  getKeyIDFromHandle(handle) {
    const ctypes_key_id = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_key_get_keyid(handle, ctypes_key_id.address())) {
      throw new Error("rnp_key_get_keyid failed");
    }
    const result = ctypes_key_id.readString();
    RNPLib.rnp_buffer_destroy(ctypes_key_id);
    return result;
  },

  getSecretAvailableFromHandle(handle) {
    return RNPLib.getSecretAvailableFromHandle(handle);
  },

  // We already know sub_handle is a subkey
  getPrimaryKeyHandleFromSub(ffi, sub_handle) {
    const newHandle = new RNPLib.rnp_key_handle_t();
    // test my expectation is correct
    if (!newHandle.isNull()) {
      throw new Error("unexpected, new handle isn't null");
    }
    const primary_grip = new lazy.ctypes.char.ptr();
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
    const is_subkey = new lazy.ctypes.bool();
    if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
      throw new Error("rnp_key_is_sub failed");
    }
    if (!is_subkey.value) {
      const nullHandle = new RNPLib.rnp_key_handle_t();
      // test my expectation is correct
      if (!nullHandle.isNull()) {
        throw new Error("unexpected, new handle isn't null");
      }
      return nullHandle;
    }
    return this.getPrimaryKeyHandleFromSub(ffi, handle);
  },

  hasKeyWeakSelfSignature(selfId, handle) {
    const sig_count = new lazy.ctypes.size_t();
    if (RNPLib.rnp_key_get_signature_count(handle, sig_count.address())) {
      throw new Error("rnp_key_get_signature_count failed");
    }

    let hasWeak = false;
    for (let i = 0; !hasWeak && i < sig_count.value; i++) {
      const sig_handle = new RNPLib.rnp_signature_handle_t();

      if (RNPLib.rnp_key_get_signature_at(handle, i, sig_handle.address())) {
        throw new Error("rnp_key_get_signature_at failed");
      }

      hasWeak = RNP.isWeakSelfSignature(selfId, sig_handle);
      RNPLib.rnp_signature_handle_destroy(sig_handle);
    }
    return hasWeak;
  },

  getSelfSigFeatures(selfId, handle) {
    let allFeatures = 0;

    const sig_count = new lazy.ctypes.size_t();
    if (RNPLib.rnp_key_get_signature_count(handle, sig_count.address())) {
      throw new Error("rnp_key_get_signature_count failed");
    }

    for (let i = 0; i < sig_count.value; i++) {
      const sig_handle = new RNPLib.rnp_signature_handle_t();

      if (RNPLib.rnp_key_get_signature_at(handle, i, sig_handle.address())) {
        throw new Error("rnp_key_get_signature_at failed");
      }

      const sig_id_str = new lazy.ctypes.char.ptr();
      if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
        throw new Error("rnp_signature_get_keyid failed");
      }

      const sigId = sig_id_str.readString();
      RNPLib.rnp_buffer_destroy(sig_id_str);

      // Is it a self-signature?
      if (sigId == selfId) {
        const features = new lazy.ctypes.uint32_t();
        if (RNPLib.rnp_signature_get_features(sig_handle, features.address())) {
          throw new Error("rnp_signature_get_features failed");
        }

        allFeatures |= features.value;
      }

      RNPLib.rnp_signature_handle_destroy(sig_handle);
    }
    return allFeatures;
  },

  isWeakSelfSignature(selfId, sig_handle) {
    const sig_id_str = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
      throw new Error("rnp_signature_get_keyid failed");
    }

    const sigId = sig_id_str.readString();
    RNPLib.rnp_buffer_destroy(sig_id_str);

    // Is it a self-signature?
    if (sigId != selfId) {
      return false;
    }

    const creation = new lazy.ctypes.uint32_t();
    if (RNPLib.rnp_signature_get_creation(sig_handle, creation.address())) {
      throw new Error("rnp_signature_get_creation failed");
    }

    const hash_str = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_signature_get_hash_alg(sig_handle, hash_str.address())) {
      throw new Error("rnp_signature_get_hash_alg failed");
    }

    const creation64 = new lazy.ctypes.uint64_t();
    creation64.value = creation.value;

    const level = new lazy.ctypes.uint32_t();

    if (
      RNPLib.rnp_get_security_rule(
        RNPLib.ffi,
        RNPLib.RNP_FEATURE_HASH_ALG,
        hash_str,
        creation64,
        null,
        null,
        level.address()
      )
    ) {
      throw new Error("rnp_get_security_rule failed");
    }

    RNPLib.rnp_buffer_destroy(hash_str);
    return level.value < RNPLib.RNP_SECURITY_DEFAULT;
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
    keyObj.hasIgnoredAttributes = false;

    const is_subkey = new lazy.ctypes.bool();
    const sub_count = new lazy.ctypes.size_t();
    const uid_count = new lazy.ctypes.size_t();

    if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
      throw new Error("rnp_key_is_sub failed");
    }
    if (is_subkey.value) {
      if (!usePrimaryIfSubkey) {
        return false;
      }
      let rv = false;
      const newHandle = this.getPrimaryKeyHandleFromSub(ffi, handle);
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
      const have_secret = new lazy.ctypes.bool();
      if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
        throw new Error("rnp_key_have_secret failed");
      }
      if (!have_secret.value) {
        return false;
      }
    }

    const meta = {
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
        const uid_handle = new RNPLib.rnp_uid_handle_t();

        if (RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())) {
          throw new Error("rnp_key_get_uid_handle_at failed");
        }

        // Never allow revoked user IDs
        let uidOkToUse = !this.isRevokedUid(uid_handle);
        if (uidOkToUse) {
          // Usually, we don't allow user IDs reported as not valid
          uidOkToUse = !this.isBadUid(uid_handle);

          const { hasGoodSignature, hasWeakSignature } =
            this.getUidSignatureQuality(keyObj.keyId, uid_handle);

          if (hasWeakSignature) {
            keyObj.hasIgnoredAttributes = true;
          }

          if (!uidOkToUse && keyObj.keyTrust == "e") {
            // However, a user might be not valid, because it has
            // expired. If the primary key has expired, we should show
            // some user ID, even if all user IDs have expired,
            // otherwise the user cannot see any text description.
            // We allow showing user IDs with a good self-signature.
            uidOkToUse = hasGoodSignature;
          }
        }

        if (uidOkToUse) {
          const uid_str = new lazy.ctypes.char.ptr();
          if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
            throw new Error("rnp_key_get_uid_at failed");
          }
          const userIdStr = uid_str.readStringReplaceMalformed();
          RNPLib.rnp_buffer_destroy(uid_str);

          if (userIdStr !== RNP_PHOTO_USERID_ID) {
            if (!firstValidUid) {
              firstValidUid = userIdStr;
            }

            if (!keyObj.userId && this.isPrimaryUid(uid_handle)) {
              keyObj.userId = userIdStr;
            }

            const uidObj = {};
            uidObj.userId = userIdStr;
            uidObj.type = "uid";
            uidObj.keyTrust = keyObj.keyTrust;
            uidObj.uidFpr = "??fpr??";

            uidObj.features = this.getUidFeatures(keyObj.keyId, uid_handle);

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
        const sub_handle = new RNPLib.rnp_key_handle_t();
        if (RNPLib.rnp_key_get_subkey_at(handle, i, sub_handle.address())) {
          throw new Error("rnp_key_get_subkey_at failed");
        }

        if (RNP.hasKeyWeakSelfSignature(keyObj.keyId, sub_handle)) {
          keyObj.hasIgnoredAttributes = true;
        }

        if (!RNP.isBadKey(sub_handle, handle, null)) {
          const subKeyObj = {};
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

      for (const aSub of keyObj.subKeys) {
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

      if (RNP.hasKeyWeakSelfSignature(keyObj.keyId, handle)) {
        keyObj.hasIgnoredAttributes = true;
      }

      keyObj.features = this.getSelfSigFeatures(keyObj.keyId, handle);
    }

    return true;
  },

  /*
  // We don't need these functions currently, but it's helpful
  // information that I'd like to keep around as documentation.

  isUInt64WithinBounds(val) {
    // JS integers are limited to 53 bits precision.
    // Numbers smaller than 2^53 -1 are safe to use.
    // (For comparison, that's 8192 TB or 8388608 GB).
    const num53BitsMinus1 = ctypes.UInt64("0x1fffffffffffff");
    return ctypes.UInt64.compare(val, num53BitsMinus1) < 0;
  },

  isUInt64Max(val) {
    // 2^64-1, 18446744073709551615
    const max = ctypes.UInt64("0xffffffffffffffff");
    return ctypes.UInt64.compare(val, max) == 0;
  },
  */

  isBadKey(handle, knownPrimaryKey, knownContextFFI) {
    const validTill64 = new lazy.ctypes.uint64_t();
    if (RNPLib.rnp_key_valid_till64(handle, validTill64.address())) {
      throw new Error("rnp_key_valid_till64 failed");
    }

    // For the purpose of this function, we define bad as: there isn't
    // any valid self-signature on the key, and thus the key should
    // be completely avoided.
    // In this scenario, zero is returned. In other words,
    // if a non-zero value is returned, we know the key isn't completely
    // bad according to our definition.

    // ctypes.uint64_t().value is of type ctypes.UInt64

    if (
      lazy.ctypes.UInt64.compare(validTill64.value, lazy.ctypes.UInt64("0")) > 0
    ) {
      return false;
    }

    // If zero was returned, it could potentially have been revoked.
    // If it was revoked, we don't treat is as generally bad,
    // to allow importing it and to consume the revocation information.
    // If the key was not revoked, then treat it as a bad key.
    const key_revoked = new lazy.ctypes.bool();
    if (RNPLib.rnp_key_is_revoked(handle, key_revoked.address())) {
      throw new Error("rnp_key_is_revoked failed");
    }

    if (!key_revoked.value) {
      // Also check if the primary key was revoked. If the primary key
      // is revoked, the subkey is considered revoked, too.
      if (knownPrimaryKey) {
        if (RNPLib.rnp_key_is_revoked(knownPrimaryKey, key_revoked.address())) {
          throw new Error("rnp_key_is_revoked failed");
        }
      } else if (knownContextFFI) {
        const primaryHandle = this.getPrimaryKeyHandleIfSub(
          knownContextFFI,
          handle
        );
        if (!primaryHandle.isNull()) {
          if (RNPLib.rnp_key_is_revoked(primaryHandle, key_revoked.address())) {
            throw new Error("rnp_key_is_revoked failed");
          }
          RNPLib.rnp_key_handle_destroy(primaryHandle);
        }
      }
    }

    return !key_revoked.value;
  },

  isPrimaryUid(uid_handle) {
    const is_primary = new lazy.ctypes.bool();

    if (RNPLib.rnp_uid_is_primary(uid_handle, is_primary.address())) {
      throw new Error("rnp_uid_is_primary failed");
    }

    return is_primary.value;
  },

  getUidFeatures(self_key_id, uid_handle) {
    let allFeatures = 0;

    const sig_count = new lazy.ctypes.size_t();
    if (RNPLib.rnp_uid_get_signature_count(uid_handle, sig_count.address())) {
      throw new Error("rnp_uid_get_signature_count failed");
    }

    for (let i = 0; i < sig_count.value; i++) {
      const sig_handle = new RNPLib.rnp_signature_handle_t();

      if (
        RNPLib.rnp_uid_get_signature_at(uid_handle, i, sig_handle.address())
      ) {
        throw new Error("rnp_uid_get_signature_at failed");
      }

      const sig_id_str = new lazy.ctypes.char.ptr();
      if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
        throw new Error("rnp_signature_get_keyid failed");
      }

      if (sig_id_str.readString() == self_key_id) {
        const features = new lazy.ctypes.uint32_t();
        if (RNPLib.rnp_signature_get_features(sig_handle, features.address())) {
          throw new Error("rnp_signature_get_features failed");
        }

        allFeatures |= features.value;
      }

      RNPLib.rnp_buffer_destroy(sig_id_str);
      RNPLib.rnp_signature_handle_destroy(sig_handle);
    }

    return allFeatures;
  },

  getUidSignatureQuality(self_key_id, uid_handle) {
    const result = {
      hasGoodSignature: false,
      hasWeakSignature: false,
    };

    const sig_count = new lazy.ctypes.size_t();
    if (RNPLib.rnp_uid_get_signature_count(uid_handle, sig_count.address())) {
      throw new Error("rnp_uid_get_signature_count failed");
    }

    for (let i = 0; i < sig_count.value; i++) {
      const sig_handle = new RNPLib.rnp_signature_handle_t();

      if (
        RNPLib.rnp_uid_get_signature_at(uid_handle, i, sig_handle.address())
      ) {
        throw new Error("rnp_uid_get_signature_at failed");
      }

      const sig_id_str = new lazy.ctypes.char.ptr();
      if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
        throw new Error("rnp_signature_get_keyid failed");
      }

      if (sig_id_str.readString() == self_key_id) {
        if (!result.hasGoodSignature) {
          const sig_validity = RNPLib.rnp_signature_is_valid(sig_handle, 0);
          result.hasGoodSignature =
            sig_validity == RNPLib.RNP_SUCCESS ||
            sig_validity == RNPLib.RNP_ERROR_SIGNATURE_EXPIRED;
        }

        if (!result.hasWeakSignature) {
          result.hasWeakSignature = RNP.isWeakSelfSignature(
            self_key_id,
            sig_handle
          );
        }
      }

      RNPLib.rnp_buffer_destroy(sig_id_str);
      RNPLib.rnp_signature_handle_destroy(sig_handle);
    }

    return result;
  },

  isBadUid(uid_handle) {
    const is_valid = new lazy.ctypes.bool();

    if (RNPLib.rnp_uid_is_valid(uid_handle, is_valid.address())) {
      throw new Error("rnp_uid_is_valid failed");
    }

    return !is_valid.value;
  },

  isRevokedUid(uid_handle) {
    const is_revoked = new lazy.ctypes.bool();

    if (RNPLib.rnp_uid_is_revoked(uid_handle, is_revoked.address())) {
      throw new Error("rnp_uid_is_revoked failed");
    }

    return is_revoked.value;
  },

  /* unused
  getKeySignatures(keyId, ignoreUnknownUid) {
    const handle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      "0x" + keyId
    );
    if (handle.isNull()) {
      return null;
    }

    const mainKeyObj = {};
    this.getKeyInfoFromHandle(
      RNPLib.ffi,
      handle,
      mainKeyObj,
      false,
      true,
      false
    );

    const result = RNP._getSignatures(mainKeyObj, handle, ignoreUnknownUid);
    RNPLib.rnp_key_handle_destroy(handle);
    return result;
  },
  */

  getKeyObjSignatures(keyObj, ignoreUnknownUid) {
    const handle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      "0x" + keyObj.keyId
    );
    if (handle.isNull()) {
      return null;
    }

    const result = RNP._getSignatures(keyObj, handle, ignoreUnknownUid);
    RNPLib.rnp_key_handle_destroy(handle);
    return result;
  },

  _getSignatures(keyObj, handle, ignoreUnknownUid) {
    const rList = [];

    try {
      const uid_count = new lazy.ctypes.size_t();
      if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
        throw new Error("rnp_key_get_uid_count failed");
      }
      let outputIndex = 0;
      for (let i = 0; i < uid_count.value; i++) {
        const uid_handle = new RNPLib.rnp_uid_handle_t();

        if (RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())) {
          throw new Error("rnp_key_get_uid_handle_at failed");
        }

        if (!this.isBadUid(uid_handle) && !this.isRevokedUid(uid_handle)) {
          const uid_str = new lazy.ctypes.char.ptr();
          if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
            throw new Error("rnp_key_get_uid_at failed");
          }
          const userIdStr = uid_str.readStringReplaceMalformed();
          RNPLib.rnp_buffer_destroy(uid_str);

          if (userIdStr !== RNP_PHOTO_USERID_ID) {
            const id = outputIndex;
            ++outputIndex;

            let subList = {};

            subList = {};
            subList.keyCreated = keyObj.keyCreated;
            subList.created = keyObj.created;
            subList.fpr = keyObj.fpr;
            subList.keyId = keyObj.keyId;

            subList.userId = userIdStr;
            subList.sigList = [];

            const sig_count = new lazy.ctypes.size_t();
            if (
              RNPLib.rnp_uid_get_signature_count(
                uid_handle,
                sig_count.address()
              )
            ) {
              throw new Error("rnp_uid_get_signature_count failed");
            }
            for (let j = 0; j < sig_count.value; j++) {
              const sigObj = {};

              const sig_handle = new RNPLib.rnp_signature_handle_t();
              if (
                RNPLib.rnp_uid_get_signature_at(
                  uid_handle,
                  j,
                  sig_handle.address()
                )
              ) {
                throw new Error("rnp_uid_get_signature_at failed");
              }

              const creation = new lazy.ctypes.uint32_t();
              if (
                RNPLib.rnp_signature_get_creation(
                  sig_handle,
                  creation.address()
                )
              ) {
                throw new Error("rnp_signature_get_creation failed");
              }
              sigObj.keyCreated = creation.value;
              sigObj.created = new Services.intl.DateTimeFormat().format(
                new Date(sigObj.keyCreated * 1000)
              );
              sigObj.sigType = "?";

              const sig_id_str = new lazy.ctypes.char.ptr();
              if (
                RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())
              ) {
                throw new Error("rnp_signature_get_keyid failed");
              }

              const sigIdStr = sig_id_str.readString();
              sigObj.signerKeyId = sigIdStr;
              RNPLib.rnp_buffer_destroy(sig_id_str);

              const signerHandle = new RNPLib.rnp_key_handle_t();

              if (
                RNPLib.rnp_signature_get_signer(
                  sig_handle,
                  signerHandle.address()
                )
              ) {
                throw new Error("rnp_signature_get_signer failed");
              }

              if (
                signerHandle.isNull() ||
                this.isBadKey(signerHandle, null, RNPLib.ffi)
              ) {
                if (!ignoreUnknownUid) {
                  sigObj.userId = "?";
                  sigObj.sigKnown = false;
                  subList.sigList.push(sigObj);
                }
              } else {
                const signer_uid_str = new lazy.ctypes.char.ptr();
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
      lazy.log.warn(`Getting signatures for 0x{keyObj.keyId} FAILED!`, ex);
    }
    return rList;
  },

  policyForbidsAlg() {
    // TODO: implement policy
    // Currently, all algorithms are allowed
    return false;
  },

  getKeyIdsFromRecipHandle(recip_handle, resultRecipAndPrimary) {
    resultRecipAndPrimary.keyId = "";
    resultRecipAndPrimary.primaryKeyId = "";

    const c_key_id = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_recipient_get_keyid(recip_handle, c_key_id.address())) {
      throw new Error("rnp_recipient_get_keyid failed");
    }
    const recip_key_id = c_key_id.readString();
    resultRecipAndPrimary.keyId = recip_key_id;
    RNPLib.rnp_buffer_destroy(c_key_id);

    const recip_key_handle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      "0x" + recip_key_id
    );
    if (!recip_key_handle.isNull()) {
      const primary_signer_handle = this.getPrimaryKeyHandleIfSub(
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

  /**
   * Decrypts/Decodes an OpenPGP message, verify signatures, and
   * return associated meta data.
   *
   * @param {string} encrypted_string - A string of bytes containing
   *   the encrypted message.
   * @param {object} options - Various pieces of information that are
   *   necessary for correctly processing the encrypted message.
   * @param {boolean} alreadyDecrypted - Usually callers should set this
   *   flag to false, to request both decryption and full decoding of
   *   all available meta data. Value True is intended to allow
   *   recursive calling of this function. Value True means, a previous
   *   action has already processed the outer encryption layer, only,
   *   (include querying of encryption strength and the list keys that
   *   are known to be able to decrypt the message), but processing of
   *   the inner payload has not yet been done, such as decompression
   *   and verification of the inner signature.
   *   If the value is set to True, then meta data related to
   *   the encryption layer is read from the "options" parameter and
   *   copied over to the result object.
   * @returns {DecryptVerifyResult} - Various flags that contain the decrypted
   *    data and related meta data.
   */
  async decrypt(encrypted_string, options, alreadyDecrypted = false) {
    const arr = encrypted_string.split("").map(e => e.charCodeAt());
    const encrypted_array = lazy.ctypes.uint8_t.array()(arr);
    return this.decryptArray(encrypted_array, options, alreadyDecrypted);
  },

  /**
   * Decrypts/Decodes an OpenPGP message, verify signatures, and
   * return associated meta data.
   *
   * @param {string} encrypted_array - An array of bytes that contains
   *   the encrypted message.
   * @param {object} options - See description of the same parameter
   *   of function decrypt().
   * @param {boolean} alreadyDecrypted - See description of the same
   *   parameter of function decrypt().
   * @returns {DecryptVerifyResult}
   */
  async decryptArray(encrypted_array, options, alreadyDecrypted = false) {
    const result = new DecryptVerifyResult();

    if (alreadyDecrypted) {
      result.encToDetails = options.encToDetails;
    }

    // Allow compressed encrypted messages, max factor 1200, up to 100 MiB.
    const max_decrypted_message_size = 100 * 1024 * 1024;
    const max_out = Math.min(
      encrypted_array.length * 1200,
      max_decrypted_message_size
    );

    let collected_fingerprint = null;
    let remembered_password = null;

    function collect_key_info_password_cb(ffi, app_ctx, key) {
      const fingerprint = new lazy.ctypes.char.ptr();
      if (!RNPLib.rnp_key_get_fprint(key, fingerprint.address())) {
        collected_fingerprint = fingerprint.readString();
      }
      RNPLib.rnp_buffer_destroy(fingerprint);
      return false;
    }

    function use_remembered_password_cb(
      ffi,
      app_ctx,
      key,
      pgp_context,
      buf,
      buf_len
    ) {
      const passCTypes = lazy.ctypes.char.array()(remembered_password); // UTF-8

      if (buf_len < passCTypes.length) {
        return false;
      }

      const char_array = lazy.ctypes.cast(
        buf,
        lazy.ctypes.char.array(buf_len).ptr
      ).contents;

      for (let i = 0; i < passCTypes.length; i++) {
        char_array[i] = passCTypes[i];
      }
      char_array[passCTypes.length] = 0;
      return true;
    }

    let tryAgain;
    let isFirstTry = true;

    let verify_op;
    let input_from_memory;
    let output_to_memory;

    // We don't know which secret key RNP wants to use for decryption.
    // We make an initial attempt to ask RNP to decrypt, in which we set
    // "collect_key_info_password_cb" as the password callback function.
    // If RNP needs to unlock a key to decrypt, we will remember the
    // key that needs to be unlocked in "collect_key_info_password_cb",
    // but will give no password to RNP, which will cause RNP to fail
    // the decryption operation.
    // After returning from rnp_op_verify_execute (which performs the
    // decryption or decryption attempt), we'll learn whether encryption
    // worked, then we can continue immediately.
    // Or, we'll learn that RNP needs to unlock a key. In this
    // scenario, we'll interact with the user to learn the password
    // that's required to unlock the key. We'll prompt the user, and if
    // the user enters the correct password, we'll remember that
    // password temporarily, and try the decryption operation again.
    // During this second attempt to decrypt, we'll provide
    // "use_remembered_password_cb" as the password callback function.
    // When RNP attempts to decrypt and calls use_remembered_password_cb,
    // we'll pass along the password to RNP, which can then
    // unlock the key and decrypt the message.
    // We use this approach, because we cannot easily prompt the user
    // from within the password callback itself.
    // (We're starting from JavaScript code, we're calling RNP C code,
    // which then calls back into a JavaScript callback, and from there
    // we would have to execute async code, but the RNP code that
    // calls back into JavaScript isn't able to handle that. To avoid
    // having to spin a nested event loop for simulating a synchronous
    // call, we're using the approach described above.)

    do {
      tryAgain = false;

      input_from_memory = new RNPLib.rnp_input_t();
      RNPLib.rnp_input_from_memory(
        input_from_memory.address(),
        encrypted_array,
        encrypted_array.length,
        false
      );

      output_to_memory = new RNPLib.rnp_output_t();
      RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

      verify_op = new RNPLib.rnp_op_verify_t();
      RNPLib.rnp_op_verify_create(
        verify_op.address(),
        RNPLib.ffi,
        input_from_memory,
        output_to_memory
      );

      // Use a local variable for the temporary wrapper object,
      // to ensure the JS engine will keep the object alive during
      // the call to rnp_op_verify_execute.
      let callbackKeepAlive = RNPLib.rnp_password_cb_t(
        isFirstTry ? collect_key_info_password_cb : use_remembered_password_cb,
        this, // this value used while executing callback
        false // callback return value if exception is thrown
      );

      RNPLib.rnp_ffi_set_pass_provider(RNPLib.ffi, callbackKeepAlive, null);
      result.exitCode = RNPLib.rnp_op_verify_execute(verify_op);

      // This call resets the callback reference kept by RNP, which
      // means we can clean up callbackKeepAlive and allow the
      // referenced object to be cleaned up.
      RNPLib.setDefaultPasswordCB();
      callbackKeepAlive = null;

      if (isFirstTry && result.exitCode != 0 && collected_fingerprint) {
        const key_handle = this.getKeyHandleByKeyIdOrFingerprint(
          RNPLib.ffi,
          "0x" + collected_fingerprint
        );
        if (
          !key_handle.isNull() &&
          RNPLib.getSecretAvailableFromHandle(key_handle) &&
          RNPLib.isSecretKeyMaterialAvailable(key_handle)
        ) {
          const decryptKey = new RnpPrivateKeyUnlockTracker(key_handle);
          if (decryptKey.available()) {
            decryptKey.setAllowPromptingUserForPassword(true);
            decryptKey.setRememberUnlockPassword(true);
            await decryptKey.unlock();
          }

          if (decryptKey.isUnlocked()) {
            tryAgain = true;
            remembered_password = decryptKey.getUnlockPassword();

            RNPLib.rnp_input_destroy(input_from_memory);
            input_from_memory = null;
            RNPLib.rnp_output_destroy(output_to_memory);
            output_to_memory = null;
            RNPLib.rnp_op_verify_destroy(verify_op);
            verify_op = null;
          }

          // We don't create the tracker in all scenarios,
          // so we'll release key_handle manually.
          decryptKey.lockIfUnlocked();
          decryptKey.forget();
        }
        RNPLib.rnp_key_handle_destroy(key_handle);
      }

      isFirstTry = false;
    } while (tryAgain);

    let rnpCannotDecrypt = false;
    let queryAllEncryptionRecipients = false;
    let stillUndecidedIfSignatureIsBad = false;

    let useDecodedData;
    let processSignature;
    switch (result.exitCode) {
      case RNPLib.RNP_SUCCESS:
        useDecodedData = true;
        processSignature = true;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_INVALID:
        // Either the signing key is unavailable, or the signature is
        // indeed bad. Must check signature status below.
        stillUndecidedIfSignatureIsBad = true;
        useDecodedData = true;
        processSignature = true;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_EXPIRED:
        useDecodedData = true;
        processSignature = false;
        result.statusFlags |= lazy.EnigmailConstants.EXPIRED_SIGNATURE;
        break;
      case RNPLib.RNP_ERROR_DECRYPT_FAILED:
        rnpCannotDecrypt = true;
        useDecodedData = false;
        processSignature = false;
        queryAllEncryptionRecipients = true;
        result.statusFlags |= lazy.EnigmailConstants.DECRYPTION_FAILED;
        break;
      case RNPLib.RNP_ERROR_NO_SUITABLE_KEY:
        rnpCannotDecrypt = true;
        useDecodedData = false;
        processSignature = false;
        queryAllEncryptionRecipients = true;
        result.statusFlags |=
          lazy.EnigmailConstants.DECRYPTION_FAILED |
          lazy.EnigmailConstants.NO_SECKEY;
        break;
      case RNPLib.RNP_ERROR_BAD_FORMAT:
        queryAllEncryptionRecipients = true;
        if (Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg")) {
          // Same handling as RNP_ERROR_DECRYPT_FAILED, to allow
          // handling of some corrupt messages, see bug 1898832.
          rnpCannotDecrypt = true;
          useDecodedData = false;
          processSignature = false;
          result.statusFlags |= lazy.EnigmailConstants.DECRYPTION_FAILED;
          break;
        }
      // else: fall through to default processing
      default:
        useDecodedData = false;
        processSignature = false;
        lazy.log.warn(
          "rnp_op_verify_execute returned unexpected: " + result.exitCode
        );
        break;
    }

    if (useDecodedData && alreadyDecrypted) {
      result.statusFlags |= lazy.EnigmailConstants.DECRYPTION_OKAY;
    } else if (useDecodedData && !alreadyDecrypted) {
      const prot_mode_str = new lazy.ctypes.char.ptr();
      const prot_cipher_str = new lazy.ctypes.char.ptr();
      const prot_is_valid = new lazy.ctypes.bool();

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
      const mode = prot_mode_str.readString();
      const cipher = prot_cipher_str.readString();
      const validIntegrityProtection = prot_is_valid.value;

      lazy.log.debug(`Decryption mode=${mode}, cipher=${cipher}`);
      if (mode != "none") {
        if (!validIntegrityProtection) {
          useDecodedData = false;
          result.statusFlags |=
            lazy.EnigmailConstants.MISSING_MDC |
            lazy.EnigmailConstants.DECRYPTION_FAILED;
        } else if (cipher == "null" || this.policyForbidsAlg(cipher)) {
          // don't indicate decryption, because a non-protecting or insecure cipher was used
          result.statusFlags |= lazy.EnigmailConstants.UNKNOWN_ALGO;
        } else {
          queryAllEncryptionRecipients = true;

          const recip_handle = new RNPLib.rnp_recipient_handle_t();
          let rv = RNPLib.rnp_op_verify_get_used_recipient(
            verify_op,
            recip_handle.address()
          );
          if (rv) {
            throw new Error("rnp_op_verify_get_used_recipient failed");
          }

          const c_alg = new lazy.ctypes.char.ptr();
          rv = RNPLib.rnp_recipient_get_alg(recip_handle, c_alg.address());
          if (rv) {
            throw new Error("rnp_recipient_get_alg failed");
          }

          if (this.policyForbidsAlg(c_alg.readString())) {
            result.statusFlags |= lazy.EnigmailConstants.UNKNOWN_ALGO;
          } else {
            this.getKeyIdsFromRecipHandle(
              recip_handle,
              result.encToDetails.myRecipKey
            );
            result.statusFlags |= lazy.EnigmailConstants.DECRYPTION_OKAY;
          }
        }
      }
    }

    if (queryAllEncryptionRecipients) {
      const all_recip_count = new lazy.ctypes.size_t();
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
          const other_recip_handle = new RNPLib.rnp_recipient_handle_t();
          if (
            RNPLib.rnp_op_verify_get_recipient_at(
              verify_op,
              recip_i,
              other_recip_handle.address()
            )
          ) {
            throw new Error("rnp_op_verify_get_recipient_at failed");
          }
          const encTo = {};
          this.getKeyIdsFromRecipHandle(other_recip_handle, encTo);
          result.encToDetails.allRecipKeys.push(encTo);
        }
      }
    }

    if (useDecodedData) {
      const result_buf = new lazy.ctypes.uint8_t.ptr();
      const result_len = new lazy.ctypes.size_t();
      const rv = RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      );

      // result_len is of type UInt64, I don't know of a better way
      // to convert it to an integer.
      const b_len = parseInt(result_len.value.toString());

      if (!rv) {
        // type casting the pointer type to an array type allows us to
        // access the elements by index.
        const uint8_array = lazy.ctypes.cast(
          result_buf,
          lazy.ctypes.uint8_t.array(result_len.value).ptr
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
          options.msgDate,
          verify_op,
          result
        );

        if (
          (result.statusFlags &
            (lazy.EnigmailConstants.GOOD_SIGNATURE |
              lazy.EnigmailConstants.UNCERTAIN_SIGNATURE |
              lazy.EnigmailConstants.EXPIRED_SIGNATURE |
              lazy.EnigmailConstants.BAD_SIGNATURE)) !=
          0
        ) {
          // A decision was already made.
          stillUndecidedIfSignatureIsBad = false;
        }
      }
    }

    if (stillUndecidedIfSignatureIsBad) {
      // We didn't find more details above, so conclude it's bad.
      result.statusFlags |= lazy.EnigmailConstants.BAD_SIGNATURE;
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);
    RNPLib.rnp_op_verify_destroy(verify_op);

    if (
      rnpCannotDecrypt &&
      !alreadyDecrypted &&
      Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg") &&
      lazy.GPGME.allDependenciesLoaded()
    ) {
      // failure processing with RNP, attempt decryption with GPGME
      const r2 = await lazy.GPGME.decryptArray(
        encrypted_array,
        this.enArmorCDataMessage.bind(this)
      );
      if (r2 && !r2.exitCode && r2.decryptedData) {
        // TODO: obtain info which key ID was used for decryption
        //       and set result.decryptKey*
        //       It isn't obvious how to do that with GPGME, because
        //       gpgme_op_decrypt_result provides the list of all the
        //       encryption keys, only.

        // The result may still contain wrapping like compression,
        // and optional signature data. Recursively call ourselves
        // to perform the remaining processing.
        options.encToDetails = result.encToDetails;

        // Handle badly encoded messages, see bugs 1898832 and 1906903.
        const deArmored = this.deArmorString(r2.decryptedData);
        const isDeArmoredStillAsciiArmored = this.isASCIIArmored(deArmored);

        let retval2;
        if (isDeArmoredStillAsciiArmored) {
          retval2 = await RNP.decryptArray(deArmored, options, true);
        } else {
          retval2 = await RNP.decrypt(r2.decryptedData, options, true);
        }

        return retval2;
      }
    }

    if (!result.decryptedData) {
      const inmem = new RNPLib.rnp_input_t();
      RNPLib.rnp_input_from_memory(
        inmem.address(),
        encrypted_array,
        encrypted_array.length,
        false
      );

      const outmem = new RNPLib.rnp_output_t();
      RNPLib.rnp_output_to_memory(outmem.address(), max_out);

      let rv = RNPLib.rnp_dump_packets_to_output(inmem, outmem, 0);
      if (!rv) {
        const result_buf = new lazy.ctypes.uint8_t.ptr();
        const result_len = new lazy.ctypes.size_t();
        rv = RNPLib.rnp_output_memory_get_buf(
          outmem,
          result_buf.address(),
          result_len.address(),
          false
        );

        if (!rv) {
          // type casting the pointer type to an array type allows us to
          // access the elements by index.
          const uint8_array = lazy.ctypes.cast(
            result_buf,
            lazy.ctypes.uint8_t.array(result_len.value).ptr
          ).contents;

          result.packetDump = lazy.MailStringUtils.uint8ArrayToByteString(
            uint8_array.readTypedArray()
          );
        }
      }

      RNPLib.rnp_input_destroy(inmem);
      RNPLib.rnp_output_destroy(outmem);
    }

    return result;
  },

  async getVerifyDetails(ffi, fromAddr, msgDate, verify_op, result) {
    if (!fromAddr) {
      // We cannot correctly verify without knowing the fromAddr.
      // This scenario is reached when quoting an encrypted MIME part.
      return false;
    }

    const sig_count = new lazy.ctypes.size_t();
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

    const sig = new RNPLib.rnp_op_verify_signature_t();
    if (RNPLib.rnp_op_verify_get_signature_at(verify_op, 0, sig.address())) {
      throw new Error("rnp_op_verify_get_signature_at failed");
    }

    const sig_handle = new RNPLib.rnp_signature_handle_t();
    const sig_get_handle_status = RNPLib.rnp_op_verify_signature_get_handle(
      sig,
      sig_handle.address()
    );
    if (sig_get_handle_status) {
      result.exitCode = -1;
      result.statusFlags |= lazy.EnigmailConstants.BAD_SIGNATURE;
      lazy.log.warn(
        `Verify signature FAILED; rnp_op_verify_signature_get_handle returned ${sig_get_handle_status}`
      );
      return false;
    }

    const sig_id_str = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_signature_get_keyid(sig_handle, sig_id_str.address())) {
      throw new Error("rnp_signature_get_keyid failed");
    }
    result.keyId = sig_id_str.readString();
    RNPLib.rnp_buffer_destroy(sig_id_str);
    RNPLib.rnp_signature_handle_destroy(sig_handle);

    const sig_status = RNPLib.rnp_op_verify_signature_get_status(sig);
    if (sig_status != RNPLib.RNP_SUCCESS && !result.exitCode) {
      /* Don't allow a good exit code. Keep existing bad code. */
      result.exitCode = -1;
    }

    let query_signer = true;

    switch (sig_status) {
      case RNPLib.RNP_SUCCESS:
        result.statusFlags |= lazy.EnigmailConstants.GOOD_SIGNATURE;
        break;
      case RNPLib.RNP_ERROR_KEY_NOT_FOUND:
        result.statusFlags |=
          lazy.EnigmailConstants.UNCERTAIN_SIGNATURE |
          lazy.EnigmailConstants.NO_PUBKEY;
        query_signer = false;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_EXPIRED:
        result.statusFlags |= lazy.EnigmailConstants.EXPIRED_SIGNATURE;
        break;
      case RNPLib.RNP_ERROR_SIGNATURE_INVALID:
        result.statusFlags |= lazy.EnigmailConstants.BAD_SIGNATURE;
        break;
      default:
        result.statusFlags |= lazy.EnigmailConstants.BAD_SIGNATURE;
        query_signer = false;
        break;
    }

    if (msgDate && result.statusFlags & lazy.EnigmailConstants.GOOD_SIGNATURE) {
      const created = new lazy.ctypes.uint32_t();
      const expires = new lazy.ctypes.uint32_t(); //relative

      if (
        RNPLib.rnp_op_verify_signature_get_times(
          sig,
          created.address(),
          expires.address()
        )
      ) {
        throw new Error("rnp_op_verify_signature_get_times failed");
      }

      result.sigDetails.sigDate = new Date(created.value * 1000);

      let timeDelta;
      if (result.sigDetails.sigDate > msgDate) {
        timeDelta = result.sigDetails.sigDate - msgDate;
      } else {
        timeDelta = msgDate - result.sigDetails.sigDate;
      }

      if (timeDelta > 1000 * 60 * 60 * 1) {
        result.statusFlags &= ~lazy.EnigmailConstants.GOOD_SIGNATURE;
        result.statusFlags |= lazy.EnigmailConstants.MSG_SIG_INVALID;
        result.extStatusFlags |=
          lazy.EnigmailConstants.EXT_SIGNING_TIME_MISMATCH;
      }
    }

    const signer_key = new RNPLib.rnp_key_handle_t();
    let have_signer_key = false;
    let use_signer_key = false;

    if (query_signer) {
      if (RNPLib.rnp_op_verify_signature_get_key(sig, signer_key.address())) {
        // If sig_status isn't RNP_ERROR_KEY_NOT_FOUND then we must
        // be able to obtain the signer key.
        throw new Error("rnp_op_verify_signature_get_key");
      }

      have_signer_key = true;
      use_signer_key = !this.isBadKey(signer_key, null, RNPLib.ffi);
    }

    if (use_signer_key) {
      const keyInfo = {};
      const ok = this.getKeyInfoFromHandle(
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
      const fromLower = fromAddr ? fromAddr.toLowerCase() : "";

      for (const uid of keyInfo.userIds) {
        if (uid.type !== "uid") {
          continue;
        }

        if (
          lazy.EnigmailFuncs.getEmailFromUserID(uid.userId).toLowerCase() ===
          fromLower
        ) {
          fromMatchesAnyUid = true;
          break;
        }
      }

      let useUndecided = true;

      if (keyInfo.secretAvailable) {
        const isPersonal = await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
          keyInfo.fpr
        );
        if (isPersonal && fromMatchesAnyUid) {
          result.extStatusFlags |= lazy.EnigmailConstants.EXT_SELF_IDENTITY;
          useUndecided = false;
        } else {
          result.statusFlags |= lazy.EnigmailConstants.INVALID_RECIPIENT;
          useUndecided = true;
        }
      } else if (result.statusFlags & lazy.EnigmailConstants.GOOD_SIGNATURE) {
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
          result.statusFlags |= lazy.EnigmailConstants.INVALID_RECIPIENT;
          useUndecided = true;
        } else {
          const acceptanceResult = {};
          try {
            await lazy.PgpSqliteDb2.getAcceptance(
              keyInfo.fpr,
              fromLower,
              acceptanceResult
            );
          } catch (ex) {
            lazy.log.warn("Get acceptance FAILED!", ex);
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
              result.statusFlags &= ~lazy.EnigmailConstants.GOOD_SIGNATURE;
              result.statusFlags |=
                lazy.EnigmailConstants.BAD_SIGNATURE |
                lazy.EnigmailConstants.INVALID_RECIPIENT;
              useUndecided = false;
            } else if (acceptanceResult.fingerprintAcceptance == "verified") {
              result.statusFlags |= lazy.EnigmailConstants.TRUSTED_IDENTITY;
              useUndecided = false;
            } else if (acceptanceResult.fingerprintAcceptance == "unverified") {
              useUndecided = false;
            }
          }
        }
      }

      if (useUndecided) {
        result.statusFlags &= ~lazy.EnigmailConstants.GOOD_SIGNATURE;
        result.statusFlags |= lazy.EnigmailConstants.UNCERTAIN_SIGNATURE;
      }
    }

    if (have_signer_key) {
      RNPLib.rnp_key_handle_destroy(signer_key);
    }

    return true;
  },

  /**
   * Verify signature of data.
   *
   * @param {string} data - The (allegedly) signed data.
   * @param {string} mimeSignatureData - The signature.
   * @param {?string} fromAddr - Email address.
   * @param {?Date} msgDate - Date.
   * @returns {DecryptVerifyResult} containing verification status details.
   */
  async verifyDetached(data, mimeSignatureData, fromAddr, msgDate) {
    const result = new DecryptVerifyResult();

    const sig_arr = mimeSignatureData.split("").map(e => e.charCodeAt());
    const sig_array = lazy.ctypes.uint8_t.array()(sig_arr);

    const input_sig = new RNPLib.rnp_input_t();
    RNPLib.rnp_input_from_memory(
      input_sig.address(),
      sig_array,
      sig_array.length,
      false
    );

    const input_from_memory = new RNPLib.rnp_input_t();

    const arr = data.split("").map(e => e.charCodeAt());
    const data_array = lazy.ctypes.uint8_t.array()(arr);

    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      data_array,
      data_array.length,
      false
    );

    const verify_op = new RNPLib.rnp_op_verify_t();
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

    const haveSignature = await this.getVerifyDetails(
      RNPLib.ffi,
      fromAddr,
      msgDate,
      verify_op,
      result
    );
    if (!haveSignature) {
      if (!result.exitCode) {
        /* Don't allow a good exit code. Keep existing bad code. */
        result.exitCode = -1;
      }
      result.statusFlags |= lazy.EnigmailConstants.BAD_SIGNATURE;
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
    const primaryKeyCurve = null;
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

    const genOp = new RNPLib.rnp_op_generate_t();
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

    if (RNPLib.rnp_op_generate_set_expiration(genOp, expireSeconds)) {
      throw new Error("rnp_op_generate_set_expiration primary failed");
    }

    if (RNPLib.rnp_op_generate_execute(genOp)) {
      throw new Error("rnp_op_generate_execute primary failed");
    }

    const primaryKey = new RNPLib.rnp_key_handle_t();
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

    if (RNPLib.rnp_op_generate_set_expiration(genOp, expireSeconds)) {
      throw new Error("rnp_op_generate_set_expiration sub failed");
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

    await lazy.PgpSqliteDb2.acceptAsPersonalKey(newKeyFingerprint);

    return newKeyId;
  },

  async saveKeyRings() {
    RNPLib.saveKeys();
    Services.obs.notifyObservers(null, "openpgp-key-change");
  },

  importToFFI(ffi, keyBlockStr, usePublic, useSecret) {
    if (usePublic && useSecret) {
      throw new Error("Cannot import public and secret keys at the same time");
    }
    const permissive = !useSecret; // permissive only for public keys

    const input_from_memory = new RNPLib.rnp_input_t();

    if (!keyBlockStr) {
      throw new Error("no keyBlockStr parameter in importToFFI");
    }

    // Input might be either plain text or binary data.
    // If the input is binary, do not modify it.
    // If the input contains characters with a multi-byte char code value,
    // we know the input doesn't consist of binary 8-bit values. Rather,
    // it contains text with multi-byte characters. The only scenario
    // in which we can tolerate those are comment lines, which we can
    // filter out.

    // Remove comment lines.
    const input = keyBlockStr.includes("-----BEGIN PGP ")
      ? keyBlockStr.replace(/^Comment:.*(\r?\n|\r)/gm, "")
      : keyBlockStr;
    const arr = lazy.MailStringUtils.byteStringToUint8Array(input);
    if (arr.some(c => c > 255)) {
      // Not 8-bit data.
      throw new Error(`Multi-byte string input: ${input}`);
    }
    const key_array = lazy.ctypes.uint8_t.array()(arr);

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

    const jsonInfo = new lazy.ctypes.char.ptr();

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
    if (rv) {
      lazy.log.warn(`rnp_import_keys FAILED; rv=${rv}`);
    } else {
      const info = JSON.parse(jsonInfo.readString());
      if (!("keys" in info) || !info.keys.length) {
        lazy.log.warn("rnp_import_keys found no supported keys");
        rv = -1;
      }
    }

    // TODO: parse jsonInfo and return a list of keys,
    // as seen in keyRing.importKeyAsync.
    // (should prevent the incorrect popup "no keys imported".)

    RNPLib.rnp_buffer_destroy(jsonInfo);
    RNPLib.rnp_input_destroy(input_from_memory);

    return rv;
  },

  maxImportKeyBlockSize: 5000000,

  async getOnePubKeyFromKeyBlock(keyBlockStr, fpr) {
    if (!keyBlockStr) {
      throw new Error(`Invalid parameter; keyblock: ${keyBlockStr}`);
    }

    if (keyBlockStr.length > RNP.maxImportKeyBlockSize) {
      throw new Error("rejecting big keyblock");
    }

    const tempFFI = RNPLib.prepare_ffi();
    if (!tempFFI) {
      throw new Error("Couldn't initialize librnp.");
    }

    let pubKey;
    if (!this.importToFFI(tempFFI, keyBlockStr, true, false)) {
      pubKey = await this.getPublicKey("0x" + fpr, tempFFI);
    }

    RNPLib.rnp_ffi_destroy(tempFFI);
    return pubKey;
  },

  async getKeyListFromKeyBlockImpl(
    keyBlockStr,
    pubkey = true,
    seckey = false,
    withPubKey = false
  ) {
    if (!keyBlockStr) {
      throw new Error(`Invalid parameter; keyblock: ${keyBlockStr}`);
    }

    if (keyBlockStr.length > RNP.maxImportKeyBlockSize) {
      throw new Error("rejecting big keyblock");
    }

    const tempFFI = RNPLib.prepare_ffi();
    if (!tempFFI) {
      throw new Error("Couldn't initialize librnp.");
    }

    let keyList = null;
    if (!this.importToFFI(tempFFI, keyBlockStr, pubkey, seckey)) {
      keyList = await this.getKeysFromFFI(
        tempFFI,
        true,
        null,
        false,
        withPubKey
      );
    }

    RNPLib.rnp_ffi_destroy(tempFFI);
    return keyList;
  },

  /**
   * Take two or more ASCII armored key blocks and import them into memory,
   * and return the merged public key for the given fingerprint.
   * (Other keys included in the key blocks are ignored.)
   * The intention is to use it to combine keys obtained from different places,
   * possibly with updated/different expiration date and userIds etc. to
   * a canonical representation of them.
   *
   * @param {string} fingerprint - Key fingerprint.
   * @param {...string} keyBlocks - Key blocks.
   * @returns {string} the resulting public key of the blocks
   */
  async mergePublicKeyBlocks(fingerprint, ...keyBlocks) {
    if (keyBlocks.some(b => b.length > RNP.maxImportKeyBlockSize)) {
      throw new Error("keyBlock too big");
    }

    const tempFFI = RNPLib.prepare_ffi();
    if (!tempFFI) {
      throw new Error("Couldn't initialize librnp.");
    }

    for (const block of new Set(keyBlocks)) {
      if (this.importToFFI(tempFFI, block, true, false)) {
        throw new Error("Merging public keys failed");
      }
    }
    const pubKey = await this.getPublicKey(`0x${fingerprint}`, tempFFI);

    RNPLib.rnp_ffi_destroy(tempFFI);
    return pubKey;
  },

  async importRevImpl(data) {
    if (!data || typeof data != "string") {
      throw new Error("invalid data parameter");
    }

    const arr = data.split("").map(e => e.charCodeAt());
    var key_array = lazy.ctypes.uint8_t.array()(arr);

    const input_from_memory = new RNPLib.rnp_input_t();
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

    const jsonInfo = new lazy.ctypes.char.ptr();

    const flags = 0;
    const rv = RNPLib.rnp_import_signatures(
      RNPLib.ffi,
      input_from_memory,
      flags,
      jsonInfo.address()
    );
    if (rv) {
      lazy.log.warn(`rnp_import_signatures FAILED; rv=${rv}`);
    }

    // TODO: parse jsonInfo

    RNPLib.rnp_buffer_destroy(jsonInfo);
    RNPLib.rnp_input_destroy(input_from_memory);
    await this.saveKeyRings();

    return rv;
  },

  async importSecKeyBlockImpl(
    win,
    passCB,
    keepPassphrases,
    keyBlockStr,
    limitedFPRs = []
  ) {
    return this._importKeyBlockWithAutoAccept(
      win,
      passCB,
      keepPassphrases,
      keyBlockStr,
      false,
      true,
      null,
      limitedFPRs
    );
  },

  async importPubkeyBlockAutoAcceptImpl(
    win,
    keyBlockStr,
    acceptance,
    limitedFPRs = []
  ) {
    return this._importKeyBlockWithAutoAccept(
      win,
      null,
      false,
      keyBlockStr,
      true,
      false,
      acceptance,
      limitedFPRs
    );
  },

  /**
   * Import either a public key or a secret key.
   * Importing both at the same time isn't supported by this API.
   *
   * @param {?nsIWindow} win - Parent window, may be null
   * @param {Function} passCB - a callback function that will be called if the user needs
   *   to enter a passphrase to unlock a secret key. See passphrasePromptCallback
   *   for the function signature.
   * @param {boolean} keepPassphrases - controls which passphrase will
   *   be used to protect imported secret keys. If true, the existing
   *   passphrase will be kept. If false, (of if currently there's no
   *   passphrase set), passphrase protection will be changed to use
   *   our automatic passphrase (to allow automatic protection by
   *   primary password, whether's it's currently enabled or not).
   * @param {string} keyBlockStr - An block of OpenPGP key data. See
   *   implementation of function importToFFI for allowed contents.
   *   TODO: Write better documentation for this parameter.
   * @param {boolean} pubkey - If true, import the public keys found in
   *   keyBlockStr.
   * @param {boolean} seckey - If true, import the secret keys found in
   *   keyBlockStr.
   * @param {string} acceptance - The key acceptance level that should
   *   be assigned to imported public keys.
   *   TODO: Write better documentation for the allowed values.
   * @param {string[]} limitedFPRs - This is a filtering parameter.
   *   If the array is empty, all keys will be imported.
   *   If the array contains at least one entry, a key will be imported
   *   only if its fingerprint (of the primary key) is listed in this
   *   array.
   */
  async _importKeyBlockWithAutoAccept(
    win,
    passCB,
    keepPassphrases,
    keyBlockStr,
    pubkey,
    seckey,
    acceptance,
    limitedFPRs = []
  ) {
    if (keyBlockStr.length > RNP.maxImportKeyBlockSize) {
      throw new Error("rejecting big keyblock");
    }
    if (pubkey && seckey) {
      throw new Error("Cannot import public and secret keys at the same time");
    }
    const permissive = !seckey; // permissive only for public keys

    /*
     * Import strategy:
     * - import file into a temporary space, in-memory only (ffi)
     * - if we failed to decrypt the secret keys, return null
     * - set the password of secret keys that don't have one yet
     * - get the key listing of all keys from the temporary space,
     *   which is want we want to return as the import report
     * - export all keys from the temporary space, and import them
     *   into our permanent space.
     */
    const userFlags = { canceled: false };

    const result = {};
    result.exitCode = -1;
    result.importedKeys = [];
    result.errorMsg = "";
    result.fingerprintsWithUnsupportedFeatures = [];

    const tempFFI = RNPLib.prepare_ffi();
    if (!tempFFI) {
      throw new Error("Couldn't initialize librnp.");
    }

    // TODO: check result
    if (this.importToFFI(tempFFI, keyBlockStr, pubkey, seckey)) {
      result.errorMsg = "RNP.importToFFI failed";
      return result;
    }

    const keys = await this.getKeysFromFFI(tempFFI, true);
    const pwCache = {
      passwords: [],
    };

    // Abort if we see keys that we don't support.
    // TODO: In the future, the decision whether a key is supported
    // should be based on the result of an API call that queries the
    // version of the key. As of today, the newest version we support is
    // v4 with a fingerprint length of 40 characters. All newer
    // specifications known at the time of writing this code use longer
    // fingerprints.
    for (const k of keys) {
      if (k.fpr.length > 40) {
        RNPLib.rnp_ffi_destroy(tempFFI);
        lazy.log.warn(
          `Cannot import OpenPGP key with fingerprint ${k.fpr} because it is based on an unsupported specification.`
        );
        result.errorMsg = `Found unsupported key: ${k.fpr}`;
        return result;
      }
    }

    // Prior to importing, ensure the user is able to unlock all keys

    // If anything goes wrong during our attempt to unlock keys,
    // we don't want to keep key material remain unprotected in memory,
    // that's why we remember the trackers, including the respective
    // unlock passphrase, temporarily in memory, and we'll minimize
    // the period of time during which the key remains unprotected.
    const secretKeyTrackers = new Map();
    let unableToUnlockId = null;

    for (const k of keys) {
      const fprStr = "0x" + k.fpr;
      if (limitedFPRs.length && !limitedFPRs.includes(fprStr)) {
        continue;
      }

      let impKey = await this.getKeyHandleByIdentifier(tempFFI, fprStr);
      if (impKey.isNull()) {
        throw new Error("cannot get key handle for imported key: " + k.fpr);
      }

      if (!k.secretAvailable) {
        RNPLib.rnp_key_handle_destroy(impKey);
        impKey = null;
      } else {
        const primaryKey = new RnpPrivateKeyUnlockTracker(impKey);
        impKey = null;

        if (this.keyObjHasUnsupportedFeatures(k)) {
          lazy.log.warn(
            `OpenPGP secret key with fingerprint ${k.fpr} advertises unsupported features.`
          );
          // This function shouldn't bring up the warning.
          // Let the caller do it.
          result.fingerprintsWithUnsupportedFeatures.push(k.fpr);
        }

        // Don't attempt to unlock secret keys that are unavailable.
        if (primaryKey.available()) {
          // Is it unprotected?
          primaryKey.unlockWithPassword("");
          if (primaryKey.isUnlocked()) {
            // yes, it's unprotected (empty passphrase)
            await primaryKey.setAutoPassphrase();
          } else {
            // try to unlock with the recently entered passwords,
            // or ask the user, if allowed
            primaryKey.setPasswordCache(pwCache);
            primaryKey.setAllowAutoUnlockWithCachedPasswords(true);
            primaryKey.setAllowPromptingUserForPassword(!!passCB);
            primaryKey.setPassphraseCallback(passCB);
            primaryKey.setRememberUnlockPassword(true);
            await primaryKey.unlock(tempFFI);
            if (!primaryKey.isUnlocked()) {
              userFlags.canceled = true;
              unableToUnlockId = RNP.getKeyIDFromHandle(primaryKey.getHandle());
            } else {
              secretKeyTrackers.set(fprStr, primaryKey);
            }
          }
        }

        if (!userFlags.canceled) {
          const sub_count = new lazy.ctypes.size_t();
          if (
            RNPLib.rnp_key_get_subkey_count(
              primaryKey.getHandle(),
              sub_count.address()
            )
          ) {
            throw new Error("rnp_key_get_subkey_count failed");
          }

          for (let i = 0; i < sub_count.value && !userFlags.canceled; i++) {
            let sub_handle = new RNPLib.rnp_key_handle_t();
            if (
              RNPLib.rnp_key_get_subkey_at(
                primaryKey.getHandle(),
                i,
                sub_handle.address()
              )
            ) {
              throw new Error("rnp_key_get_subkey_at failed");
            }

            const subTracker = new RnpPrivateKeyUnlockTracker(sub_handle);
            sub_handle = null;

            if (subTracker.available()) {
              // Is it unprotected?
              subTracker.unlockWithPassword("");
              if (subTracker.isUnlocked()) {
                // yes, it's unprotected (empty passphrase)
                await subTracker.setAutoPassphrase();
              } else {
                // try to unlock with the recently entered passwords,
                // or ask the user, if allowed
                subTracker.setPasswordCache(pwCache);
                subTracker.setAllowAutoUnlockWithCachedPasswords(true);
                subTracker.setAllowPromptingUserForPassword(!!passCB);
                subTracker.setPassphraseCallback(passCB);
                subTracker.setRememberUnlockPassword(true);
                await subTracker.unlock(tempFFI);
                if (!subTracker.isUnlocked()) {
                  userFlags.canceled = true;
                  unableToUnlockId = RNP.getKeyIDFromHandle(
                    subTracker.getHandle()
                  );
                  break;
                } else {
                  secretKeyTrackers.set(
                    this.getFingerprintFromHandle(subTracker.getHandle()),
                    subTracker
                  );
                }
              }
            }
          }
        }
      }

      if (userFlags.canceled) {
        break;
      }
    }

    if (unableToUnlockId) {
      result.errorMsg = "Cannot unlock key " + unableToUnlockId;
    }

    if (!userFlags.canceled) {
      for (const k of keys) {
        const fprStr = "0x" + k.fpr;
        if (limitedFPRs.length && !limitedFPRs.includes(fprStr)) {
          continue;
        }

        // We allow importing, if any of the following is true
        // - it contains a secret key
        // - it contains at least one user ID
        // - it is an update for an existing key (possibly new validity/revocation)

        if (k.userIds.length == 0 && !k.secretAvailable) {
          const existingKey = await this.getKeyHandleByIdentifier(
            RNPLib.ffi,
            "0x" + k.fpr
          );
          if (existingKey.isNull()) {
            continue;
          }
          RNPLib.rnp_key_handle_destroy(existingKey);
        }

        let impKeyPub;
        const impKeySecTracker = secretKeyTrackers.get(fprStr);
        if (!impKeySecTracker) {
          impKeyPub = await this.getKeyHandleByIdentifier(tempFFI, fprStr);
        }

        if (!keepPassphrases) {
          // It's possible that the primary key doesn't come with a
          // secret key (only public key of primary key was imported).
          // In that scenario, we must still process subkeys that come
          // with a secret key.

          if (impKeySecTracker) {
            impKeySecTracker.unprotect();
            await impKeySecTracker.setAutoPassphrase();
          }

          const sub_count = new lazy.ctypes.size_t();
          if (
            RNPLib.rnp_key_get_subkey_count(
              impKeySecTracker ? impKeySecTracker.getHandle() : impKeyPub,
              sub_count.address()
            )
          ) {
            throw new Error("rnp_key_get_subkey_count failed");
          }

          for (let i = 0; i < sub_count.value; i++) {
            const sub_handle = new RNPLib.rnp_key_handle_t();
            if (
              RNPLib.rnp_key_get_subkey_at(
                impKeySecTracker ? impKeySecTracker.getHandle() : impKeyPub,
                i,
                sub_handle.address()
              )
            ) {
              throw new Error("rnp_key_get_subkey_at failed");
            }

            const subTracker = secretKeyTrackers.get(
              this.getFingerprintFromHandle(sub_handle)
            );
            if (!subTracker) {
              // There is no secret key material for this subkey available,
              // that's why no tracker was created, we can skip it.
              continue;
            }
            subTracker.unprotect();
            await subTracker.setAutoPassphrase();
          }
        }

        let exportFlags =
          RNPLib.RNP_KEY_EXPORT_ARMORED | RNPLib.RNP_KEY_EXPORT_SUBKEYS;

        if (pubkey) {
          exportFlags |= RNPLib.RNP_KEY_EXPORT_PUBLIC;
        }
        if (seckey) {
          exportFlags |= RNPLib.RNP_KEY_EXPORT_SECRET;
        }

        const output_to_memory = new RNPLib.rnp_output_t();
        if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
          throw new Error("rnp_output_to_memory failed");
        }

        if (
          RNPLib.rnp_key_export(
            impKeySecTracker ? impKeySecTracker.getHandle() : impKeyPub,
            output_to_memory,
            exportFlags
          )
        ) {
          throw new Error("rnp_key_export failed");
        }

        if (impKeyPub) {
          RNPLib.rnp_key_handle_destroy(impKeyPub);
          impKeyPub = null;
        }

        const result_buf = new lazy.ctypes.uint8_t.ptr();
        const result_len = new lazy.ctypes.size_t();
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

        const input_from_memory = new RNPLib.rnp_input_t();

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

        result.importedKeys.push("0x" + k.id);

        RNPLib.rnp_input_destroy(input_from_memory);
        RNPLib.rnp_output_destroy(output_to_memory);

        // For acceptance "undecided", we don't store it, because that's
        // the default if no value is stored.
        const actionableAcceptances = ["rejected", "unverified", "verified"];

        if (
          pubkey &&
          !k.secretAvailable &&
          actionableAcceptances.includes(acceptance)
        ) {
          // For each imported public key, if its current acceptance is
          // undecided, we update its acceptance for the associated email
          // addresses to the passed acceptance value.
          // We also update the acceptance for all the email addresses
          // associated to a key if both the current acceptance for that key
          // and the passed acceptance value are unverified.
          // If the acceptance is rejected or verified, we keep it is as is.

          const currentAcceptance =
            await lazy.PgpSqliteDb2.getFingerprintAcceptance(null, k.fpr);

          if (
            !currentAcceptance ||
            currentAcceptance == "undecided" ||
            (currentAcceptance == "unverified" && acceptance == "unverified")
          ) {
            // Currently undecided or unverified, allowed to update.
            const allEmails = [];

            for (const uid of k.userIds) {
              if (uid.type != "uid") {
                continue;
              }

              const uidEmail = lazy.EnigmailFuncs.getEmailFromUserID(
                uid.userId
              );
              if (uidEmail) {
                allEmails.push(uidEmail);
              }
            }
            await lazy.PgpSqliteDb2.updateAcceptance(
              k.fpr,
              allEmails,
              acceptance
            );
          }
        }
      }

      result.exitCode = 0;
      await this.saveKeyRings();
    }

    for (const valTracker of secretKeyTrackers.values()) {
      valTracker.release();
    }

    RNPLib.rnp_ffi_destroy(tempFFI);
    return result;
  },

  /**
   * Delete the given key.
   *
   * @param {string} keyFingerprint - Fingerprint.
   * @param {boolean} deleteSecret - Whether to delete secret key as well.
   */
  async deleteKey(keyFingerprint, deleteSecret) {
    const handle = new RNPLib.rnp_key_handle_t();
    if (
      RNPLib.rnp_locate_key(
        RNPLib.ffi,
        "fingerprint",
        keyFingerprint,
        handle.address()
      )
    ) {
      throw new Error(`rnp_locate_key failed for ${keyFingerprint}`);
    }

    let flags = RNPLib.RNP_KEY_REMOVE_PUBLIC | RNPLib.RNP_KEY_REMOVE_SUBKEYS;
    if (deleteSecret) {
      flags |= RNPLib.RNP_KEY_REMOVE_SECRET;
    }

    if (RNPLib.rnp_key_remove(handle, flags)) {
      throw new Error(`rnp_key_remove failed; deleteSecret=${deleteSecret}`);
    }

    RNPLib.rnp_key_handle_destroy(handle);
    await this.saveKeyRings();
  },

  /**
   * Revoke the given key.
   *
   * @param {string} keyFingerprint - Fingerprint.
   */
  async revokeKey(keyFingerprint) {
    const tracker =
      RnpPrivateKeyUnlockTracker.constructFromFingerprint(keyFingerprint);
    if (!tracker.available()) {
      return;
    }
    tracker.setAllowPromptingUserForPassword(true);
    tracker.setAllowAutoUnlockWithCachedPasswords(true);
    await tracker.unlock();
    if (!tracker.isUnlocked()) {
      return;
    }

    const flags = 0;
    const revokeResult = RNPLib.rnp_key_revoke(
      tracker.getHandle(),
      flags,
      null,
      null,
      null
    );
    tracker.release();
    if (revokeResult) {
      throw new Error(
        `rnp_key_revoke failed for fingerprint=${keyFingerprint}`
      );
    }
    await this.saveKeyRings();
  },

  _getKeyHandleByKeyIdOrFingerprint(ffi, id, findPrimary) {
    if (!id.startsWith("0x")) {
      throw new Error(`id should be 0x prefixed; got id ${id}`);
    }
    // remove 0x
    id = id.substring(2);

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

    if (!key.isNull() && findPrimary) {
      const is_subkey = new lazy.ctypes.bool();
      if (RNPLib.rnp_key_is_sub(key, is_subkey.address())) {
        throw new Error("rnp_key_is_sub failed");
      }
      if (is_subkey.value) {
        const primaryKey = this.getPrimaryKeyHandleFromSub(ffi, key);
        RNPLib.rnp_key_handle_destroy(key);
        key = primaryKey;
      }
    }

    if (!key.isNull() && this.isBadKey(key, null, ffi)) {
      RNPLib.rnp_key_handle_destroy(key);
      key = new RNPLib.rnp_key_handle_t();
    }

    return key;
  },

  getPrimaryKeyHandleByKeyIdOrFingerprint(ffi, id) {
    return this._getKeyHandleByKeyIdOrFingerprint(ffi, id, true);
  },

  getKeyHandleByKeyIdOrFingerprint(ffi, id) {
    return this._getKeyHandleByKeyIdOrFingerprint(ffi, id, false);
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
    const allowed = new lazy.ctypes.bool();
    if (RNPLib.rnp_key_allows_usage(key, usage, allowed.address())) {
      throw new Error("rnp_key_allows_usage failed");
    }
    if (!allowed.value) {
      return false;
    }

    if (usage != str_sign) {
      return true;
    }

    return (
      RNPLib.getSecretAvailableFromHandle(key) &&
      RNPLib.isSecretKeyMaterialAvailable(key)
    );
  },

  getSuitableSubkey(primary, usage) {
    const sub_count = new lazy.ctypes.size_t();
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
      let skip =
        this.isBadKey(sub_handle, primary, null) ||
        this.isKeyExpired(sub_handle);
      if (!skip) {
        const key_revoked = new lazy.ctypes.bool();
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
        const created = this.getKeyCreatedValueFromHandle(sub_handle);
        if (!newest_handle || created > newest_created) {
          if (newest_handle) {
            RNPLib.rnp_key_handle_destroy(newest_handle);
          }
          newest_handle = sub_handle;
          sub_handle = null;
          newest_created = created;
        }
      }

      if (sub_handle) {
        RNPLib.rnp_key_handle_destroy(sub_handle);
      }
    }

    return newest_handle;
  },

  /**
   * Get a minimal Autocrypt-compatible public key, for the given key
   * that exactly matches the given userId.
   *
   * @param {rnp_key_handle_t} key - RNP key handle.
   * @param {string} userId - The userID to include.
   * @returns {string} The encoded key, or the empty string on failure.
   */
  getSuitableEncryptKeyAsAutocrypt(key, userId) {
    // Prefer usable subkeys, because they are always newer
    // (or same age) as primary key.

    const use_sub = this.getSuitableSubkey(key, str_encrypt);
    if (!use_sub && !this.isKeyUsableFor(key, str_encrypt)) {
      return "";
    }

    const result = this.getAutocryptKeyB64ByHandle(key, use_sub, userId);

    if (use_sub) {
      RNPLib.rnp_key_handle_destroy(use_sub);
    }
    return result;
  },

  addSuitableEncryptKey(key, op) {
    // Prefer usable subkeys, because they are always newer
    // (or same age) as primary key.

    const use_sub = this.getSuitableSubkey(key, str_encrypt);
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
    for (const ak of aliasKeys) {
      const key = this.getKeyHandleByKeyIdOrFingerprint(RNPLib.ffi, "0x" + ak);
      if (!key || key.isNull()) {
        lazy.log.warn(`Couldn't find key used by alias rule ${ak}`);
        return false;
      }
      this.addSuitableEncryptKey(key, op);
      RNPLib.rnp_key_handle_destroy(key);
    }
    return true;
  },

  /**
   * Get a minimal Autocrypt-compatible public key, for the given email
   * address.
   *
   * @param {string} email - Use a userID with this email address.
   * @returns {string} The encoded key, or the empty string on failure.
   */
  async getRecipientAutocryptKeyForEmail(email) {
    email = email.toLowerCase();

    const key = await this.findKeyByEmail("<" + email + ">", true);
    if (!key || key.isNull()) {
      return "";
    }

    const keyInfo = {};
    const ok = this.getKeyInfoFromHandle(
      RNPLib.ffi,
      key,
      keyInfo,
      false,
      false,
      false
    );
    if (!ok) {
      throw new Error("getKeyInfoFromHandle failed");
    }

    let result = "";
    const userId = keyInfo.userIds.find(
      uid =>
        uid.type == "uid" &&
        lazy.EnigmailFuncs.getEmailFromUserID(uid.userId).toLowerCase() == email
    );
    if (userId) {
      result = this.getSuitableEncryptKeyAsAutocrypt(key, userId.userId);
    }
    RNPLib.rnp_key_handle_destroy(key);
    return result;
  },

  async addEncryptionKeyForEmail(email, op) {
    const key = await this.findKeyByEmail(email, true);
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

  /**
   * Test if the given array appears to contain an OpenPGP ASCII Armored
   * data block. This is done by checking the initial bytes of the array
   * contain the -----BEGIN string. This check should be sufficient to
   * distinguish it from a data block that contains a binary encoding
   * of OpenPGP data packets.
   *
   * @param {TypedArray} typedArray - It's assumed this parameter
   *   was created by obtaining a memory buffer from js-ctypes, casting
   *   it to ctypes.uint8_t.array, and calling readTypedArray().
   * @returns {boolean} - Returns true if the block looks ASCII armored
   */
  isASCIIArmored(typedArray) {
    const armorBegin = "-----BEGIN";
    return lazy.MailStringUtils.uint8ArrayToByteString(
      typedArray.slice(0, armorBegin.length)
    ).startsWith(armorBegin);
  },

  async encryptAndOrSign(plaintext, args, resultStatus) {
    let signedInner;

    if (args.sign && args.senderKeyIsExternal) {
      if (!lazy.GPGME.allDependenciesLoaded()) {
        throw new Error(
          "invalid configuration, request to use external GnuPG key, but GPGME isn't working"
        );
      }
      if (args.sigTypeClear) {
        throw new Error(
          "unexpected signing request with external GnuPG key configuration"
        );
      }

      if (args.encrypt) {
        // If we are asked to encrypt and sign at the same time, it
        // means we're asked to produce the combined OpenPGP encoding.
        // We ask GPG to produce a regular signature, and will then
        // combine it with the encryption produced by RNP.
        const orgEncrypt = args.encrypt;
        args.encrypt = false;
        signedInner = await lazy.GPGME.sign(plaintext, args, resultStatus);
        if (!signedInner) {
          throw new Error("GPGME.sign failed");
        }
        // Despite our request to produce binary data, GPGME.sign might
        // have produce ASCII armored encoding, e.g. if the user has
        // a configuration file that enables it.
        if (this.isASCIIArmored(signedInner)) {
          signedInner = this.deArmorTypedArray(signedInner);
        }
        args.encrypt = orgEncrypt;
      } else {
        // We aren't asked to encrypt, but sign only. That means the
        // caller needs the detached signature, either for MIME
        // mime encoding with separate signature part, or for the nested
        // approach with separate signing and encryption layers.
        const signResult = lazy.GPGME.signDetached(
          plaintext,
          args,
          resultStatus
        );
        if (!signResult) {
          throw new Error("GPGME.signDetached failed");
        }
        return signResult;
      }
    }

    resultStatus.exitCode = -1;
    resultStatus.statusFlags = 0;
    resultStatus.statusMsg = "";
    resultStatus.errorMsg = "";

    let data_array;
    if (args.sign && args.senderKeyIsExternal) {
      data_array = lazy.ctypes.uint8_t.array()(signedInner);
    } else {
      const arr = plaintext.split("").map(e => e.charCodeAt());
      data_array = lazy.ctypes.uint8_t.array()(arr);
    }

    const input = new RNPLib.rnp_input_t();
    if (
      RNPLib.rnp_input_from_memory(
        input.address(),
        data_array,
        data_array.length,
        false
      )
    ) {
      throw new Error("rnp_input_from_memory failed");
    }

    const output = new RNPLib.rnp_output_t();
    if (RNPLib.rnp_output_to_memory(output.address(), 0)) {
      throw new Error("rnp_output_to_memory failed");
    }

    let op;
    if (args.encrypt) {
      op = new RNPLib.rnp_op_encrypt_t();
      if (
        RNPLib.rnp_op_encrypt_create(op.address(), RNPLib.ffi, input, output)
      ) {
        throw new Error("rnp_op_encrypt_create failed");
      }
    } else if (args.sign && !args.senderKeyIsExternal) {
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

    let senderKeyTracker = null;
    let subKeyTracker = null;

    try {
      if ((args.sign && !args.senderKeyIsExternal) || args.encryptToSender) {
        {
          // Use a temporary scope to ensure the senderKey variable
          // cannot be accessed later on.
          const senderKey = await this.getKeyHandleByIdentifier(
            RNPLib.ffi,
            args.sender
          );
          if (!senderKey || senderKey.isNull()) {
            return null;
          }

          senderKeyTracker = new RnpPrivateKeyUnlockTracker(senderKey);
          senderKeyTracker.setAllowPromptingUserForPassword(true);
          senderKeyTracker.setAllowAutoUnlockWithCachedPasswords(true);
        }

        // Manually configured external key overrides the check for
        // a valid personal key.
        if (!args.senderKeyIsExternal) {
          if (!senderKeyTracker.isSecret()) {
            throw new Error(
              `configured sender key ${args.sender} isn't available`
            );
          }
          if (
            !(await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(
              senderKeyTracker.getFingerprint()
            ))
          ) {
            throw new Error(
              `configured sender key ${args.sender} isn't accepted as a personal key`
            );
          }
        }

        if (args.encryptToSender) {
          this.addSuitableEncryptKey(senderKeyTracker.getHandle(), op);
        }

        if (args.sign && !args.senderKeyIsExternal) {
          let signingKeyTrackerReference = senderKeyTracker;

          // Prefer usable subkeys, because they are always newer
          // (or same age) as primary key.
          const usableSubKeyHandle = this.getSuitableSubkey(
            senderKeyTracker.getHandle(),
            str_sign
          );
          if (
            !usableSubKeyHandle &&
            !this.isKeyUsableFor(senderKeyTracker.getHandle(), str_sign)
          ) {
            throw new Error("no suitable (sub)key found for " + str_sign);
          }
          if (usableSubKeyHandle) {
            subKeyTracker = new RnpPrivateKeyUnlockTracker(usableSubKeyHandle);
            subKeyTracker.setAllowPromptingUserForPassword(true);
            subKeyTracker.setAllowAutoUnlockWithCachedPasswords(true);
            if (subKeyTracker.available()) {
              signingKeyTrackerReference = subKeyTracker;
            }
          }

          await signingKeyTrackerReference.unlock();

          if (args.encrypt) {
            if (
              RNPLib.rnp_op_encrypt_add_signature(
                op,
                signingKeyTrackerReference.getHandle(),
                null
              )
            ) {
              throw new Error("rnp_op_encrypt_add_signature failed");
            }
          } else if (
            RNPLib.rnp_op_sign_add_signature(
              op,
              signingKeyTrackerReference.getHandle(),
              null
            )
          ) {
            throw new Error("rnp_op_sign_add_signature failed");
          }
          // This was just a reference, no ownership.
          signingKeyTrackerReference = null;
        }
      }

      if (args.encrypt) {
        // If we have an alias definition, it will be used, and the usual
        // lookup by email address will be skipped. Earlier code should
        // have already checked that alias keys are available and usable
        // for encryption, so we fail if a problem is found.

        for (const rcpList of [args.to, args.bcc]) {
          for (let rcpEmail of rcpList) {
            rcpEmail = rcpEmail.toLowerCase();
            const aliasKeys = args.aliasKeys.get(
              this.getEmailWithoutBrackets(rcpEmail)
            );
            if (aliasKeys) {
              if (!this.addAliasKeys(aliasKeys, op)) {
                resultStatus.statusFlags |=
                  lazy.EnigmailConstants.INVALID_RECIPIENT;
                return null;
              }
            } else if (!(await this.addEncryptionKeyForEmail(rcpEmail, op))) {
              resultStatus.statusFlags |=
                lazy.EnigmailConstants.INVALID_RECIPIENT;
              return null;
            }
          }
        }

        if (AppConstants.MOZ_UPDATE_CHANNEL != "release") {
          const debugKey = Services.prefs.getStringPref(
            "mail.openpgp.debug.extra_encryption_key"
          );
          if (debugKey) {
            const handle = this.getKeyHandleByKeyIdOrFingerprint(
              RNPLib.ffi,
              debugKey
            );
            if (!handle.isNull()) {
              this.addSuitableEncryptKey(handle, op);
              RNPLib.rnp_key_handle_destroy(handle);
            }
          }
        }

        // Don't use AEAD as long as RNP uses v5 packets which aren't
        // widely compatible with other clients.
        if (RNPLib.rnp_op_encrypt_set_aead(op, "NONE")) {
          throw new Error("rnp_op_encrypt_set_aead failed");
        }

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

        if (args.sign && args.senderKeyIsExternal) {
          if (RNPLib.rnp_op_encrypt_set_flags(op, RNPLib.RNP_ENCRYPT_NOWRAP)) {
            throw new Error("rnp_op_encrypt_set_flags failed");
          }
        }

        const rv = RNPLib.rnp_op_encrypt_execute(op);
        if (rv) {
          throw new Error("rnp_op_encrypt_execute failed: " + rv);
        }
        RNPLib.rnp_op_encrypt_destroy(op);
      } else if (args.sign && !args.senderKeyIsExternal) {
        if (RNPLib.rnp_op_sign_set_hash(op, "SHA256")) {
          throw new Error("rnp_op_sign_set_hash failed");
        }
        // TODO, map args.signatureHash string to RNP and call
        //       rnp_op_encrypt_set_hash

        if (RNPLib.rnp_op_sign_set_armor(op, args.armor)) {
          throw new Error("rnp_op_sign_set_armor failed");
        }

        if (RNPLib.rnp_op_sign_execute(op)) {
          throw new Error("rnp_op_sign_execute failed");
        }
        RNPLib.rnp_op_sign_destroy(op);
      }
    } finally {
      if (subKeyTracker) {
        subKeyTracker.release();
      }
      if (senderKeyTracker) {
        senderKeyTracker.release();
      }
    }

    RNPLib.rnp_input_destroy(input);

    let result = null;

    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
    if (
      !RNPLib.rnp_output_memory_get_buf(
        output,
        result_buf.address(),
        result_len.address(),
        false
      )
    ) {
      const char_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(output);

    resultStatus.exitCode = 0;

    if (args.encrypt) {
      resultStatus.statusFlags |= lazy.EnigmailConstants.END_ENCRYPTION;
    }

    if (args.sign) {
      resultStatus.statusFlags |= lazy.EnigmailConstants.SIG_CREATED;
    }

    return result;
  },

  /**
   * @param {number} expiryTime - Time to check, in seconds from the epoch.
   * @returns {boolean} - true if the given time is after now.
   */
  isExpiredTime(expiryTime) {
    if (!expiryTime) {
      return false;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds > expiryTime;
  },

  isKeyExpired(handle) {
    const expiration = new lazy.ctypes.uint32_t();
    if (RNPLib.rnp_key_get_expiration(handle, expiration.address())) {
      throw new Error("rnp_key_get_expiration failed");
    }
    if (!expiration.value) {
      return false;
    }

    const created = this.getKeyCreatedValueFromHandle(handle);
    const expirationSeconds = created + expiration.value;
    return this.isExpiredTime(expirationSeconds);
  },

  /**
   * Find key by email.
   *
   * @param {string} id - Email, surrounded by angle brackets.
   * @param {boolean} [onlyIfAcceptableAsRecipientKey=false] - Require matching
   *   key to be acceptable as recipient key.
   * @returns {Promise<ctypes.voidptr_t>} key handle of matching key.
   */
  async findKeyByEmail(id, onlyIfAcceptableAsRecipientKey = false) {
    if (!id.startsWith("<") || !id.endsWith(">") || id.includes(" ")) {
      throw new Error(`Invalid argument; id=${id}`);
    }

    const emailWithoutBrackets = id.substring(1, id.length - 1);

    const iter = new RNPLib.rnp_identifier_iterator_t();
    const grip = new lazy.ctypes.char.ptr();

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
      const handle = new RNPLib.rnp_key_handle_t();

      try {
        const is_subkey = new lazy.ctypes.bool();
        const uid_count = new lazy.ctypes.size_t();

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
        if (this.isBadKey(handle, null, RNPLib.ffi)) {
          continue;
        }
        const key_revoked = new lazy.ctypes.bool();
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
          const uid_handle = new RNPLib.rnp_uid_handle_t();

          if (
            RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())
          ) {
            throw new Error("rnp_key_get_uid_handle_at failed");
          }

          if (!this.isBadUid(uid_handle) && !this.isRevokedUid(uid_handle)) {
            const uid_str = new lazy.ctypes.char.ptr();
            if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
              throw new Error("rnp_key_get_uid_at failed");
            }

            const userId = uid_str.readStringReplaceMalformed();
            RNPLib.rnp_buffer_destroy(uid_str);

            if (
              lazy.EnigmailFuncs.getEmailFromUserID(userId).toLowerCase() ==
              emailWithoutBrackets
            ) {
              foundUid = true;

              if (onlyIfAcceptableAsRecipientKey) {
                // a key is acceptable, either:
                // - without secret key, it's accepted verified or unverified
                // - with secret key, must be marked as personal

                const have_secret = new lazy.ctypes.bool();
                if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
                  throw new Error("rnp_key_have_secret failed");
                }

                const fingerprint = new lazy.ctypes.char.ptr();
                if (RNPLib.rnp_key_get_fprint(handle, fingerprint.address())) {
                  throw new Error("rnp_key_get_fprint failed");
                }
                const fpr = fingerprint.readString();
                RNPLib.rnp_buffer_destroy(fingerprint);

                if (have_secret.value) {
                  const isAccepted =
                    await lazy.PgpSqliteDb2.isAcceptedAsPersonalKey(fpr);
                  if (isAccepted) {
                    foundHandle = handle;
                    have_handle = false;
                    if (tentativeUnverifiedHandle) {
                      RNPLib.rnp_key_handle_destroy(tentativeUnverifiedHandle);
                      tentativeUnverifiedHandle = null;
                    }
                  }
                } else {
                  const acceptanceResult = {};
                  try {
                    await lazy.PgpSqliteDb2.getAcceptance(
                      fpr,
                      emailWithoutBrackets,
                      acceptanceResult
                    );
                  } catch (ex) {
                    lazy.log.warn("Get acceptance FAILED!", ex);
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
        lazy.log.warn(`Finding key by email=${id} FAILED`, ex);
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

  async getPublicKey(id, store = RNPLib.ffi) {
    let result = "";
    const key = await this.getKeyHandleByIdentifier(store, id);

    if (key.isNull()) {
      return result;
    }

    const flags =
      RNPLib.RNP_KEY_EXPORT_ARMORED |
      RNPLib.RNP_KEY_EXPORT_PUBLIC |
      RNPLib.RNP_KEY_EXPORT_SUBKEYS;

    const output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), 0);

    if (RNPLib.rnp_key_export(key, output_to_memory, flags)) {
      throw new Error("rnp_key_export failed");
    }

    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
    const exitCode = RNPLib.rnp_output_memory_get_buf(
      output_to_memory,
      result_buf.address(),
      result_len.address(),
      false
    );

    if (!exitCode) {
      const char_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(output_to_memory);
    RNPLib.rnp_key_handle_destroy(key);
    return result;
  },

  /**
   * Exports a public key, strips all signatures added by others,
   * and optionally also strips user IDs. Self-signatures are kept.
   * The given key handle will not be modified. The input key will be
   * copied to a temporary area, only the temporary copy will be
   * modified. The result key will be streamed to the given output.
   *
   * @param {rnp_key_handle_t} expKey - RNP key handle
   * @param {boolean} keepUserIDs - if true keep users IDs
   * @param {rnp_output_t} out_binary - output stream handle
   */
  export_pubkey_strip_sigs_uids(expKey, keepUserIDs, out_binary) {
    const expKeyId = this.getKeyIDFromHandle(expKey);

    const tempFFI = RNPLib.prepare_ffi();
    if (!tempFFI) {
      throw new Error("Couldn't initialize librnp.");
    }

    const exportFlags =
      RNPLib.RNP_KEY_EXPORT_SUBKEYS | RNPLib.RNP_KEY_EXPORT_PUBLIC;
    const importFlags = RNPLib.RNP_LOAD_SAVE_PUBLIC_KEYS;

    const output_to_memory = new RNPLib.rnp_output_t();
    if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
      throw new Error("rnp_output_to_memory failed");
    }

    if (RNPLib.rnp_key_export(expKey, output_to_memory, exportFlags)) {
      throw new Error("rnp_key_export failed");
    }

    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
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

    const input_from_memory = new RNPLib.rnp_input_t();

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

    if (RNPLib.rnp_import_keys(tempFFI, input_from_memory, importFlags, null)) {
      throw new Error("rnp_import_keys failed");
    }

    const tempKey = this.getKeyHandleByKeyIdOrFingerprint(
      tempFFI,
      "0x" + expKeyId
    );

    // Strip

    if (!keepUserIDs) {
      const uid_count = new lazy.ctypes.size_t();
      if (RNPLib.rnp_key_get_uid_count(tempKey, uid_count.address())) {
        throw new Error("rnp_key_get_uid_count failed");
      }
      for (let i = uid_count.value; i > 0; i--) {
        const uid_handle = new RNPLib.rnp_uid_handle_t();
        if (
          RNPLib.rnp_key_get_uid_handle_at(tempKey, i - 1, uid_handle.address())
        ) {
          throw new Error("rnp_key_get_uid_handle_at failed");
        }
        if (RNPLib.rnp_uid_remove(tempKey, uid_handle)) {
          throw new Error("rnp_uid_remove failed");
        }
        RNPLib.rnp_uid_handle_destroy(uid_handle);
      }
    }

    if (
      RNPLib.rnp_key_remove_signatures(
        tempKey,
        RNPLib.RNP_KEY_SIGNATURE_NON_SELF_SIG,
        null,
        null
      )
    ) {
      throw new Error("rnp_key_remove_signatures failed");
    }

    if (RNPLib.rnp_key_export(tempKey, out_binary, exportFlags)) {
      throw new Error("rnp_key_export failed");
    }
    RNPLib.rnp_key_handle_destroy(tempKey);

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);
    RNPLib.rnp_ffi_destroy(tempFFI);
  },

  /**
   * Export one or multiple public keys.
   *
   * @param {string[]} idArrayFull - an array of key IDs or fingerprints
   *   that should be exported as full keys including all attributes.
   * @param {string[]} idArrayReduced - an array of key IDs or
   *   fingerprints that should be exported with all self-signatures,
   *   but without signatures from others.
   * @param {string[]} idArrayMinimal - an array of key IDs or
   *   fingerprints that should be exported as minimized keys.
   * @returns {string} - An ascii armored key block containing all
   *   requested (available) keys.
   */
  getMultiplePublicKeys(idArrayFull, idArrayReduced, idArrayMinimal) {
    const out_final = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(out_final.address(), 0);

    const out_binary = new RNPLib.rnp_output_t();
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

    const flags = RNPLib.RNP_KEY_EXPORT_PUBLIC | RNPLib.RNP_KEY_EXPORT_SUBKEYS;

    if (idArrayFull) {
      for (const id of idArrayFull) {
        const key = this.getKeyHandleByKeyIdOrFingerprint(RNPLib.ffi, id);
        if (key.isNull()) {
          continue;
        }

        if (RNPLib.rnp_key_export(key, out_binary, flags)) {
          throw new Error("rnp_key_export failed");
        }

        RNPLib.rnp_key_handle_destroy(key);
      }
    }

    if (idArrayReduced) {
      for (const id of idArrayReduced) {
        const key = this.getPrimaryKeyHandleByKeyIdOrFingerprint(
          RNPLib.ffi,
          id
        );
        if (key.isNull()) {
          continue;
        }

        this.export_pubkey_strip_sigs_uids(key, true, out_binary);

        RNPLib.rnp_key_handle_destroy(key);
      }
    }

    if (idArrayMinimal) {
      for (const id of idArrayMinimal) {
        const key = this.getPrimaryKeyHandleByKeyIdOrFingerprint(
          RNPLib.ffi,
          id
        );
        if (key.isNull()) {
          continue;
        }

        this.export_pubkey_strip_sigs_uids(key, false, out_binary);

        RNPLib.rnp_key_handle_destroy(key);
      }
    }

    if ((rv = RNPLib.rnp_output_finish(out_binary))) {
      throw new Error("rnp_output_finish failed: " + rv);
    }

    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
    const exitCode = RNPLib.rnp_output_memory_get_buf(
      out_final,
      result_buf.address(),
      result_len.address(),
      false
    );

    let result = "";
    if (!exitCode) {
      const char_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(result_len.value).ptr
      ).contents;
      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(out_binary);
    RNPLib.rnp_output_destroy(out_final);

    return result;
  },

  /**
   * The RNP library may store keys in a format that isn't compatible
   * with GnuPG, see bug 1713621 for an example where this happened.
   *
   * This function modifies the input key to make it compatible.
   *
   * The caller must ensure that the key is unprotected when calling
   * this function, and must apply the desired protection afterwards.
   */
  ensureECCSubkeyIsGnuPGCompatible(tempKey) {
    const algo = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_key_get_alg(tempKey, algo.address())) {
      throw new Error("rnp_key_get_alg failed");
    }
    const algoStr = algo.readString();
    RNPLib.rnp_buffer_destroy(algo);

    if (algoStr.toLowerCase() != "ecdh") {
      return;
    }

    const curve = new lazy.ctypes.char.ptr();
    if (RNPLib.rnp_key_get_curve(tempKey, curve.address())) {
      throw new Error("rnp_key_get_curve failed");
    }
    const curveStr = curve.readString();
    RNPLib.rnp_buffer_destroy(curve);

    if (curveStr.toLowerCase() != "curve25519") {
      return;
    }

    const tweak_status = new lazy.ctypes.bool();
    let rc = RNPLib.rnp_key_25519_bits_tweaked(tempKey, tweak_status.address());
    if (rc) {
      throw new Error("rnp_key_25519_bits_tweaked failed: " + rc);
    }

    // If it's not tweaked yet, then tweak to make it compatible.
    if (!tweak_status.value) {
      rc = RNPLib.rnp_key_25519_bits_tweak(tempKey);
      if (rc) {
        throw new Error("rnp_key_25519_bits_tweak failed: " + rc);
      }
    }
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

    const out_final = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(out_final.address(), 0);

    const out_binary = new RNPLib.rnp_output_t();
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

    const tempFFI = RNPLib.prepare_ffi();
    if (!tempFFI) {
      throw new Error("Couldn't initialize librnp.");
    }

    const exportFlags =
      RNPLib.RNP_KEY_EXPORT_SUBKEYS | RNPLib.RNP_KEY_EXPORT_SECRET;
    const importFlags =
      RNPLib.RNP_LOAD_SAVE_PUBLIC_KEYS | RNPLib.RNP_LOAD_SAVE_SECRET_KEYS;

    let unlockFailed = false;
    const pwCache = {
      passwords: [],
    };

    for (const fpr of fprs) {
      const fprStr = fpr;
      let expKey = await this.getKeyHandleByIdentifier(
        RNPLib.ffi,
        "0x" + fprStr
      );

      let output_to_memory = new RNPLib.rnp_output_t();
      if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
        throw new Error("rnp_output_to_memory failed");
      }

      if (RNPLib.rnp_key_export(expKey, output_to_memory, exportFlags)) {
        throw new Error("rnp_key_export failed");
      }
      RNPLib.rnp_key_handle_destroy(expKey);
      expKey = null;

      let result_buf = new lazy.ctypes.uint8_t.ptr();
      const result_len = new lazy.ctypes.size_t();
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

      RNPLib.rnp_input_destroy(input_from_memory);
      RNPLib.rnp_output_destroy(output_to_memory);
      input_from_memory = null;
      output_to_memory = null;
      result_buf = null;

      const tracker = RnpPrivateKeyUnlockTracker.constructFromFingerprint(
        fprStr,
        tempFFI
      );
      if (!tracker.available()) {
        tracker.release();
        continue;
      }

      tracker.setAllowPromptingUserForPassword(true);
      tracker.setAllowAutoUnlockWithCachedPasswords(true);
      tracker.setPasswordCache(pwCache);
      tracker.setRememberUnlockPassword(true);

      await tracker.unlock();
      if (!tracker.isUnlocked()) {
        unlockFailed = true;
        tracker.release();
        break;
      }

      tracker.unprotect();
      tracker.setPassphrase(backupPassword);

      const sub_count = new lazy.ctypes.size_t();
      if (
        RNPLib.rnp_key_get_subkey_count(
          tracker.getHandle(),
          sub_count.address()
        )
      ) {
        throw new Error("rnp_key_get_subkey_count failed");
      }
      for (let i = 0; i < sub_count.value; i++) {
        const sub_handle = new RNPLib.rnp_key_handle_t();
        if (
          RNPLib.rnp_key_get_subkey_at(
            tracker.getHandle(),
            i,
            sub_handle.address()
          )
        ) {
          throw new Error("rnp_key_get_subkey_at failed");
        }

        const subTracker = new RnpPrivateKeyUnlockTracker(sub_handle);
        if (subTracker.available()) {
          subTracker.setAllowPromptingUserForPassword(true);
          subTracker.setAllowAutoUnlockWithCachedPasswords(true);
          subTracker.setPasswordCache(pwCache);
          subTracker.setRememberUnlockPassword(true);

          await subTracker.unlock();
          if (!subTracker.isUnlocked()) {
            unlockFailed = true;
          } else {
            subTracker.unprotect();
            this.ensureECCSubkeyIsGnuPGCompatible(subTracker.getHandle());
            subTracker.setPassphrase(backupPassword);
          }
        }
        subTracker.release();
        if (unlockFailed) {
          break;
        }
      }

      if (
        !unlockFailed &&
        RNPLib.rnp_key_export(tracker.getHandle(), out_binary, exportFlags)
      ) {
        throw new Error("rnp_key_export failed");
      }

      tracker.release();
      if (unlockFailed) {
        break;
      }
    }
    RNPLib.rnp_ffi_destroy(tempFFI);

    let result = "";
    if (!unlockFailed) {
      if ((rv = RNPLib.rnp_output_finish(out_binary))) {
        throw new Error("rnp_output_finish failed: " + rv);
      }

      const result_buf = new lazy.ctypes.uint8_t.ptr();
      const result_len = new lazy.ctypes.size_t();
      const exitCode = RNPLib.rnp_output_memory_get_buf(
        out_final,
        result_buf.address(),
        result_len.address(),
        false
      );

      if (!exitCode) {
        const char_array = lazy.ctypes.cast(
          result_buf,
          lazy.ctypes.char.array(result_len.value).ptr
        ).contents;
        result = char_array.readString();
      }
    }

    RNPLib.rnp_output_destroy(out_binary);
    RNPLib.rnp_output_destroy(out_final);

    return result;
  },

  /**
   * Generate a revocation statement for the secret key with the given
   * ID. The function must also unlock the secret key.
   *
   * @param {string} id - The ID of a primary key.
   * @param {?string} pass - The password that can be used to unlock the
   *   primary key. If parameter is set to null, then this function
   *   will prompt the user to enter the password.
   * @param {bool} addEnglishInformation - Add english language text to
   *   the revocation file, that explains what the file contains.
   * @returns {string} - The ASCII armored revocation statement.
   */
  async unlockAndGetNewRevocation(id, pass, addEnglishInformation = true) {
    const key = await this.getKeyHandleByIdentifier(RNPLib.ffi, id);
    if (key.isNull()) {
      return "";
    }
    const tracker = new RnpPrivateKeyUnlockTracker(key);

    if (pass) {
      tracker.setAllowPromptingUserForPassword(false);
      tracker.setAllowAutoUnlockWithCachedPasswords(false);
      tracker.unlockWithPassword(pass);
    } else {
      tracker.setAllowPromptingUserForPassword(true);
      tracker.setAllowAutoUnlockWithCachedPasswords(true);
      await tracker.unlock();
    }

    if (!tracker.isUnlocked()) {
      tracker.release();
      throw new Error(`Couldn't unlock key ${id}`);
    }

    const out_final = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(out_final.address(), 0);

    const out_binary = new RNPLib.rnp_output_t();
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

    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
    const exitCode = RNPLib.rnp_output_memory_get_buf(
      out_final,
      result_buf.address(),
      result_len.address(),
      false
    );

    let result = "";
    if (!exitCode) {
      const char_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(result_len.value).ptr
      ).contents;
      result = char_array.readString();
    }

    RNPLib.rnp_output_destroy(out_binary);
    RNPLib.rnp_output_destroy(out_final);
    tracker.release();

    if (!addEnglishInformation) {
      return result;
    }

    return (
      revocationFilePrefix1 +
      "\n\n" +
      id +
      "\n" +
      revocationFilePrefix2 +
      result
    );
  },

  enArmorString(input, type) {
    const arr = input.split("").map(e => e.charCodeAt());
    const input_array = lazy.ctypes.uint8_t.array()(arr);

    return this.enArmorCData(input_array, input_array.length, type);
  },

  enArmorCDataMessage(buf, len) {
    return this.enArmorCData(buf, len, "message");
  },

  enArmorCData(buf, len, type) {
    const input_array = lazy.ctypes.cast(buf, lazy.ctypes.uint8_t.array(len));

    const input_from_memory = new RNPLib.rnp_input_t();
    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      input_array,
      len,
      false
    );

    const max_out = len * 2 + 150; // extra bytes for head/tail/hash lines

    const output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

    if (RNPLib.rnp_enarmor(input_from_memory, output_to_memory, type)) {
      throw new Error("rnp_enarmor failed");
    }

    let result = "";
    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
    if (
      !RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      )
    ) {
      const char_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);

    return result;
  },

  /**
   * Removes ASCII armor layer from the input.
   *
   * @param {TypedArray} input_array - An array of bytes containing
   *   an OpenPGP message in ASCII armored data format.
   * @returns {object} - A typed array with the result bytes.
   */
  deArmorTypedArray(input_array) {
    const input_from_memory = new RNPLib.rnp_input_t();
    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      input_array,
      input_array.length,
      false
    );
    const max_out = input_array.length * 2 + 150; // extra bytes for head/tail/hash lines

    const output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

    if (RNPLib.rnp_dearmor(input_from_memory, output_to_memory)) {
      throw new Error("rnp_dearmor failed");
    }

    let result = null;

    const result_buf = new lazy.ctypes.uint8_t.ptr();
    const result_len = new lazy.ctypes.size_t();
    if (
      !RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      )
    ) {
      // type casting the pointer type to an array type allows us to
      // access the elements by index.
      const uint8_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.uint8_t.array(result_len.value).ptr
      ).contents;

      result = uint8_array.readTypedArray();
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);

    return result;
  },

  /**
   * Removes ASCII armor layer from the input.
   *
   * @param {string} str - A string of bytes that contains OpenPGP
   *   ASCII armored data.
   * @returns {object} - A typed array with the result bytes.
   */
  deArmorString(str) {
    const array = lazy.MailStringUtils.byteStringToUint8Array(str);
    return this.deArmorTypedArray(array);
  },

  /**
   * Change the key expiration date.
   *
   * @param {KeyObj} primaryKey - Primary key.
   * @param {?KeyObj} subKey - Key to change if not the primary key (simpleMode false)
   * @param {?Date} date - The expiration date. null for "does not expire".
   * @param {boolean} [simpleMode=true] - Set to false to edit expiration of
   *   a parcular subkey only.
   * @returns {boolean} true if the key expiration was changed.
   */
  async changeKeyExpiration(primaryKey, subKey, date, simpleMode = true) {
    const keyToEdit = simpleMode ? primaryKey : subKey;

    // We must always unlock the primary key, that's the one that will
    // be used to sign/allow the change.
    let fingerprintsToUnlock;
    let fingerprintsToEdit;

    if (simpleMode) {
      fingerprintsToUnlock = [primaryKey.fpr, primaryKey.subKeys[0].fpr];
      fingerprintsToEdit = [primaryKey.fpr, primaryKey.subKeys[0].fpr];
    } else {
      // When not editing the primary key, also unlock the subkey to edit.
      fingerprintsToUnlock = [primaryKey.fpr];
      if (keyToEdit.fpr != primaryKey.fpr) {
        fingerprintsToUnlock.push(keyToEdit.fpr);
      }
      fingerprintsToEdit = [keyToEdit.fpr];
    }

    // Key Expiration Time - this is the number of seconds after the key
    // creation time that the key expires.
    const expirationTime = date
      ? Math.ceil(date.getTime() / 1000) - keyToEdit.keyCreated
      : 0;

    const pwCache = {
      passwords: [],
    };
    const keyTrackers = [];
    try {
      for (const fp of fingerprintsToUnlock) {
        const tracker = RnpPrivateKeyUnlockTracker.constructFromFingerprint(fp);
        tracker.setAllowPromptingUserForPassword(true);
        tracker.setAllowAutoUnlockWithCachedPasswords(true);
        tracker.setPasswordCache(pwCache);
        await tracker.unlock();
        keyTrackers.push(tracker);
        if (!tracker.isUnlocked()) {
          // Unlock failed.
          return false;
        }
      }
      await RNP._changeExpirationDate(fingerprintsToEdit, expirationTime);
    } finally {
      for (const t of keyTrackers) {
        t.release();
      }
    }
    return true;
  },

  /**
   * Will change the expiration date of all given keys to newExpiry.
   * fingerprintArray is an array, containing fingerprints, both
   * primary key fingerprints and subkey fingerprints are allowed.
   * The function assumes that all involved keys have already been
   * unlocked. We shouldn't rely on password callbacks for unlocking,
   * as it would be confusing if only some keys are changed.
   *
   * @param {string[]} fingerprintArray - Fingerprints.
   * @param {integer} newExpiry - New expiration time in seconds (since key creation).
   */
  async _changeExpirationDate(fingerprintArray, newExpiry) {
    for (const fingerprint of fingerprintArray) {
      const handle = this.getKeyHandleByKeyIdOrFingerprint(
        RNPLib.ffi,
        "0x" + fingerprint
      );

      if (handle.isNull()) {
        continue;
      }

      if (RNPLib.rnp_key_set_expiration(handle, newExpiry)) {
        throw new Error(`rnp_key_set_expiration failed for ${fingerprint}`);
      }
      RNPLib.rnp_key_handle_destroy(handle);
    }

    await this.saveKeyRings();
    return true;
  },

  /**
   * Get a minimal Autocrypt-compatible key for the given key handles.
   * If subkey is given, it must refer to an existing encryption subkey.
   * This is a wrapper around RNP function rnp_key_export_autocrypt.
   *
   * @param {rnp_key_handle_t} primHandle - The handle of a primary key.
   * @param {?rnp_key_handle_t} subHandle - The handle of an encryption subkey or null.
   * @param {string} userId - The userID to include.
   * @returns {string} The encoded key, or the empty string on failure.
   */
  getAutocryptKeyB64ByHandle(primHandle, subHandle, userId) {
    if (primHandle.isNull()) {
      throw new Error("getAutocryptKeyB64ByHandle invalid parameter");
    }

    const output_to_memory = new RNPLib.rnp_output_t();
    if (RNPLib.rnp_output_to_memory(output_to_memory.address(), 0)) {
      throw new Error("rnp_output_to_memory failed");
    }

    let result = "";

    if (
      RNPLib.rnp_key_export_autocrypt(
        primHandle,
        subHandle,
        userId,
        output_to_memory,
        0
      )
    ) {
      lazy.log.warn("rnp_key_export_autocrypt FAILED");
    } else {
      const result_buf = new lazy.ctypes.uint8_t.ptr();
      const result_len = new lazy.ctypes.size_t();
      const rv = RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      );

      if (!rv) {
        // result_len is of type UInt64, I don't know of a better way
        // to convert it to an integer.
        const b_len = parseInt(result_len.value.toString());

        // type casting the pointer type to an array type allows us to
        // access the elements by index.
        const uint8_array = lazy.ctypes.cast(
          result_buf,
          lazy.ctypes.uint8_t.array(result_len.value).ptr
        ).contents;

        let str = "";
        for (let i = 0; i < b_len; i++) {
          str += String.fromCharCode(uint8_array[i]);
        }

        result = btoa(str);
      }
    }

    RNPLib.rnp_output_destroy(output_to_memory);

    return result;
  },

  /**
   * Get a minimal Autocrypt-compatible key for the given key ID.
   * If subKeyId is given, it must refer to an existing encryption subkey.
   * This is a wrapper around RNP function rnp_key_export_autocrypt.
   *
   * @param {string} primaryKeyId - The ID of a primary key.
   * @param {?string} subKeyId - The ID of an encryption subkey or null.
   * @param {string} uidString - The userID to include.
   * @returns {string} The encoded key, or the empty string on failure.
   */
  getAutocryptKeyB64(primaryKeyId, subKeyId, uidString) {
    let subHandle = null;

    if (subKeyId) {
      subHandle = this.getKeyHandleByKeyIdOrFingerprint(RNPLib.ffi, subKeyId);
      if (subHandle.isNull()) {
        // Although subKeyId is optional, if it's given, it must be valid.
        return "";
      }
    }

    const primHandle = this.getKeyHandleByKeyIdOrFingerprint(
      RNPLib.ffi,
      primaryKeyId
    );

    const result = this.getAutocryptKeyB64ByHandle(
      primHandle,
      subHandle,
      uidString
    );

    if (!primHandle.isNull()) {
      RNPLib.rnp_key_handle_destroy(primHandle);
    }
    if (subHandle) {
      RNPLib.rnp_key_handle_destroy(subHandle);
    }
    return result;
  },

  /**
   * Helper function to produce the string that will be shown to the
   * user, when the user is asked to unlock a key. If the key is a
   * subkey, it might help to user to identify the respective key by
   * also mentioning the key ID of the primary key, so both IDs are
   * shown when prompting to unlock a subkey.
   * Parameter nonDefaultFFI is required, if the prompt is related to
   * a key that isn't (yet) stored in the global storage, for example
   * a key that is being prepared for import or export in a temporary
   * ffi space.
   *
   * @param {rnp_key_handle_t} handle - produce a passphrase prompt
   *   string based on the properties of this key.
   * @param {rnp_ffi_t} ffi - the RNP FFI that relates the handle
   * @returns {string} - a string that asks the user to enter the
   *   passphrase for the given string parameter, including details
   *   that allow the user to identify the key.
   */
  async getPassphrasePrompt(handle, ffi) {
    const parentOfHandle = this.getPrimaryKeyHandleIfSub(ffi, handle);
    const useThisHandle = !parentOfHandle.isNull() ? parentOfHandle : handle;

    const keyObj = {};
    if (
      !this.getKeyInfoFromHandle(ffi, useThisHandle, keyObj, false, true, true)
    ) {
      return "";
    }

    const mainKeyId = keyObj.keyId;
    let subKeyId;
    if (!parentOfHandle.isNull()) {
      subKeyId = this.getKeyIDFromHandle(handle);
    }

    if (subKeyId) {
      return l10n.formatValue("passphrase-prompt2-sub", {
        subkey: subKeyId,
        key: mainKeyId,
        date: keyObj.created,
        username_and_email: keyObj.userId,
      });
    }
    return l10n.formatValue("passphrase-prompt2", {
      key: mainKeyId,
      date: keyObj.created,
      username_and_email: keyObj.userId,
    });
  },

  getSupportedFeatureFlags() {
    // Update this bitmask whenever additional features are supported.
    return RNPLib.PGP_KEY_FEATURE_MDC;
  },

  /**
   * @param {EnigmailKeyObj} keyObj - The key to check.
   * @returns {boolean} true if unsupported features (version, algorithms) are advertised by this key
   */
  keyObjHasUnsupportedFeatures(keyObj) {
    let foundFeatures = 0;
    if (keyObj.features) {
      foundFeatures |= keyObj.features;
    }

    for (let i = 0; i < keyObj.userIds.length; i++) {
      const uid = keyObj.userIds[i];
      if (uid.type === "uid" && uid.features) {
        foundFeatures |= uid.features;
      }
    }

    const ourSupportedFeatures = this.getSupportedFeatureFlags();

    // Remove our supported feature flags from bitmask.
    const unsupportedFeatures = (foundFeatures &= ~ourSupportedFeatures);

    return unsupportedFeatures != 0;
  },

  /**
   * @param {?rnp_key_handle_t} handle - the handle of a RNP key
   * @returns {boolean} true if unsupported features (version, algorithms) are advertised by this key
   */
  keyHasUnsupportedFeatures(handle) {
    const selfId = this.getKeyIDFromHandle(handle);

    let foundFeatures = this.getSelfSigFeatures(selfId, handle);

    const uid_count = new lazy.ctypes.size_t();
    if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
      throw new Error("rnp_key_get_uid_count failed");
    }
    for (let i = 0; i < uid_count.value; i++) {
      const uid_handle = new RNPLib.rnp_uid_handle_t();

      if (RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())) {
        throw new Error("rnp_key_get_uid_handle_at failed");
      }

      if (!this.isRevokedUid(uid_handle)) {
        const uid_str = new lazy.ctypes.char.ptr();
        if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
          throw new Error("rnp_key_get_uid_at failed");
        }
        const userIdStr = uid_str.readStringReplaceMalformed();
        RNPLib.rnp_buffer_destroy(uid_str);

        if (userIdStr !== RNP_PHOTO_USERID_ID) {
          foundFeatures |= this.getUidFeatures(selfId, uid_handle);
        }
      }

      RNPLib.rnp_uid_handle_destroy(uid_handle);
    }

    const ourSupportedFeatures = this.getSupportedFeatureFlags();

    // Remove our supported feature flags from bitmask.
    const unsupportedFeatures = (foundFeatures &= ~ourSupportedFeatures);

    return unsupportedFeatures != 0;
  },

  /**
   * Verify an attachment.
   *
   * @param {string} dataPath - The data to verify.
   * @param {string} signaturePath - The signature data.
   * @returns {boolean} true if verification succeeded.
   */
  async verifyAttachment(dataPath, signaturePath) {
    const data = lazy.MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(dataPath)
    );
    const signature = lazy.MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(signaturePath)
    );
    return !(await this.verifyDetached(data, signature)).exitCode;
  },
};
