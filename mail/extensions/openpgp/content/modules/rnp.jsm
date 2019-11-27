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

  addKeyAttributes(handle, keyObj, is_subkey) {
    let have_secret = new ctypes.bool;
    let key_id = new ctypes.char.ptr;
    let fingerprint = new ctypes.char.ptr;
    let algo = new ctypes.char.ptr;
    let bits = new ctypes.uint32_t;
    let key_creation = new ctypes.uint32_t;
    let key_expiration = new ctypes.uint32_t;
    let allowed = new ctypes.bool;

    if (RNPLib.rnp_key_have_secret(handle, have_secret.address())) {
      throw "rnp_key_have_secret failed";
    }

    keyObj.secretAvailable = have_secret.value;

    if (is_subkey) {
      keyObj.type = "sub";
    } else {
      keyObj.type = "pub";
    }

    if (RNPLib.rnp_key_get_keyid(handle, key_id.address())) {
      throw "rnp_key_get_keyid failed";
    }
    keyObj.keyId = key_id.readString();

    if (RNPLib.rnp_key_get_fprint(handle, fingerprint.address())) {
      throw "rnp_key_get_fprint failed";
    }
    keyObj.fpr = fingerprint.readString();

    if (RNPLib.rnp_key_get_alg(handle, algo.address())) {
      throw "rnp_key_get_alg failed";
    }
    keyObj.algoSym = algo.readString();
    
    if (RNPLib.rnp_key_get_bits(handle, bits.address())) {
      throw "rnp_key_get_bits failed";
    }
    keyObj.keySize = bits.value;

    if (RNPLib.rnp_key_get_creation(handle, key_creation.address())) {
      throw "rnp_key_get_creation failed";
    }
    keyObj.keyCreated = key_creation.value;
    keyObj.created = EnigmailTime.getDateTime(keyObj.keyCreated, true, false);

    if (RNPLib.rnp_key_get_expiration(handle, key_expiration.address())) {
      throw "rnp_key_get_creation failed";
    }
    if (key_expiration.value > 0) {
      keyObj.expiryTime = keyObj.keyCreated + key_expiration.value;
    } else {
      keyObj.expiryTime = 0;
    }
    keyObj.expiry = EnigmailTime.getDateTime(keyObj.expiryTime, true, false);

    keyObj.keyUseFor = "";
    if (RNPLib.rnp_key_allows_usage(handle, "encrypt", allowed.address())) {
      throw "rnp_key_allows_usage failed";
    }
    if (allowed.value) {
      keyObj.keyUseFor += "e";
    }
    if (RNPLib.rnp_key_allows_usage(handle, "sign", allowed.address())) {
      throw "rnp_key_allows_usage failed";
    }
    if (allowed.value) {
      keyObj.keyUseFor += "s";
    }
    if (RNPLib.rnp_key_allows_usage(handle, "certify", allowed.address())) {
      throw "rnp_key_allows_usage failed";
    }
    if (allowed.value) {
      keyObj.keyUseFor += "c";
    }
    if (RNPLib.rnp_key_allows_usage(handle, "authenticate", allowed.address())) {
      throw "rnp_key_allows_usage failed";
    }
    if (allowed.value) {
      keyObj.keyUseFor += "a";
    }
  },
  
  getKeys(onlyKeys = null) {
    let keys = [];
    let rv;

    let iter = new RNPLib.rnp_identifier_iterator_t;
    let grip = new ctypes.char.ptr();

    rv = RNPLib.rnp_identifier_iterator_create(RNPLib.ffi, iter.address(), "grip");
    if (rv) {
      return null;
    }

    while (!RNPLib.rnp_identifier_iterator_next(iter, grip.address())) {
      if (grip.isNull()) {
        break;
      }

      let have_handle = false;
      let handle = new RNPLib.rnp_key_handle_t;
      let keyObj = {};

      keyObj.keyTrust = "/";
      keyObj.ownerTrust = null;
      keyObj.userId = null;
      keyObj.userIds = [];
      keyObj.subKeys = [];
      keyObj.photoAvailable = false;

      try {
        let is_subkey = new ctypes.bool;
        let sub_count = new ctypes.size_t;
        let uid_count = new ctypes.size_t;

        if (RNPLib.rnp_locate_key(RNPLib.ffi, "grip", grip, handle.address())) {
          throw "rnp_locate_key failed";
        }
        have_handle = true;
        if (RNPLib.rnp_key_is_sub(handle, is_subkey.address())) {
          throw "rnp_key_is_sub failed";
        }
        if (is_subkey.value) {
          let primary_grip = new ctypes.char.ptr();
          if (RNPLib.rnp_key_get_primary_grip(handle, primary_grip.address())) {
            throw "rnp_key_get_primary_grip failed";
          }
          /* Skip if we have primary key. Subkey will be processed together with primary */
          if (!primary_grip.isNull()) {
            RNPLib.rnp_buffer_destroy(primary_grip);
            continue;
          }
        }

        let key_revoked = new ctypes.bool;
        if (RNPLib.rnp_key_is_revoked(handle, key_revoked.address())) {
          throw "rnp_key_is_revoked failed";
        }

        if (key_revoked.value) {
          keyObj.keyTrust = "r";
        }

        this.addKeyAttributes(handle, keyObj, false);

        /* The remaining actions are done for primary keys, only. */
        if (is_subkey.value) {
          continue;
        }
        
        let primary_uid_set = false;

        if (RNPLib.rnp_key_get_uid_count(handle, uid_count.address())) {
          throw "rnp_key_get_uid_count failed";
        }
console.log("rnp_key_get_uid_count: " + uid_count.value);
        for (let i = 0; i < uid_count.value; i++) {
          let uid_handle = new RNPLib.rnp_uid_handle_t;
          let is_revoked = new ctypes.bool;

          if (RNPLib.rnp_key_get_uid_handle_at(handle, i, uid_handle.address())) {
            throw "rnp_key_get_uid_handle_at failed";
          }

          if (RNPLib.rnp_uid_is_revoked(uid_handle, is_revoked.address())) {
            throw "rnp_uid_is_revoked failed";
          }

          if (!is_revoked.value) {
            let uid_str = new ctypes.char.ptr;
            if (RNPLib.rnp_key_get_uid_at(handle, i, uid_str.address())) {
              throw "rnp_key_get_uid_at failed";
            }
            
            if (!primary_uid_set) {
              keyObj.userId = uid_str.readString();
              primary_uid_set = true;
            }

            let uidObj = {};
            uidObj.userId = uid_str.readString();
            uidObj.type = "uid";
            uidObj.keyTrust = "/";
            uidObj.uidFpr = "??fpr??"
            
            keyObj.userIds.push(uidObj);
            
            RNPLib.rnp_buffer_destroy(uid_str);
          }

          RNPLib.rnp_uid_handle_destroy(uid_handle);
        }

        if (RNPLib.rnp_key_get_subkey_count(handle, sub_count.address())) {
          throw "rnp_key_get_subkey_count failed";
        }
console.log("rnp_key_get_subkey_count: " + sub_count.value);
        for (let i = 0; i < sub_count.value; i++) {
          let sub_handle = new RNPLib.rnp_key_handle_t;
          if (RNPLib.rnp_key_get_subkey_at(handle, i, sub_handle.address())) {
              throw "rnp_key_get_subkey_at failed";
          }

          let subKeyObj = {};
          subKeyObj.keyTrust = "/";
          this.addKeyAttributes(sub_handle, subKeyObj, true);
          keyObj.subKeys.push(subKeyObj);

          RNPLib.rnp_key_handle_destroy(sub_handle);
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
    result.statusFlags = 0;

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

        result.statusFlags |= EnigmailConstants.DECRYPTION_OKAY;
        result.decryptedData = char_array.readString();
        console.log(result.decryptedData);
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
      return;
    }

    if (expiryDays != 0) {
      expireSeconds = expiryDays*24*60*60;
    }

    let genOp = new RNPLib.rnp_op_generate_t;
    if (RNPLib.rnp_op_generate_create(genOp.address(), RNPLib.ffi, primaryKeyType)) {
      throw "rnp_op_generate_create primary failed";
    }

    if (RNPLib.rnp_op_generate_set_userid(genOp, userId)) {
      throw "rnp_op_generate_set_userid failed";
    }
    
    if (passphrase != null && passphrase.length != 0) {
      if (RNPLib.rnp_op_generate_set_protection_password(genOp, passphrase)) {
        throw "rnp_op_generate_set_protection_password failed";
      }
    }
    
    if (primaryKeyBits != 0) {
      if (RNPLib.rnp_op_generate_set_bits(genOp, primaryKeyBits)) {
        throw "rnp_op_generate_set_bits primary failed";
      }
    }
    
    if (primaryKeyCurve != null) {
      if (RNPLib.rnp_op_generate_set_curve(genOp, primaryKeyCurve)) {
        throw "rnp_op_generate_set_curve primary failed";
      }
    }
    
    if (expireSeconds != 0) {
      if (RNPLib.rnp_op_generate_set_expiration(genOp, expireSeconds)) {
        throw "rnp_op_generate_set_expiration primary failed";
      }
    }
    
    if (RNPLib.rnp_op_generate_execute(genOp)) {
      throw "rnp_op_generate_execute primary failed";
    }
    
    let primaryKey = new RNPLib.rnp_key_handle_t;
    if (RNPLib.rnp_op_generate_get_key(genOp, primaryKey.address())) {
      throw "rnp_op_generate_get_key primary failed";
    }

    RNPLib.rnp_op_generate_destroy(genOp);

    let ctypes_key_id = new ctypes.char.ptr;
    if (RNPLib.rnp_key_get_keyid(primaryKey, ctypes_key_id.address())) {
      throw "rnp_key_get_keyid failed";
    }
    newKeyId = ctypes_key_id.readString();
    
    if (RNPLib.rnp_op_generate_subkey_create(genOp.address(), RNPLib.ffi, primaryKey, subKeyType)) {
      throw "rnp_op_generate_subkey_create primary failed";
    }

    if (passphrase != null && passphrase.length != 0) {
      if (RNPLib.rnp_op_generate_set_protection_password(genOp, passphrase)) {
        throw "rnp_op_generate_set_protection_password failed";
      }
    }

    if (subKeyBits != 0) {
      if (RNPLib.rnp_op_generate_set_bits(genOp, subKeyBits)) {
        throw "rnp_op_generate_set_bits sub failed";
      }
    }
    
    if (subKeyCurve != null) {
      if (RNPLib.rnp_op_generate_set_curve(genOp, subKeyCurve)) {
        throw "rnp_op_generate_set_curve sub failed";
      }
    }
    
    if (expireSeconds != 0) {
      if (RNPLib.rnp_op_generate_set_expiration(genOp, expireSeconds)) {
        throw "rnp_op_generate_set_expiration sub failed";
      }
    }

    try {
      if (passphrase != null && passphrase.length != 0) {
        if (RNPLib.rnp_key_unlock(primaryKey, passphrase)) {
          throw "rnp_key_unlock failed";
        }
      }

      if (RNPLib.rnp_op_generate_execute(genOp)) {
        throw "rnp_op_generate_execute sub failed";
      }
    } finally {
      if (RNPLib.rnp_key_lock(primaryKey)) {
        throw "rnp_key_lock failed";
      }
    }

    RNPLib.rnp_op_generate_destroy(genOp);
    
    return newKeyId;
  },

  saveKeyRings() {
    RNPLib.saveKeys();
  },
};

// exports

this.EXPORTED_SYMBOLS = ["RNP"];
