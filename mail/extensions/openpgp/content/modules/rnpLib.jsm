/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var systemOS = Services.appinfo.OS.toLowerCase();
const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
var abi = ctypes.default_abi;
const EnigmailApp = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
).EnigmailApp;
var OpenPGPMasterpass = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
).OpenPGPMasterpass;

// Open librnp. Determine the path to the chrome directory and look for it
// there first. If not, fallback to searching the standard locations.
var librnp, librnpPath;

function tryLoadRNP(name, suffix) {
  let filename = ctypes.libraryName(name) + suffix;
  let binPath = Services.dirsvc.get("XpcomLib", Ci.nsIFile).path;
  let binDir = OS.Path.dirname(binPath);
  librnpPath = OS.Path.join(binDir, filename);

  try {
    console.log("===> trying to load " + librnpPath);
    librnp = ctypes.open(librnpPath);
  } catch (e) {}

  if (!librnp) {
    try {
      // look in standard locations
      librnpPath = filename;
      console.log(
        "===> trying to load " +
          librnpPath +
          " from system's standard locations"
      );
      librnp = ctypes.open(librnpPath);
      console.log("===> successfully loaded " + librnpPath);
    } catch (e) {}
  }
}

function loadExternalRNPLib() {
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

  if (!librnp) {
    tryLoadRNP("rnp", "");
  }
}

var RNPLibLoader = {
  init() {
    loadExternalRNPLib();
    if (librnp) {
      enableRNPLibJS();
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

const rnp_password_cb_t = ctypes.FunctionType(abi, ctypes.bool, [
  rnp_ffi_t,
  ctypes.void_t.ptr,
  rnp_key_handle_t,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.size_t,
]).ptr;

var RNPLib;

function enableRNPLibJS() {
  // this must be delayed until after "librnp" is initialized

  RNPLib = {
    path: librnpPath,

    ffi: null,
    
    getFilenames() {
      let names = {};

      let secFile = EnigmailApp.getProfileDirectory();
      secFile.append("secring.gpg");
      let pubFile = EnigmailApp.getProfileDirectory();
      pubFile.append("pubring.gpg");
      
      names.secring = secFile.path;
      names.pubring = pubFile.path;

      return names;
    },
    
    init() {
      console.log("===> RNPLib.init()\n");

      this.ffi = new rnp_ffi_t;
      if (this.rnp_ffi_create(this.ffi.address(), "GPG", "GPG")) {
        throw new Error("Couldn't initialize librnp.");
      }

      this.keep_password_cb_alive = rnp_password_cb_t(
        this.password_cb,
        this, // this value used while executing callback
        false // callback return value if exception is thrown
      );
      this.rnp_ffi_set_pass_provider(
        this.ffi,
        this.keep_password_cb_alive,
        null
      );

      let filenames = this.getFilenames();

      let input_from_path = new rnp_input_t;
      this.rnp_input_from_path(input_from_path.address(), filenames.pubring);
      this.rnp_load_keys(
        this.ffi,
        "GPG",
        input_from_path,
        this.RNP_LOAD_SAVE_PUBLIC_KEYS
      );
      this.rnp_input_destroy(input_from_path);

      let in2 = new rnp_input_t;

      this.rnp_input_from_path(in2.address(), filenames.secring);
      this.rnp_load_keys(this.ffi, "GPG", in2, this.RNP_LOAD_SAVE_SECRET_KEYS);
      this.rnp_input_destroy(in2);

      input_from_path = null;
      in2 = null;

      let pubnum = new ctypes.size_t;
      this.rnp_get_public_key_count(this.ffi, pubnum.address());

      let secnum = new ctypes.size_t;
      this.rnp_get_secret_key_count(this.ffi, secnum.address());

      console.log("public keys: " + pubnum + ", secret keys: " + secnum);
      console.log(
        "public keys: " + pubnum.value + ", secret keys: " + secnum.value
      );

      /*
      if (this.rnp_ffi_destroy(this.ffi)) {
        throw new Error("Couldn't destroy librnp.");
      }
      */
      return true;
    },
    
    saveKeys() {
      let filenames = this.getFilenames();

      let rv;
      let output_to_path = new rnp_output_t;
      rv = this.rnp_output_to_path(output_to_path.address(), filenames.pubring);
      rv = this.rnp_save_keys(
        this.ffi,
        "GPG",
        output_to_path,
        this.RNP_LOAD_SAVE_PUBLIC_KEYS
      );
      this.rnp_output_destroy(output_to_path);

      let out2 = new rnp_output_t;

      rv = this.rnp_output_to_path(out2.address(), filenames.secring);
      rv = this.rnp_save_keys(this.ffi, "GPG", out2, this.RNP_LOAD_SAVE_SECRET_KEYS);
      this.rnp_output_destroy(out2);

      output_to_path = null;
      out2 = null;
    },

    keep_password_cb_alive: null,

    password_cb(ffi, app_ctx, key, pgp_context, buf, buf_len) {
      console.log(
        "in RNPLib.password_cb, context: " + pgp_context.readString()
      );
      console.log("max_len: " + buf_len);
      
      let pass = OpenPGPMasterpass.retrieveOpenPGPPassword();
      var passCTypes = ctypes.char.array()(pass); // UTF-8
      let passLen = passCTypes.length;

      if (buf_len < passLen) {
        return false;
      }

      let char_array = ctypes.cast(buf, ctypes.char.array(buf_len).ptr)
        .contents;

      let i;
      for (i = 0; i < passLen; ++i) {
        char_array[i] = passCTypes[i];
      }
      char_array[passLen] = 0;
      return true;
    },

    // Get a RNP library handle.
    rnp_ffi_create: librnp.declare(
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
      rnp_op_generate_t,
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
      rnp_op_generate_t,
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

    rnp_result_t,
    rnp_ffi_t,
    rnp_password_cb_t,
    rnp_input_t,
    rnp_output_t,
    rnp_key_handle_t,
    rnp_uid_handle_t,
    rnp_identifier_iterator_t,
    rnp_op_generate_t,
    
    RNP_LOAD_SAVE_PUBLIC_KEYS: 1,
    
    RNP_LOAD_SAVE_SECRET_KEYS: 2,
    
    RNP_KEY_REMOVE_PUBLIC: 1,
    
    RNP_KEY_REMOVE_SECRET: 2,

  };
}

// exports

this.EXPORTED_SYMBOLS = ["RNPLibLoader"];
