/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  GPGMELibLoader: "chrome://openpgp/content/modules/GPGMELib.sys.mjs",
  ctypes: "resource://gre/modules/ctypes.sys.mjs",
});

var GPGMELib;

export var GPGME = {
  hasRan: false,
  libLoaded: false,
  once() {
    this.hasRan = true;
    try {
      GPGMELib = lazy.GPGMELibLoader.init();
      if (!GPGMELib) {
        return;
      }
      if (GPGMELib && GPGMELib.init()) {
        GPGME.libLoaded = true;
      }
    } catch (e) {
      console.warn("Init GPGME FAILED", e);
    }
  },

  init() {
    if (!this.hasRan) {
      this.once();
    }

    return GPGME.libLoaded;
  },

  allDependenciesLoaded() {
    return GPGME.libLoaded;
  },

  /**
   * High level interface to retrieve public keys from GnuPG that
   * contain a user ID that matches the given email address.
   *
   * @param {string} email - The email address to search for.
   *
   * @returns {Map} - a Map that contains ASCII armored key blocks
   *   indexed by fingerprint.
   */
  getPublicKeysForEmail(email) {
    function keyFilterFunction(key) {
      if (
        key.contents.bitfield & GPGMELib.gpgme_key_t_revoked ||
        key.contents.bitfield & GPGMELib.gpgme_key_t_expired ||
        key.contents.bitfield & GPGMELib.gpgme_key_t_disabled ||
        key.contents.bitfield & GPGMELib.gpgme_key_t_invalid ||
        !(key.contents.bitfield & GPGMELib.gpgme_key_t_can_encrypt)
      ) {
        return false;
      }

      let matchesEmail = false;
      let nextUid = key.contents.uids;
      while (nextUid && !nextUid.isNull()) {
        const uidEmail = nextUid.contents.email.readString();
        // Variable email is provided by the outer scope.
        if (uidEmail == email) {
          matchesEmail = true;
          break;
        }
        nextUid = nextUid.contents.next;
      }
      return matchesEmail;
    }

    return GPGMELib.exportKeys(email, false, keyFilterFunction);
  },

  async decrypt(encrypted, enArmorCB) {
    const result = {};
    result.decryptedData = "";

    const arr = encrypted.split("").map(e => e.charCodeAt());
    const encrypted_array = lazy.ctypes.uint8_t.array()(arr);
    const tmp_array = lazy.ctypes.cast(
      encrypted_array,
      lazy.ctypes.char.array(encrypted_array.length)
    );

    const data_ciphertext = new GPGMELib.gpgme_data_t();
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

    const data_plain = new GPGMELib.gpgme_data_t();
    if (GPGMELib.gpgme_data_new(data_plain.address())) {
      throw new Error("gpgme_data_new failed");
    }

    const c1 = new GPGMELib.gpgme_ctx_t();
    if (GPGMELib.gpgme_new(c1.address())) {
      throw new Error("gpgme_new failed");
    }

    GPGMELib.gpgme_set_armor(c1, 1);

    result.exitCode = GPGMELib.gpgme_op_decrypt_ext(
      c1,
      GPGMELib.GPGME_DECRYPT_UNWRAP,
      data_ciphertext,
      data_plain
    );

    if (GPGMELib.gpgme_data_release(data_ciphertext)) {
      throw new Error("gpgme_data_release failed");
    }

    const result_len = new lazy.ctypes.size_t();
    const result_buf = GPGMELib.gpgme_data_release_and_get_mem(
      data_plain,
      result_len.address()
    );

    if (!result_buf.isNull()) {
      const unwrapped = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(result_len.value).ptr
      ).contents;

      // The result of decrypt(GPGME_DECRYPT_UNWRAP) is an OpenPGP message.
      // Because old versions of GPGME (e.g. 1.12.0) may return the
      // results as a binary encoding (despite gpgme_set_armor),
      // we check if the result looks like an armored message.
      // If it doesn't we apply armoring ourselves.

      const armor_head = "-----BEGIN PGP MESSAGE-----";

      const head_of_array = lazy.ctypes.cast(
        result_buf,
        lazy.ctypes.char.array(armor_head.length).ptr
      ).contents;

      let isArmored = false;

      try {
        // If this is binary, which usually isn't a valid UTF-8
        // encoding, it will throw an error.
        const head_of_array_string = head_of_array.readString();
        if (head_of_array_string == armor_head) {
          isArmored = true;
        }
      } catch (ex) {}

      if (isArmored) {
        result.decryptedData = unwrapped.readString();
      } else {
        result.decryptedData = enArmorCB(unwrapped, result_len.value);
      }

      GPGMELib.gpgme_free(result_buf);
    }

    GPGMELib.gpgme_release(c1);

    return result;
  },

  async signDetached(plaintext, args, resultStatus) {
    resultStatus.exitCode = -1;
    resultStatus.statusFlags = 0;
    resultStatus.statusMsg = "";
    resultStatus.errorMsg = "";

    if (args.encrypt || !args.sign || !args.sigTypeDetached) {
      throw new Error("invalid encrypt/sign parameters");
    }
    if (!plaintext) {
      throw new Error("cannot sign empty data");
    }

    let result = null;
    //args.sender must be keyId
    const keyId = args.sender.replace(/^0x/, "").toUpperCase();

    const ctx = new GPGMELib.gpgme_ctx_t();
    if (GPGMELib.gpgme_new(ctx.address())) {
      throw new Error("gpgme_new failed");
    }
    GPGMELib.gpgme_set_armor(ctx, 1);
    GPGMELib.gpgme_set_textmode(ctx, 1);
    const keyHandle = new GPGMELib.gpgme_key_t();
    if (!GPGMELib.gpgme_get_key(ctx, keyId, keyHandle.address(), 1)) {
      if (!GPGMELib.gpgme_signers_add(ctx, keyHandle)) {
        var tmp_array = lazy.ctypes.char.array()(plaintext);
        const data_plaintext = new GPGMELib.gpgme_data_t();

        // The tmp_array will have one additional byte to store the
        // trailing null character, we don't want to sign it, thus -1.
        if (
          !GPGMELib.gpgme_data_new_from_mem(
            data_plaintext.address(),
            tmp_array,
            tmp_array.length - 1,
            0
          )
        ) {
          const data_signed = new GPGMELib.gpgme_data_t();
          if (!GPGMELib.gpgme_data_new(data_signed.address())) {
            const exitCode = GPGMELib.gpgme_op_sign(
              ctx,
              data_plaintext,
              data_signed,
              GPGMELib.GPGME_SIG_MODE_DETACH
            );
            if (exitCode != GPGMELib.GPG_ERR_NO_ERROR) {
              GPGMELib.gpgme_data_release(data_signed);
            } else {
              const result_len = new lazy.ctypes.size_t();
              const result_buf = GPGMELib.gpgme_data_release_and_get_mem(
                data_signed,
                result_len.address()
              );
              if (!result_buf.isNull()) {
                const unwrapped = lazy.ctypes.cast(
                  result_buf,
                  lazy.ctypes.char.array(result_len.value).ptr
                ).contents;
                result = unwrapped.readString();
                resultStatus.exitCode = 0;
                resultStatus.statusFlags |= lazy.EnigmailConstants.SIG_CREATED;
                GPGMELib.gpgme_free(result_buf);
              }
            }
          }
        }
      }
      GPGMELib.gpgme_key_release(keyHandle);
    }
    GPGMELib.gpgme_release(ctx);
    return result;
  },

  async sign(plaintext, args, resultStatus) {
    resultStatus.exitCode = -1;
    resultStatus.statusFlags = 0;
    resultStatus.statusMsg = "";
    resultStatus.errorMsg = "";

    if (args.encrypt || !args.sign) {
      throw new Error("invalid encrypt/sign parameters");
    }
    if (!plaintext) {
      throw new Error("cannot sign empty data");
    }

    let result = null;
    //args.sender must be keyId
    const keyId = args.sender.replace(/^0x/, "").toUpperCase();

    const ctx = new GPGMELib.gpgme_ctx_t();
    if (GPGMELib.gpgme_new(ctx.address())) {
      throw new Error("gpgme_new failed");
    }
    const keyHandle = new GPGMELib.gpgme_key_t();
    if (!GPGMELib.gpgme_get_key(ctx, keyId, keyHandle.address(), 1)) {
      if (!GPGMELib.gpgme_signers_add(ctx, keyHandle)) {
        var tmp_array = lazy.ctypes.char.array()(plaintext);
        const data_plaintext = new GPGMELib.gpgme_data_t();

        // The tmp_array will have one additional byte to store the
        // trailing null character, we don't want to sign it, thus -1.
        if (
          !GPGMELib.gpgme_data_new_from_mem(
            data_plaintext.address(),
            tmp_array,
            tmp_array.length - 1,
            0
          )
        ) {
          const data_signed = new GPGMELib.gpgme_data_t();
          if (!GPGMELib.gpgme_data_new(data_signed.address())) {
            const exitCode = GPGMELib.gpgme_op_sign(
              ctx,
              data_plaintext,
              data_signed,
              GPGMELib.GPGME_SIG_MODE_NORMAL
            );
            if (exitCode != GPGMELib.GPG_ERR_NO_ERROR) {
              GPGMELib.gpgme_data_release(data_signed);
            } else {
              const result_len = new lazy.ctypes.size_t();
              const result_buf = GPGMELib.gpgme_data_release_and_get_mem(
                data_signed,
                result_len.address()
              );
              if (!result_buf.isNull()) {
                const unwrapped = lazy.ctypes.cast(
                  result_buf,
                  lazy.ctypes.uint8_t.array(result_len.value).ptr
                ).contents;

                result = unwrapped.readTypedArray();
                resultStatus.exitCode = 0;
                resultStatus.statusFlags |= lazy.EnigmailConstants.SIG_CREATED;
                GPGMELib.gpgme_free(result_buf);
              }
            }
          }
        }
      }
      GPGMELib.gpgme_key_release(keyHandle);
    }
    GPGMELib.gpgme_release(ctx);
    return result;
  },
};
