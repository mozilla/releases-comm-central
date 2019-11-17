/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var systemOS = Services.appinfo.OS.toLowerCase();
const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
var abi = ctypes.default_abi;

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

const rnp_password_cb_t = ctypes.FunctionType(abi, ctypes.bool, [
  rnp_ffi_t,
  ctypes.void_t.ptr,
  rnp_key_handle_t,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.size_t,
]).ptr;

const RNP_LOAD_SAVE_PUBLIC_KEYS = 1;
const RNP_LOAD_SAVE_SECRET_KEYS = 2;

var RNPLib;

function enableRNPLibJS() {
  // this must be delayed until after "librnp" is initialized

  RNPLib = {
    path: librnpPath,

    ffi: null,

    init() {
      console.log("===> RNPLib.init()\n");

      this.ffi = new rnp_ffi_t;
      if (this.rnp_ffi_create(this.ffi.address(), "GPG", "GPG")) {
        throw new Error("Couldn't initialize librnp.");
      }

      this.keep_password_cb_alive = rnp_password_cb_t(
        this.password_cb,
        this,
        false
      );
      this.rnp_ffi_set_pass_provider(
        this.ffi,
        this.keep_password_cb_alive,
        null
      );

      let input_from_path = new rnp_input_t;

      this.rnp_input_from_path(
        input_from_path.address(),
        "/home/user/.rnp/pubring.gpg"
      );
      this.rnp_load_keys(
        this.ffi,
        "GPG",
        input_from_path,
        RNP_LOAD_SAVE_PUBLIC_KEYS
      );
      this.rnp_input_destroy(input_from_path);

      let in2 = new rnp_input_t;

      this.rnp_input_from_path(in2.address(), "/home/user/.rnp/secring.gpg");
      this.rnp_load_keys(this.ffi, "GPG", in2, RNP_LOAD_SAVE_SECRET_KEYS);
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

    keep_password_cb_alive: null,

    password_cb(ffi, app_ctx, key, pgp_context, buf, buf_len) {
      console.log(
        "in RNPLib.password_cb, context: " + pgp_context.readString()
      );
      //console.log("max_len: " + buf_len);
      //console.log(buf);

      /*
      let char_array = ctypes.cast(buf, ctypes.char.array(buf_len).ptr)
        .contents;
      */
      //char_array[0] = 0;
      //console.log(char_array.readString());

      //buf[0] = 0;
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
      rnp_input_t
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

    rnp_ffi_set_pass_provider: librnp.declare(
      "rnp_ffi_set_pass_provider",
      abi,
      rnp_result_t,
      rnp_ffi_t,
      rnp_password_cb_t,
      ctypes.void_t.ptr
    ),

    rnp_password_cb_t,

    rnp_input_t,

    rnp_output_t,

    rnp_key_handle_t,

    rnp_result_t,

    rnp_ffi_t,
  };
}

// exports

this.EXPORTED_SYMBOLS = ["RNPLibLoader"];
