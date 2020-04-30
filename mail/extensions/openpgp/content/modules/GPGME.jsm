/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["GPGME"];

var { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
var { GPGMELibLoader } = ChromeUtils.import(
  "chrome://openpgp/content/modules/GPGMELib.jsm"
);

var GPGMELib;

var GPGME = {
  hasRan: false,
  libLoaded: false,
  once() {
    this.hasRan = true;
    try {
      GPGMELib = GPGMELibLoader.init();
      if (!GPGMELib) {
        return;
      }
      if (GPGMELib && GPGMELib.init()) {
        GPGME.libLoaded = true;
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

    return GPGME.libLoaded;
  },

  allDependenciesLoaded() {
    return GPGME.libLoaded;
  },

  async decrypt(encrypted, enArmorCB) {
    let result = {};
    result.decryptedData = "";

    var tmp_array = ctypes.char.array()(encrypted);

    let data_ciphertext = new GPGMELib.gpgme_data_t();
    if (
      GPGMELib.gpgme_data_new_from_mem(
        data_ciphertext.address(),
        tmp_array,
        tmp_array.length,
        0
      )
    ) {
      throw new Error("gpgme_data_new_from_mem failed");
    }

    let data_plain = new GPGMELib.gpgme_data_t();
    if (GPGMELib.gpgme_data_new(data_plain.address())) {
      throw new Error("gpgme_data_new failed");
    }

    let c1 = new GPGMELib.gpgme_ctx_t();
    if (GPGMELib.gpgme_new(c1.address())) {
      throw new Error("gpgme_new failed");
    }

    result.exitCode = GPGMELib.gpgme_op_decrypt_ext(
      c1,
      GPGMELib.GPGME_DECRYPT_UNWRAP,
      data_ciphertext,
      data_plain
    );

    if (GPGMELib.gpgme_data_release(data_ciphertext)) {
      throw new Error("gpgme_data_release failed");
    }

    let result_len = new ctypes.size_t();
    let result_buf = GPGMELib.gpgme_data_release_and_get_mem(
      data_plain,
      result_len.address()
    );

    if (!result_buf.isNull()) {
      let unwrapped = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;

      // The result of decrypt(GPGME_DECRYPT_UNWRAP) is an OpenPGP message.
      // However, GPGME always returns the results as a binary encoding.
      // GPG 1.12.0 ignored gpgme_set_armor(context, 1) and
      // gpgme_data_set_encoding(data_plain, GPGME_DATA_ENCODING_ARMOR).

      // TODO: Find a way to pass the binary data directly to the
      //       RNP.decrypt function for efficiency.

      result.decryptedData = enArmorCB(unwrapped, result_len.value);
      GPGMELib.gpgme_free(result_buf);
    }

    GPGMELib.gpgme_release(c1);

    return result;
  },
};
