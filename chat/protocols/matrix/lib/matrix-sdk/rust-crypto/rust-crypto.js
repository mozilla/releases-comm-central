"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RustCrypto = void 0;
var _anotherJson = _interopRequireDefault(require("another-json"));
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var _event = require("../models/event");
var _logger = require("../logger");
var _httpApi = require("../http-api");
var _RoomEncryptor = require("./RoomEncryptor");
var _OutgoingRequestProcessor = require("./OutgoingRequestProcessor");
var _KeyClaimManager = require("./KeyClaimManager");
var _utils = require("../utils");
var _cryptoApi = require("../crypto-api");
var _deviceConverter = require("./device-converter");
var _secretStorage = require("../secret-storage");
var _CrossSigningIdentity = require("./CrossSigningIdentity");
var _secretStorage2 = require("./secret-storage");
var _key_passphrase = require("../crypto/key_passphrase");
var _recoverykey = require("../crypto/recoverykey");
var _crypto = require("../crypto/crypto");
var _verification = require("./verification");
var _event2 = require("../@types/event");
var _crypto2 = require("../crypto");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _backup = require("./backup");
var _ReEmitter = require("../ReEmitter");
var _randomstring = require("../randomstring");
var _errors = require("../errors");
var _base = require("../base64");
var _algorithms = require("../crypto/algorithms");
var _OutgoingRequestsManager = require("./OutgoingRequestsManager");
var _PerSessionKeyBackupDownloader = require("./PerSessionKeyBackupDownloader");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2022-2023 The Matrix.org Foundation C.I.C.

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
const ALL_VERIFICATION_METHODS = ["m.sas.v1", "m.qr_code.scan.v1", "m.qr_code.show.v1", "m.reciprocate.v1"];
/**
 * An implementation of {@link CryptoBackend} using the Rust matrix-sdk-crypto.
 *
 * @internal
 */
class RustCrypto extends _typedEventEmitter.TypedEventEmitter {
  constructor(logger, /** The `OlmMachine` from the underlying rust crypto sdk. */
  olmMachine,
  /**
   * Low-level HTTP interface: used to make outgoing requests required by the rust SDK.
   *
   * We expect it to set the access token, etc.
   */
  http, /** The local user's User ID. */
  userId, /** The local user's Device ID. */
  _deviceId, /** Interface to server-side secret storage */
  secretStorage, /** Crypto callbacks provided by the application */
  cryptoCallbacks) {
    super();
    this.logger = logger;
    this.olmMachine = olmMachine;
    this.http = http;
    this.userId = userId;
    this.secretStorage = secretStorage;
    this.cryptoCallbacks = cryptoCallbacks;
    _defineProperty(this, "_trustCrossSignedDevices", true);
    /** whether {@link stop} has been called */
    _defineProperty(this, "stopped", false);
    /** mapping of roomId → encryptor class */
    _defineProperty(this, "roomEncryptors", {});
    _defineProperty(this, "eventDecryptor", void 0);
    _defineProperty(this, "keyClaimManager", void 0);
    _defineProperty(this, "outgoingRequestProcessor", void 0);
    _defineProperty(this, "crossSigningIdentity", void 0);
    _defineProperty(this, "backupManager", void 0);
    _defineProperty(this, "outgoingRequestsManager", void 0);
    _defineProperty(this, "perSessionBackupDownloader", void 0);
    _defineProperty(this, "reemitter", new _ReEmitter.TypedReEmitter(this));
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // CryptoApi implementation
    //
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    _defineProperty(this, "globalBlacklistUnverifiedDevices", false);
    /**
     * The verification methods we offer to the other side during an interactive verification.
     */
    _defineProperty(this, "_supportedVerificationMethods", ALL_VERIFICATION_METHODS);
    this.outgoingRequestProcessor = new _OutgoingRequestProcessor.OutgoingRequestProcessor(olmMachine, http);
    this.outgoingRequestsManager = new _OutgoingRequestsManager.OutgoingRequestsManager(this.logger, olmMachine, this.outgoingRequestProcessor);
    this.keyClaimManager = new _KeyClaimManager.KeyClaimManager(olmMachine, this.outgoingRequestProcessor);
    this.backupManager = new _backup.RustBackupManager(olmMachine, http, this.outgoingRequestProcessor);
    this.perSessionBackupDownloader = new _PerSessionKeyBackupDownloader.PerSessionKeyBackupDownloader(this.logger, this.olmMachine, this.http, this.backupManager);
    this.eventDecryptor = new EventDecryptor(this.logger, olmMachine, this.perSessionBackupDownloader);
    this.reemitter.reEmit(this.backupManager, [_crypto2.CryptoEvent.KeyBackupStatus, _crypto2.CryptoEvent.KeyBackupSessionsRemaining, _crypto2.CryptoEvent.KeyBackupFailed, _crypto2.CryptoEvent.KeyBackupDecryptionKeyCached]);
    this.crossSigningIdentity = new _CrossSigningIdentity.CrossSigningIdentity(olmMachine, this.outgoingRequestProcessor, secretStorage);

    // Check and start in background the key backup connection
    this.checkKeyBackupAndEnable();
  }

  /**
   * Return the OlmMachine only if {@link RustCrypto#stop} has not been called.
   *
   * This allows us to better handle race conditions where the client is stopped before or during a crypto API call.
   *
   * @throws ClientStoppedError if {@link RustCrypto#stop} has been called.
   */
  getOlmMachineOrThrow() {
    if (this.stopped) {
      throw new _errors.ClientStoppedError();
    }
    return this.olmMachine;
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // CryptoBackend implementation
  //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  set globalErrorOnUnknownDevices(_v) {
    // Not implemented for rust crypto.
  }
  get globalErrorOnUnknownDevices() {
    // Not implemented for rust crypto.
    return false;
  }
  stop() {
    // stop() may be called multiple times, but attempting to close() the OlmMachine twice
    // will cause an error.
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.keyClaimManager.stop();
    this.backupManager.stop();
    this.outgoingRequestsManager.stop();
    this.perSessionBackupDownloader.stop();

    // make sure we close() the OlmMachine; doing so means that all the Rust objects will be
    // cleaned up; in particular, the indexeddb connections will be closed, which means they
    // can then be deleted.
    this.olmMachine.close();
  }
  async encryptEvent(event, _room) {
    const roomId = event.getRoomId();
    const encryptor = this.roomEncryptors[roomId];
    if (!encryptor) {
      throw new Error(`Cannot encrypt event in unconfigured room ${roomId}`);
    }
    await encryptor.encryptEvent(event, this.globalBlacklistUnverifiedDevices);
  }
  async decryptEvent(event) {
    const roomId = event.getRoomId();
    if (!roomId) {
      // presumably, a to-device message. These are normally decrypted in preprocessToDeviceMessages
      // so the fact it has come back here suggests that decryption failed.
      //
      // once we drop support for the libolm crypto implementation, we can stop passing to-device messages
      // through decryptEvent and hence get rid of this case.
      throw new Error("to-device event was not decrypted in preprocessToDeviceMessages");
    }
    return await this.eventDecryptor.attemptEventDecryption(event);
  }

  /**
   * Implementation of (deprecated) {@link MatrixClient#getEventEncryptionInfo}.
   *
   * @param event - event to inspect
   */
  getEventEncryptionInfo(event) {
    const ret = {};
    ret.senderKey = event.getSenderKey() ?? undefined;
    ret.algorithm = event.getWireContent().algorithm;
    if (!ret.senderKey || !ret.algorithm) {
      ret.encrypted = false;
      return ret;
    }
    ret.encrypted = true;
    ret.authenticated = true;
    ret.mismatchedSender = true;
    return ret;
  }

  /**
   * Implementation of {@link CryptoBackend#checkUserTrust}.
   *
   * Stub for backwards compatibility.
   *
   */
  checkUserTrust(userId) {
    return new _cryptoApi.UserVerificationStatus(false, false, false);
  }

  /**
   * Get the cross signing information for a given user.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param userId - the user ID to get the cross-signing info for.
   *
   * @returns the cross signing information for the user.
   */
  getStoredCrossSigningForUser(userId) {
    // TODO
    return null;
  }

  /**
   * This function is unneeded for the rust-crypto.
   * The cross signing key import and the device verification are done in {@link CryptoApi#bootstrapCrossSigning}
   *
   * The function is stub to keep the compatibility with the old crypto.
   * More information: https://github.com/vector-im/element-web/issues/25648
   *
   * Implementation of {@link CryptoBackend#checkOwnCrossSigningTrust}
   */
  async checkOwnCrossSigningTrust() {
    return;
  }
  /**
   * Implementation of {@link CryptoApi#getVersion}.
   */
  getVersion() {
    const versions = RustSdkCryptoJs.getVersions();
    return `Rust SDK ${versions.matrix_sdk_crypto} (${versions.git_sha}), Vodozemac ${versions.vodozemac}`;
  }

  /**
   * Implementation of {@link CryptoApi#isEncryptionEnabledInRoom}.
   */
  async isEncryptionEnabledInRoom(roomId) {
    const roomSettings = await this.olmMachine.getRoomSettings(new RustSdkCryptoJs.RoomId(roomId));
    return Boolean(roomSettings?.algorithm);
  }

  /**
   * Implementation of {@link CryptoApi#getOwnDeviceKeys}.
   */
  async getOwnDeviceKeys() {
    const keys = this.olmMachine.identityKeys;
    return {
      ed25519: keys.ed25519.toBase64(),
      curve25519: keys.curve25519.toBase64()
    };
  }
  prepareToEncrypt(room) {
    const encryptor = this.roomEncryptors[room.roomId];
    if (encryptor) {
      encryptor.prepareForEncryption(this.globalBlacklistUnverifiedDevices);
    }
  }
  forceDiscardSession(roomId) {
    return this.roomEncryptors[roomId]?.forceDiscardSession();
  }
  async exportRoomKeys() {
    const raw = await this.olmMachine.exportRoomKeys(() => true);
    return JSON.parse(raw);
  }
  async exportRoomKeysAsJson() {
    return await this.olmMachine.exportRoomKeys(() => true);
  }
  async importRoomKeys(keys, opts) {
    return await this.backupManager.importRoomKeys(keys, opts);
  }
  async importRoomKeysAsJson(keys, opts) {
    return await this.backupManager.importRoomKeysAsJson(keys, opts);
  }

  /**
   * Implementation of {@link CryptoApi.userHasCrossSigningKeys}.
   */
  async userHasCrossSigningKeys(userId = this.userId, downloadUncached = false) {
    // TODO: could probably do with a more efficient way of doing this than returning the whole set and searching
    const rustTrackedUsers = await this.olmMachine.trackedUsers();
    let rustTrackedUser;
    for (const u of rustTrackedUsers) {
      if (userId === u.toString()) {
        rustTrackedUser = u;
        break;
      }
    }
    if (rustTrackedUser !== undefined) {
      if (userId === this.userId) {
        /* make sure we have an *up-to-date* idea of the user's cross-signing keys. This is important, because if we
         * return "false" here, we will end up generating new cross-signing keys and replacing the existing ones.
         */
        const request = this.olmMachine.queryKeysForUsers(
        // clone as rust layer will take ownership and it's reused later
        [rustTrackedUser.clone()]);
        await this.outgoingRequestProcessor.makeOutgoingRequest(request);
      }
      const userIdentity = await this.olmMachine.getIdentity(rustTrackedUser);
      userIdentity?.free();
      return userIdentity !== undefined;
    } else if (downloadUncached) {
      // Download the cross signing keys and check if the master key is available
      const keyResult = await this.downloadDeviceList(new Set([userId]));
      const keys = keyResult.master_keys?.[userId];

      // No master key
      if (!keys) return false;

      // `keys` is an object with { [`ed25519:${pubKey}`]: pubKey }
      // We assume only a single key, and we want the bare form without type
      // prefix, so we select the values.
      return Boolean(Object.values(keys.keys)[0]);
    } else {
      return false;
    }
  }

  /**
   * Get the device information for the given list of users.
   *
   * @param userIds - The users to fetch.
   * @param downloadUncached - If true, download the device list for users whose device list we are not
   *    currently tracking. Defaults to false, in which case such users will not appear at all in the result map.
   *
   * @returns A map `{@link DeviceMap}`.
   */
  async getUserDeviceInfo(userIds, downloadUncached = false) {
    const deviceMapByUserId = new Map();
    const rustTrackedUsers = await this.getOlmMachineOrThrow().trackedUsers();

    // Convert RustSdkCryptoJs.UserId to a `Set<string>`
    const trackedUsers = new Set();
    rustTrackedUsers.forEach(rustUserId => trackedUsers.add(rustUserId.toString()));

    // Keep untracked user to download their keys after
    const untrackedUsers = new Set();
    for (const userId of userIds) {
      // if this is a tracked user, we can just fetch the device list from the rust-sdk
      // (NB: this is probably ok even if we race with a leave event such that we stop tracking the user's
      // devices: the rust-sdk will return the last-known device list, which will be good enough.)
      if (trackedUsers.has(userId)) {
        deviceMapByUserId.set(userId, await this.getUserDevices(userId));
      } else {
        untrackedUsers.add(userId);
      }
    }

    // for any users whose device lists we are not tracking, fall back to downloading the device list
    // over HTTP.
    if (downloadUncached && untrackedUsers.size >= 1) {
      const queryResult = await this.downloadDeviceList(untrackedUsers);
      Object.entries(queryResult.device_keys).forEach(([userId, deviceKeys]) => deviceMapByUserId.set(userId, (0, _deviceConverter.deviceKeysToDeviceMap)(deviceKeys)));
    }
    return deviceMapByUserId;
  }

  /**
   * Get the device list for the given user from the olm machine
   * @param userId - Rust SDK UserId
   */
  async getUserDevices(userId) {
    const rustUserId = new RustSdkCryptoJs.UserId(userId);

    // For reasons I don't really understand, the Javascript FinalizationRegistry doesn't seem to run the
    // registered callbacks when `userDevices` goes out of scope, nor when the individual devices in the array
    // returned by `userDevices.devices` do so.
    //
    // This is particularly problematic, because each of those structures holds a reference to the
    // VerificationMachine, which in turn holds a reference to the IndexeddbCryptoStore. Hence, we end up leaking
    // open connections to the crypto store, which means the store can't be deleted on logout.
    //
    // To fix this, we explicitly call `.free` on each of the objects, which tells the rust code to drop the
    // allocated memory and decrement the refcounts for the crypto store.

    // Wait for up to a second for any in-flight device list requests to complete.
    // The reason for this isn't so much to avoid races (some level of raciness is
    // inevitable for this method) but to make testing easier.
    const userDevices = await this.olmMachine.getUserDevices(rustUserId, 1);
    try {
      const deviceArray = userDevices.devices();
      try {
        return new Map(deviceArray.map(device => [device.deviceId.toString(), (0, _deviceConverter.rustDeviceToJsDevice)(device, rustUserId)]));
      } finally {
        deviceArray.forEach(d => d.free());
      }
    } finally {
      userDevices.free();
    }
  }

  /**
   * Download the given user keys by calling `/keys/query` request
   * @param untrackedUsers - download keys of these users
   */
  async downloadDeviceList(untrackedUsers) {
    const queryBody = {
      device_keys: {}
    };
    untrackedUsers.forEach(user => queryBody.device_keys[user] = []);
    return await this.http.authedRequest(_httpApi.Method.Post, "/_matrix/client/v3/keys/query", undefined, queryBody, {
      prefix: ""
    });
  }

  /**
   * Implementation of {@link CryptoApi#getTrustCrossSignedDevices}.
   */
  getTrustCrossSignedDevices() {
    return this._trustCrossSignedDevices;
  }

  /**
   * Implementation of {@link CryptoApi#setTrustCrossSignedDevices}.
   */
  setTrustCrossSignedDevices(val) {
    this._trustCrossSignedDevices = val;
    // TODO: legacy crypto goes through the list of known devices and emits DeviceVerificationChanged
    //  events. Maybe we need to do the same?
  }

  /**
   * Mark the given device as locally verified.
   *
   * Implementation of {@link CryptoApi#setDeviceVerified}.
   */
  async setDeviceVerified(userId, deviceId, verified = true) {
    const device = await this.olmMachine.getDevice(new RustSdkCryptoJs.UserId(userId), new RustSdkCryptoJs.DeviceId(deviceId));
    if (!device) {
      throw new Error(`Unknown device ${userId}|${deviceId}`);
    }
    try {
      await device.setLocalTrust(verified ? RustSdkCryptoJs.LocalTrust.Verified : RustSdkCryptoJs.LocalTrust.Unset);
    } finally {
      device.free();
    }
  }

  /**
   * Blindly cross-sign one of our other devices.
   *
   * Implementation of {@link CryptoApi#crossSignDevice}.
   */
  async crossSignDevice(deviceId) {
    const device = await this.olmMachine.getDevice(new RustSdkCryptoJs.UserId(this.userId), new RustSdkCryptoJs.DeviceId(deviceId));
    if (!device) {
      throw new Error(`Unknown device ${deviceId}`);
    }
    try {
      const outgoingRequest = await device.verify();
      await this.outgoingRequestProcessor.makeOutgoingRequest(outgoingRequest);
    } finally {
      device.free();
    }
  }

  /**
   * Implementation of {@link CryptoApi#getDeviceVerificationStatus}.
   */
  async getDeviceVerificationStatus(userId, deviceId) {
    const device = await this.olmMachine.getDevice(new RustSdkCryptoJs.UserId(userId), new RustSdkCryptoJs.DeviceId(deviceId));
    if (!device) return null;
    try {
      return new _cryptoApi.DeviceVerificationStatus({
        signedByOwner: device.isCrossSignedByOwner(),
        crossSigningVerified: device.isCrossSigningTrusted(),
        localVerified: device.isLocallyTrusted(),
        trustCrossSignedDevices: this._trustCrossSignedDevices
      });
    } finally {
      device.free();
    }
  }

  /**
   * Implementation of {@link CryptoApi#getUserVerificationStatus}.
   */
  async getUserVerificationStatus(userId) {
    const userIdentity = await this.getOlmMachineOrThrow().getIdentity(new RustSdkCryptoJs.UserId(userId));
    if (userIdentity === undefined) {
      return new _cryptoApi.UserVerificationStatus(false, false, false);
    }
    const verified = userIdentity.isVerified();
    userIdentity.free();
    return new _cryptoApi.UserVerificationStatus(verified, false, false);
  }

  /**
   * Implementation of {@link CryptoApi#isCrossSigningReady}
   */
  async isCrossSigningReady() {
    const {
      publicKeysOnDevice,
      privateKeysInSecretStorage,
      privateKeysCachedLocally
    } = await this.getCrossSigningStatus();
    const hasKeysInCache = Boolean(privateKeysCachedLocally.masterKey) && Boolean(privateKeysCachedLocally.selfSigningKey) && Boolean(privateKeysCachedLocally.userSigningKey);

    // The cross signing is ready if the public and private keys are available
    return publicKeysOnDevice && (hasKeysInCache || privateKeysInSecretStorage);
  }

  /**
   * Implementation of {@link CryptoApi#getCrossSigningKeyId}
   */
  async getCrossSigningKeyId(type = _cryptoApi.CrossSigningKey.Master) {
    const userIdentity = await this.olmMachine.getIdentity(new RustSdkCryptoJs.UserId(this.userId));
    if (!userIdentity) {
      // The public keys are not available on this device
      return null;
    }
    try {
      const crossSigningStatus = await this.olmMachine.crossSigningStatus();
      const privateKeysOnDevice = crossSigningStatus.hasMaster && crossSigningStatus.hasUserSigning && crossSigningStatus.hasSelfSigning;
      if (!privateKeysOnDevice) {
        // The private keys are not available on this device
        return null;
      }
      if (!userIdentity.isVerified()) {
        // We have both public and private keys, but they don't match!
        return null;
      }
      let key;
      switch (type) {
        case _cryptoApi.CrossSigningKey.Master:
          key = userIdentity.masterKey;
          break;
        case _cryptoApi.CrossSigningKey.SelfSigning:
          key = userIdentity.selfSigningKey;
          break;
        case _cryptoApi.CrossSigningKey.UserSigning:
          key = userIdentity.userSigningKey;
          break;
        default:
          // Unknown type
          return null;
      }
      const parsedKey = JSON.parse(key);
      // `keys` is an object with { [`ed25519:${pubKey}`]: pubKey }
      // We assume only a single key, and we want the bare form without type
      // prefix, so we select the values.
      return Object.values(parsedKey.keys)[0];
    } finally {
      userIdentity.free();
    }
  }

  /**
   * Implementation of {@link CryptoApi#boostrapCrossSigning}
   */
  async bootstrapCrossSigning(opts) {
    await this.crossSigningIdentity.bootstrapCrossSigning(opts);
  }

  /**
   * Implementation of {@link CryptoApi#isSecretStorageReady}
   */
  async isSecretStorageReady() {
    // make sure that the cross-signing keys are stored
    const secretsToCheck = ["m.cross_signing.master", "m.cross_signing.user_signing", "m.cross_signing.self_signing"];

    // if key backup is active, we also need to check that the backup decryption key is stored
    const keyBackupEnabled = (await this.backupManager.getActiveBackupVersion()) != null;
    if (keyBackupEnabled) {
      secretsToCheck.push("m.megolm_backup.v1");
    }
    return (0, _secretStorage2.secretStorageCanAccessSecrets)(this.secretStorage, secretsToCheck);
  }

  /**
   * Implementation of {@link CryptoApi#bootstrapSecretStorage}
   */
  async bootstrapSecretStorage({
    createSecretStorageKey,
    setupNewSecretStorage,
    setupNewKeyBackup
  } = {}) {
    // If an AES Key is already stored in the secret storage and setupNewSecretStorage is not set
    // we don't want to create a new key
    const isNewSecretStorageKeyNeeded = setupNewSecretStorage || !(await this.secretStorageHasAESKey());
    if (isNewSecretStorageKeyNeeded) {
      if (!createSecretStorageKey) {
        throw new Error("unable to create a new secret storage key, createSecretStorageKey is not set");
      }

      // Create a new storage key and add it to secret storage
      this.logger.info("bootstrapSecretStorage: creating new secret storage key");
      const recoveryKey = await createSecretStorageKey();
      await this.addSecretStorageKeyToSecretStorage(recoveryKey);
    }
    const crossSigningStatus = await this.olmMachine.crossSigningStatus();
    const hasPrivateKeys = crossSigningStatus.hasMaster && crossSigningStatus.hasSelfSigning && crossSigningStatus.hasUserSigning;

    // If we have cross-signing private keys cached, store them in secret
    // storage if they are not there already.
    if (hasPrivateKeys && (isNewSecretStorageKeyNeeded || !(await (0, _secretStorage2.secretStorageContainsCrossSigningKeys)(this.secretStorage)))) {
      this.logger.info("bootstrapSecretStorage: cross-signing keys not yet exported; doing so now.");
      const crossSigningPrivateKeys = await this.olmMachine.exportCrossSigningKeys();
      if (!crossSigningPrivateKeys.masterKey) {
        throw new Error("missing master key in cross signing private keys");
      }
      if (!crossSigningPrivateKeys.userSigningKey) {
        throw new Error("missing user signing key in cross signing private keys");
      }
      if (!crossSigningPrivateKeys.self_signing_key) {
        throw new Error("missing self signing key in cross signing private keys");
      }
      await this.secretStorage.store("m.cross_signing.master", crossSigningPrivateKeys.masterKey);
      await this.secretStorage.store("m.cross_signing.user_signing", crossSigningPrivateKeys.userSigningKey);
      await this.secretStorage.store("m.cross_signing.self_signing", crossSigningPrivateKeys.self_signing_key);
    }
    if (setupNewKeyBackup) {
      await this.resetKeyBackup();
    }
  }

  /**
   * Add the secretStorage key to the secret storage
   * - The secret storage key must have the `keyInfo` field filled
   * - The secret storage key is set as the default key of the secret storage
   * - Call `cryptoCallbacks.cacheSecretStorageKey` when done
   *
   * @param secretStorageKey - The secret storage key to add in the secret storage.
   */
  async addSecretStorageKeyToSecretStorage(secretStorageKey) {
    const secretStorageKeyObject = await this.secretStorage.addKey(_secretStorage.SECRET_STORAGE_ALGORITHM_V1_AES, {
      passphrase: secretStorageKey.keyInfo?.passphrase,
      name: secretStorageKey.keyInfo?.name,
      key: secretStorageKey.privateKey
    });
    await this.secretStorage.setDefaultKeyId(secretStorageKeyObject.keyId);
    this.cryptoCallbacks.cacheSecretStorageKey?.(secretStorageKeyObject.keyId, secretStorageKeyObject.keyInfo, secretStorageKey.privateKey);
  }

  /**
   * Check if a secret storage AES Key is already added in secret storage
   *
   * @returns True if an AES key is in the secret storage
   */
  async secretStorageHasAESKey() {
    // See if we already have an AES secret-storage key.
    const secretStorageKeyTuple = await this.secretStorage.getKey();
    if (!secretStorageKeyTuple) return false;
    const [, keyInfo] = secretStorageKeyTuple;

    // Check if the key is an AES key
    return keyInfo.algorithm === _secretStorage.SECRET_STORAGE_ALGORITHM_V1_AES;
  }

  /**
   * Implementation of {@link CryptoApi#getCrossSigningStatus}
   */
  async getCrossSigningStatus() {
    const userIdentity = await this.getOlmMachineOrThrow().getIdentity(new RustSdkCryptoJs.UserId(this.userId));
    const publicKeysOnDevice = Boolean(userIdentity?.masterKey) && Boolean(userIdentity?.selfSigningKey) && Boolean(userIdentity?.userSigningKey);
    userIdentity?.free();
    const privateKeysInSecretStorage = await (0, _secretStorage2.secretStorageContainsCrossSigningKeys)(this.secretStorage);
    const crossSigningStatus = await this.getOlmMachineOrThrow().crossSigningStatus();
    return {
      publicKeysOnDevice,
      privateKeysInSecretStorage,
      privateKeysCachedLocally: {
        masterKey: Boolean(crossSigningStatus?.hasMaster),
        userSigningKey: Boolean(crossSigningStatus?.hasUserSigning),
        selfSigningKey: Boolean(crossSigningStatus?.hasSelfSigning)
      }
    };
  }

  /**
   * Implementation of {@link CryptoApi#createRecoveryKeyFromPassphrase}
   */
  async createRecoveryKeyFromPassphrase(password) {
    if (password) {
      // Generate the key from the passphrase
      const derivation = await (0, _key_passphrase.keyFromPassphrase)(password);
      return {
        keyInfo: {
          passphrase: {
            algorithm: "m.pbkdf2",
            iterations: derivation.iterations,
            salt: derivation.salt
          }
        },
        privateKey: derivation.key,
        encodedPrivateKey: (0, _recoverykey.encodeRecoveryKey)(derivation.key)
      };
    } else {
      // Using the navigator crypto API to generate the private key
      const key = new Uint8Array(32);
      _crypto.crypto.getRandomValues(key);
      return {
        privateKey: key,
        encodedPrivateKey: (0, _recoverykey.encodeRecoveryKey)(key)
      };
    }
  }

  /**
   * Implementation of {@link CryptoApi.getEncryptionInfoForEvent}.
   */
  async getEncryptionInfoForEvent(event) {
    return this.eventDecryptor.getEncryptionInfoForEvent(event);
  }

  /**
   * Returns to-device verification requests that are already in progress for the given user id.
   *
   * Implementation of {@link CryptoApi#getVerificationRequestsToDeviceInProgress}
   *
   * @param userId - the ID of the user to query
   *
   * @returns the VerificationRequests that are in progress
   */
  getVerificationRequestsToDeviceInProgress(userId) {
    const requests = this.olmMachine.getVerificationRequests(new RustSdkCryptoJs.UserId(userId));
    return requests.filter(request => request.roomId === undefined).map(request => new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods));
  }

  /**
   * Finds a DM verification request that is already in progress for the given room id
   *
   * Implementation of {@link CryptoApi#findVerificationRequestDMInProgress}
   *
   * @param roomId - the room to use for verification
   * @param userId - search the verification request for the given user
   *
   * @returns the VerificationRequest that is in progress, if any
   *
   */
  findVerificationRequestDMInProgress(roomId, userId) {
    if (!userId) throw new Error("missing userId");
    const requests = this.olmMachine.getVerificationRequests(new RustSdkCryptoJs.UserId(userId));

    // Search for the verification request for the given room id
    const request = requests.find(request => request.roomId?.toString() === roomId);
    if (request) {
      return new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods);
    }
  }

  /**
   * Implementation of {@link CryptoApi#requestVerificationDM}
   */
  async requestVerificationDM(userId, roomId) {
    const userIdentity = await this.olmMachine.getIdentity(new RustSdkCryptoJs.UserId(userId));
    if (!userIdentity) throw new Error(`unknown userId ${userId}`);
    try {
      // Transform the verification methods into rust objects
      const methods = this._supportedVerificationMethods.map(method => (0, _verification.verificationMethodIdentifierToMethod)(method));
      // Get the request content to send to the DM room
      const verificationEventContent = await userIdentity.verificationRequestContent(methods);

      // Send the request content to send to the DM room
      const eventId = await this.sendVerificationRequestContent(roomId, verificationEventContent);

      // Get a verification request
      const request = await userIdentity.requestVerification(new RustSdkCryptoJs.RoomId(roomId), new RustSdkCryptoJs.EventId(eventId), methods);
      return new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods);
    } finally {
      userIdentity.free();
    }
  }

  /**
   * Send the verification content to a room
   * See https://spec.matrix.org/v1.7/client-server-api/#put_matrixclientv3roomsroomidsendeventtypetxnid
   *
   * Prefer to use {@link OutgoingRequestProcessor.makeOutgoingRequest} when dealing with {@link RustSdkCryptoJs.RoomMessageRequest}
   *
   * @param roomId - the targeted room
   * @param verificationEventContent - the request body.
   *
   * @returns the event id
   */
  async sendVerificationRequestContent(roomId, verificationEventContent) {
    const txId = (0, _randomstring.randomString)(32);
    // Send the verification request content to the DM room
    const {
      event_id: eventId
    } = await this.http.authedRequest(_httpApi.Method.Put, `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txId)}`, undefined, verificationEventContent, {
      prefix: ""
    });
    return eventId;
  }
  /**
   * Set the verification methods we offer to the other side during an interactive verification.
   *
   * If `undefined`, we will offer all the methods supported by the Rust SDK.
   */
  setSupportedVerificationMethods(methods) {
    // by default, the Rust SDK does not offer `m.qr_code.scan.v1`, but we do want to offer that.
    this._supportedVerificationMethods = methods ?? ALL_VERIFICATION_METHODS;
  }

  /**
   * Send a verification request to our other devices.
   *
   * If a verification is already in flight, returns it. Otherwise, initiates a new one.
   *
   * Implementation of {@link CryptoApi#requestOwnUserVerification}.
   *
   * @returns a VerificationRequest when the request has been sent to the other party.
   */
  async requestOwnUserVerification() {
    const userIdentity = await this.olmMachine.getIdentity(new RustSdkCryptoJs.UserId(this.userId));
    if (userIdentity === undefined) {
      throw new Error("cannot request verification for this device when there is no existing cross-signing key");
    }
    try {
      const [request, outgoingRequest] = await userIdentity.requestVerification(this._supportedVerificationMethods.map(_verification.verificationMethodIdentifierToMethod));
      await this.outgoingRequestProcessor.makeOutgoingRequest(outgoingRequest);
      return new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods);
    } finally {
      userIdentity.free();
    }
  }

  /**
   * Request an interactive verification with the given device.
   *
   * If a verification is already in flight, returns it. Otherwise, initiates a new one.
   *
   * Implementation of {@link CryptoApi#requestDeviceVerification}.
   *
   * @param userId - ID of the owner of the device to verify
   * @param deviceId - ID of the device to verify
   *
   * @returns a VerificationRequest when the request has been sent to the other party.
   */
  async requestDeviceVerification(userId, deviceId) {
    const device = await this.olmMachine.getDevice(new RustSdkCryptoJs.UserId(userId), new RustSdkCryptoJs.DeviceId(deviceId));
    if (!device) {
      throw new Error("Not a known device");
    }
    try {
      const [request, outgoingRequest] = await device.requestVerification(this._supportedVerificationMethods.map(_verification.verificationMethodIdentifierToMethod));
      await this.outgoingRequestProcessor.makeOutgoingRequest(outgoingRequest);
      return new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods);
    } finally {
      device.free();
    }
  }

  /**
   * Fetch the backup decryption key we have saved in our store.
   *
   * Implementation of {@link CryptoApi#getSessionBackupPrivateKey}.
   *
   * @returns the key, if any, or null
   */
  async getSessionBackupPrivateKey() {
    const backupKeys = await this.olmMachine.getBackupKeys();
    if (!backupKeys.decryptionKey) return null;
    return Buffer.from(backupKeys.decryptionKey.toBase64(), "base64");
  }

  /**
   * Store the backup decryption key.
   *
   * Implementation of {@link CryptoApi#storeSessionBackupPrivateKey}.
   *
   * @param key - the backup decryption key
   * @param version - the backup version for this key.
   */
  async storeSessionBackupPrivateKey(key, version) {
    const base64Key = (0, _base.encodeBase64)(key);
    if (!version) {
      throw new Error("storeSessionBackupPrivateKey: version is required");
    }
    await this.backupManager.saveBackupDecryptionKey(RustSdkCryptoJs.BackupDecryptionKey.fromBase64(base64Key), version);
  }

  /**
   * Get the current status of key backup.
   *
   * Implementation of {@link CryptoApi#getActiveSessionBackupVersion}.
   */
  async getActiveSessionBackupVersion() {
    return await this.backupManager.getActiveBackupVersion();
  }

  /**
   * Determine if a key backup can be trusted.
   *
   * Implementation of {@link Crypto.CryptoApi.isKeyBackupTrusted}.
   */
  async isKeyBackupTrusted(info) {
    return await this.backupManager.isKeyBackupTrusted(info);
  }

  /**
   * Force a re-check of the key backup and enable/disable it as appropriate.
   *
   * Implementation of {@link Crypto.CryptoApi.checkKeyBackupAndEnable}.
   */
  async checkKeyBackupAndEnable() {
    return await this.backupManager.checkKeyBackupAndEnable(true);
  }

  /**
   * Implementation of {@link CryptoApi#deleteKeyBackupVersion}.
   */
  async deleteKeyBackupVersion(version) {
    await this.backupManager.deleteKeyBackupVersion(version);
  }

  /**
   * Implementation of {@link CryptoApi#resetKeyBackup}.
   */
  async resetKeyBackup() {
    const backupInfo = await this.backupManager.setupKeyBackup(o => this.signObject(o));

    // we want to store the private key in 4S
    // need to check if 4S is set up?
    if (await this.secretStorageHasAESKey()) {
      await this.secretStorage.store("m.megolm_backup.v1", backupInfo.decryptionKey.toBase64());
    }

    // we can check and start async
    this.checkKeyBackupAndEnable();
  }

  /**
   * Signs the given object with the current device and current identity (if available).
   * As defined in {@link https://spec.matrix.org/v1.8/appendices/#signing-json | Signing JSON}.
   *
   * @param obj - The object to sign
   */
  async signObject(obj) {
    const sigs = new Map(Object.entries(obj.signatures || {}));
    const unsigned = obj.unsigned;
    delete obj.signatures;
    delete obj.unsigned;
    const userSignatures = sigs.get(this.userId) || {};
    const canonalizedJson = _anotherJson.default.stringify(obj);
    const signatures = await this.olmMachine.sign(canonalizedJson);
    const map = JSON.parse(signatures.asJSON());
    sigs.set(this.userId, _objectSpread(_objectSpread({}, userSignatures), map[this.userId]));
    if (unsigned !== undefined) obj.unsigned = unsigned;
    obj.signatures = Object.fromEntries(sigs.entries());
  }

  /**
   * Implementation of {@link CryptoBackend#getBackupDecryptor}.
   */
  async getBackupDecryptor(backupInfo, privKey) {
    if (backupInfo.algorithm != "m.megolm_backup.v1.curve25519-aes-sha2") {
      throw new Error(`getBackupDecryptor Unsupported algorithm ${backupInfo.algorithm}`);
    }
    const authData = backupInfo.auth_data;
    if (!(privKey instanceof Uint8Array)) {
      throw new Error(`getBackupDecryptor expects Uint8Array`);
    }
    const backupDecryptionKey = RustSdkCryptoJs.BackupDecryptionKey.fromBase64((0, _base.encodeBase64)(privKey));
    if (authData.public_key != backupDecryptionKey.megolmV1PublicKey.publicKeyBase64) {
      throw new Error(`getBackupDecryptor key mismatch error`);
    }
    return this.backupManager.createBackupDecryptor(backupDecryptionKey);
  }

  /**
   * Implementation of {@link CryptoBackend#importBackedUpRoomKeys}.
   */
  async importBackedUpRoomKeys(keys, opts) {
    return await this.backupManager.importBackedUpRoomKeys(keys, opts);
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // SyncCryptoCallbacks implementation
  //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * Apply sync changes to the olm machine
   * @param events - the received to-device messages
   * @param oneTimeKeysCounts - the received one time key counts
   * @param unusedFallbackKeys - the received unused fallback keys
   * @param devices - the received device list updates
   * @returns A list of preprocessed to-device messages.
   */
  async receiveSyncChanges({
    events,
    oneTimeKeysCounts = new Map(),
    unusedFallbackKeys,
    devices = new RustSdkCryptoJs.DeviceLists()
  }) {
    const result = await (0, _utils.logDuration)(_logger.logger, "receiveSyncChanges", async () => {
      return await this.olmMachine.receiveSyncChanges(events ? JSON.stringify(events) : "[]", devices, oneTimeKeysCounts, unusedFallbackKeys);
    });

    // receiveSyncChanges returns a JSON-encoded list of decrypted to-device messages.
    return JSON.parse(result);
  }

  /** called by the sync loop to preprocess incoming to-device messages
   *
   * @param events - the received to-device messages
   * @returns A list of preprocessed to-device messages.
   */
  async preprocessToDeviceMessages(events) {
    // send the received to-device messages into receiveSyncChanges. We have no info on device-list changes,
    // one-time-keys, or fallback keys, so just pass empty data.
    const processed = await this.receiveSyncChanges({
      events
    });

    // look for interesting to-device messages
    for (const message of processed) {
      if (message.type === _event2.EventType.KeyVerificationRequest) {
        this.onIncomingKeyVerificationRequest(message.sender, message.content);
      }
    }
    return processed;
  }

  /** called by the sync loop to process one time key counts and unused fallback keys
   *
   * @param oneTimeKeysCounts - the received one time key counts
   * @param unusedFallbackKeys - the received unused fallback keys
   */
  async processKeyCounts(oneTimeKeysCounts, unusedFallbackKeys) {
    const mapOneTimeKeysCount = oneTimeKeysCounts && new Map(Object.entries(oneTimeKeysCounts));
    const setUnusedFallbackKeys = unusedFallbackKeys && new Set(unusedFallbackKeys);
    if (mapOneTimeKeysCount !== undefined || setUnusedFallbackKeys !== undefined) {
      await this.receiveSyncChanges({
        oneTimeKeysCounts: mapOneTimeKeysCount,
        unusedFallbackKeys: setUnusedFallbackKeys
      });
    }
  }

  /** called by the sync loop to process the notification that device lists have
   * been changed.
   *
   * @param deviceLists - device_lists field from /sync
   */
  async processDeviceLists(deviceLists) {
    const devices = new RustSdkCryptoJs.DeviceLists(deviceLists.changed?.map(userId => new RustSdkCryptoJs.UserId(userId)), deviceLists.left?.map(userId => new RustSdkCryptoJs.UserId(userId)));
    await this.receiveSyncChanges({
      devices
    });
  }

  /** called by the sync loop on m.room.encrypted events
   *
   * @param room - in which the event was received
   * @param event - encryption event to be processed
   */
  async onCryptoEvent(room, event) {
    const config = event.getContent();
    const settings = new RustSdkCryptoJs.RoomSettings();
    if (config.algorithm === "m.megolm.v1.aes-sha2") {
      settings.algorithm = RustSdkCryptoJs.EncryptionAlgorithm.MegolmV1AesSha2;
    } else {
      // Among other situations, this happens if the crypto state event is redacted.
      this.logger.warn(`Room ${room.roomId}: ignoring crypto event with invalid algorithm ${config.algorithm}`);
      return;
    }
    try {
      settings.sessionRotationPeriodMs = config.rotation_period_ms;
      settings.sessionRotationPeriodMessages = config.rotation_period_msgs;
      await this.olmMachine.setRoomSettings(new RustSdkCryptoJs.RoomId(room.roomId), settings);
    } catch (e) {
      this.logger.warn(`Room ${room.roomId}: ignoring crypto event which caused error: ${e}`);
      return;
    }

    // If we got this far, the SDK found the event acceptable.
    // We need to either create or update the active RoomEncryptor.
    const existingEncryptor = this.roomEncryptors[room.roomId];
    if (existingEncryptor) {
      existingEncryptor.onCryptoEvent(config);
    } else {
      this.roomEncryptors[room.roomId] = new _RoomEncryptor.RoomEncryptor(this.olmMachine, this.keyClaimManager, this.outgoingRequestsManager, room, config);
    }
  }

  /** called by the sync loop after processing each sync.
   *
   * TODO: figure out something equivalent for sliding sync.
   *
   * @param syncState - information on the completed sync.
   */
  onSyncCompleted(syncState) {
    // Processing the /sync may have produced new outgoing requests which need sending, so kick off the outgoing
    // request loop, if it's not already running.
    this.outgoingRequestsManager.doProcessOutgoingRequests().catch(e => {
      this.logger.warn("onSyncCompleted: Error processing outgoing requests", e);
    });
  }

  /**
   * Handle an incoming m.key.verification request event
   *
   * @param sender - the sender of the event
   * @param content - the content of the event
   */
  onIncomingKeyVerificationRequest(sender, content) {
    const transactionId = content.transaction_id;
    if (!transactionId || !sender) {
      // not a valid request: ignore
      return;
    }
    const request = this.olmMachine.getVerificationRequest(new RustSdkCryptoJs.UserId(sender), transactionId);
    if (request) {
      this.emit(_crypto2.CryptoEvent.VerificationRequestReceived, new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods));
    }
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // Other public functions
  //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /** called by the MatrixClient on a room membership event
   *
   * @param event - The matrix event which caused this event to fire.
   * @param member - The member whose RoomMember.membership changed.
   * @param oldMembership - The previous membership state. Null if it's a new member.
   */
  onRoomMembership(event, member, oldMembership) {
    const enc = this.roomEncryptors[event.getRoomId()];
    if (!enc) {
      // not encrypting in this room
      return;
    }
    enc.onRoomMembership(member);
  }

  /** Callback for OlmMachine.registerRoomKeyUpdatedCallback
   *
   * Called by the rust-sdk whenever there is an update to (megolm) room keys. We
   * check if we have any events waiting for the given keys, and schedule them for
   * a decryption retry if so.
   *
   * @param keys - details of the updated keys
   */
  async onRoomKeysUpdated(keys) {
    for (const key of keys) {
      this.onRoomKeyUpdated(key);
    }
    this.backupManager.maybeUploadKey();
  }
  onRoomKeyUpdated(key) {
    if (this.stopped) return;
    this.logger.debug(`Got update for session ${key.senderKey.toBase64()}|${key.sessionId} in ${key.roomId.toString()}`);
    const pendingList = this.eventDecryptor.getEventsPendingRoomKey(key);
    if (pendingList.length === 0) return;
    this.logger.debug("Retrying decryption on events:", pendingList.map(e => `${e.getId()}`));

    // Have another go at decrypting events with this key.
    //
    // We don't want to end up blocking the callback from Rust, which could otherwise end up dropping updates,
    // so we don't wait for the decryption to complete. In any case, there is no need to wait:
    // MatrixEvent.attemptDecryption ensures that there is only one decryption attempt happening at once,
    // and deduplicates repeated attempts for the same event.
    for (const ev of pendingList) {
      ev.attemptDecryption(this, {
        isRetry: true
      }).catch(_e => {
        this.logger.info(`Still unable to decrypt event ${ev.getId()} after receiving key`);
      });
    }
  }

  /**
   * Callback for `OlmMachine.registerUserIdentityUpdatedCallback`
   *
   * Called by the rust-sdk whenever there is an update to any user's cross-signing status. We re-check their trust
   * status and emit a `UserTrustStatusChanged` event, as well as a `KeysChanged` if it is our own identity that changed.
   *
   * @param userId - the user with the updated identity
   */
  async onUserIdentityUpdated(userId) {
    const newVerification = await this.getUserVerificationStatus(userId.toString());
    this.emit(_crypto2.CryptoEvent.UserTrustStatusChanged, userId.toString(), newVerification);

    // If our own user identity has changed, we may now trust the key backup where we did not before.
    // So, re-check the key backup status and enable it if available.
    if (userId.toString() === this.userId) {
      this.emit(_crypto2.CryptoEvent.KeysChanged, {});
      await this.checkKeyBackupAndEnable();
    }
  }

  /**
   * Callback for `OlmMachine.registerDevicesUpdatedCallback`
   *
   * Called when users' devices have updated. Emits `WillUpdateDevices` and `DevicesUpdated`. In the JavaScript
   * crypto backend, these events are called at separate times, with `WillUpdateDevices` being emitted just before
   * the devices are saved, and `DevicesUpdated` being emitted just after. But the OlmMachine only gives us
   * one event, so we emit both events here.
   *
   * @param userIds - an array of user IDs of users whose devices have updated.
   */
  async onDevicesUpdated(userIds) {
    this.emit(_crypto2.CryptoEvent.WillUpdateDevices, userIds, false);
    this.emit(_crypto2.CryptoEvent.DevicesUpdated, userIds, false);
  }

  /**
   * Handles secret received from the rust secret inbox.
   *
   * The gossipped secrets are received using the `m.secret.send` event type
   * and are guaranteed to have been received over a 1-to-1 Olm
   * Session from a verified device.
   *
   * The only secret currently handled in this way is `m.megolm_backup.v1`.
   *
   * @param name - the secret name
   * @param value - the secret value
   */
  async handleSecretReceived(name, value) {
    this.logger.debug(`onReceiveSecret: Received secret ${name}`);
    if (name === "m.megolm_backup.v1") {
      return await this.backupManager.handleBackupSecretReceived(value);
      // XXX at this point we should probably try to download the backup and import the keys,
      // or at least retry for the current decryption failures?
      // Maybe add some signaling when a new secret is received, and let clients handle it?
      // as it's where the restore from backup APIs are exposed.
    }
    return false;
  }

  /**
   * Called when a new secret is received in the rust secret inbox.
   *
   * Will poll the secret inbox and handle the secrets received.
   *
   * @param name - The name of the secret received.
   */
  async checkSecrets(name) {
    const pendingValues = await this.olmMachine.getSecretsFromInbox(name);
    for (const value of pendingValues) {
      if (await this.handleSecretReceived(name, value)) {
        // If we have a valid secret for that name there is no point of processing the other secrets values.
        // It's probably the same secret shared by another device.
        break;
      }
    }

    // Important to call this after handling the secrets as good hygiene.
    await this.olmMachine.deleteSecretsFromInbox(name);
  }

  /**
   * Handle a live event received via /sync.
   * See {@link ClientEventHandlerMap#event}
   *
   * @param event - live event
   */
  async onLiveEventFromSync(event) {
    // Ignore state event or remote echo
    // transaction_id is provided in case of remote echo {@link https://spec.matrix.org/v1.7/client-server-api/#local-echo}
    if (event.isState() || !!event.getUnsigned().transaction_id) return;
    const processEvent = async evt => {
      // Process only verification event
      if ((0, _verification.isVerificationEvent)(event)) {
        await this.onKeyVerificationRequest(evt);
      }
    };

    // If the event is encrypted of in failure, we wait for decryption
    if (event.isDecryptionFailure() || event.isEncrypted()) {
      // 5 mins
      const TIMEOUT_DELAY = 5 * 60 * 1000;

      // After 5mins, we are not expecting the event to be decrypted
      const timeoutId = setTimeout(() => event.off(_event.MatrixEventEvent.Decrypted, onDecrypted), TIMEOUT_DELAY);
      const onDecrypted = (decryptedEvent, error) => {
        if (error) return;
        clearTimeout(timeoutId);
        event.off(_event.MatrixEventEvent.Decrypted, onDecrypted);
        processEvent(decryptedEvent);
      };
      event.on(_event.MatrixEventEvent.Decrypted, onDecrypted);
    } else {
      await processEvent(event);
    }
  }

  /**
   * Handle key verification request.
   *
   * @param event - a key validation request event.
   */
  async onKeyVerificationRequest(event) {
    const roomId = event.getRoomId();
    if (!roomId) {
      throw new Error("missing roomId in the event");
    }
    this.logger.debug(`Incoming verification event ${event.getId()} type ${event.getType()} from ${event.getSender()}`);
    await this.olmMachine.receiveVerificationEvent(JSON.stringify({
      event_id: event.getId(),
      type: event.getType(),
      sender: event.getSender(),
      state_key: event.getStateKey(),
      content: event.getContent(),
      origin_server_ts: event.getTs()
    }), new RustSdkCryptoJs.RoomId(roomId));
    if (event.getType() === _event2.EventType.RoomMessage && event.getContent().msgtype === _event2.MsgType.KeyVerificationRequest) {
      const request = this.olmMachine.getVerificationRequest(new RustSdkCryptoJs.UserId(event.getSender()), event.getId());
      if (!request) {
        // There are multiple reasons this can happen; probably the most likely is that the event is too old.
        this.logger.info(`Ignoring just-received verification request ${event.getId()} which did not start a rust-side verification`);
      } else {
        this.emit(_crypto2.CryptoEvent.VerificationRequestReceived, new _verification.RustVerificationRequest(this.olmMachine, request, this.outgoingRequestProcessor, this._supportedVerificationMethods));
      }
    }

    // that may have caused us to queue up outgoing requests, so make sure we send them.
    this.outgoingRequestsManager.doProcessOutgoingRequests().catch(e => {
      this.logger.warn("onKeyVerificationRequest: Error processing outgoing requests", e);
    });
  }
}
exports.RustCrypto = RustCrypto;
class EventDecryptor {
  constructor(logger, olmMachine, perSessionBackupDownloader) {
    this.logger = logger;
    this.olmMachine = olmMachine;
    this.perSessionBackupDownloader = perSessionBackupDownloader;
    /**
     * Events which we couldn't decrypt due to unknown sessions / indexes.
     *
     * Map from senderKey to sessionId to Set of MatrixEvents
     */
    _defineProperty(this, "eventsPendingKey", new _utils.MapWithDefault(() => new _utils.MapWithDefault(() => new Set())));
  }
  async attemptEventDecryption(event) {
    // add the event to the pending list *before* attempting to decrypt.
    // then, if the key turns up while decryption is in progress (and
    // decryption fails), we will schedule a retry.
    // (fixes https://github.com/vector-im/element-web/issues/5001)
    this.addEventToPendingList(event);
    try {
      const res = await this.olmMachine.decryptRoomEvent(stringifyEvent(event), new RustSdkCryptoJs.RoomId(event.getRoomId()));

      // Success. We can remove the event from the pending list, if
      // that hasn't already happened.
      this.removeEventFromPendingList(event);
      return {
        clearEvent: JSON.parse(res.event),
        claimedEd25519Key: res.senderClaimedEd25519Key,
        senderCurve25519Key: res.senderCurve25519Key,
        forwardingCurve25519KeyChain: res.forwardingCurve25519KeyChain
      };
    } catch (err) {
      // We need to map back to regular decryption errors (used for analytics for example)
      // The DecryptionErrors are used by react-sdk so is implicitly part of API, but poorly typed
      if (err instanceof RustSdkCryptoJs.MegolmDecryptionError) {
        const content = event.getWireContent();
        let jsError;
        switch (err.code) {
          case RustSdkCryptoJs.DecryptionErrorCode.MissingRoomKey:
            {
              jsError = new _algorithms.DecryptionError("MEGOLM_UNKNOWN_INBOUND_SESSION_ID", "The sender's device has not sent us the keys for this message.", {
                session: content.sender_key + "|" + content.session_id
              });
              this.perSessionBackupDownloader.onDecryptionKeyMissingError(event.getRoomId(), event.getWireContent().session_id);
              break;
            }
          case RustSdkCryptoJs.DecryptionErrorCode.UnknownMessageIndex:
            {
              jsError = new _algorithms.DecryptionError("OLM_UNKNOWN_MESSAGE_INDEX", "The sender's device has not sent us the keys for this message at this index.", {
                session: content.sender_key + "|" + content.session_id
              });
              this.perSessionBackupDownloader.onDecryptionKeyMissingError(event.getRoomId(), event.getWireContent().session_id);
              break;
            }
          // We don't map MismatchedIdentityKeys for now, as there is no equivalent in legacy.
          // Just put it on the `UNABLE_TO_DECRYPT` bucket.
          default:
            {
              jsError = new _algorithms.DecryptionError("UNABLE_TO_DECRYPT", err.description, {
                session: content.sender_key + "|" + content.session_id
              });
              break;
            }
        }
        throw jsError;
      }
      throw new _algorithms.DecryptionError("UNABLE_TO_DECRYPT", "Unknown error");
    }
  }
  async getEncryptionInfoForEvent(event) {
    if (!event.getClearContent() || event.isDecryptionFailure()) {
      // not successfully decrypted
      return null;
    }

    // special-case outgoing events, which the rust crypto-sdk will barf on
    if (event.status !== null) {
      return {
        shieldColour: _cryptoApi.EventShieldColour.NONE,
        shieldReason: null
      };
    }
    const encryptionInfo = await this.olmMachine.getRoomEventEncryptionInfo(stringifyEvent(event), new RustSdkCryptoJs.RoomId(event.getRoomId()));
    return rustEncryptionInfoToJsEncryptionInfo(this.logger, encryptionInfo);
  }

  /**
   * Look for events which are waiting for a given megolm session
   *
   * Returns a list of events which were encrypted by `session` and could not be decrypted
   *
   * @param session -
   */
  getEventsPendingRoomKey(session) {
    const senderPendingEvents = this.eventsPendingKey.get(session.senderKey.toBase64());
    if (!senderPendingEvents) return [];
    const sessionPendingEvents = senderPendingEvents.get(session.sessionId);
    if (!sessionPendingEvents) return [];
    const roomId = session.roomId.toString();
    return [...sessionPendingEvents].filter(ev => ev.getRoomId() === roomId);
  }

  /**
   * Add an event to the list of those awaiting their session keys.
   */
  addEventToPendingList(event) {
    const content = event.getWireContent();
    const senderKey = content.sender_key;
    const sessionId = content.session_id;
    const senderPendingEvents = this.eventsPendingKey.getOrCreate(senderKey);
    const sessionPendingEvents = senderPendingEvents.getOrCreate(sessionId);
    sessionPendingEvents.add(event);
  }

  /**
   * Remove an event from the list of those awaiting their session keys.
   */
  removeEventFromPendingList(event) {
    const content = event.getWireContent();
    const senderKey = content.sender_key;
    const sessionId = content.session_id;
    const senderPendingEvents = this.eventsPendingKey.get(senderKey);
    if (!senderPendingEvents) return;
    const sessionPendingEvents = senderPendingEvents.get(sessionId);
    if (!sessionPendingEvents) return;
    sessionPendingEvents.delete(event);

    // also clean up the higher-level maps if they are now empty
    if (sessionPendingEvents.size === 0) {
      senderPendingEvents.delete(sessionId);
      if (senderPendingEvents.size === 0) {
        this.eventsPendingKey.delete(senderKey);
      }
    }
  }
}
function stringifyEvent(event) {
  return JSON.stringify({
    event_id: event.getId(),
    type: event.getWireType(),
    sender: event.getSender(),
    state_key: event.getStateKey(),
    content: event.getWireContent(),
    origin_server_ts: event.getTs()
  });
}
function rustEncryptionInfoToJsEncryptionInfo(logger, encryptionInfo) {
  if (encryptionInfo === undefined) {
    // not decrypted here
    return null;
  }

  // TODO: use strict shield semantics.
  const shieldState = encryptionInfo.shieldState(false);
  let shieldColour;
  switch (shieldState.color) {
    case RustSdkCryptoJs.ShieldColor.Grey:
      shieldColour = _cryptoApi.EventShieldColour.GREY;
      break;
    case RustSdkCryptoJs.ShieldColor.None:
      shieldColour = _cryptoApi.EventShieldColour.NONE;
      break;
    default:
      shieldColour = _cryptoApi.EventShieldColour.RED;
  }
  let shieldReason;
  if (shieldState.message === undefined) {
    shieldReason = null;
  } else if (shieldState.message === "Encrypted by an unverified user.") {
    // this case isn't actually used with lax shield semantics.
    shieldReason = _cryptoApi.EventShieldReason.UNVERIFIED_IDENTITY;
  } else if (shieldState.message === "Encrypted by a device not verified by its owner.") {
    shieldReason = _cryptoApi.EventShieldReason.UNSIGNED_DEVICE;
  } else if (shieldState.message === "The authenticity of this encrypted message can't be guaranteed on this device.") {
    shieldReason = _cryptoApi.EventShieldReason.AUTHENTICITY_NOT_GUARANTEED;
  } else if (shieldState.message === "Encrypted by an unknown or deleted device.") {
    shieldReason = _cryptoApi.EventShieldReason.UNKNOWN_DEVICE;
  } else {
    logger.warn(`Unknown shield state message '${shieldState.message}'`);
    shieldReason = _cryptoApi.EventShieldReason.UNKNOWN;
  }
  return {
    shieldColour,
    shieldReason
  };
}