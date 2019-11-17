/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const { RNPLibLoader } = ChromeUtils.import(
  "chrome://openpgp/content/modules/rnpLib.jsm"
);

// rnp module

var RNPLib;

var RNP = {
  hasRan: false,
  libLoaded: false,
  once() {
    this.hasRan = true;
    try {
      RNPLib = RNPLibLoader.init();
      if (!RNPLib) {
        return;
      }
      if (RNPLib && RNPLib.init()) {
        //this.initUiOps();
        RNP.libLoaded = true;
      }
    } catch (e) {
      console.log(e);
    }
  },

  init(opts) {
    opts = opts || {};

    if (!this.hasRan) {
      this.once();
    }

    if (!RNP.libLoaded) {
      console.log("failed to load RNP library");
    }
  },

  decrypt(encrypted, options) {
    let input_from_memory = new RNPLib.rnp_input_t;

    /*
    let uint8_array_type = ctypes.ArrayType(ctypes.uint8_t);
    let encrypted_array = uint8_array_type(encrypted.length + 1);
    
    for (let i = 0; i < encrypted.length; i++) {
      encrypted_array[i] = encrypted.charCodeAt(i);
    }
    encrypted_array[encrypted.length] = 0;
    */

    var tmp_array = ctypes.char.array()(encrypted);
    var encrypted_array = ctypes.cast(
      tmp_array,
      ctypes.uint8_t.array(encrypted.length)
    );

    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      encrypted_array,
      encrypted.length,
      false
    );

    let max_out = encrypted.length * 2;

    let output_to_memory = new RNPLib.rnp_output_t;
    RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

    let result = {};
    result.decryptedData = "";

    result.exitCode = RNPLib.rnp_decrypt(
      RNPLib.ffi,
      input_from_memory,
      output_to_memory
    );
    console.log("decrypt exit code: " + result.exitCode);

    if (!result.exitCode) {
      let result_buf = new ctypes.uint8_t.ptr();
      let result_len = new ctypes.size_t();
      result.exitCode = RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      );
      console.log("decrypt get buffer result code: " + result.exitCode);

      if (!result.exitCode) {
        console.log("decrypt result len: " + result_len.value);
        //let buf_array = ctypes.cast(result_buf, ctypes.uint8_t.array(result_len.value).ptr).contents;
        //let char_array = ctypes.cast(buf_array, ctypes.char.array(result_len.value));

        let char_array = ctypes.cast(
          result_buf,
          ctypes.char.array(result_len.value).ptr
        ).contents;

        result.decryptedData = char_array.readString();
        console.log(result.decryptedData);
      }
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);

    return result;
  },
};

// exports

this.EXPORTED_SYMBOLS = ["RNP"];
