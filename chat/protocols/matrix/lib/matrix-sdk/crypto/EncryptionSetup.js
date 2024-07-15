"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EncryptionSetupOperation = exports.EncryptionSetupBuilder = void 0;
var _logger = require("../logger");
var _event = require("../models/event");
var _CrossSigning = require("./CrossSigning");
var _indexeddbCryptoStore = require("./store/indexeddb-crypto-store");
var _httpApi = require("../http-api");
var _client = require("../client");
var _typedEventEmitter = require("../models/typed-event-emitter");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2021 The Matrix.org Foundation C.I.C.

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
/**
 * Builds an EncryptionSetupOperation by calling any of the add.. methods.
 * Once done, `buildOperation()` can be called which allows to apply to operation.
 *
 * This is used as a helper by Crypto to keep track of all the network requests
 * and other side-effects of bootstrapping, so it can be applied in one go (and retried in the future)
 * Also keeps track of all the private keys created during bootstrapping, so we don't need to prompt for them
 * more than once.
 */
class EncryptionSetupBuilder {
  /**
   * @param accountData - pre-existing account data, will only be read, not written.
   * @param delegateCryptoCallbacks - crypto callbacks to delegate to if the key isn't in cache yet
   */
  constructor(accountData, delegateCryptoCallbacks) {
    _defineProperty(this, "accountDataClientAdapter", void 0);
    _defineProperty(this, "crossSigningCallbacks", void 0);
    _defineProperty(this, "ssssCryptoCallbacks", void 0);
    _defineProperty(this, "crossSigningKeys", void 0);
    _defineProperty(this, "keySignatures", void 0);
    _defineProperty(this, "keyBackupInfo", void 0);
    _defineProperty(this, "sessionBackupPrivateKey", void 0);
    this.accountDataClientAdapter = new AccountDataClientAdapter(accountData);
    this.crossSigningCallbacks = new CrossSigningCallbacks();
    this.ssssCryptoCallbacks = new SSSSCryptoCallbacks(delegateCryptoCallbacks);
  }

  /**
   * Adds new cross-signing public keys
   *
   * @param authUpload - Function called to await an interactive auth
   * flow when uploading device signing keys.
   * Args:
   *     A function that makes the request requiring auth. Receives
   *     the auth data as an object. Can be called multiple times, first with
   *     an empty authDict, to obtain the flows.
   * @param keys - the new keys
   */
  addCrossSigningKeys(authUpload, keys) {
    this.crossSigningKeys = {
      authUpload,
      keys
    };
  }

  /**
   * Adds the key backup info to be updated on the server
   *
   * Used either to create a new key backup, or add signatures
   * from the new MSK.
   *
   * @param keyBackupInfo - as received from/sent to the server
   */
  addSessionBackup(keyBackupInfo) {
    this.keyBackupInfo = keyBackupInfo;
  }

  /**
   * Adds the session backup private key to be updated in the local cache
   *
   * Used after fixing the format of the key
   *
   */
  addSessionBackupPrivateKeyToCache(privateKey) {
    this.sessionBackupPrivateKey = privateKey;
  }

  /**
   * Add signatures from a given user and device/x-sign key
   * Used to sign the new cross-signing key with the device key
   *
   */
  addKeySignature(userId, deviceId, signature) {
    if (!this.keySignatures) {
      this.keySignatures = {};
    }
    const userSignatures = this.keySignatures[userId] || {};
    this.keySignatures[userId] = userSignatures;
    userSignatures[deviceId] = signature;
  }
  async setAccountData(type, content) {
    await this.accountDataClientAdapter.setAccountData(type, content);
  }

  /**
   * builds the operation containing all the parts that have been added to the builder
   */
  buildOperation() {
    const accountData = this.accountDataClientAdapter.values;
    return new EncryptionSetupOperation(accountData, this.crossSigningKeys, this.keyBackupInfo, this.keySignatures);
  }

  /**
   * Stores the created keys locally.
   *
   * This does not yet store the operation in a way that it can be restored,
   * but that is the idea in the future.
   */
  async persist(crypto) {
    // store private keys in cache
    if (this.crossSigningKeys) {
      const cacheCallbacks = (0, _CrossSigning.createCryptoStoreCacheCallbacks)(crypto.cryptoStore, crypto.olmDevice);
      for (const type of ["master", "self_signing", "user_signing"]) {
        _logger.logger.log(`Cache ${type} cross-signing private key locally`);
        const privateKey = this.crossSigningCallbacks.privateKeys.get(type);
        await cacheCallbacks.storeCrossSigningKeyCache?.(type, privateKey);
      }
      // store own cross-sign pubkeys as trusted
      await crypto.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
        crypto.cryptoStore.storeCrossSigningKeys(txn, this.crossSigningKeys.keys);
      });
    }
    // store session backup key in cache
    if (this.sessionBackupPrivateKey) {
      await crypto.storeSessionBackupPrivateKey(this.sessionBackupPrivateKey);
    }
  }
}

/**
 * Can be created from EncryptionSetupBuilder, or
 * (in a follow-up PR, not implemented yet) restored from storage, to retry.
 *
 * It does not have knowledge of any private keys, unlike the builder.
 */
exports.EncryptionSetupBuilder = EncryptionSetupBuilder;
class EncryptionSetupOperation {
  /**
   */
  constructor(accountData, crossSigningKeys, keyBackupInfo, keySignatures) {
    this.accountData = accountData;
    this.crossSigningKeys = crossSigningKeys;
    this.keyBackupInfo = keyBackupInfo;
    this.keySignatures = keySignatures;
  }

  /**
   * Runs the (remaining part of, in the future) operation by sending requests to the server.
   */
  async apply(crypto) {
    const baseApis = crypto.baseApis;
    // upload cross-signing keys
    if (this.crossSigningKeys) {
      const keys = {};
      for (const [name, key] of Object.entries(this.crossSigningKeys.keys)) {
        keys[name + "_key"] = key;
      }

      // We must only call `uploadDeviceSigningKeys` from inside this auth
      // helper to ensure we properly handle auth errors.
      await this.crossSigningKeys.authUpload?.(authDict => {
        return baseApis.uploadDeviceSigningKeys(authDict ?? undefined, keys);
      });

      // pass the new keys to the main instance of our own CrossSigningInfo.
      crypto.crossSigningInfo.setKeys(this.crossSigningKeys.keys);
    }
    // set account data
    if (this.accountData) {
      for (const [type, content] of this.accountData) {
        await baseApis.setAccountData(type, content);
      }
    }
    // upload first cross-signing signatures with the new key
    // (e.g. signing our own device)
    if (this.keySignatures) {
      await baseApis.uploadKeySignatures(this.keySignatures);
    }
    // need to create/update key backup info
    if (this.keyBackupInfo) {
      if (this.keyBackupInfo.version) {
        // session backup signature
        // The backup is trusted because the user provided the private key.
        // Sign the backup with the cross signing key so the key backup can
        // be trusted via cross-signing.
        await baseApis.http.authedRequest(_httpApi.Method.Put, "/room_keys/version/" + this.keyBackupInfo.version, undefined, {
          algorithm: this.keyBackupInfo.algorithm,
          auth_data: this.keyBackupInfo.auth_data
        }, {
          prefix: _httpApi.ClientPrefix.V3
        });
      } else {
        // add new key backup
        await baseApis.http.authedRequest(_httpApi.Method.Post, "/room_keys/version", undefined, this.keyBackupInfo, {
          prefix: _httpApi.ClientPrefix.V3
        });
      }
      // tell the backup manager to re-check the keys now that they have been (maybe) updated
      await crypto.backupManager.checkKeyBackup();
    }
  }
}

/**
 * Catches account data set by SecretStorage during bootstrapping by
 * implementing the methods related to account data in MatrixClient
 */
exports.EncryptionSetupOperation = EncryptionSetupOperation;
class AccountDataClientAdapter extends _typedEventEmitter.TypedEventEmitter {
  /**
   * @param existingValues - existing account data
   */
  constructor(existingValues) {
    super();
    this.existingValues = existingValues;
    //
    _defineProperty(this, "values", new Map());
  }

  /**
   * @returns the content of the account data
   */
  getAccountDataFromServer(type) {
    return Promise.resolve(this.getAccountData(type));
  }

  /**
   * @returns the content of the account data
   */
  getAccountData(type) {
    const modifiedValue = this.values.get(type);
    if (modifiedValue) {
      return modifiedValue;
    }
    const existingValue = this.existingValues.get(type);
    if (existingValue) {
      return existingValue.getContent();
    }
    return null;
  }
  setAccountData(type, content) {
    const lastEvent = this.values.get(type);
    this.values.set(type, content);
    // ensure accountData is emitted on the next tick,
    // as SecretStorage listens for it while calling this method
    // and it seems to rely on this.
    return Promise.resolve().then(() => {
      const event = new _event.MatrixEvent({
        type,
        content
      });
      this.emit(_client.ClientEvent.AccountData, event, lastEvent);
      return {};
    });
  }
}

/**
 * Catches the private cross-signing keys set during bootstrapping
 * by both cache callbacks (see createCryptoStoreCacheCallbacks) as non-cache callbacks.
 * See CrossSigningInfo constructor
 */
class CrossSigningCallbacks {
  constructor() {
    _defineProperty(this, "privateKeys", new Map());
  }
  // cache callbacks
  getCrossSigningKeyCache(type, expectedPublicKey) {
    return this.getCrossSigningKey(type, expectedPublicKey);
  }
  storeCrossSigningKeyCache(type, key) {
    this.privateKeys.set(type, key);
    return Promise.resolve();
  }

  // non-cache callbacks
  getCrossSigningKey(type, expectedPubkey) {
    return Promise.resolve(this.privateKeys.get(type) ?? null);
  }
  saveCrossSigningKeys(privateKeys) {
    for (const [type, privateKey] of Object.entries(privateKeys)) {
      this.privateKeys.set(type, privateKey);
    }
  }
}

/**
 * Catches the 4S private key set during bootstrapping by implementing
 * the SecretStorage crypto callbacks
 */
class SSSSCryptoCallbacks {
  constructor(delegateCryptoCallbacks) {
    this.delegateCryptoCallbacks = delegateCryptoCallbacks;
    _defineProperty(this, "privateKeys", new Map());
  }
  async getSecretStorageKey({
    keys
  }, name) {
    for (const keyId of Object.keys(keys)) {
      const privateKey = this.privateKeys.get(keyId);
      if (privateKey) {
        return [keyId, privateKey];
      }
    }
    // if we don't have the key cached yet, ask
    // for it to the general crypto callbacks and cache it
    if (this?.delegateCryptoCallbacks?.getSecretStorageKey) {
      const result = await this.delegateCryptoCallbacks.getSecretStorageKey({
        keys
      }, name);
      if (result) {
        const [keyId, privateKey] = result;
        this.privateKeys.set(keyId, privateKey);
      }
      return result;
    }
    return null;
  }
  addPrivateKey(keyId, keyInfo, privKey) {
    this.privateKeys.set(keyId, privKey);
    // Also pass along to application to cache if it wishes
    this.delegateCryptoCallbacks?.cacheSecretStorageKey?.(keyId, keyInfo, privKey);
  }
}