/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const { RNPLibLoader } = ChromeUtils.import(
  "chrome://openpgp/content/modules/rnpLib.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailTime } = ChromeUtils.import(
  "chrome://openpgp/content/modules/time.jsm"
);

const str_encrypt = "encrypt";
const str_sign = "sign";
const str_certify = "certify";
const str_authenticate = "authenticate";

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

  addKeyAttributes(handle, meta, keyObj, is_subkey, forListing) {
    let have_secret = new ctypes.bool();
    let key_id = new ctypes.char.ptr();
    let fingerprint = new ctypes.char.ptr();
    let algo = new ctypes.char.ptr();
    let bits = new ctypes.uint32_t();
    let key_creation = new ctypes.uint32_t();
    let key_expiration = new ctypes.uint32_t();
    let allowed = new ctypes.bool();

    if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
      throw new Error("rnp_key_have_secret failed");
    }

    keyObj.secretAvailable = have_secret.value;

    if (is_subkey) {
      keyObj.type = "sub";
    } else {
      keyObj.type = "pub";
    }

    if (RNPLib.rnp_key_get_keyid(handle, key_id.address())) {
      throw new Error("rnp_key_get_keyid failed");
    }
    keyObj.keyId = key_id.readString();
    if (forListing) {
      keyObj.id = keyObj.keyId;
    }

    if (RNPLib.rnp_key_get_fprint(handle, fingerprint.address())) {
      throw new Error("rnp_key_get_fprint failed");
    }
    keyObj.fpr = fingerprint.readString();

    if (RNPLib.rnp_key_get_alg(handle, algo.address())) {
      throw new Error("rnp_key_get_alg failed");
    }
    keyObj.algoSym = algo.readString();

    if (RNPLib.rnp_key_get_bits(handle, bits.address())) {
      throw new Error("rnp_key_get_bits failed");
    }
    keyObj.keySize = bits.value;

    if (RNPLib.rnp_key_get_creation(handle, key_creation.address())) {
      throw new Error("rnp_key_get_creation failed");
    }
    keyObj.keyCreated = key_creation.value;
    keyObj.created = EnigmailTime.getDateTime(keyObj.keyCreated, true, false);

    if (RNPLib.rnp_key_get_expiration(handle, key_expiration.address())) {
      throw new Error("rnp_key_get_creation failed");
    }
    if (key_expiration.value > 0) {
      keyObj.expiryTime = keyObj.keyCreated + key_expiration.value;
    } else {
      keyObj.expiryTime = 0;
    }
    keyObj.expiry = EnigmailTime.getDateTime(keyObj.expiryTime, true, false);

    keyObj.keyUseFor = "";
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

  getKeys(onlyKeys = null) {
    return this.getKeysFromFFI(RNPLib.ffi, false, onlyKeys);
  },

  /* Some consumers want a different listing of keys, and expect
   * slightly different attribute names...
   * If forListing is true, we'll set those additional attributes. */
  getKeysFromFFI(ffi, forListing, onlyKeys = null) {
    let keys = [];
    let rv;

    let iter = new RNPLib.rnp_identifier_iterator_t();
    let grip = new ctypes.char.ptr();

    rv = RNPLib.rnp_identifier_iterator_create(ffi, iter.address(), "grip");
    if (rv) {
      return null;
    }

    let meta = {
      a: false,
      s: false,
      c: false,
      e: false,
    };

    while (!RNPLib.rnp_identifier_iterator_next(iter, grip.address())) {
      if (grip.isNull()) {
        break;
      }

      let have_handle = false;
      let handle = new RNPLib.rnp_key_handle_t();
      let keyObj = {};

      keyObj.ownerTrust = null;
      keyObj.userId = null;
      keyObj.userIds = [];
      keyObj.subKeys = [];
      keyObj.photoAvailable = false;

      try {
        let is_subkey = new ctypes.bool();
        let sub_count = new ctypes.size_t();
        let uid_count = new ctypes.size_t();

        if (RNPLib.rnp_locate_key(ffi, "grip", grip, handle.address())) {
          throw new Error("rnp_locate_key failed");
        }
        have_handle = true;
        if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
          throw new Error("rnp_key_is_sub failed");
        }
        if (is_subkey.value) {
          let primary_grip = new ctypes.char.ptr();
          if (RNPLib.rnp_key_get_primary_grip(handle, primary_grip.address())) {
            throw new Error("rnp_key_get_primary_grip failed");
          }
          /* Skip if we have primary key. Subkey will be processed together with primary */
          if (!primary_grip.isNull()) {
            RNPLib.rnp_buffer_destroy(primary_grip);
            continue;
          }
        }

        this.addKeyAttributes(handle, meta, keyObj, false, forListing);

        let key_revoked = new ctypes.bool();
        if (RNPLib.rnp_key_is_revoked(handle, key_revoked.address())) {
          throw new Error("rnp_key_is_revoked failed");
        }

        if (key_revoked.value) {
          keyObj.keyTrust = "r";
          if (forListing) {
            keyObj.revoke = true;
          }
        } else if (keyObj.secretAvailable) {
          keyObj.keyTrust = "u";
        } else {
          keyObj.keyTrust = "o";
        }

        /* The remaining actions are done for primary keys, only. */
        if (is_subkey.value) {
          continue;
        }

        let primary_uid_set = false;

        if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
          throw new Error("rnp_key_get_uid_count failed");
        }
        console.debug("rnp_key_get_uid_count: " + uid_count.value);
        for (let i = 0; i < uid_count.value; i++) {
          let uid_handle = new RNPLib.rnp_uid_handle_t();
          let is_revoked = new ctypes.bool();

          if (
            RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())
          ) {
            throw new Error("rnp_key_get_uid_handle_at failed");
          }

          if (RNPLib.rnp_uid_is_revoked(uid_handle, is_revoked.address())) {
            throw new Error("rnp_uid_is_revoked failed");
          }

          if (!is_revoked.value) {
            let uid_str = new ctypes.char.ptr();
            if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
              throw new Error("rnp_key_get_uid_at failed");
            }

            if (!primary_uid_set) {
              keyObj.userId = uid_str.readString();
              if (forListing) {
                keyObj.name = keyObj.userId;
              }
              primary_uid_set = true;
            }

            let uidObj = {};
            uidObj.userId = uid_str.readString();
            uidObj.type = "uid";
            uidObj.keyTrust = keyObj.keyTrust;
            uidObj.uidFpr = "??fpr??";

            keyObj.userIds.push(uidObj);

            RNPLib.rnp_buffer_destroy(uid_str);
          }

          RNPLib.rnp_uid_handle_destroy(uid_handle);
        }

        if (RNPLib.rnp_key_get_subkey_count(handle, sub_count.address())) {
          throw new Error("rnp_key_get_subkey_count failed");
        }
        console.debug("rnp_key_get_subkey_count: " + sub_count.value);
        for (let i = 0; i < sub_count.value; i++) {
          let sub_handle = new RNPLib.rnp_key_handle_t();
          if (RNPLib.rnp_key_get_subkey_at(handle, i, sub_handle.address())) {
            throw new Error("rnp_key_get_subkey_at failed");
          }

          let subKeyObj = {};
          subKeyObj.keyTrust = keyObj.keyTrust;
          this.addKeyAttributes(sub_handle, meta, subKeyObj, true, forListing);
          keyObj.subKeys.push(subKeyObj);

          RNPLib.rnp_key_handle_destroy(sub_handle);
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
      } catch (ex) {
        console.log(ex);
      } finally {
        if (have_handle) {
          RNPLib.rnp_key_handle_destroy(handle);
        }
      }

      keys.push(keyObj);
    }

    RNPLib.rnp_identifier_iterator_destroy(iter);

    console.log(keys);
    return keys;
  },

  decrypt(encrypted, options) {
    let input_from_memory = new RNPLib.rnp_input_t();

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

    let max_out = encrypted.length * 10;

    let output_to_memory = new RNPLib.rnp_output_t();
    RNPLib.rnp_output_to_memory(output_to_memory.address(), max_out);

    let result = {};
    result.decryptedData = "";
    result.statusFlags = 0;

    result.exitCode = RNPLib.rnp_decrypt(
      RNPLib.ffi,
      input_from_memory,
      output_to_memory
    );
    console.debug("decrypt exit code: " + result.exitCode);

    if (!result.exitCode) {
      let result_buf = new ctypes.uint8_t.ptr();
      let result_len = new ctypes.size_t();
      result.exitCode = RNPLib.rnp_output_memory_get_buf(
        output_to_memory,
        result_buf.address(),
        result_len.address(),
        false
      );
      console.debug("decrypt get buffer result code: " + result.exitCode);

      if (!result.exitCode) {
        console.debug("decrypt result len: " + result_len.value);
        //let buf_array = ctypes.cast(result_buf, ctypes.uint8_t.array(result_len.value).ptr).contents;
        //let char_array = ctypes.cast(buf_array, ctypes.char.array(result_len.value));

        let char_array = ctypes.cast(
          result_buf,
          ctypes.char.array(result_len.value).ptr
        ).contents;

        result.statusFlags |= EnigmailConstants.DECRYPTION_OKAY;
        result.decryptedData = char_array.readString();
        console.debug(result.decryptedData);
      }
    }

    if (!(result.statusFlags & EnigmailConstants.DECRYPTION_OKAY)) {
      result.statusFlags |= EnigmailConstants.DECRYPTION_FAILED;
    }

    RNPLib.rnp_input_destroy(input_from_memory);
    RNPLib.rnp_output_destroy(output_to_memory);

    return result;
  },

  genKey(userId, keyType, keyBits, expiryDays, passphrase) {
    let newKeyId = "";

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

    let ctypes_key_id = new ctypes.char.ptr();
    if (RNPLib.rnp_key_get_keyid(primaryKey, ctypes_key_id.address())) {
      throw new Error("rnp_key_get_keyid failed");
    }
    newKeyId = ctypes_key_id.readString();

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

    let lockFailure = false;
    try {
      if (passphrase != null && passphrase.length != 0) {
        if (RNPLib.rnp_key_unlock(primaryKey, passphrase)) {
          throw new Error("rnp_key_unlock failed");
        }
      }

      if (RNPLib.rnp_op_generate_execute(genOp)) {
        throw new Error("rnp_op_generate_execute sub failed");
      }
    } finally {
      if (RNPLib.rnp_key_lock(primaryKey)) {
        lockFailure = true;
      }
    }
    if (lockFailure) {
      throw new Error("rnp_key_lock failed");
    }

    RNPLib.rnp_op_generate_destroy(genOp);

    return newKeyId;
  },

  saveKeyRings() {
    RNPLib.saveKeys();
  },

  importToFFI(ffi, keyBlockStr) {
    let input_from_memory = new RNPLib.rnp_input_t();

    var tmp_array = ctypes.char.array()(keyBlockStr);
    var key_array = ctypes.cast(
      tmp_array,
      ctypes.uint8_t.array(keyBlockStr.length)
    );

    RNPLib.rnp_input_from_memory(
      input_from_memory.address(),
      key_array,
      keyBlockStr.length,
      false
    );

    let jsonInfo = new ctypes.char.ptr();

    let rv = RNPLib.rnp_import_keys(
      ffi,
      input_from_memory,
      RNPLib.RNP_LOAD_SAVE_PUBLIC_KEYS,
      jsonInfo.address()
    );

    // TODO: parse jsonInfo and return a list of keys,
    // as seen in keyRing.importKeyAsync.
    // (should prevent the incorrect popup "no keys imported".)

    console.debug(
      "result key listing, rv= %s, result= %s",
      rv,
      jsonInfo.readString()
    );

    RNPLib.rnp_buffer_destroy(jsonInfo);
    RNPLib.rnp_input_destroy(input_from_memory);

    return null;
  },

  getKeyListFromKeyBlock(keyBlockStr) {
    // Create a separate, temporary RNP storage area (FFI),
    // import the key block into it, then get the listing.

    console.debug("trying to get key listing for this data: " + keyBlockStr);

    let tempFFI = new RNPLib.rnp_ffi_t();
    if (RNPLib.rnp_ffi_create(tempFFI.address(), "GPG", "GPG")) {
      throw new Error("Couldn't initialize librnp.");
    }

    this.importToFFI(tempFFI, keyBlockStr);

    let keys = this.getKeysFromFFI(tempFFI, true);

    console.debug("result key array: %o", keys);

    RNPLib.rnp_ffi_destroy(tempFFI);
    return keys;
  },

  importKeyBlock(keyBlockStr) {
    return this.importToFFI(RNPLib.ffi, keyBlockStr);
  },

  deleteKey(keyFingerprint, deleteSecret) {
    console.debug("deleting key with fingerprint: " + keyFingerprint);

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

    let flags = RNPLib.RNP_KEY_REMOVE_PUBLIC;
    if (deleteSecret) {
      flags |= RNPLib.RNP_KEY_REMOVE_SECRET;
    }

    if (RNPLib.rnp_key_remove(handle, flags)) {
      throw new Error("rnp_key_remove failed");
    }

    RNPLib.rnp_key_handle_destroy(handle);
    this.saveKeyRings();
  },

  getKeyHandleByIdentifier(id) {
    console.debug("getKeyHandleByIdentifier searching for: " + id);
    let key = null;

    if (id.startsWith("<")) {
      //throw new Error("search by email address not yet implemented: " + id);
      if (!id.endsWith(">")) {
        throw new Error(
          "if search identifier starts with < then it must end with > : " + id
        );
      }
      key = this.findKeyByEmail(id);
    } else {
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
        throw new Error(
          "key/fingerprint identifier of unexpected length: " + id
        );
      }

      key = new RNPLib.rnp_key_handle_t();
      if (RNPLib.rnp_locate_key(RNPLib.ffi, type, id, key.address())) {
        throw new Error("rnp_locate_key failed, " + type + ", " + id);
      }
    }

    if (key.isNull()) {
      console.debug("getKeyHandleByIdentifier nothing found");
    } else {
      console.debug("getKeyHandleByIdentifier found!");
      let is_subkey = new ctypes.bool();
      let res = RNPLib.rnp_key_is_sub(key, is_subkey.address());
      if (res) {
        throw new Error("rnp_key_is_sub failed: " + res);
      }
      console.debug("is_primary? " + !is_subkey.value);
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
    let found_handle = null;
    let sub_count = new ctypes.size_t();
    if (RNPLib.rnp_key_get_subkey_count(primary, sub_count.address())) {
      throw new Error("rnp_key_get_subkey_count failed");
    }
    for (let i = 0; i < sub_count.value; i++) {
      let sub_handle = new RNPLib.rnp_key_handle_t();
      if (RNPLib.rnp_key_get_subkey_at(primary, i, sub_handle.address())) {
        throw new Error("rnp_key_get_subkey_at failed");
      }
      let expiration = new ctypes.uint32_t();
      if (RNPLib.rnp_key_get_expiration(sub_handle, expiration.address())) {
        throw new Error("rnp_key_get_expiration failed");
      }
      let skip = false;
      if (expiration.value != 0) {
        let now_seconds = Math.floor(Date.now() / 1000);
        let creation = new ctypes.uint32_t();
        if (RNPLib.rnp_key_get_creation(sub_handle, creation.address())) {
          throw new Error("rnp_key_get_expiration failed");
        }
        let expiration_seconds = creation.value + expiration.value;
        console.debug(
          "now: " +
            now_seconds +
            " vs. subkey creation+expiration in seconds: " +
            expiration_seconds
        );
        if (now_seconds > expiration_seconds) {
          console.debug("skipping expired subkey");
          skip = true;
        }
      }
      if (!skip) {
        let key_revoked = new ctypes.bool();
        if (RNPLib.rnp_key_is_revoked(sub_handle, key_revoked.address())) {
          console.debug("skipping revoked subkey");
          skip = true;
        }
      }
      if (!skip) {
        if (!this.isKeyUsableFor(sub_handle, usage)) {
          console.debug("skipping subkey not usable for request");
          skip = true;
        }
      }
      if (skip) {
        RNPLib.rnp_key_handle_destroy(sub_handle);
      } else {
        found_handle = sub_handle;

        let fingerprint = new ctypes.char.ptr();
        if (RNPLib.rnp_key_get_fprint(found_handle, fingerprint.address())) {
          throw new Error("rnp_key_get_fprint failed");
        }
        console.debug(
          "found suitable subkey, fingerprint: " + fingerprint.readString()
        );
        break;
      }
    }

    return found_handle;
  },

  addSuitableEncryptKey(key, op) {
    let use_sub = null;
    console.debug("addSuitableEncryptKey");

    // looks like this will be unnecessary ???

    if (!this.isKeyUsableFor(key, str_encrypt)) {
      console.debug("addSuitableEncryptKey primary not usable");
      use_sub = this.getSuitableSubkey(key, str_encrypt);
      if (!use_sub) {
        throw new Error("no suitable subkey found for " + str_encrypt);
      } else {
        console.debug("addSuitableEncryptKey using subkey");
      }
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

  encryptAndOrSign(plaintext, args, resultStatus) {
    resultStatus.exitCode = -1;
    resultStatus.statusFlags = 0;
    resultStatus.statusMsg = "";
    resultStatus.errorMsg = "";

    console.debug(
      `encryptAndOrSign, plaintext (length=${plaintext.length}): ${plaintext}`
    );

    var tmp_array = ctypes.char.array()(plaintext);
    var plaintext_array = ctypes.cast(
      tmp_array,
      ctypes.uint8_t.array(plaintext.length)
    );

    let input = new RNPLib.rnp_input_t();
    if (
      RNPLib.rnp_input_from_memory(
        input.address(),
        plaintext_array,
        plaintext.length,
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
      senderKey = this.getKeyHandleByIdentifier(args.sender);
      if (!senderKey) {
        return null;
      }
      if (args.encryptToSender) {
        this.addSuitableEncryptKey(senderKey, op);
      }
      if (args.sign) {
        let use_sub = null;
        if (!this.isKeyUsableFor(senderKey, str_sign)) {
          use_sub = this.getSuitableSubkey(senderKey, str_sign);
          if (!use_sub) {
            throw new Error("no suitable subkey found for " + str_sign);
          }
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
      for (let id in args.to) {
        let toKey = this.getKeyHandleByIdentifier(args.to[id]);
        if (!toKey) {
          resultStatus.statusFlags |= EnigmailConstants.INVALID_RECIPIENT;
          return null;
        }
        this.addSuitableEncryptKey(toKey, op);
        RNPLib.rnp_key_handle_destroy(toKey);
      }

      for (let id in args.bcc) {
        let bccKey = this.getKeyHandleByIdentifier(args.bcc[id]);
        if (!bccKey) {
          resultStatus.statusFlags |= EnigmailConstants.INVALID_RECIPIENT;
          return null;
        }
        this.addSuitableEncryptKey(bccKey, op);
        RNPLib.rnp_key_handle_destroy(bccKey);
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
      console.debug("encrypt result len: " + result_len.value);
      //let buf_array = ctypes.cast(result_buf, ctypes.uint8_t.array(result_len.value).ptr).contents;
      //let char_array = ctypes.cast(buf_array, ctypes.char.array(result_len.value));

      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
      console.debug(result);
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

  findKeyByEmail(id) {
    if (!id.startsWith("<") || !id.endsWith(">")) {
      throw new Error("invalid parameter given to findKeyByEmail");
    }

    let rv;

    let iter = new RNPLib.rnp_identifier_iterator_t();
    let grip = new ctypes.char.ptr();

    rv = RNPLib.rnp_identifier_iterator_create(
      RNPLib.ffi,
      iter.address(),
      "grip"
    );
    if (rv) {
      return null;
    }

    let foundHandle = null;
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

        let key_revoked = new ctypes.bool();
        if (RNPLib.rnp_key_is_revoked(handle, key_revoked.address())) {
          throw new Error("rnp_key_is_revoked failed");
        }

        if (key_revoked.value) {
          continue;
        }

        if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
          throw new Error("rnp_key_get_uid_count failed");
        }
        console.debug("rnp_key_get_uid_count: " + uid_count.value);
        for (let i = 0; i < uid_count.value; i++) {
          let uid_handle = new RNPLib.rnp_uid_handle_t();
          let is_revoked = new ctypes.bool();

          if (
            RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())
          ) {
            throw new Error("rnp_key_get_uid_handle_at failed");
          }

          if (RNPLib.rnp_uid_is_revoked(uid_handle, is_revoked.address())) {
            throw new Error("rnp_uid_is_revoked failed");
          }

          if (!is_revoked.value) {
            let uid_str = new ctypes.char.ptr();
            if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
              throw new Error("rnp_key_get_uid_at failed");
            }

            let userId = uid_str.readString();

            if (userId.includes(id)) {
              foundHandle = handle;
            }

            RNPLib.rnp_buffer_destroy(uid_str);
          }

          RNPLib.rnp_uid_handle_destroy(uid_handle);
        }
      } catch (ex) {
        console.log(ex);
      } finally {
        if (!foundHandle && have_handle) {
          RNPLib.rnp_key_handle_destroy(handle);
        }
      }
    }

    RNPLib.rnp_identifier_iterator_destroy(iter);

    return foundHandle;
  },

  getPublicKey(id) {
    let result = "";
    let key = this.getKeyHandleByIdentifier(id);

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
    console.debug("decrypt get buffer result code: " + exitCode);

    if (!exitCode) {
      console.debug("decrypt result len: " + result_len.value);

      let char_array = ctypes.cast(
        result_buf,
        ctypes.char.array(result_len.value).ptr
      ).contents;

      result = char_array.readString();
      console.debug(result);
    }

    RNPLib.rnp_output_destroy(output_to_memory);
    RNPLib.rnp_key_handle_destroy(key);
    return result;
  },
};

// exports

const EXPORTED_SYMBOLS = ["RNP"];
