/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ctypes } from "resource://gre/modules/ctypes.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OpenPGPMasterpass: "chrome://openpgp/content/modules/masterpass.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const MIN_RNP_VERSION = [0, 17, 1];

var systemOS = Services.appinfo.OS.toLowerCase();
var abi = ctypes.default_abi;

// Open librnp. Determine the path to the chrome directory and look for it
// there first. If not, fallback to searching the standard locations.
var librnp, librnpPath;

function tryLoadRNP(name, suffix) {
  const filename = ctypes.libraryName(name) + suffix;
  const binPath = Services.dirsvc.get("XpcomLib", Ci.nsIFile).path;
  const binDir = PathUtils.parent(binPath);
  librnpPath = PathUtils.join(binDir, filename);

  try {
    librnp = ctypes.open(librnpPath);
  } catch (e) {}

  if (!librnp) {
    try {
      // look in standard locations
      librnpPath = filename;
      librnp = ctypes.open(librnpPath);
    } catch (e) {}
  }
}

function loadExternalRNPLib() {
  if (!librnp) {
    // Try loading librnp.so, librnp.dylib, or rnp.dll first
    tryLoadRNP("rnp", "");
  }

  if (!librnp && (systemOS === "winnt" || systemOS === "darwin")) {
    // rnp.0.dll or rnp.0.dylib
    tryLoadRNP("rnp.0", "");
  }

  if (!librnp) {
    tryLoadRNP("rnp-0", "");
  }

  if (!librnp && systemOS === "winnt") {
    // librnp-0.dll
    tryLoadRNP("librnp-0", "");
  }

  if (!librnp && !(systemOS === "winnt") && !(systemOS === "darwin")) {
    // librnp.so.0
    tryLoadRNP("rnp", ".0");
  }
}

export var RNPLibLoader = {
  init() {
    const required_version_str = `${MIN_RNP_VERSION[0]}.${MIN_RNP_VERSION[1]}.${MIN_RNP_VERSION[2]}`;

    const dummyRNPLib = {
      loaded: false,
      loadedOfficial: false,
      loadStatus: "libs-rnp-status-load-failed",
      loadErrorReason: "RNP/OpenPGP library failed to load",
      path: "",

      getRNPLibStatus() {
        return {
          min_version: required_version_str,
          loaded_version: "-",
          status: this.loadStatus,
          error: this.loadErrorReason,
          path: this.path,
        };
      },
    };

    loadExternalRNPLib();
    if (!librnp) {
      return dummyRNPLib;
    }

    try {
      enableRNPLibJS();
    } catch (e) {
      console.warn("Enable RNP FAILED!", e);
      return dummyRNPLib;
    }

    const rnp_version_str =
      RNPLib.rnp_version_string_full().readStringReplaceMalformed();
    RNPLib.loadedVersion = rnp_version_str;
    RNPLib.expectedVersion = required_version_str;

    const hasRequiredVersion = RNPLib.check_required_version();

    if (!hasRequiredVersion) {
      RNPLib.loadErrorReason = `RNP version ${rnp_version_str} does not meet minimum required ${required_version_str}.`;
      RNPLib.loadStatus = "libs-rnp-status-incompatible";
      return RNPLib;
    }

    RNPLib.loaded = true;

    const hasOfficialVersion =
      rnp_version_str.includes(".MZLA") ||
      rnp_version_str.match("^[0-9]+.[0-9]+.[0-9]+(.[0-9]+)?$");
    if (!hasOfficialVersion) {
      RNPLib.loadErrorReason = `RNP reports unexpected version information, it's considered an unofficial version with unknown capabilities.`;
      RNPLib.loadStatus = "libs-rnp-status-unofficial";
    } else {
      RNPLib.loadedOfficial = true;
    }

    return RNPLib;
  },
};

const rnp_result_t = ctypes.uint32_t;
const rnp_ffi_t = ctypes.void_t.ptr;
const rnp_input_t = ctypes.void_t.ptr;
const rnp_output_t = ctypes.void_t.ptr;
const rnp_key_handle_t = ctypes.void_t.ptr;
const rnp_uid_handle_t = ctypes.void_t.ptr;
const rnp_identifier_iterator_t = ctypes.void_t.ptr;
const rnp_op_generate_t = ctypes.void_t.ptr;
const rnp_op_encrypt_t = ctypes.void_t.ptr;
const rnp_op_sign_t = ctypes.void_t.ptr;
const rnp_op_sign_signature_t = ctypes.void_t.ptr;
const rnp_op_verify_t = ctypes.void_t.ptr;
const rnp_op_verify_signature_t = ctypes.void_t.ptr;
const rnp_signature_handle_t = ctypes.void_t.ptr;
const rnp_recipient_handle_t = ctypes.void_t.ptr;
const rnp_symenc_handle_t = ctypes.void_t.ptr;

const rnp_password_cb_t = ctypes.FunctionType(abi, ctypes.bool, [
  rnp_ffi_t,
  ctypes.void_t.ptr,
  rnp_key_handle_t,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.size_t,
]).ptr;

const rnp_key_signatures_cb = ctypes.FunctionType(abi, ctypes.void_t, [
  rnp_ffi_t,
  ctypes.void_t.ptr,
  rnp_signature_handle_t,
  ctypes.uint32_t.ptr,
]).ptr;

var RNPLib;

function enableRNPLibJS() {
  // this must be delayed until after "librnp" is initialized

  RNPLib = {
    loaded: false,
    loadedOfficial: false,
    loadStatus: "",
    loadErrorReason: "",
    expectedVersion: "",
    loadedVersion: "",

    getRNPLibStatus() {
      return {
        min_version: this.expectedVersion,
        loaded_version: this.loadedVersion,
        status:
          this.loaded && this.loadedOfficial
            ? "libs-rnp-status-ok"
            : this.loadStatus,
        error: this.loadErrorReason,
        path: this.path,
      };
    },

    path: librnpPath,

    // Handle to the RNP library and primary key data store.
    // Kept at null if init fails.
    ffi: null,

    // returns rnp_input_t, destroy using rnp_input_destroy
    async createInputFromPath(path) {
      // IOUtils.read always returns an array.
      const u8 = await IOUtils.read(path);
      if (!u8.length) {
        return null;
      }

      const input_from_memory = new this.rnp_input_t();
      try {
        this.rnp_input_from_memory(
          input_from_memory.address(),
          u8,
          u8.length,
          false
        );
      } catch (ex) {
        throw new Error("rnp_input_from_memory for file " + path + " failed");
      }
      return input_from_memory;
    },

    getFilenames() {
      const secFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
      secFile.append("secring.gpg");
      const pubFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
      pubFile.append("pubring.gpg");

      const secRingPath = secFile.path;
      const pubRingPath = pubFile.path;

      return { pubRingPath, secRingPath };
    },

    /**
     * Load a keyring file into the global ffi context.
     *
     * @param {string} filename - The file to load.
     * @param {integer} keyringFlag - Either RNP_LOAD_SAVE_PUBLIC_KEYS
     *   or RNP_LOAD_SAVE_SECRET_KEYS.
     */
    async loadFile(filename, keyringFlag) {
      const in_file = await this.createInputFromPath(filename);
      if (in_file) {
        this.rnp_load_keys(this.ffi, "GPG", in_file, keyringFlag);
        this.rnp_input_destroy(in_file);
      }
    },

    /**
     * Load a keyring file into the global ffi context.
     * If the file couldn't be opened, fall back to a backup file,
     * by appending ".old" to filename.
     *
     * @param {string} filename - The file to load.
     * @param {integer} keyringFlag - Either RNP_LOAD_SAVE_PUBLIC_KEYS
     *   or RNP_LOAD_SAVE_SECRET_KEYS.
     */
    async loadWithFallback(filename, keyringFlag) {
      let loadBackup = false;
      try {
        await this.loadFile(filename, keyringFlag);
      } catch (ex) {
        if (DOMException.isInstance(ex)) {
          loadBackup = true;
        }
      }
      if (loadBackup) {
        filename += ".old";
        try {
          await this.loadFile(filename, keyringFlag);
        } catch (ex) {}
      }
    },

    async _fixUnprotectedKeys() {
      // Bug 1710290, protect all unprotected keys.
      // To do so, we require that the user has already unlocked
      // by entering the global primary password, if it is set.
      // Ensure that other repairing is done first, if necessary,
      // as handled by masterpass.sys.mjs (OpenPGP automatic password).

      // Note we have two failure scenarios, either a failure, or
      // retrieveOpenPGPPassword() returning null (that function
      // might fail because of inconsistencies or corruption).
      let canRepair = false;
      try {
        console.warn("Trying to automatically protect the unprotected keys.");
        const mp = await lazy.OpenPGPMasterpass.retrieveOpenPGPPassword();
        if (mp) {
          await RNPLib.protectUnprotectedKeys();
          await RNPLib.saveKeys();
          canRepair = true;
          console.warn("Successfully protected the unprotected keys.");
          const [prot, unprot] = RNPLib.getProtectedKeysCount();
          if (unprot > 0) {
            console.error(
              `Found (${prot} protected and ${unprot} unprotected secret keys.`
            );
          }
        }
      } catch (ex) {
        console.error("Protection FAILED!", ex);
      }

      if (!canRepair) {
        console.error("Cannot protect the unprotected keys at this time.");
      }
    },

    check_required_version() {
      const min_version = this.rnp_version_for(...MIN_RNP_VERSION);
      const this_version = this.rnp_version();
      return Boolean(this_version >= min_version);
    },

    /**
     * Prepare an RNP library handle, and in addition set all the
     * application's preferences for library behavior.
     *
     * Other application code should NOT call rnp_ffi_create directly,
     * but obtain an RNP library handle from this function.
     */
    prepare_ffi() {
      const ffi = new rnp_ffi_t();
      if (this._rnp_ffi_create(ffi.address(), "GPG", "GPG")) {
        return null;
      }

      // Treat MD5 as insecure.
      if (
        this.rnp_add_security_rule(
          ffi,
          this.RNP_FEATURE_HASH_ALG,
          this.RNP_ALGNAME_MD5,
          this.RNP_SECURITY_OVERRIDE,
          0,
          this.RNP_SECURITY_INSECURE
        )
      ) {
        return null;
      }

      // Use RNP's default rule for SHA1 used with data signatures,
      // and use our override to allow it for key signatures.
      if (
        this.rnp_add_security_rule(
          ffi,
          this.RNP_FEATURE_HASH_ALG,
          this.RNP_ALGNAME_SHA1,
          this.RNP_SECURITY_VERIFY_KEY | this.RNP_SECURITY_OVERRIDE,
          0,
          this.RNP_SECURITY_DEFAULT
        )
      ) {
        return null;
      }

      /*
      // Security rules API does not yet support PK and SYMM algs.
      //
      // If a hash algorithm is already disabled at build time,
      // and an attempt is made to set a security rule for that
      // algorithm, then RNP returns a failure.
      //
      // Ideally, RNP should allow these calls (regardless of build time
      // settings) to define an application security rule, that is
      // independent of the configuration used for building the
      // RNP library.

      if (
        this.rnp_add_security_rule(
          ffi,
          this.RNP_FEATURE_HASH_ALG,
          this.RNP_ALGNAME_SM3,
          this.RNP_SECURITY_OVERRIDE,
          0,
          this.RNP_SECURITY_PROHIBITED
        )
      ) {
        return null;
      }

      if (
        this.rnp_add_security_rule(
          ffi,
          this.RNP_FEATURE_PK_ALG,
          this.RNP_ALGNAME_SM2,
          this.RNP_SECURITY_OVERRIDE,
          0,
          this.RNP_SECURITY_PROHIBITED
        )
      ) {
        return null;
      }

      if (
        this.rnp_add_security_rule(
          ffi,
          this.RNP_FEATURE_SYMM_ALG,
          this.RNP_ALGNAME_SM4,
          this.RNP_SECURITY_OVERRIDE,
          0,
          this.RNP_SECURITY_PROHIBITED
        )
      ) {
        return null;
      }
      */

      return ffi;
    },

    /**
     * Test the correctness of security rules, in particular, test
     * if the given hash algorithm is allowed at the given time.
     *
     * This is an application consistency test. If the behavior isn't
     * according to the expectation, the function throws an error.
     *
     * @param {string} hashAlg - Test this hash algorithm
     * @param {time_t} time - Test status at this timestamp
     * @param {boolean} keySigAllowed - Test if using the hash algorithm
     *  is allowed for signatures found inside OpenPGP keys.
     * @param {boolean} dataSigAllowed - Test if using the hash algorithm
     *  is allowed for signatures on data.
     */
    _confirmSecurityRule(hashAlg, time, keySigAllowed, dataSigAllowed) {
      const level = new ctypes.uint32_t();
      const flag = new ctypes.uint32_t();

      flag.value = this.RNP_SECURITY_VERIFY_DATA;
      let testDataSuccess = false;
      if (
        !RNPLib.rnp_get_security_rule(
          this.ffi,
          this.RNP_FEATURE_HASH_ALG,
          hashAlg,
          time,
          flag.address(),
          null,
          level.address()
        )
      ) {
        if (dataSigAllowed) {
          testDataSuccess = level.value == RNPLib.RNP_SECURITY_DEFAULT;
        } else {
          testDataSuccess = level.value < RNPLib.RNP_SECURITY_DEFAULT;
        }
      }

      if (!testDataSuccess) {
        throw new Error("security configuration for data signatures failed");
      }

      flag.value = this.RNP_SECURITY_VERIFY_KEY;
      let testKeySuccess = false;
      if (
        !RNPLib.rnp_get_security_rule(
          this.ffi,
          this.RNP_FEATURE_HASH_ALG,
          hashAlg,
          time,
          flag.address(),
          null,
          level.address()
        )
      ) {
        if (keySigAllowed) {
          testKeySuccess = level.value == RNPLib.RNP_SECURITY_DEFAULT;
        } else {
          testKeySuccess = level.value < RNPLib.RNP_SECURITY_DEFAULT;
        }
      }

      if (!testKeySuccess) {
        throw new Error("security configuration for key signatures failed");
      }
    },

    /**
     * Perform tests that the RNP library behaves according to the
     * defined security rules.
     * If a problem is found, the function throws an error.
     */
    _sanityCheckSecurityRules() {
      const time_t_now = Math.round(Date.now() / 1000);
      const ten_years_in_seconds = 10 * 365 * 24 * 60 * 60;
      const ten_years_future = time_t_now + ten_years_in_seconds;

      this._confirmSecurityRule(this.RNP_ALGNAME_MD5, time_t_now, false, false);
      this._confirmSecurityRule(
        this.RNP_ALGNAME_MD5,
        ten_years_future,
        false,
        false
      );

      this._confirmSecurityRule(this.RNP_ALGNAME_SHA1, time_t_now, true, false);
      this._confirmSecurityRule(
        this.RNP_ALGNAME_SHA1,
        ten_years_future,
        true,
        false
      );
    },

    /**
     * Register the default password callback with the default ffi
     * RNP context (RNPLib.ffi).
     */
    setDefaultPasswordCB() {
      this.rnp_ffi_set_pass_provider(
        this.ffi,
        this.keep_password_cb_alive,
        null
      );
    },

    async init() {
      this.ffi = this.prepare_ffi();
      if (!this.ffi) {
        throw new Error("Couldn't initialize librnp.");
      }

      this.rnp_ffi_set_log_fd(this.ffi, 2); // stderr

      this.keep_password_cb_alive = rnp_password_cb_t(
        this.password_cb,
        this, // this value used while executing callback
        false // callback return value if exception is thrown
      );
      this.setDefaultPasswordCB();

      const { pubRingPath, secRingPath } = this.getFilenames();

      try {
        this._sanityCheckSecurityRules();
      } catch (e) {
        // Disable all RNP operation
        this.ffi = null;
        throw e;
      }

      await this.loadWithFallback(pubRingPath, this.RNP_LOAD_SAVE_PUBLIC_KEYS);
      await this.loadWithFallback(secRingPath, this.RNP_LOAD_SAVE_SECRET_KEYS);

      const pubnum = new ctypes.size_t();
      this.rnp_get_public_key_count(this.ffi, pubnum.address());

      const secnum = new ctypes.size_t();
      this.rnp_get_secret_key_count(this.ffi, secnum.address());

      const [prot, unprot] = this.getProtectedKeysCount();
      if (unprot) {
        console.warn(
          `Found ${pubnum.value} public keys and ${secnum.value} secret keys (${prot} protected, ${unprot} unprotected)`
        );
        // We need automatic repair, which can involve a primary password
        // prompt. Let's use a short timer, so we keep it out of the
        // early startup code.
        console.warn(
          "Will attempt to automatically protect the unprotected keys in 30 seconds"
        );
        lazy.setTimeout(RNPLib._fixUnprotectedKeys, 30000);
      }
      return true;
    },

    /**
     * Returns two numbers, the number of protected and unprotected keys.
     * Because we use an automatic password for all secret keys
     * (regardless of a primary password being used),
     * the number of unprotected keys should be zero.
     */
    getProtectedKeysCount() {
      let prot = 0;
      let unprot = 0;

      const iter = new RNPLib.rnp_identifier_iterator_t();
      const grip = new ctypes.char.ptr();

      if (
        RNPLib.rnp_identifier_iterator_create(
          RNPLib.ffi,
          iter.address(),
          "grip"
        )
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
          const is_protected = new ctypes.bool();
          if (RNPLib.rnp_key_is_protected(handle, is_protected.address())) {
            throw new Error("rnp_key_is_protected failed");
          }
          if (is_protected.value) {
            prot++;
          } else {
            unprot++;
          }
        }

        RNPLib.rnp_key_handle_destroy(handle);
      }

      RNPLib.rnp_identifier_iterator_destroy(iter);
      return [prot, unprot];
    },

    getSecretAvailableFromHandle(handle) {
      const have_secret = new ctypes.bool();
      if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
        throw new Error("rnp_key_have_secret failed");
      }
      return have_secret.value;
    },

    /**
     * If the given secret key is a pseudo secret key, which doesn't
     * contain the underlying key material, then return false.
     *
     * Only call this function if getSecretAvailableFromHandle returns
     * true for the given handle (which means it claims to contain a
     * secret key).
     *
     * @param {rnp_key_handle_t} handle - handle of the key to query
     * @returns {boolean} - true if secret key material is available
     *
     */
    isSecretKeyMaterialAvailable(handle) {
      const protection_type = new ctypes.char.ptr();
      if (
        RNPLib.rnp_key_get_protection_type(handle, protection_type.address())
      ) {
        throw new Error("rnp_key_get_protection_type failed");
      }
      let result;
      switch (protection_type.readString()) {
        case "GPG-None":
        case "GPG-Smartcard":
        case "Unknown":
          result = false;
          break;
        default:
          result = true;
          break;
      }
      RNPLib.rnp_buffer_destroy(protection_type);
      return result;
    },

    async protectUnprotectedKeys() {
      const iter = new RNPLib.rnp_identifier_iterator_t();
      const grip = new ctypes.char.ptr();

      const newPass = await lazy.OpenPGPMasterpass.retrieveOpenPGPPassword();

      if (
        RNPLib.rnp_identifier_iterator_create(
          RNPLib.ffi,
          iter.address(),
          "grip"
        )
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

        if (RNPLib.getSecretAvailableFromHandle(handle)) {
          const is_protected = new ctypes.bool();
          if (RNPLib.rnp_key_is_protected(handle, is_protected.address())) {
            throw new Error("rnp_key_is_protected failed");
          }
          if (!is_protected.value) {
            RNPLib.protectKeyWithSubKeys(handle, newPass);
          }
        }

        RNPLib.rnp_key_handle_destroy(handle);
      }

      RNPLib.rnp_identifier_iterator_destroy(iter);
    },

    protectKeyWithSubKeys(handle, newPass) {
      if (RNPLib.isSecretKeyMaterialAvailable(handle)) {
        if (RNPLib.rnp_key_protect(handle, newPass, null, null, null, 0)) {
          throw new Error("rnp_key_protect failed");
        }
      }

      const sub_count = new ctypes.size_t();
      if (RNPLib.rnp_key_get_subkey_count(handle, sub_count.address())) {
        throw new Error("rnp_key_get_subkey_count failed");
      }

      for (let i = 0; i < sub_count.value; i++) {
        const sub_handle = new RNPLib.rnp_key_handle_t();
        if (RNPLib.rnp_key_get_subkey_at(handle, i, sub_handle.address())) {
          throw new Error("rnp_key_get_subkey_at failed");
        }
        if (
          RNPLib.getSecretAvailableFromHandle(sub_handle) &&
          RNPLib.isSecretKeyMaterialAvailable(sub_handle)
        ) {
          if (
            RNPLib.rnp_key_protect(sub_handle, newPass, null, null, null, 0)
          ) {
            throw new Error("rnp_key_protect failed");
          }
        }
        RNPLib.rnp_key_handle_destroy(sub_handle);
      }
    },

    /**
     * Save keyring file to the given path.
     *
     * @param {string} path - The file path to save to.
     * @param {number} keyRingFlag - RNP_LOAD_SAVE_PUBLIC_KEYS or
     *   RNP_LOAD_SAVE_SECRET_KEYS.
     */
    async saveKeyRing(path, keyRingFlag) {
      if (!this.ffi) {
        return;
      }

      const oldPath = path + ".old";

      // Ignore failure, oldPath might not exist yet.
      await IOUtils.copy(path, oldPath).catch(() => {});

      let u8 = null;
      const keyCount = new ctypes.size_t();

      if (keyRingFlag == this.RNP_LOAD_SAVE_SECRET_KEYS) {
        this.rnp_get_secret_key_count(this.ffi, keyCount.address());
      } else {
        this.rnp_get_public_key_count(this.ffi, keyCount.address());
      }

      const keyCountNum = parseInt(keyCount.value.toString());
      if (keyCountNum) {
        const rnp_out = new this.rnp_output_t();
        if (this.rnp_output_to_memory(rnp_out.address(), 0)) {
          throw new Error("rnp_output_to_memory failed");
        }
        if (this.rnp_save_keys(this.ffi, "GPG", rnp_out, keyRingFlag)) {
          throw new Error("rnp_save_keys failed");
        }

        const result_buf = new ctypes.uint8_t.ptr();
        const result_len = new ctypes.size_t();

        // Parameter false means "don't copy rnp_out to result_buf",
        // rather a reference to the memory is used. Be careful to
        // destroy rnp_out after we're done with the data.
        if (
          this.rnp_output_memory_get_buf(
            rnp_out,
            result_buf.address(),
            result_len.address(),
            false
          )
        ) {
          throw new Error("rnp_output_memory_get_buf failed");
        } else {
          const uint8_array = ctypes.cast(
            result_buf,
            ctypes.uint8_t.array(result_len.value).ptr
          ).contents;
          // This call creates a copy of the data, it should be
          // safe to destroy rnp_out afterwards.
          u8 = uint8_array.readTypedArray();
        }
        this.rnp_output_destroy(rnp_out);
      }

      u8 = u8 || new Uint8Array();

      await IOUtils.write(path, u8, {
        tmpPath: path + ".tmp-new",
      });
    },

    async saveKeys() {
      if (!this.ffi) {
        return;
      }
      const { pubRingPath, secRingPath } = this.getFilenames();

      const saveThem = async () => {
        await this.saveKeyRing(pubRingPath, this.RNP_LOAD_SAVE_PUBLIC_KEYS);
        await this.saveKeyRing(secRingPath, this.RNP_LOAD_SAVE_SECRET_KEYS);
      };
      const saveBlocker = saveThem();
      IOUtils.profileBeforeChange.addBlocker(
        "OpenPGP: writing out keyring",
        saveBlocker
      );
      await saveBlocker;
      IOUtils.profileBeforeChange.removeBlocker(saveBlocker);
    },

    keep_password_cb_alive: null,

    cached_pw: null,

    /**
     * Past versions of Thunderbird used this callback to provide
     * the automatically managed passphrase to RNP, which was used
     * for all OpenPGP. Nowadays, Thunderbird supports the definition
     * of used-defined passphrase. To better control the unlocking of
     * keys, Thunderbird no longer uses this callback.
     * The application is designed to unlock secret keys as needed,
     * prior to calling the respective RNP APIs.
     * If this callback is reached anyway, it's an internal error,
     * it means that some Thunderbird code hasn't properly unlocked
     * the required key yet.
     *
     * This is a C callback from an external library, so we cannot
     * rely on the usual JS throw mechanism to abort this operation.
     */
    password_cb(ffi, app_ctx, key) {
      const fingerprint = new ctypes.char.ptr();
      let fpStr;
      if (!RNPLib.rnp_key_get_fprint(key, fingerprint.address())) {
        fpStr = "Fingerprint: " + fingerprint.readString();
      }
      RNPLib.rnp_buffer_destroy(fingerprint);

      console.error(`RNP password_cb called unexpectedly; fpStr=${fpStr}`);
      return false;
    },

    // For comparing version numbers
    rnp_version_for: librnp.declare(
      "rnp_version_for",
      abi,
      ctypes.uint32_t,
      ctypes.uint32_t, // major
      ctypes.uint32_t, // minor
      ctypes.uint32_t // patch
    ),

    // Get the library version.
    rnp_version: librnp.declare("rnp_version", abi, ctypes.uint32_t),

    rnp_version_string_full: librnp.declare(
      "rnp_version_string_full",
      abi,
      ctypes.char.ptr
    ),

    // Get a RNP library handle.
    // Mark with leading underscore, to clarify that this function
    // shouldn't be called directly - you should call prepare_ffi().
    _rnp_ffi_create: librnp.declare(
      "rnp_ffi_create",
      abi,
      rnp_result_t,
      rnp_ffi_t.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    rnp_ffi_destroy: librnp.declare(
      "rnp_ffi_destroy",
      abi,
      rnp_result_t,
      rnp_ffi_t
    ),

    rnp_ffi_set_log_fd: librnp.declare(
      "rnp_ffi_set_log_fd",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.int
    ),

    rnp_get_public_key_count: librnp.declare(
      "rnp_get_public_key_count",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.size_t.ptr
    ),

    rnp_get_secret_key_count: librnp.declare(
      "rnp_get_secret_key_count",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.size_t.ptr
    ),

    rnp_input_from_path: librnp.declare(
      "rnp_input_from_path",
      abi,
      rnp_result_t,
      rnp_input_t.ptr,
      ctypes.char.ptr
    ),

    rnp_input_from_memory: librnp.declare(
      "rnp_input_from_memory",
      abi,
      rnp_result_t,
      rnp_input_t.ptr,
      ctypes.uint8_t.ptr,
      ctypes.size_t,
      ctypes.bool
    ),

    rnp_output_to_memory: librnp.declare(
      "rnp_output_to_memory",
      abi,
      rnp_result_t,
      rnp_output_t.ptr,
      ctypes.size_t
    ),

    rnp_output_to_path: librnp.declare(
      "rnp_output_to_path",
      abi,
      rnp_result_t,
      rnp_output_t.ptr,
      ctypes.char.ptr
    ),

    rnp_decrypt: librnp.declare(
      "rnp_decrypt",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      rnp_input_t,
      rnp_output_t
    ),

    rnp_output_memory_get_buf: librnp.declare(
      "rnp_output_memory_get_buf",
      abi,
      rnp_result_t,
      rnp_output_t,
      ctypes.uint8_t.ptr.ptr,
      ctypes.size_t.ptr,
      ctypes.bool
    ),

    rnp_input_destroy: librnp.declare(
      "rnp_input_destroy",
      abi,
      rnp_result_t,
      rnp_input_t
    ),

    rnp_output_destroy: librnp.declare(
      "rnp_output_destroy",
      abi,
      rnp_result_t,
      rnp_output_t
    ),

    rnp_load_keys: librnp.declare(
      "rnp_load_keys",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.char.ptr,
      rnp_input_t,
      ctypes.uint32_t
    ),

    rnp_save_keys: librnp.declare(
      "rnp_save_keys",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.char.ptr,
      rnp_output_t,
      ctypes.uint32_t
    ),

    rnp_ffi_set_pass_provider: librnp.declare(
      "rnp_ffi_set_pass_provider",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      rnp_password_cb_t,
      ctypes.void_t.ptr
    ),

    rnp_identifier_iterator_create: librnp.declare(
      "rnp_identifier_iterator_create",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      rnp_identifier_iterator_t.ptr,
      ctypes.char.ptr
    ),

    rnp_identifier_iterator_next: librnp.declare(
      "rnp_identifier_iterator_next",
      abi,
      rnp_result_t,
      rnp_identifier_iterator_t,
      ctypes.char.ptr.ptr
    ),

    rnp_identifier_iterator_destroy: librnp.declare(
      "rnp_identifier_iterator_destroy",
      abi,
      rnp_result_t,
      rnp_identifier_iterator_t
    ),

    rnp_locate_key: librnp.declare(
      "rnp_locate_key",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.char.ptr,
      ctypes.char.ptr,
      rnp_key_handle_t.ptr
    ),

    rnp_key_handle_destroy: librnp.declare(
      "rnp_key_handle_destroy",
      abi,
      rnp_result_t,
      rnp_key_handle_t
    ),

    rnp_key_allows_usage: librnp.declare(
      "rnp_key_allows_usage",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr,
      ctypes.bool.ptr
    ),

    rnp_key_is_sub: librnp.declare(
      "rnp_key_is_sub",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_is_primary: librnp.declare(
      "rnp_key_is_primary",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_have_secret: librnp.declare(
      "rnp_key_have_secret",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_have_public: librnp.declare(
      "rnp_key_have_public",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_get_fprint: librnp.declare(
      "rnp_key_get_fprint",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_get_keyid: librnp.declare(
      "rnp_key_get_keyid",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_get_alg: librnp.declare(
      "rnp_key_get_alg",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_get_grip: librnp.declare(
      "rnp_key_get_grip",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_get_primary_grip: librnp.declare(
      "rnp_key_get_primary_grip",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_is_revoked: librnp.declare(
      "rnp_key_is_revoked",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_buffer_destroy: librnp.declare(
      "rnp_buffer_destroy",
      abi,
      ctypes.void_t,
      ctypes.void_t.ptr
    ),

    rnp_key_get_subkey_count: librnp.declare(
      "rnp_key_get_subkey_count",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.size_t.ptr
    ),

    rnp_key_get_subkey_at: librnp.declare(
      "rnp_key_get_subkey_at",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.size_t,
      rnp_key_handle_t.ptr
    ),

    rnp_key_get_creation: librnp.declare(
      "rnp_key_get_creation",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_key_get_expiration: librnp.declare(
      "rnp_key_get_expiration",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_key_get_bits: librnp.declare(
      "rnp_key_get_bits",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_key_get_uid_count: librnp.declare(
      "rnp_key_get_uid_count",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.size_t.ptr
    ),

    rnp_key_get_primary_uid: librnp.declare(
      "rnp_key_get_primary_uid",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_get_uid_at: librnp.declare(
      "rnp_key_get_uid_at",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.size_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_get_uid_handle_at: librnp.declare(
      "rnp_key_get_uid_handle_at",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.size_t,
      rnp_uid_handle_t.ptr
    ),

    rnp_uid_handle_destroy: librnp.declare(
      "rnp_uid_handle_destroy",
      abi,
      rnp_result_t,
      rnp_uid_handle_t
    ),

    rnp_uid_is_revoked: librnp.declare(
      "rnp_uid_is_revoked",
      abi,
      rnp_result_t,
      rnp_uid_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_unlock: librnp.declare(
      "rnp_key_unlock",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr
    ),

    rnp_key_lock: librnp.declare(
      "rnp_key_lock",
      abi,
      rnp_result_t,
      rnp_key_handle_t
    ),

    rnp_key_unprotect: librnp.declare(
      "rnp_key_unprotect",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr
    ),

    rnp_key_protect: librnp.declare(
      "rnp_key_protect",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.size_t
    ),

    rnp_key_is_protected: librnp.declare(
      "rnp_key_is_protected",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_is_locked: librnp.declare(
      "rnp_key_is_locked",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_op_generate_create: librnp.declare(
      "rnp_op_generate_create",
      abi,
      rnp_result_t,
      rnp_op_generate_t.ptr,
      rnp_ffi_t,
      ctypes.char.ptr
    ),

    rnp_op_generate_subkey_create: librnp.declare(
      "rnp_op_generate_subkey_create",
      abi,
      rnp_result_t,
      rnp_op_generate_t.ptr,
      rnp_ffi_t,
      rnp_key_handle_t,
      ctypes.char.ptr
    ),

    rnp_op_generate_set_bits: librnp.declare(
      "rnp_op_generate_set_bits",
      abi,
      rnp_result_t,
      rnp_op_generate_t,
      ctypes.uint32_t
    ),

    rnp_op_generate_set_curve: librnp.declare(
      "rnp_op_generate_set_curve",
      abi,
      rnp_result_t,
      rnp_op_generate_t,
      ctypes.char.ptr
    ),

    rnp_op_generate_set_protection_password: librnp.declare(
      "rnp_op_generate_set_protection_password",
      abi,
      rnp_result_t,
      rnp_op_generate_t,
      ctypes.char.ptr
    ),

    rnp_op_generate_set_userid: librnp.declare(
      "rnp_op_generate_set_userid",
      abi,
      rnp_result_t,
      rnp_op_generate_t,
      ctypes.char.ptr
    ),

    rnp_op_generate_set_expiration: librnp.declare(
      "rnp_op_generate_set_expiration",
      abi,
      rnp_result_t,
      rnp_op_generate_t,
      ctypes.uint32_t
    ),

    rnp_op_generate_execute: librnp.declare(
      "rnp_op_generate_execute",
      abi,
      rnp_result_t,
      rnp_op_generate_t
    ),

    rnp_op_generate_get_key: librnp.declare(
      "rnp_op_generate_get_key",
      abi,
      rnp_result_t,
      rnp_op_generate_t,
      rnp_key_handle_t.ptr
    ),

    rnp_op_generate_destroy: librnp.declare(
      "rnp_op_generate_destroy",
      abi,
      rnp_result_t,
      rnp_op_generate_t
    ),

    rnp_guess_contents: librnp.declare(
      "rnp_guess_contents",
      abi,
      rnp_result_t,
      rnp_input_t,
      ctypes.char.ptr.ptr
    ),

    rnp_import_signatures: librnp.declare(
      "rnp_import_signatures",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      rnp_input_t,
      ctypes.uint32_t,
      ctypes.char.ptr.ptr
    ),

    rnp_import_keys: librnp.declare(
      "rnp_import_keys",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      rnp_input_t,
      ctypes.uint32_t,
      ctypes.char.ptr.ptr
    ),

    rnp_key_remove: librnp.declare(
      "rnp_key_remove",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t
    ),

    rnp_uid_remove: librnp.declare(
      "rnp_uid_remove",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      rnp_uid_handle_t
    ),

    rnp_key_remove_signatures: librnp.declare(
      "rnp_key_remove_signatures",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t,
      rnp_key_signatures_cb,
      ctypes.void_t.ptr
    ),

    rnp_op_encrypt_create: librnp.declare(
      "rnp_op_encrypt_create",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t.ptr,
      rnp_ffi_t,
      rnp_input_t,
      rnp_output_t
    ),

    rnp_op_sign_cleartext_create: librnp.declare(
      "rnp_op_sign_cleartext_create",
      abi,
      rnp_result_t,
      rnp_op_sign_t.ptr,
      rnp_ffi_t,
      rnp_input_t,
      rnp_output_t
    ),

    rnp_op_sign_detached_create: librnp.declare(
      "rnp_op_sign_detached_create",
      abi,
      rnp_result_t,
      rnp_op_sign_t.ptr,
      rnp_ffi_t,
      rnp_input_t,
      rnp_output_t
    ),

    rnp_op_encrypt_add_recipient: librnp.declare(
      "rnp_op_encrypt_add_recipient",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      rnp_key_handle_t
    ),

    rnp_op_encrypt_add_signature: librnp.declare(
      "rnp_op_encrypt_add_signature",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      rnp_key_handle_t,
      rnp_op_sign_signature_t.ptr
    ),

    rnp_op_sign_add_signature: librnp.declare(
      "rnp_op_sign_add_signature",
      abi,
      rnp_result_t,
      rnp_op_sign_t,
      rnp_key_handle_t,
      rnp_op_sign_signature_t.ptr
    ),

    rnp_op_encrypt_set_armor: librnp.declare(
      "rnp_op_encrypt_set_armor",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      ctypes.bool
    ),

    rnp_op_sign_set_armor: librnp.declare(
      "rnp_op_sign_set_armor",
      abi,
      rnp_result_t,
      rnp_op_sign_t,
      ctypes.bool
    ),

    rnp_op_encrypt_set_hash: librnp.declare(
      "rnp_op_encrypt_set_hash",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      ctypes.char.ptr
    ),

    rnp_op_sign_set_hash: librnp.declare(
      "rnp_op_sign_set_hash",
      abi,
      rnp_result_t,
      rnp_op_sign_t,
      ctypes.char.ptr
    ),

    rnp_op_encrypt_set_cipher: librnp.declare(
      "rnp_op_encrypt_set_cipher",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      ctypes.char.ptr
    ),

    rnp_op_sign_execute: librnp.declare(
      "rnp_op_sign_execute",
      abi,
      rnp_result_t,
      rnp_op_sign_t
    ),

    rnp_op_sign_destroy: librnp.declare(
      "rnp_op_sign_destroy",
      abi,
      rnp_result_t,
      rnp_op_sign_t
    ),

    rnp_op_encrypt_execute: librnp.declare(
      "rnp_op_encrypt_execute",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t
    ),

    rnp_op_encrypt_destroy: librnp.declare(
      "rnp_op_encrypt_destroy",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t
    ),

    rnp_key_export: librnp.declare(
      "rnp_key_export",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      rnp_output_t,
      ctypes.uint32_t
    ),

    rnp_key_export_revocation: librnp.declare(
      "rnp_key_export_revocation",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      rnp_output_t,
      ctypes.uint32_t,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    rnp_output_to_armor: librnp.declare(
      "rnp_output_to_armor",
      abi,
      rnp_result_t,
      rnp_output_t,
      rnp_output_t.ptr,
      ctypes.char.ptr
    ),

    rnp_output_finish: librnp.declare(
      "rnp_output_finish",
      abi,
      rnp_result_t,
      rnp_output_t
    ),

    rnp_op_verify_create: librnp.declare(
      "rnp_op_verify_create",
      abi,
      rnp_result_t,
      rnp_op_verify_t.ptr,
      rnp_ffi_t,
      rnp_input_t,
      rnp_output_t
    ),

    rnp_op_verify_detached_create: librnp.declare(
      "rnp_op_verify_detached_create",
      abi,
      rnp_result_t,
      rnp_op_verify_t.ptr,
      rnp_ffi_t,
      rnp_input_t,
      rnp_input_t
    ),

    rnp_op_verify_execute: librnp.declare(
      "rnp_op_verify_execute",
      abi,
      rnp_result_t,
      rnp_op_verify_t
    ),

    rnp_op_verify_destroy: librnp.declare(
      "rnp_op_verify_destroy",
      abi,
      rnp_result_t,
      rnp_op_verify_t
    ),

    rnp_op_verify_get_signature_count: librnp.declare(
      "rnp_op_verify_get_signature_count",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.size_t.ptr
    ),

    rnp_op_verify_get_signature_at: librnp.declare(
      "rnp_op_verify_get_signature_at",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.size_t,
      rnp_op_verify_signature_t.ptr
    ),

    rnp_op_verify_signature_get_handle: librnp.declare(
      "rnp_op_verify_signature_get_handle",
      abi,
      rnp_result_t,
      rnp_op_verify_signature_t,
      rnp_signature_handle_t.ptr
    ),

    rnp_op_verify_signature_get_status: librnp.declare(
      "rnp_op_verify_signature_get_status",
      abi,
      rnp_result_t,
      rnp_op_verify_signature_t
    ),

    rnp_op_verify_signature_get_key: librnp.declare(
      "rnp_op_verify_signature_get_key",
      abi,
      rnp_result_t,
      rnp_op_verify_signature_t,
      rnp_key_handle_t.ptr
    ),

    rnp_op_verify_signature_get_times: librnp.declare(
      "rnp_op_verify_signature_get_times",
      abi,
      rnp_result_t,
      rnp_op_verify_signature_t,
      ctypes.uint32_t.ptr,
      ctypes.uint32_t.ptr
    ),

    rnp_uid_get_signature_count: librnp.declare(
      "rnp_uid_get_signature_count",
      abi,
      rnp_result_t,
      rnp_uid_handle_t,
      ctypes.size_t.ptr
    ),

    rnp_uid_get_signature_at: librnp.declare(
      "rnp_uid_get_signature_at",
      abi,
      rnp_result_t,
      rnp_uid_handle_t,
      ctypes.size_t,
      rnp_signature_handle_t.ptr
    ),

    rnp_key_get_signature_count: librnp.declare(
      "rnp_key_get_signature_count",
      abi,
      rnp_result_t,
      rnp_uid_handle_t,
      ctypes.size_t.ptr
    ),

    rnp_key_get_signature_at: librnp.declare(
      "rnp_key_get_signature_at",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.size_t,
      rnp_signature_handle_t.ptr
    ),

    rnp_signature_get_hash_alg: librnp.declare(
      "rnp_signature_get_hash_alg",
      abi,
      rnp_result_t,
      rnp_signature_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_signature_get_creation: librnp.declare(
      "rnp_signature_get_creation",
      abi,
      rnp_result_t,
      rnp_signature_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_signature_get_keyid: librnp.declare(
      "rnp_signature_get_keyid",
      abi,
      rnp_result_t,
      rnp_signature_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_signature_get_signer: librnp.declare(
      "rnp_signature_get_signer",
      abi,
      rnp_result_t,
      rnp_signature_handle_t,
      rnp_key_handle_t.ptr
    ),

    rnp_signature_handle_destroy: librnp.declare(
      "rnp_signature_handle_destroy",
      abi,
      rnp_result_t,
      rnp_signature_handle_t
    ),

    rnp_enarmor: librnp.declare(
      "rnp_enarmor",
      abi,
      rnp_result_t,
      rnp_input_t,
      rnp_output_t,
      ctypes.char.ptr
    ),

    rnp_dearmor: librnp.declare(
      "rnp_dearmor",
      abi,
      rnp_result_t,
      rnp_input_t,
      rnp_output_t
    ),

    rnp_op_verify_get_protection_info: librnp.declare(
      "rnp_op_verify_get_protection_info",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.char.ptr.ptr,
      ctypes.char.ptr.ptr,
      ctypes.bool.ptr
    ),

    rnp_op_verify_get_recipient_count: librnp.declare(
      "rnp_op_verify_get_recipient_count",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.size_t.ptr
    ),

    rnp_op_verify_get_used_recipient: librnp.declare(
      "rnp_op_verify_get_used_recipient",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      rnp_recipient_handle_t.ptr
    ),

    rnp_op_verify_get_recipient_at: librnp.declare(
      "rnp_op_verify_get_recipient_at",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.size_t,
      rnp_recipient_handle_t.ptr
    ),

    rnp_recipient_get_keyid: librnp.declare(
      "rnp_recipient_get_keyid",
      abi,
      rnp_result_t,
      rnp_recipient_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_recipient_get_alg: librnp.declare(
      "rnp_recipient_get_alg",
      abi,
      rnp_result_t,
      rnp_recipient_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_op_verify_get_symenc_count: librnp.declare(
      "rnp_op_verify_get_symenc_count",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.size_t.ptr
    ),

    rnp_op_verify_get_used_symenc: librnp.declare(
      "rnp_op_verify_get_used_symenc",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      rnp_symenc_handle_t.ptr
    ),

    rnp_op_verify_get_symenc_at: librnp.declare(
      "rnp_op_verify_get_symenc_at",
      abi,
      rnp_result_t,
      rnp_op_verify_t,
      ctypes.size_t,
      rnp_symenc_handle_t.ptr
    ),

    rnp_symenc_get_cipher: librnp.declare(
      "rnp_symenc_get_cipher",
      abi,
      rnp_result_t,
      rnp_symenc_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_symenc_get_aead_alg: librnp.declare(
      "rnp_symenc_get_aead_alg",
      abi,
      rnp_result_t,
      rnp_symenc_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_symenc_get_hash_alg: librnp.declare(
      "rnp_symenc_get_hash_alg",
      abi,
      rnp_result_t,
      rnp_symenc_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_symenc_get_s2k_type: librnp.declare(
      "rnp_symenc_get_s2k_type",
      abi,
      rnp_result_t,
      rnp_symenc_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_symenc_get_s2k_iterations: librnp.declare(
      "rnp_symenc_get_s2k_iterations",
      abi,
      rnp_result_t,
      rnp_symenc_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_key_set_expiration: librnp.declare(
      "rnp_key_set_expiration",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t
    ),

    rnp_key_revoke: librnp.declare(
      "rnp_key_revoke",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    rnp_key_export_autocrypt: librnp.declare(
      "rnp_key_export_autocrypt",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      rnp_key_handle_t,
      ctypes.char.ptr,
      rnp_output_t,
      ctypes.uint32_t
    ),

    rnp_key_valid_till: librnp.declare(
      "rnp_key_valid_till",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_key_valid_till64: librnp.declare(
      "rnp_key_valid_till64",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.uint64_t.ptr
    ),

    rnp_uid_is_valid: librnp.declare(
      "rnp_uid_is_valid",
      abi,
      rnp_result_t,
      rnp_uid_handle_t,
      ctypes.bool.ptr
    ),

    rnp_uid_is_primary: librnp.declare(
      "rnp_uid_is_primary",
      abi,
      rnp_result_t,
      rnp_uid_handle_t,
      ctypes.bool.ptr
    ),

    rnp_signature_is_valid: librnp.declare(
      "rnp_signature_is_valid",
      abi,
      rnp_result_t,
      rnp_signature_handle_t,
      ctypes.uint32_t
    ),

    rnp_key_get_protection_type: librnp.declare(
      "rnp_key_get_protection_type",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_output_armor_set_line_length: librnp.declare(
      "rnp_output_armor_set_line_length",
      abi,
      rnp_result_t,
      rnp_output_t,
      ctypes.size_t
    ),

    rnp_key_25519_bits_tweaked: librnp.declare(
      "rnp_key_25519_bits_tweaked",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.bool.ptr
    ),

    rnp_key_25519_bits_tweak: librnp.declare(
      "rnp_key_25519_bits_tweak",
      abi,
      rnp_result_t,
      rnp_key_handle_t
    ),

    rnp_key_get_curve: librnp.declare(
      "rnp_key_get_curve",
      abi,
      rnp_result_t,
      rnp_key_handle_t,
      ctypes.char.ptr.ptr
    ),

    rnp_get_security_rule: librnp.declare(
      "rnp_get_security_rule",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.uint64_t,
      ctypes.uint32_t.ptr,
      ctypes.uint64_t.ptr,
      ctypes.uint32_t.ptr
    ),

    rnp_add_security_rule: librnp.declare(
      "rnp_add_security_rule",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.uint32_t,
      ctypes.uint64_t,
      ctypes.uint32_t
    ),

    rnp_op_encrypt_set_aead: librnp.declare(
      "rnp_op_encrypt_set_aead",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      ctypes.char.ptr
    ),

    rnp_op_encrypt_set_flags: librnp.declare(
      "rnp_op_encrypt_set_flags",
      abi,
      rnp_result_t,
      rnp_op_encrypt_t,
      ctypes.uint32_t
    ),

    rnp_dump_packets_to_output: librnp.declare(
      "rnp_dump_packets_to_output",
      abi,
      rnp_result_t,
      rnp_input_t,
      rnp_output_t,
      ctypes.uint32_t
    ),

    rnp_signature_get_features: librnp.declare(
      "rnp_signature_get_features",
      abi,
      rnp_result_t,
      rnp_signature_handle_t,
      ctypes.uint32_t.ptr
    ),

    rnp_result_t,
    rnp_ffi_t,
    rnp_password_cb_t,
    rnp_input_t,
    rnp_output_t,
    rnp_key_handle_t,
    rnp_uid_handle_t,
    rnp_identifier_iterator_t,
    rnp_op_generate_t,
    rnp_op_encrypt_t,
    rnp_op_sign_t,
    rnp_op_sign_signature_t,
    rnp_op_verify_t,
    rnp_op_verify_signature_t,
    rnp_signature_handle_t,
    rnp_recipient_handle_t,
    rnp_symenc_handle_t,

    RNP_LOAD_SAVE_PUBLIC_KEYS: 1,
    RNP_LOAD_SAVE_SECRET_KEYS: 2,
    RNP_LOAD_SAVE_PERMISSIVE: 256,

    RNP_KEY_REMOVE_PUBLIC: 1,
    RNP_KEY_REMOVE_SECRET: 2,
    RNP_KEY_REMOVE_SUBKEYS: 4,

    RNP_KEY_EXPORT_ARMORED: 1,
    RNP_KEY_EXPORT_PUBLIC: 2,
    RNP_KEY_EXPORT_SECRET: 4,
    RNP_KEY_EXPORT_SUBKEYS: 8,

    RNP_KEY_SIGNATURE_NON_SELF_SIG: 4,

    RNP_SUCCESS: 0x00000000,

    RNP_FEATURE_SYMM_ALG: "symmetric algorithm",
    RNP_FEATURE_HASH_ALG: "hash algorithm",
    RNP_FEATURE_PK_ALG: "public key algorithm",
    RNP_ALGNAME_MD5: "MD5",
    RNP_ALGNAME_SHA1: "SHA1",
    RNP_ALGNAME_SM2: "SM2",
    RNP_ALGNAME_SM3: "SM3",
    RNP_ALGNAME_SM4: "SM4",

    RNP_SECURITY_OVERRIDE: 1,
    RNP_SECURITY_VERIFY_KEY: 2,
    RNP_SECURITY_VERIFY_DATA: 4,
    RNP_SECURITY_REMOVE_ALL: 65536,

    RNP_SECURITY_PROHIBITED: 0,
    RNP_SECURITY_INSECURE: 1,
    RNP_SECURITY_DEFAULT: 2,

    RNP_ENCRYPT_NOWRAP: 1,

    PGP_KEY_FEATURE_MDC: 1,
    PGP_KEY_FEATURE_AEAD: 2,
    PGP_KEY_FEATURE_V5: 4,

    /* Common error codes */
    RNP_ERROR_GENERIC: 0x10000000, // 268435456
    RNP_ERROR_BAD_FORMAT: 0x10000001, // 268435457
    RNP_ERROR_BAD_PARAMETERS: 0x10000002, // 268435458
    RNP_ERROR_NOT_IMPLEMENTED: 0x10000003, // 268435459
    RNP_ERROR_NOT_SUPPORTED: 0x10000004, // 268435460
    RNP_ERROR_OUT_OF_MEMORY: 0x10000005, // 268435461
    RNP_ERROR_SHORT_BUFFER: 0x10000006, // 268435462
    RNP_ERROR_NULL_POINTER: 0x10000007, // 268435463

    /* Storage */
    RNP_ERROR_ACCESS: 0x11000000, // 285212672
    RNP_ERROR_READ: 0x11000001, // 285212673
    RNP_ERROR_WRITE: 0x11000002, // 285212674

    /* Crypto */
    RNP_ERROR_BAD_STATE: 0x12000000, // 301989888
    RNP_ERROR_MAC_INVALID: 0x12000001, // 301989889
    RNP_ERROR_SIGNATURE_INVALID: 0x12000002, // 301989890
    RNP_ERROR_KEY_GENERATION: 0x12000003, // 301989891
    RNP_ERROR_BAD_PASSWORD: 0x12000004, // 301989892
    RNP_ERROR_KEY_NOT_FOUND: 0x12000005, // 301989893
    RNP_ERROR_NO_SUITABLE_KEY: 0x12000006, // 301989894
    RNP_ERROR_DECRYPT_FAILED: 0x12000007, // 301989895
    RNP_ERROR_RNG: 0x12000008, // 301989896
    RNP_ERROR_SIGNING_FAILED: 0x12000009, // 301989897
    RNP_ERROR_NO_SIGNATURES_FOUND: 0x1200000a, // 301989898

    RNP_ERROR_SIGNATURE_EXPIRED: 0x1200000b, // 301989899

    /* Parsing */
    RNP_ERROR_NOT_ENOUGH_DATA: 0x13000000, // 318767104
    RNP_ERROR_UNKNOWN_TAG: 0x13000001, // 318767105
    RNP_ERROR_PACKET_NOT_CONSUMED: 0x13000002, // 318767106
    RNP_ERROR_NO_USERID: 0x13000003, // 318767107
    RNP_ERROR_EOF: 0x13000004, // 318767108
  };
}
