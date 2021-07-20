/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["GPGMELibLoader"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ctypes: "resource://gre/modules/ctypes.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

var systemOS = Services.appinfo.OS.toLowerCase();
var abi = ctypes.default_abi;

// Default libary paths to look for on macOS
const ADDITIONAL_LIB_PATHS = ["/usr/local/lib", "/opt/local/lib", "/opt/homebrew/lib"];

// Open libgpgme. Determine the path to the chrome directory and look for it
// there first. If not, fallback to searching the standard locations.
var libgpgme, libgpgmePath;

function tryLoadGPGME(name, suffix) {
  let filename = ctypes.libraryName(name) + suffix;
  let binPath = Services.dirsvc.get("XpcomLib", Ci.nsIFile).path;
  let binDir = PathUtils.parent(binPath);
  libgpgmePath = PathUtils.join(binDir, filename);

  let loadFromInfo;

  try {
    loadFromInfo = libgpgmePath;
    libgpgme = ctypes.open(libgpgmePath);
  } catch (e) {}

  if (!libgpgme) {
    try {
      loadFromInfo = "system's standard library locations";
      // look in standard locations
      libgpgmePath = filename;
      libgpgme = ctypes.open(libgpgmePath);
    } catch (e) {}
  }

  if (!libgpgme && systemOS !== "winnt") {
    // try specific additional directories

    for (let tryPath of ADDITIONAL_LIB_PATHS) {
      try {
        loadFromInfo = "additional standard locations";
        libgpgmePath = tryPath + "/" + filename;
        libgpgme = ctypes.open(libgpgmePath);

        if (libgpgme) {
          break;
        }
      } catch (e) {}
    }
  }

  if (libgpgme) {
    console.debug(
      "Successfully loaded optional OpenPGP library " +
        filename +
        " from " +
        loadFromInfo
    );
  }
}

function loadExternalGPGMELib() {
  if (!libgpgme) {
    if (systemOS === "winnt") {
      tryLoadGPGME("libgpgme-11", "");

      if (!libgpgme) {
        tryLoadGPGME("gpgme-11", "");
      }
    }

    if (!libgpgme) {
      tryLoadGPGME("gpgme", "");
    }

    if (!libgpgme) {
      tryLoadGPGME("gpgme", ".11");
    }

    if (!libgpgme) {
      tryLoadGPGME("gpgme.11");
    }
  }

  return !!libgpgme;
}

var GPGMELibLoader = {
  init() {
    if (!loadExternalGPGMELib()) {
      return null;
    }
    if (libgpgme) {
      enableGPGMELibJS();
    }
    return GPGMELib;
  },
};

const gpgme_error_t = ctypes.unsigned_int;
const gpgme_ctx_t = ctypes.void_t.ptr;
const gpgme_data_t = ctypes.void_t.ptr;
const gpgme_validity_t = ctypes.int;
const gpgme_keylist_mode_t = ctypes.unsigned_int;
const gpgme_protocol_t = ctypes.int;
const gpgme_pubkey_algo_t = ctypes.int;
const gpgme_sig_notation_flags_t = ctypes.unsigned_int;
const gpgme_export_mode_t = ctypes.unsigned_int;
const gpgme_decrypt_flags_t = ctypes.unsigned_int;
const gpgme_data_encoding_t = ctypes.unsigned_int;
const gpgme_sig_mode_t = ctypes.int; // it's an enum, risk of wrong type.

let _gpgme_subkey = ctypes.StructType("_gpgme_subkey");
_gpgme_subkey.define([
  { next: _gpgme_subkey.ptr },
  { bitfield: ctypes.unsigned_int },
  { pubkey_algo: gpgme_pubkey_algo_t },
  { length: ctypes.unsigned_int },
  { keyid: ctypes.char.ptr },
  { _keyid: ctypes.char.array(17) },
  { fpr: ctypes.char.ptr },
  { timestamp: ctypes.long },
  { expires: ctypes.long },
  { card_number: ctypes.char.ptr },
  { curve: ctypes.char.ptr },
  { keygrip: ctypes.char.ptr },
]);
let gpgme_subkey_t = _gpgme_subkey.ptr;

let _gpgme_sig_notation = ctypes.StructType("_gpgme_sig_notation");
_gpgme_sig_notation.define([
  { next: _gpgme_sig_notation.ptr },
  { name: ctypes.char.ptr },
  { value: ctypes.char.ptr },
  { name_len: ctypes.int },
  { value_len: ctypes.int },
  { flags: gpgme_sig_notation_flags_t },
  { bitfield: ctypes.unsigned_int },
]);
let gpgme_sig_notation_t = _gpgme_sig_notation.ptr;

let _gpgme_key_sig = ctypes.StructType("_gpgme_key_sig");
_gpgme_key_sig.define([
  { next: _gpgme_key_sig.ptr },
  { bitfield: ctypes.unsigned_int },
  { pubkey_algo: gpgme_pubkey_algo_t },
  { keyid: ctypes.char.ptr },
  { _keyid: ctypes.char.array(17) },
  { timestamp: ctypes.long },
  { expires: ctypes.long },
  { status: gpgme_error_t },
  { class_: ctypes.unsigned_int },
  { uid: ctypes.char.ptr },
  { name: ctypes.char.ptr },
  { email: ctypes.char.ptr },
  { comment: ctypes.char.ptr },
  { sig_class: ctypes.unsigned_int },
  { notations: gpgme_sig_notation_t },
  { last_notation: gpgme_sig_notation_t },
]);
let gpgme_key_sig_t = _gpgme_key_sig.ptr;

let _gpgme_tofu_info = ctypes.StructType("_gpgme_tofu_info");
_gpgme_tofu_info.define([
  { next: _gpgme_tofu_info.ptr },
  { bitfield: ctypes.unsigned_int },
  { signcount: ctypes.unsigned_short },
  { encrcount: ctypes.unsigned_short },
  { signfirst: ctypes.unsigned_short },
  { signlast: ctypes.unsigned_short },
  { encrfirst: ctypes.unsigned_short },
  { encrlast: ctypes.unsigned_short },
  { description: ctypes.char.ptr },
]);
let gpgme_tofu_info_t = _gpgme_tofu_info.ptr;

let _gpgme_user_id = ctypes.StructType("_gpgme_user_id");
_gpgme_user_id.define([
  { next: _gpgme_user_id.ptr },
  { bitfield: ctypes.unsigned_int },
  { validity: gpgme_validity_t },
  { uid: ctypes.char.ptr },
  { name: ctypes.char.ptr },
  { email: ctypes.char.ptr },
  { comment: ctypes.char.ptr },
  { signatures: gpgme_key_sig_t },
  { _last_keysig: gpgme_key_sig_t },
  { address: ctypes.char.ptr },
  { tofu: gpgme_tofu_info_t },
  { last_update: ctypes.unsigned_long },
]);
let gpgme_user_id_t = _gpgme_user_id.ptr;

let _gpgme_key = ctypes.StructType("gpgme_key_t", [
  { _refs: ctypes.unsigned_int },
  { bitfield: ctypes.unsigned_int },
  { protocol: gpgme_protocol_t },
  { issuer_serial: ctypes.char.ptr },
  { issuer_name: ctypes.char.ptr },
  { chain_id: ctypes.char.ptr },
  { owner_trust: gpgme_validity_t },
  { subkeys: gpgme_subkey_t },
  { uids: gpgme_user_id_t },
  { _last_subkey: gpgme_subkey_t },
  { _last_uid: gpgme_user_id_t },
  { keylist_mode: gpgme_keylist_mode_t },
  { fpr: ctypes.char.ptr },
  { last_update: ctypes.unsigned_long },
]);
let gpgme_key_t = _gpgme_key.ptr;

var GPGMELib;

function enableGPGMELibJS() {
  // this must be delayed until after "libgpgme" is initialized

  GPGMELib = {
    path: libgpgmePath,

    init() {
      // GPGME 1.9.0 released 2017-03-28 is the first version that
      // supports GPGME_DECRYPT_UNWRAP, requiring >= gpg 2.1.12
      let versionPtr = this.gpgme_check_version("1.9.0");
      let version = versionPtr.readString();
      console.debug("gpgme version: " + version);

      let gpgExe = Services.prefs.getStringPref(
        "mail.openpgp.alternative_gpg_path"
      );
      if (!gpgExe) {
        return true;
      }

      let extResult = this.gpgme_set_engine_info(
        this.GPGME_PROTOCOL_OpenPGP,
        gpgExe,
        null
      );
      let success = extResult === this.GPG_ERR_NO_ERROR;
      let info = success ? "success" : "failure: " + extResult;
      console.debug(
        "configuring GPGME to use an external OpenPGP engine " +
          gpgExe +
          " - " +
          info
      );
      return success;
    },

    exportKeys(pattern, secret = false) {
      let resultArray = [];
      let allFingerprints = [];

      let c1 = new gpgme_ctx_t();
      if (this.gpgme_new(c1.address())) {
        throw new Error("gpgme_new failed");
      }

      if (this.gpgme_op_keylist_start(c1, pattern, secret ? 1 : 0)) {
        throw new Error("gpgme_op_keylist_start failed");
      }

      do {
        let key = new gpgme_key_t();
        let rv = this.gpgme_op_keylist_next(c1, key.address());
        if (rv & GPGMELib.GPG_ERR_EOF) {
          break;
        } else if (rv) {
          throw new Error("gpgme_op_keylist_next failed: " + rv);
        }

        if (key.contents.protocol == GPGMELib.GPGME_PROTOCOL_OpenPGP) {
          let fpr = key.contents.fpr.readString();
          allFingerprints.push(fpr);
        }
        this.gpgme_key_release(key);
      } while (true);

      if (this.gpgme_op_keylist_end(c1)) {
        throw new Error("gpgme_op_keylist_end failed");
      }

      this.gpgme_release(c1);

      for (let aFpr of allFingerprints) {
        let c2 = new gpgme_ctx_t();
        if (this.gpgme_new(c2.address())) {
          throw new Error("gpgme_new failed");
        }

        this.gpgme_set_armor(c2, 1);

        let data = new gpgme_data_t();
        let rv = this.gpgme_data_new(data.address());
        if (rv) {
          throw new Error("gpgme_op_keylist_next gpgme_data_new: " + rv);
        }

        rv = this.gpgme_op_export(
          c2,
          aFpr,
          secret ? GPGMELib.GPGME_EXPORT_MODE_SECRET : 0,
          data
        );
        if (rv) {
          throw new Error("gpgme_op_export gpgme_data_new: " + rv);
        }

        let result_len = new ctypes.size_t();
        let result_buf = this.gpgme_data_release_and_get_mem(
          data,
          result_len.address()
        );

        let keyData = ctypes.cast(
          result_buf,
          ctypes.char.array(result_len.value).ptr
        ).contents;

        resultArray.push(keyData.readString());

        this.gpgme_free(result_buf);
        this.gpgme_release(c2);
      }
      return resultArray;
    },

    gpgme_check_version: libgpgme.declare(
      "gpgme_check_version",
      abi,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    gpgme_set_engine_info: libgpgme.declare(
      "gpgme_set_engine_info",
      abi,
      gpgme_error_t,
      gpgme_protocol_t,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    gpgme_new: libgpgme.declare("gpgme_new", abi, gpgme_error_t, gpgme_ctx_t),

    gpgme_release: libgpgme.declare(
      "gpgme_release",
      abi,
      ctypes.void_t,
      gpgme_ctx_t
    ),

    gpgme_key_release: libgpgme.declare(
      "gpgme_key_release",
      abi,
      ctypes.void_t,
      gpgme_key_t
    ),

    gpgme_op_keylist_start: libgpgme.declare(
      "gpgme_op_keylist_start",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      ctypes.char.ptr,
      ctypes.int
    ),

    gpgme_op_keylist_next: libgpgme.declare(
      "gpgme_op_keylist_next",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      gpgme_key_t.ptr
    ),

    gpgme_op_keylist_end: libgpgme.declare(
      "gpgme_op_keylist_end",
      abi,
      gpgme_error_t,
      gpgme_ctx_t
    ),

    gpgme_op_export: libgpgme.declare(
      "gpgme_op_export",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      ctypes.char.ptr,
      gpgme_export_mode_t,
      gpgme_data_t
    ),

    gpgme_set_armor: libgpgme.declare(
      "gpgme_set_armor",
      abi,
      ctypes.void_t,
      gpgme_ctx_t,
      ctypes.int
    ),

    gpgme_data_new: libgpgme.declare(
      "gpgme_data_new",
      abi,
      gpgme_error_t,
      gpgme_data_t.ptr
    ),

    gpgme_data_release: libgpgme.declare(
      "gpgme_data_release",
      abi,
      ctypes.void_t,
      gpgme_data_t
    ),

    gpgme_data_release_and_get_mem: libgpgme.declare(
      "gpgme_data_release_and_get_mem",
      abi,
      ctypes.char.ptr,
      gpgme_data_t,
      ctypes.size_t.ptr
    ),

    gpgme_free: libgpgme.declare(
      "gpgme_free",
      abi,
      ctypes.void_t,
      ctypes.void_t.ptr
    ),

    gpgme_op_decrypt_ext: libgpgme.declare(
      "gpgme_op_decrypt_ext",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      gpgme_decrypt_flags_t,
      gpgme_data_t,
      gpgme_data_t
    ),

    gpgme_data_new_from_mem: libgpgme.declare(
      "gpgme_data_new_from_mem",
      abi,
      gpgme_error_t,
      gpgme_data_t.ptr,
      ctypes.char.ptr,
      ctypes.size_t,
      ctypes.int
    ),

    gpgme_data_read: libgpgme.declare(
      "gpgme_data_read",
      abi,
      ctypes.ssize_t,
      gpgme_data_t,
      ctypes.void_t.ptr,
      ctypes.size_t
    ),

    gpgme_data_rewind: libgpgme.declare(
      "gpgme_data_rewind",
      abi,
      gpgme_error_t,
      gpgme_data_t
    ),

    gpgme_data_get_encoding: libgpgme.declare(
      "gpgme_data_get_encoding",
      abi,
      gpgme_data_encoding_t,
      gpgme_data_t
    ),

    gpgme_data_set_encoding: libgpgme.declare(
      "gpgme_data_set_encoding",
      abi,
      gpgme_error_t,
      gpgme_data_t,
      gpgme_data_encoding_t
    ),

    gpgme_op_sign: libgpgme.declare(
      "gpgme_op_sign",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      gpgme_data_t,
      gpgme_data_t,
      gpgme_sig_mode_t
    ),

    gpgme_signers_add: libgpgme.declare(
      "gpgme_signers_add",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      gpgme_key_t
    ),

    gpgme_get_key: libgpgme.declare(
      "gpgme_get_key",
      abi,
      gpgme_error_t,
      gpgme_ctx_t,
      ctypes.char.ptr,
      gpgme_key_t.ptr,
      ctypes.int
    ),

    gpgme_set_textmode: libgpgme.declare(
      "gpgme_set_textmode",
      abi,
      ctypes.void_t,
      gpgme_ctx_t,
      ctypes.int
    ),

    gpgme_error_t,
    gpgme_ctx_t,
    gpgme_data_t,
    gpgme_validity_t,
    gpgme_keylist_mode_t,
    gpgme_pubkey_algo_t,
    gpgme_sig_notation_flags_t,
    gpgme_export_mode_t,
    gpgme_decrypt_flags_t,
    gpgme_data_encoding_t,

    gpgme_protocol_t,
    gpgme_subkey_t,
    gpgme_sig_notation_t,
    gpgme_key_sig_t,
    gpgme_tofu_info_t,
    gpgme_user_id_t,
    gpgme_key_t,

    GPG_ERR_NO_ERROR: 0x00000000,
    GPG_ERR_EOF: 16383,
    GPGME_PROTOCOL_OpenPGP: 0,
    GPGME_EXPORT_MODE_SECRET: 16,
    GPGME_DECRYPT_UNWRAP: 128,
    GPGME_DATA_ENCODING_ARMOR: 3,
    GPGME_SIG_MODE_DETACH: 1,
  };
}
