"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DehydrationManager = exports.DEHYDRATION_ALGORITHM = void 0;
var _anotherJson = _interopRequireDefault(require("another-json"));
var _olmlib = require("./olmlib");
var _indexeddbCryptoStore = require("../crypto/store/indexeddb-crypto-store");
var _aes = require("./aes");
var _logger = require("../logger");
var _httpApi = require("../http-api");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2020-2021 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                          you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                          You may obtain a copy of the License at
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                              http://www.apache.org/licenses/LICENSE-2.0
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                          distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                          See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                          limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                          */
const DEHYDRATION_ALGORITHM = "org.matrix.msc2697.v1.olm.libolm_pickle";
exports.DEHYDRATION_ALGORITHM = DEHYDRATION_ALGORITHM;
const oneweek = 7 * 24 * 60 * 60 * 1000;
class DehydrationManager {
  constructor(crypto) {
    this.crypto = crypto;
    _defineProperty(this, "inProgress", false);
    _defineProperty(this, "timeoutId", void 0);
    _defineProperty(this, "key", void 0);
    _defineProperty(this, "keyInfo", void 0);
    _defineProperty(this, "deviceDisplayName", void 0);
    this.getDehydrationKeyFromCache();
  }
  getDehydrationKeyFromCache() {
    return this.crypto.cryptoStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.crypto.cryptoStore.getSecretStorePrivateKey(txn, async result => {
        if (result) {
          const {
            key,
            keyInfo,
            deviceDisplayName,
            time
          } = result;
          const pickleKey = Buffer.from(this.crypto.olmDevice.pickleKey);
          const decrypted = await (0, _aes.decryptAES)(key, pickleKey, DEHYDRATION_ALGORITHM);
          this.key = (0, _olmlib.decodeBase64)(decrypted);
          this.keyInfo = keyInfo;
          this.deviceDisplayName = deviceDisplayName;
          const now = Date.now();
          const delay = Math.max(1, time + oneweek - now);
          this.timeoutId = global.setTimeout(this.dehydrateDevice.bind(this), delay);
        }
      }, "dehydration");
    });
  }

  /** set the key, and queue periodic dehydration to the server in the background */
  async setKeyAndQueueDehydration(key, keyInfo = {}, deviceDisplayName) {
    const matches = await this.setKey(key, keyInfo, deviceDisplayName);
    if (!matches) {
      // start dehydration in the background
      this.dehydrateDevice();
    }
  }
  async setKey(key, keyInfo = {}, deviceDisplayName) {
    if (!key) {
      // unsetting the key -- cancel any pending dehydration task
      if (this.timeoutId) {
        global.clearTimeout(this.timeoutId);
        this.timeoutId = undefined;
      }
      // clear storage
      await this.crypto.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
        this.crypto.cryptoStore.storeSecretStorePrivateKey(txn, "dehydration", null);
      });
      this.key = undefined;
      this.keyInfo = undefined;
      return;
    }

    // Check to see if it's the same key as before.  If it's different,
    // dehydrate a new device.  If it's the same, we can keep the same
    // device.  (Assume that keyInfo and deviceDisplayName will be the
    // same if the key is the same.)
    let matches = !!this.key && key.length == this.key.length;
    for (let i = 0; matches && i < key.length; i++) {
      if (key[i] != this.key[i]) {
        matches = false;
      }
    }
    if (!matches) {
      this.key = key;
      this.keyInfo = keyInfo;
      this.deviceDisplayName = deviceDisplayName;
    }
    return matches;
  }

  /** returns the device id of the newly created dehydrated device */
  async dehydrateDevice() {
    if (this.inProgress) {
      _logger.logger.log("Dehydration already in progress -- not starting new dehydration");
      return;
    }
    this.inProgress = true;
    if (this.timeoutId) {
      global.clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    try {
      const pickleKey = Buffer.from(this.crypto.olmDevice.pickleKey);

      // update the crypto store with the timestamp
      const key = await (0, _aes.encryptAES)((0, _olmlib.encodeBase64)(this.key), pickleKey, DEHYDRATION_ALGORITHM);
      await this.crypto.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
        this.crypto.cryptoStore.storeSecretStorePrivateKey(txn, "dehydration", {
          keyInfo: this.keyInfo,
          key,
          deviceDisplayName: this.deviceDisplayName,
          time: Date.now()
        });
      });
      _logger.logger.log("Attempting to dehydrate device");
      _logger.logger.log("Creating account");
      // create the account and all the necessary keys
      const account = new global.Olm.Account();
      account.create();
      const e2eKeys = JSON.parse(account.identity_keys());
      const maxKeys = account.max_number_of_one_time_keys();
      // FIXME: generate in small batches?
      account.generate_one_time_keys(maxKeys / 2);
      account.generate_fallback_key();
      const otks = JSON.parse(account.one_time_keys());
      const fallbacks = JSON.parse(account.fallback_key());
      account.mark_keys_as_published();

      // dehydrate the account and store it on the server
      const pickledAccount = account.pickle(new Uint8Array(this.key));
      const deviceData = {
        algorithm: DEHYDRATION_ALGORITHM,
        account: pickledAccount
      };
      if (this.keyInfo.passphrase) {
        deviceData.passphrase = this.keyInfo.passphrase;
      }
      _logger.logger.log("Uploading account to server");
      // eslint-disable-next-line camelcase
      const dehydrateResult = await this.crypto.baseApis.http.authedRequest(_httpApi.Method.Put, "/dehydrated_device", undefined, {
        device_data: deviceData,
        initial_device_display_name: this.deviceDisplayName
      }, {
        prefix: "/_matrix/client/unstable/org.matrix.msc2697.v2"
      });

      // send the keys to the server
      const deviceId = dehydrateResult.device_id;
      _logger.logger.log("Preparing device keys", deviceId);
      const deviceKeys = {
        algorithms: this.crypto.supportedAlgorithms,
        device_id: deviceId,
        user_id: this.crypto.userId,
        keys: {
          [`ed25519:${deviceId}`]: e2eKeys.ed25519,
          [`curve25519:${deviceId}`]: e2eKeys.curve25519
        }
      };
      const deviceSignature = account.sign(_anotherJson.default.stringify(deviceKeys));
      deviceKeys.signatures = {
        [this.crypto.userId]: {
          [`ed25519:${deviceId}`]: deviceSignature
        }
      };
      if (this.crypto.crossSigningInfo.getId("self_signing")) {
        await this.crypto.crossSigningInfo.signObject(deviceKeys, "self_signing");
      }
      _logger.logger.log("Preparing one-time keys");
      const oneTimeKeys = {};
      for (const [keyId, key] of Object.entries(otks.curve25519)) {
        const k = {
          key
        };
        const signature = account.sign(_anotherJson.default.stringify(k));
        k.signatures = {
          [this.crypto.userId]: {
            [`ed25519:${deviceId}`]: signature
          }
        };
        oneTimeKeys[`signed_curve25519:${keyId}`] = k;
      }
      _logger.logger.log("Preparing fallback keys");
      const fallbackKeys = {};
      for (const [keyId, key] of Object.entries(fallbacks.curve25519)) {
        const k = {
          key,
          fallback: true
        };
        const signature = account.sign(_anotherJson.default.stringify(k));
        k.signatures = {
          [this.crypto.userId]: {
            [`ed25519:${deviceId}`]: signature
          }
        };
        fallbackKeys[`signed_curve25519:${keyId}`] = k;
      }
      _logger.logger.log("Uploading keys to server");
      await this.crypto.baseApis.http.authedRequest(_httpApi.Method.Post, "/keys/upload/" + encodeURI(deviceId), undefined, {
        "device_keys": deviceKeys,
        "one_time_keys": oneTimeKeys,
        "org.matrix.msc2732.fallback_keys": fallbackKeys
      });
      _logger.logger.log("Done dehydrating");

      // dehydrate again in a week
      this.timeoutId = global.setTimeout(this.dehydrateDevice.bind(this), oneweek);
      return deviceId;
    } finally {
      this.inProgress = false;
    }
  }
  stop() {
    if (this.timeoutId) {
      global.clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
exports.DehydrationManager = DehydrationManager;