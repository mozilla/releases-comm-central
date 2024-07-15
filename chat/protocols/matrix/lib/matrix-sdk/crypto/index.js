"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IncomingRoomKeyRequest = exports.CryptoEvent = exports.Crypto = void 0;
exports.fixBackupKey = fixBackupKey;
exports.isCryptoAvailable = isCryptoAvailable;
exports.verificationMethods = void 0;
var _anotherJson = _interopRequireDefault(require("another-json"));
var _uuid = require("uuid");
var _event = require("../@types/event");
var _ReEmitter = require("../ReEmitter");
var _logger = require("../logger");
var _OlmDevice = require("./OlmDevice");
var olmlib = _interopRequireWildcard(require("./olmlib"));
var _DeviceList = require("./DeviceList");
var _deviceinfo = require("./deviceinfo");
var algorithms = _interopRequireWildcard(require("./algorithms"));
var _CrossSigning = require("./CrossSigning");
var _EncryptionSetup = require("./EncryptionSetup");
var _SecretStorage = require("./SecretStorage");
var _api = require("./api");
var _OutgoingRoomKeyRequestManager = require("./OutgoingRoomKeyRequestManager");
var _indexeddbCryptoStore = require("./store/indexeddb-crypto-store");
var _QRCode = require("./verification/QRCode");
var _SAS = require("./verification/SAS");
var _key_passphrase = require("./key_passphrase");
var _recoverykey = require("./recoverykey");
var _VerificationRequest = require("./verification/request/VerificationRequest");
var _InRoomChannel = require("./verification/request/InRoomChannel");
var _ToDeviceChannel = require("./verification/request/ToDeviceChannel");
var _IllegalMethod = require("./verification/IllegalMethod");
var _errors = require("../errors");
var _aes = require("./aes");
var _dehydration = require("./dehydration");
var _backup = require("./backup");
var _room = require("../models/room");
var _roomMember = require("../models/room-member");
var _event2 = require("../models/event");
var _client = require("../client");
var _RoomList = require("./RoomList");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _CryptoBackend = require("../common-crypto/CryptoBackend");
var _roomState = require("../models/room-state");
var _utils = require("../utils");
var _secretStorage = require("../secret-storage");
var _cryptoApi = require("../crypto-api");
var _deviceConverter = require("./device-converter");
var _httpApi = require("../http-api");
var _base = require("../base64");
var _membership = require("../@types/membership");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2016 OpenMarket Ltd
Copyright 2017 Vector Creations Ltd
Copyright 2018-2019 New Vector Ltd
Copyright 2019-2021 The Matrix.org Foundation C.I.C.

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
/* re-exports for backwards compatibility */

const DeviceVerification = _deviceinfo.DeviceInfo.DeviceVerification;
const defaultVerificationMethods = {
  [_QRCode.ReciprocateQRCode.NAME]: _QRCode.ReciprocateQRCode,
  [_SAS.SAS.NAME]: _SAS.SAS,
  // These two can't be used for actual verification, but we do
  // need to be able to define them here for the verification flows
  // to start.
  [_QRCode.SHOW_QR_CODE_METHOD]: _IllegalMethod.IllegalMethod,
  [_QRCode.SCAN_QR_CODE_METHOD]: _IllegalMethod.IllegalMethod
};

/**
 * verification method names
 */
// legacy export identifier
const verificationMethods = exports.verificationMethods = {
  RECIPROCATE_QR_CODE: _QRCode.ReciprocateQRCode.NAME,
  SAS: _SAS.SAS.NAME
};
function isCryptoAvailable() {
  return Boolean(globalThis.Olm);
}

// minimum time between attempting to unwedge an Olm session, if we succeeded
// in creating a new session
const MIN_FORCE_SESSION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// minimum time between attempting to unwedge an Olm session, if we failed
// to create a new session
const FORCE_SESSION_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/* eslint-disable camelcase */

/**
 * The parameters of a room key request. The details of the request may
 * vary with the crypto algorithm, but the management and storage layers for
 * outgoing requests expect it to have 'room_id' and 'session_id' properties.
 */

/* eslint-enable camelcase */

/* eslint-disable camelcase */

/* eslint-enable camelcase */
let CryptoEvent = exports.CryptoEvent = /*#__PURE__*/function (CryptoEvent) {
  CryptoEvent["DeviceVerificationChanged"] = "deviceVerificationChanged";
  CryptoEvent["UserTrustStatusChanged"] = "userTrustStatusChanged";
  CryptoEvent["UserCrossSigningUpdated"] = "userCrossSigningUpdated";
  CryptoEvent["RoomKeyRequest"] = "crypto.roomKeyRequest";
  CryptoEvent["RoomKeyRequestCancellation"] = "crypto.roomKeyRequestCancellation";
  CryptoEvent["KeyBackupStatus"] = "crypto.keyBackupStatus";
  CryptoEvent["KeyBackupFailed"] = "crypto.keyBackupFailed";
  CryptoEvent["KeyBackupSessionsRemaining"] = "crypto.keyBackupSessionsRemaining";
  CryptoEvent["KeyBackupDecryptionKeyCached"] = "crypto.keyBackupDecryptionKeyCached";
  CryptoEvent["KeySignatureUploadFailure"] = "crypto.keySignatureUploadFailure";
  CryptoEvent["VerificationRequest"] = "crypto.verification.request";
  CryptoEvent["VerificationRequestReceived"] = "crypto.verificationRequestReceived";
  CryptoEvent["Warning"] = "crypto.warning";
  CryptoEvent["WillUpdateDevices"] = "crypto.willUpdateDevices";
  CryptoEvent["DevicesUpdated"] = "crypto.devicesUpdated";
  CryptoEvent["KeysChanged"] = "crossSigning.keysChanged";
  CryptoEvent["LegacyCryptoStoreMigrationProgress"] = "crypto.legacyCryptoStoreMigrationProgress";
  return CryptoEvent;
}({});
class Crypto extends _typedEventEmitter.TypedEventEmitter {
  /**
   * @returns The version of Olm.
   */
  static getOlmVersion() {
    return _OlmDevice.OlmDevice.getOlmVersion();
  }
  /**
   * Cryptography bits
   *
   * This module is internal to the js-sdk; the public API is via MatrixClient.
   *
   * @internal
   *
   * @param baseApis - base matrix api interface
   *
   * @param userId - The user ID for the local user
   *
   * @param deviceId - The identifier for this device.
   *
   * @param clientStore - the MatrixClient data store.
   *
   * @param cryptoStore - storage for the crypto layer.
   *
   * @param verificationMethods - Array of verification methods to use.
   *    Each element can either be a string from MatrixClient.verificationMethods
   *    or a class that implements a verification method.
   */
  constructor(baseApis, userId, deviceId, clientStore, cryptoStore, verificationMethods) {
    super();
    this.baseApis = baseApis;
    this.userId = userId;
    this.deviceId = deviceId;
    this.clientStore = clientStore;
    this.cryptoStore = cryptoStore;
    _defineProperty(this, "backupManager", void 0);
    _defineProperty(this, "crossSigningInfo", void 0);
    _defineProperty(this, "olmDevice", void 0);
    _defineProperty(this, "deviceList", void 0);
    _defineProperty(this, "dehydrationManager", void 0);
    _defineProperty(this, "secretStorage", void 0);
    _defineProperty(this, "roomList", void 0);
    _defineProperty(this, "reEmitter", void 0);
    _defineProperty(this, "verificationMethods", void 0);
    _defineProperty(this, "supportedAlgorithms", void 0);
    _defineProperty(this, "outgoingRoomKeyRequestManager", void 0);
    _defineProperty(this, "toDeviceVerificationRequests", void 0);
    _defineProperty(this, "inRoomVerificationRequests", void 0);
    _defineProperty(this, "trustCrossSignedDevices", true);
    // the last time we did a check for the number of one-time-keys on the server.
    _defineProperty(this, "lastOneTimeKeyCheck", null);
    _defineProperty(this, "oneTimeKeyCheckInProgress", false);
    // EncryptionAlgorithm instance for each room
    _defineProperty(this, "roomEncryptors", new Map());
    // map from algorithm to DecryptionAlgorithm instance, for each room
    _defineProperty(this, "roomDecryptors", new Map());
    _defineProperty(this, "deviceKeys", {});
    // type: key
    _defineProperty(this, "globalBlacklistUnverifiedDevices", false);
    _defineProperty(this, "globalErrorOnUnknownDevices", true);
    // list of IncomingRoomKeyRequests/IncomingRoomKeyRequestCancellations
    // we received in the current sync.
    _defineProperty(this, "receivedRoomKeyRequests", []);
    _defineProperty(this, "receivedRoomKeyRequestCancellations", []);
    // true if we are currently processing received room key requests
    _defineProperty(this, "processingRoomKeyRequests", false);
    // controls whether device tracking is delayed
    // until calling encryptEvent or trackRoomDevices,
    // or done immediately upon enabling room encryption.
    _defineProperty(this, "lazyLoadMembers", false);
    // in case lazyLoadMembers is true,
    // track if an initial tracking of all the room members
    // has happened for a given room. This is delayed
    // to avoid loading room members as long as possible.
    _defineProperty(this, "roomDeviceTrackingState", {});
    // The timestamp of the minimum time at which we will retry forcing establishment
    // of a new session for each device, in milliseconds.
    // {
    //     userId: {
    //         deviceId: 1234567890000,
    //     },
    // }
    // Map: user Id → device Id → timestamp
    _defineProperty(this, "forceNewSessionRetryTime", new _utils.MapWithDefault(() => new _utils.MapWithDefault(() => 0)));
    // This flag will be unset whilst the client processes a sync response
    // so that we don't start requesting keys until we've actually finished
    // processing the response.
    _defineProperty(this, "sendKeyRequestsImmediately", false);
    _defineProperty(this, "oneTimeKeyCount", void 0);
    _defineProperty(this, "needsNewFallback", void 0);
    _defineProperty(this, "fallbackCleanup", void 0);
    /*
     * Event handler for DeviceList's userNewDevices event
     */
    _defineProperty(this, "onDeviceListUserCrossSigningUpdated", async userId => {
      if (userId === this.userId) {
        // An update to our own cross-signing key.
        // Get the new key first:
        const newCrossSigning = this.deviceList.getStoredCrossSigningForUser(userId);
        const seenPubkey = newCrossSigning ? newCrossSigning.getId() : null;
        const currentPubkey = this.crossSigningInfo.getId();
        const changed = currentPubkey !== seenPubkey;
        if (currentPubkey && seenPubkey && !changed) {
          // If it's not changed, just make sure everything is up to date
          await this.checkOwnCrossSigningTrust();
        } else {
          // We'll now be in a state where cross-signing on the account is not trusted
          // because our locally stored cross-signing keys will not match the ones
          // on the server for our account. So we clear our own stored cross-signing keys,
          // effectively disabling cross-signing until the user gets verified by the device
          // that reset the keys
          this.storeTrustedSelfKeys(null);
          // emit cross-signing has been disabled
          this.emit(CryptoEvent.KeysChanged, {});
          // as the trust for our own user has changed,
          // also emit an event for this
          this.emit(CryptoEvent.UserTrustStatusChanged, this.userId, this.checkUserTrust(userId));
        }
      } else {
        await this.checkDeviceVerifications(userId);

        // Update verified before latch using the current state and save the new
        // latch value in the device list store.
        const crossSigning = this.deviceList.getStoredCrossSigningForUser(userId);
        if (crossSigning) {
          crossSigning.updateCrossSigningVerifiedBefore(this.checkUserTrust(userId).isCrossSigningVerified());
          this.deviceList.setRawStoredCrossSigningForUser(userId, crossSigning.toStorage());
        }
        this.emit(CryptoEvent.UserTrustStatusChanged, userId, this.checkUserTrust(userId));
      }
    });
    _defineProperty(this, "onMembership", (event, member, oldMembership) => {
      try {
        this.onRoomMembership(event, member, oldMembership);
      } catch (e) {
        _logger.logger.error("Error handling membership change:", e);
      }
    });
    _defineProperty(this, "onToDeviceEvent", event => {
      try {
        _logger.logger.log(`received to-device ${event.getType()} from: ` + `${event.getSender()} id: ${event.getContent()[_event.ToDeviceMessageId]}`);
        if (event.getType() == "m.room_key" || event.getType() == "m.forwarded_room_key") {
          this.onRoomKeyEvent(event);
        } else if (event.getType() == "m.room_key_request") {
          this.onRoomKeyRequestEvent(event);
        } else if (event.getType() === "m.secret.request") {
          this.secretStorage.onRequestReceived(event);
        } else if (event.getType() === "m.secret.send") {
          this.secretStorage.onSecretReceived(event);
        } else if (event.getType() === "m.room_key.withheld") {
          this.onRoomKeyWithheldEvent(event);
        } else if (event.getContent().transaction_id) {
          this.onKeyVerificationMessage(event);
        } else if (event.getContent().msgtype === "m.bad.encrypted") {
          this.onToDeviceBadEncrypted(event);
        } else if (event.isBeingDecrypted() || event.shouldAttemptDecryption()) {
          if (!event.isBeingDecrypted()) {
            event.attemptDecryption(this);
          }
          // once the event has been decrypted, try again
          event.once(_event2.MatrixEventEvent.Decrypted, ev => {
            this.onToDeviceEvent(ev);
          });
        }
      } catch (e) {
        _logger.logger.error("Error handling toDeviceEvent:", e);
      }
    });
    /**
     * Handle key verification requests sent as timeline events
     *
     * @internal
     * @param event - the timeline event
     * @param room - not used
     * @param atStart - not used
     * @param removed - not used
     * @param whether - this is a live event
     */
    _defineProperty(this, "onTimelineEvent", (event, room, atStart, removed, {
      liveEvent = true
    } = {}) => {
      if (!_InRoomChannel.InRoomChannel.validateEvent(event, this.baseApis)) {
        return;
      }
      const createRequest = event => {
        const channel = new _InRoomChannel.InRoomChannel(this.baseApis, event.getRoomId());
        return new _VerificationRequest.VerificationRequest(channel, this.verificationMethods, this.baseApis);
      };
      this.handleVerificationEvent(event, this.inRoomVerificationRequests, createRequest, liveEvent);
    });
    _logger.logger.debug("Crypto: initialising roomlist...");
    this.roomList = new _RoomList.RoomList(cryptoStore);
    this.reEmitter = new _ReEmitter.TypedReEmitter(this);
    if (verificationMethods) {
      this.verificationMethods = new Map();
      for (const method of verificationMethods) {
        if (typeof method === "string") {
          if (defaultVerificationMethods[method]) {
            this.verificationMethods.set(method, defaultVerificationMethods[method]);
          }
        } else if (method["NAME"]) {
          this.verificationMethods.set(method["NAME"], method);
        } else {
          _logger.logger.warn(`Excluding unknown verification method ${method}`);
        }
      }
    } else {
      this.verificationMethods = new Map(Object.entries(defaultVerificationMethods));
    }
    this.backupManager = new _backup.BackupManager(baseApis, async () => {
      // try to get key from cache
      const cachedKey = await this.getSessionBackupPrivateKey();
      if (cachedKey) {
        return cachedKey;
      }

      // try to get key from secret storage
      const storedKey = await this.secretStorage.get("m.megolm_backup.v1");
      if (storedKey) {
        // ensure that the key is in the right format.  If not, fix the key and
        // store the fixed version
        const fixedKey = fixBackupKey(storedKey);
        if (fixedKey) {
          const keys = await this.secretStorage.getKey();
          await this.secretStorage.store("m.megolm_backup.v1", fixedKey, [keys[0]]);
        }
        return (0, _base.decodeBase64)(fixedKey || storedKey);
      }

      // try to get key from app
      if (this.baseApis.cryptoCallbacks && this.baseApis.cryptoCallbacks.getBackupKey) {
        return this.baseApis.cryptoCallbacks.getBackupKey();
      }
      throw new Error("Unable to get private key");
    });
    this.olmDevice = new _OlmDevice.OlmDevice(cryptoStore);
    this.deviceList = new _DeviceList.DeviceList(baseApis, cryptoStore, this.olmDevice);

    // XXX: This isn't removed at any point, but then none of the event listeners
    // this class sets seem to be removed at any point... :/
    this.deviceList.on(CryptoEvent.UserCrossSigningUpdated, this.onDeviceListUserCrossSigningUpdated);
    this.reEmitter.reEmit(this.deviceList, [CryptoEvent.DevicesUpdated, CryptoEvent.WillUpdateDevices]);
    this.supportedAlgorithms = Array.from(algorithms.DECRYPTION_CLASSES.keys());
    this.outgoingRoomKeyRequestManager = new _OutgoingRoomKeyRequestManager.OutgoingRoomKeyRequestManager(baseApis, this.deviceId, this.cryptoStore);
    this.toDeviceVerificationRequests = new _ToDeviceChannel.ToDeviceRequests();
    this.inRoomVerificationRequests = new _InRoomChannel.InRoomRequests();
    const cryptoCallbacks = this.baseApis.cryptoCallbacks || {};
    const cacheCallbacks = (0, _CrossSigning.createCryptoStoreCacheCallbacks)(cryptoStore, this.olmDevice);
    this.crossSigningInfo = new _CrossSigning.CrossSigningInfo(userId, cryptoCallbacks, cacheCallbacks);
    // Yes, we pass the client twice here: see SecretStorage
    this.secretStorage = new _SecretStorage.SecretStorage(baseApis, cryptoCallbacks, baseApis);
    this.dehydrationManager = new _dehydration.DehydrationManager(this);

    // Assuming no app-supplied callback, default to getting from SSSS.
    if (!cryptoCallbacks.getCrossSigningKey && cryptoCallbacks.getSecretStorageKey) {
      cryptoCallbacks.getCrossSigningKey = async type => {
        return _CrossSigning.CrossSigningInfo.getFromSecretStorage(type, this.secretStorage);
      };
    }
  }

  /**
   * Initialise the crypto module so that it is ready for use
   *
   * Returns a promise which resolves once the crypto module is ready for use.
   *
   * @param exportedOlmDevice - (Optional) data from exported device
   *     that must be re-created.
   */
  async init({
    exportedOlmDevice,
    pickleKey
  } = {}) {
    _logger.logger.log("Crypto: initialising Olm...");
    await global.Olm.init();
    _logger.logger.log(exportedOlmDevice ? "Crypto: initialising Olm device from exported device..." : "Crypto: initialising Olm device...");
    await this.olmDevice.init({
      fromExportedDevice: exportedOlmDevice,
      pickleKey
    });
    _logger.logger.log("Crypto: loading device list...");
    await this.deviceList.load();

    // build our device keys: these will later be uploaded
    this.deviceKeys["ed25519:" + this.deviceId] = this.olmDevice.deviceEd25519Key;
    this.deviceKeys["curve25519:" + this.deviceId] = this.olmDevice.deviceCurve25519Key;
    _logger.logger.log("Crypto: fetching own devices...");
    let myDevices = this.deviceList.getRawStoredDevicesForUser(this.userId);
    if (!myDevices) {
      myDevices = {};
    }
    if (!myDevices[this.deviceId]) {
      // add our own deviceinfo to the cryptoStore
      _logger.logger.log("Crypto: adding this device to the store...");
      const deviceInfo = {
        keys: this.deviceKeys,
        algorithms: this.supportedAlgorithms,
        verified: DeviceVerification.VERIFIED,
        known: true
      };
      myDevices[this.deviceId] = deviceInfo;
      this.deviceList.storeDevicesForUser(this.userId, myDevices);
      this.deviceList.saveIfDirty();
    }
    await this.cryptoStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.cryptoStore.getCrossSigningKeys(txn, keys => {
        // can be an empty object after resetting cross-signing keys, see storeTrustedSelfKeys
        if (keys && Object.keys(keys).length !== 0) {
          _logger.logger.log("Loaded cross-signing public keys from crypto store");
          this.crossSigningInfo.setKeys(keys);
        }
      });
    });
    // make sure we are keeping track of our own devices
    // (this is important for key backups & things)
    this.deviceList.startTrackingDeviceList(this.userId);
    _logger.logger.debug("Crypto: initialising roomlist...");
    await this.roomList.init();
    _logger.logger.log("Crypto: checking for key backup...");
    this.backupManager.checkAndStart();
  }

  /**
   * Implementation of {@link Crypto.CryptoApi#getVersion}.
   */
  getVersion() {
    const olmVersionTuple = Crypto.getOlmVersion();
    return `Olm ${olmVersionTuple[0]}.${olmVersionTuple[1]}.${olmVersionTuple[2]}`;
  }

  /**
   * Whether to trust a others users signatures of their devices.
   * If false, devices will only be considered 'verified' if we have
   * verified that device individually (effectively disabling cross-signing).
   *
   * Default: true
   *
   * @returns True if trusting cross-signed devices
   */
  getTrustCrossSignedDevices() {
    return this.trustCrossSignedDevices;
  }

  /**
   * @deprecated Use {@link Crypto.CryptoApi#getTrustCrossSignedDevices}.
   */
  getCryptoTrustCrossSignedDevices() {
    return this.trustCrossSignedDevices;
  }

  /**
   * See getCryptoTrustCrossSignedDevices
   *
   * @param val - True to trust cross-signed devices
   */
  setTrustCrossSignedDevices(val) {
    this.trustCrossSignedDevices = val;
    for (const userId of this.deviceList.getKnownUserIds()) {
      const devices = this.deviceList.getRawStoredDevicesForUser(userId);
      for (const deviceId of Object.keys(devices)) {
        const deviceTrust = this.checkDeviceTrust(userId, deviceId);
        // If the device is locally verified then isVerified() is always true,
        // so this will only have caused the value to change if the device is
        // cross-signing verified but not locally verified
        if (!deviceTrust.isLocallyVerified() && deviceTrust.isCrossSigningVerified()) {
          const deviceObj = this.deviceList.getStoredDevice(userId, deviceId);
          this.emit(CryptoEvent.DeviceVerificationChanged, userId, deviceId, deviceObj);
        }
      }
    }
  }

  /**
   * @deprecated Use {@link Crypto.CryptoApi#setTrustCrossSignedDevices}.
   */
  setCryptoTrustCrossSignedDevices(val) {
    this.setTrustCrossSignedDevices(val);
  }

  /**
   * Create a recovery key from a user-supplied passphrase.
   *
   * @param password - Passphrase string that can be entered by the user
   *     when restoring the backup as an alternative to entering the recovery key.
   *     Optional.
   * @returns Object with public key metadata, encoded private
   *     recovery key which should be disposed of after displaying to the user,
   *     and raw private key to avoid round tripping if needed.
   */
  async createRecoveryKeyFromPassphrase(password) {
    const decryption = new global.Olm.PkDecryption();
    try {
      if (password) {
        const derivation = await (0, _key_passphrase.keyFromPassphrase)(password);
        decryption.init_with_private_key(derivation.key);
        const privateKey = decryption.get_private_key();
        return {
          keyInfo: {
            passphrase: {
              algorithm: "m.pbkdf2",
              iterations: derivation.iterations,
              salt: derivation.salt
            }
          },
          privateKey: privateKey,
          encodedPrivateKey: (0, _recoverykey.encodeRecoveryKey)(privateKey)
        };
      } else {
        decryption.generate_key();
        const privateKey = decryption.get_private_key();
        return {
          privateKey: privateKey,
          encodedPrivateKey: (0, _recoverykey.encodeRecoveryKey)(privateKey)
        };
      }
    } finally {
      decryption?.free();
    }
  }

  /**
   * Checks if the user has previously published cross-signing keys
   *
   * This means downloading the devicelist for the user and checking if the list includes
   * the cross-signing pseudo-device.
   *
   * @internal
   */
  async userHasCrossSigningKeys(userId = this.userId) {
    await this.downloadKeys([userId]);
    return this.deviceList.getStoredCrossSigningForUser(userId) !== null;
  }

  /**
   * Checks whether cross signing:
   * - is enabled on this account and trusted by this device
   * - has private keys either cached locally or stored in secret storage
   *
   * If this function returns false, bootstrapCrossSigning() can be used
   * to fix things such that it returns true. That is to say, after
   * bootstrapCrossSigning() completes successfully, this function should
   * return true.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @returns True if cross-signing is ready to be used on this device
   */
  async isCrossSigningReady() {
    const publicKeysOnDevice = this.crossSigningInfo.getId();
    const privateKeysExistSomewhere = (await this.crossSigningInfo.isStoredInKeyCache()) || (await this.crossSigningInfo.isStoredInSecretStorage(this.secretStorage));
    return !!(publicKeysOnDevice && privateKeysExistSomewhere);
  }

  /**
   * Checks whether secret storage:
   * - is enabled on this account
   * - is storing cross-signing private keys
   * - is storing session backup key (if enabled)
   *
   * If this function returns false, bootstrapSecretStorage() can be used
   * to fix things such that it returns true. That is to say, after
   * bootstrapSecretStorage() completes successfully, this function should
   * return true.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @returns True if secret storage is ready to be used on this device
   */
  async isSecretStorageReady() {
    const secretStorageKeyInAccount = await this.secretStorage.hasKey();
    const privateKeysInStorage = await this.crossSigningInfo.isStoredInSecretStorage(this.secretStorage);
    const sessionBackupInStorage = !this.backupManager.getKeyBackupEnabled() || (await this.baseApis.isKeyBackupKeyStored());
    return !!(secretStorageKeyInAccount && privateKeysInStorage && sessionBackupInStorage);
  }

  /**
   * Implementation of {@link Crypto.CryptoApi#getCrossSigningStatus}
   */
  async getCrossSigningStatus() {
    const publicKeysOnDevice = Boolean(this.crossSigningInfo.getId());
    const privateKeysInSecretStorage = Boolean(await this.crossSigningInfo.isStoredInSecretStorage(this.secretStorage));
    const cacheCallbacks = this.crossSigningInfo.getCacheCallbacks();
    const masterKey = Boolean(await cacheCallbacks.getCrossSigningKeyCache?.("master"));
    const selfSigningKey = Boolean(await cacheCallbacks.getCrossSigningKeyCache?.("self_signing"));
    const userSigningKey = Boolean(await cacheCallbacks.getCrossSigningKeyCache?.("user_signing"));
    return {
      publicKeysOnDevice,
      privateKeysInSecretStorage,
      privateKeysCachedLocally: {
        masterKey,
        selfSigningKey,
        userSigningKey
      }
    };
  }

  /**
   * Bootstrap cross-signing by creating keys if needed. If everything is already
   * set up, then no changes are made, so this is safe to run to ensure
   * cross-signing is ready for use.
   *
   * This function:
   * - creates new cross-signing keys if they are not found locally cached nor in
   *   secret storage (if it has been setup)
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   */
  async bootstrapCrossSigning({
    authUploadDeviceSigningKeys,
    setupNewCrossSigning
  } = {}) {
    _logger.logger.log("Bootstrapping cross-signing");
    const delegateCryptoCallbacks = this.baseApis.cryptoCallbacks;
    const builder = new _EncryptionSetup.EncryptionSetupBuilder(this.baseApis.store.accountData, delegateCryptoCallbacks);
    const crossSigningInfo = new _CrossSigning.CrossSigningInfo(this.userId, builder.crossSigningCallbacks, builder.crossSigningCallbacks);

    // Reset the cross-signing keys
    const resetCrossSigning = async () => {
      crossSigningInfo.resetKeys();
      // Sign master key with device key
      await this.signObject(crossSigningInfo.keys.master);

      // Store auth flow helper function, as we need to call it when uploading
      // to ensure we handle auth errors properly.
      builder.addCrossSigningKeys(authUploadDeviceSigningKeys, crossSigningInfo.keys);

      // Cross-sign own device
      const device = this.deviceList.getStoredDevice(this.userId, this.deviceId);
      const deviceSignature = await crossSigningInfo.signDevice(this.userId, device);
      builder.addKeySignature(this.userId, this.deviceId, deviceSignature);

      // Sign message key backup with cross-signing master key
      if (this.backupManager.backupInfo) {
        await crossSigningInfo.signObject(this.backupManager.backupInfo.auth_data, "master");
        builder.addSessionBackup(this.backupManager.backupInfo);
      }
    };
    const publicKeysOnDevice = this.crossSigningInfo.getId();
    const privateKeysInCache = await this.crossSigningInfo.isStoredInKeyCache();
    const privateKeysInStorage = await this.crossSigningInfo.isStoredInSecretStorage(this.secretStorage);
    const privateKeysExistSomewhere = privateKeysInCache || privateKeysInStorage;

    // Log all relevant state for easier parsing of debug logs.
    _logger.logger.log({
      setupNewCrossSigning,
      publicKeysOnDevice,
      privateKeysInCache,
      privateKeysInStorage,
      privateKeysExistSomewhere
    });
    if (!privateKeysExistSomewhere || setupNewCrossSigning) {
      _logger.logger.log("Cross-signing private keys not found locally or in secret storage, " + "creating new keys");
      // If a user has multiple devices, it important to only call bootstrap
      // as part of some UI flow (and not silently during startup), as they
      // may have setup cross-signing on a platform which has not saved keys
      // to secret storage, and this would reset them. In such a case, you
      // should prompt the user to verify any existing devices first (and
      // request private keys from those devices) before calling bootstrap.
      await resetCrossSigning();
    } else if (publicKeysOnDevice && privateKeysInCache) {
      _logger.logger.log("Cross-signing public keys trusted and private keys found locally");
    } else if (privateKeysInStorage) {
      _logger.logger.log("Cross-signing private keys not found locally, but they are available " + "in secret storage, reading storage and caching locally");
      await this.checkOwnCrossSigningTrust({
        allowPrivateKeyRequests: true
      });
    }

    // Assuming no app-supplied callback, default to storing new private keys in
    // secret storage if it exists. If it does not, it is assumed this will be
    // done as part of setting up secret storage later.
    const crossSigningPrivateKeys = builder.crossSigningCallbacks.privateKeys;
    if (crossSigningPrivateKeys.size && !this.baseApis.cryptoCallbacks.saveCrossSigningKeys) {
      const secretStorage = new _secretStorage.ServerSideSecretStorageImpl(builder.accountDataClientAdapter, builder.ssssCryptoCallbacks);
      if (await secretStorage.hasKey()) {
        _logger.logger.log("Storing new cross-signing private keys in secret storage");
        // This is writing to in-memory account data in
        // builder.accountDataClientAdapter so won't fail
        await _CrossSigning.CrossSigningInfo.storeInSecretStorage(crossSigningPrivateKeys, secretStorage);
      }
    }
    const operation = builder.buildOperation();
    await operation.apply(this);
    // This persists private keys and public keys as trusted,
    // only do this if apply succeeded for now as retry isn't in place yet
    await builder.persist(this);
    _logger.logger.log("Cross-signing ready");
  }

  /**
   * Bootstrap Secure Secret Storage if needed by creating a default key. If everything is
   * already set up, then no changes are made, so this is safe to run to ensure secret
   * storage is ready for use.
   *
   * This function
   * - creates a new Secure Secret Storage key if no default key exists
   *   - if a key backup exists, it is migrated to store the key in the Secret
   *     Storage
   * - creates a backup if none exists, and one is requested
   * - migrates Secure Secret Storage to use the latest algorithm, if an outdated
   *   algorithm is found
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * Returns:
   *     A promise which resolves to key creation data for
   *     SecretStorage#addKey: an object with `passphrase` etc fields.
   */
  // TODO this does not resolve with what it says it does
  async bootstrapSecretStorage({
    createSecretStorageKey = async () => ({}),
    keyBackupInfo,
    setupNewKeyBackup,
    setupNewSecretStorage,
    getKeyBackupPassphrase
  } = {}) {
    _logger.logger.log("Bootstrapping Secure Secret Storage");
    const delegateCryptoCallbacks = this.baseApis.cryptoCallbacks;
    const builder = new _EncryptionSetup.EncryptionSetupBuilder(this.baseApis.store.accountData, delegateCryptoCallbacks);
    const secretStorage = new _secretStorage.ServerSideSecretStorageImpl(builder.accountDataClientAdapter, builder.ssssCryptoCallbacks);

    // the ID of the new SSSS key, if we create one
    let newKeyId = null;

    // create a new SSSS key and set it as default
    const createSSSS = async opts => {
      const {
        keyId,
        keyInfo
      } = await secretStorage.addKey(_secretStorage.SECRET_STORAGE_ALGORITHM_V1_AES, opts);

      // make the private key available to encrypt 4S secrets
      builder.ssssCryptoCallbacks.addPrivateKey(keyId, keyInfo, opts.key);
      await secretStorage.setDefaultKeyId(keyId);
      return keyId;
    };
    const ensureCanCheckPassphrase = async (keyId, keyInfo) => {
      if (!keyInfo.mac) {
        const key = await this.baseApis.cryptoCallbacks.getSecretStorageKey?.({
          keys: {
            [keyId]: keyInfo
          }
        }, "");
        if (key) {
          const privateKey = key[1];
          builder.ssssCryptoCallbacks.addPrivateKey(keyId, keyInfo, privateKey);
          const {
            iv,
            mac
          } = await (0, _aes.calculateKeyCheck)(privateKey);
          keyInfo.iv = iv;
          keyInfo.mac = mac;
          await builder.setAccountData(`m.secret_storage.key.${keyId}`, keyInfo);
        }
      }
    };
    const signKeyBackupWithCrossSigning = async keyBackupAuthData => {
      if (this.crossSigningInfo.getId() && (await this.crossSigningInfo.isStoredInKeyCache("master"))) {
        try {
          _logger.logger.log("Adding cross-signing signature to key backup");
          await this.crossSigningInfo.signObject(keyBackupAuthData, "master");
        } catch (e) {
          // This step is not critical (just helpful), so we catch here
          // and continue if it fails.
          _logger.logger.error("Signing key backup with cross-signing keys failed", e);
        }
      } else {
        _logger.logger.warn("Cross-signing keys not available, skipping signature on key backup");
      }
    };
    const oldSSSSKey = await this.secretStorage.getKey();
    const [oldKeyId, oldKeyInfo] = oldSSSSKey || [null, null];
    const storageExists = !setupNewSecretStorage && oldKeyInfo && oldKeyInfo.algorithm === _secretStorage.SECRET_STORAGE_ALGORITHM_V1_AES;

    // Log all relevant state for easier parsing of debug logs.
    _logger.logger.log({
      keyBackupInfo,
      setupNewKeyBackup,
      setupNewSecretStorage,
      storageExists,
      oldKeyInfo
    });
    if (!storageExists && !keyBackupInfo) {
      // either we don't have anything, or we've been asked to restart
      // from scratch
      _logger.logger.log("Secret storage does not exist, creating new storage key");

      // if we already have a usable default SSSS key and aren't resetting
      // SSSS just use it. otherwise, create a new one
      // Note: we leave the old SSSS key in place: there could be other
      // secrets using it, in theory. We could move them to the new key but a)
      // that would mean we'd need to prompt for the old passphrase, and b)
      // it's not clear that would be the right thing to do anyway.
      const {
        keyInfo,
        privateKey
      } = await createSecretStorageKey();
      newKeyId = await createSSSS({
        passphrase: keyInfo?.passphrase,
        key: privateKey,
        name: keyInfo?.name
      });
    } else if (!storageExists && keyBackupInfo) {
      // we have an existing backup, but no SSSS
      _logger.logger.log("Secret storage does not exist, using key backup key");

      // if we have the backup key already cached, use it; otherwise use the
      // callback to prompt for the key
      const backupKey = (await this.getSessionBackupPrivateKey()) || (await getKeyBackupPassphrase?.());

      // create a new SSSS key and use the backup key as the new SSSS key
      const opts = {
        key: backupKey
      };
      if (keyBackupInfo.auth_data.private_key_salt && keyBackupInfo.auth_data.private_key_iterations) {
        // FIXME: ???
        opts.passphrase = {
          algorithm: "m.pbkdf2",
          iterations: keyBackupInfo.auth_data.private_key_iterations,
          salt: keyBackupInfo.auth_data.private_key_salt,
          bits: 256
        };
      }
      newKeyId = await createSSSS(opts);

      // store the backup key in secret storage
      await secretStorage.store("m.megolm_backup.v1", (0, _base.encodeBase64)(backupKey), [newKeyId]);

      // The backup is trusted because the user provided the private key.
      // Sign the backup with the cross-signing key so the key backup can
      // be trusted via cross-signing.
      await signKeyBackupWithCrossSigning(keyBackupInfo.auth_data);
      builder.addSessionBackup(keyBackupInfo);
    } else {
      // 4S is already set up
      _logger.logger.log("Secret storage exists");
      if (oldKeyInfo && oldKeyInfo.algorithm === _secretStorage.SECRET_STORAGE_ALGORITHM_V1_AES) {
        // make sure that the default key has the information needed to
        // check the passphrase
        await ensureCanCheckPassphrase(oldKeyId, oldKeyInfo);
      }
    }

    // If we have cross-signing private keys cached, store them in secret
    // storage if they are not there already.
    if (!this.baseApis.cryptoCallbacks.saveCrossSigningKeys && (await this.isCrossSigningReady()) && (newKeyId || !(await this.crossSigningInfo.isStoredInSecretStorage(secretStorage)))) {
      _logger.logger.log("Copying cross-signing private keys from cache to secret storage");
      const crossSigningPrivateKeys = await this.crossSigningInfo.getCrossSigningKeysFromCache();
      // This is writing to in-memory account data in
      // builder.accountDataClientAdapter so won't fail
      await _CrossSigning.CrossSigningInfo.storeInSecretStorage(crossSigningPrivateKeys, secretStorage);
    }
    if (setupNewKeyBackup && !keyBackupInfo) {
      _logger.logger.log("Creating new message key backup version");
      const info = await this.baseApis.prepareKeyBackupVersion(null /* random key */,
      // don't write to secret storage, as it will write to this.secretStorage.
      // Here, we want to capture all the side-effects of bootstrapping,
      // and want to write to the local secretStorage object
      {
        secureSecretStorage: false
      });
      // write the key to 4S
      const privateKey = (0, _recoverykey.decodeRecoveryKey)(info.recovery_key);
      await secretStorage.store("m.megolm_backup.v1", (0, _base.encodeBase64)(privateKey));

      // create keyBackupInfo object to add to builder
      const data = {
        algorithm: info.algorithm,
        auth_data: info.auth_data
      };

      // Sign with cross-signing master key
      await signKeyBackupWithCrossSigning(data.auth_data);

      // sign with the device fingerprint
      await this.signObject(data.auth_data);
      builder.addSessionBackup(data);
    }

    // Cache the session backup key
    const sessionBackupKey = await secretStorage.get("m.megolm_backup.v1");
    if (sessionBackupKey) {
      _logger.logger.info("Got session backup key from secret storage: caching");
      // fix up the backup key if it's in the wrong format, and replace
      // in secret storage
      const fixedBackupKey = fixBackupKey(sessionBackupKey);
      if (fixedBackupKey) {
        const keyId = newKeyId || oldKeyId;
        await secretStorage.store("m.megolm_backup.v1", fixedBackupKey, keyId ? [keyId] : null);
      }
      const decodedBackupKey = new Uint8Array((0, _base.decodeBase64)(fixedBackupKey || sessionBackupKey));
      builder.addSessionBackupPrivateKeyToCache(decodedBackupKey);
    } else if (this.backupManager.getKeyBackupEnabled()) {
      // key backup is enabled but we don't have a session backup key in SSSS: see if we have one in
      // the cache or the user can provide one, and if so, write it to SSSS
      const backupKey = (await this.getSessionBackupPrivateKey()) || (await getKeyBackupPassphrase?.());
      if (!backupKey) {
        // This will require user intervention to recover from since we don't have the key
        // backup key anywhere. The user should probably just set up a new key backup and
        // the key for the new backup will be stored. If we hit this scenario in the wild
        // with any frequency, we should do more than just log an error.
        _logger.logger.error("Key backup is enabled but couldn't get key backup key!");
        return;
      }
      _logger.logger.info("Got session backup key from cache/user that wasn't in SSSS: saving to SSSS");
      await secretStorage.store("m.megolm_backup.v1", (0, _base.encodeBase64)(backupKey));
    }
    const operation = builder.buildOperation();
    await operation.apply(this);
    // this persists private keys and public keys as trusted,
    // only do this if apply succeeded for now as retry isn't in place yet
    await builder.persist(this);
    _logger.logger.log("Secure Secret Storage ready");
  }

  /**
   * Implementation of {@link Crypto.CryptoApi#resetKeyBackup}.
   */
  async resetKeyBackup() {
    // Delete existing ones
    // There is no use case for having several key backup version live server side.
    // Even if not deleted it would be lost as the key to restore is lost.
    // There should be only one backup at a time.
    await this.backupManager.deleteAllKeyBackupVersions();
    const info = await this.backupManager.prepareKeyBackupVersion();
    await this.signObject(info.auth_data);

    // add new key backup
    const {
      version
    } = await this.baseApis.http.authedRequest(_httpApi.Method.Post, "/room_keys/version", undefined, info, {
      prefix: _httpApi.ClientPrefix.V3
    });
    _logger.logger.log(`Created backup version ${version}`);

    // write the key to 4S
    const privateKey = info.privateKey;
    await this.secretStorage.store("m.megolm_backup.v1", (0, _base.encodeBase64)(privateKey));
    await this.storeSessionBackupPrivateKey(privateKey);
    await this.backupManager.checkAndStart();
    await this.backupManager.scheduleAllGroupSessionsForBackup();
  }

  /**
   * Implementation of {@link Crypto.CryptoApi#deleteKeyBackupVersion}.
   */
  async deleteKeyBackupVersion(version) {
    await this.backupManager.deleteKeyBackupVersion(version);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#addKey}.
   */
  addSecretStorageKey(algorithm, opts, keyID) {
    return this.secretStorage.addKey(algorithm, opts, keyID);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#hasKey}.
   */
  hasSecretStorageKey(keyID) {
    return this.secretStorage.hasKey(keyID);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#getKey}.
   */
  getSecretStorageKey(keyID) {
    return this.secretStorage.getKey(keyID);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#store}.
   */
  storeSecret(name, secret, keys) {
    return this.secretStorage.store(name, secret, keys);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#get}.
   */
  getSecret(name) {
    return this.secretStorage.get(name);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#isStored}.
   */
  isSecretStored(name) {
    return this.secretStorage.isStored(name);
  }
  requestSecret(name, devices) {
    if (!devices) {
      devices = Object.keys(this.deviceList.getRawStoredDevicesForUser(this.userId));
    }
    return this.secretStorage.request(name, devices);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#getDefaultKeyId}.
   */
  getDefaultSecretStorageKeyId() {
    return this.secretStorage.getDefaultKeyId();
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#setDefaultKeyId}.
   */
  setDefaultSecretStorageKeyId(k) {
    return this.secretStorage.setDefaultKeyId(k);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#checkKey}.
   */
  checkSecretStorageKey(key, info) {
    return this.secretStorage.checkKey(key, info);
  }

  /**
   * Checks that a given secret storage private key matches a given public key.
   * This can be used by the getSecretStorageKey callback to verify that the
   * private key it is about to supply is the one that was requested.
   *
   * @param privateKey - The private key
   * @param expectedPublicKey - The public key
   * @returns true if the key matches, otherwise false
   */
  checkSecretStoragePrivateKey(privateKey, expectedPublicKey) {
    let decryption = null;
    try {
      decryption = new global.Olm.PkDecryption();
      const gotPubkey = decryption.init_with_private_key(privateKey);
      // make sure it agrees with the given pubkey
      return gotPubkey === expectedPublicKey;
    } finally {
      decryption?.free();
    }
  }

  /**
   * Fetches the backup private key, if cached
   * @returns the key, if any, or null
   */
  async getSessionBackupPrivateKey() {
    const encodedKey = await new Promise(resolve => {
      this.cryptoStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
        this.cryptoStore.getSecretStorePrivateKey(txn, resolve, "m.megolm_backup.v1");
      });
    });
    let key = null;

    // make sure we have a Uint8Array, rather than a string
    if (typeof encodedKey === "string") {
      key = new Uint8Array((0, _base.decodeBase64)(fixBackupKey(encodedKey) || encodedKey));
      await this.storeSessionBackupPrivateKey(key);
    }
    if (encodedKey && typeof encodedKey === "object" && "ciphertext" in encodedKey) {
      const pickleKey = Buffer.from(this.olmDevice.pickleKey);
      const decrypted = await (0, _aes.decryptAES)(encodedKey, pickleKey, "m.megolm_backup.v1");
      key = (0, _base.decodeBase64)(decrypted);
    }
    return key;
  }

  /**
   * Stores the session backup key to the cache
   * @param key - the private key
   * @returns a promise so you can catch failures
   */
  async storeSessionBackupPrivateKey(key, version) {
    if (!(key instanceof Uint8Array)) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      throw new Error(`storeSessionBackupPrivateKey expects Uint8Array, got ${key}`);
    }
    const pickleKey = Buffer.from(this.olmDevice.pickleKey);
    const encryptedKey = await (0, _aes.encryptAES)((0, _base.encodeBase64)(key), pickleKey, "m.megolm_backup.v1");
    return this.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.cryptoStore.storeSecretStorePrivateKey(txn, "m.megolm_backup.v1", encryptedKey);
    });
  }

  /**
   * Get the current status of key backup.
   *
   * Implementation of {@link Crypto.CryptoApi.getActiveSessionBackupVersion}.
   */
  async getActiveSessionBackupVersion() {
    if (this.backupManager.getKeyBackupEnabled()) {
      return this.backupManager.version ?? null;
    }
    return null;
  }

  /**
   * Determine if a key backup can be trusted.
   *
   * Implementation of {@link Crypto.CryptoApi.isKeyBackupTrusted}.
   */
  async isKeyBackupTrusted(info) {
    const trustInfo = await this.backupManager.isKeyBackupTrusted(info);
    return (0, _backup.backupTrustInfoFromLegacyTrustInfo)(trustInfo);
  }

  /**
   * Force a re-check of the key backup and enable/disable it as appropriate.
   *
   * Implementation of {@link Crypto.CryptoApi.checkKeyBackupAndEnable}.
   */
  async checkKeyBackupAndEnable() {
    const checkResult = await this.backupManager.checkKeyBackup();
    if (!checkResult || !checkResult.backupInfo) return null;
    return {
      backupInfo: checkResult.backupInfo,
      trustInfo: (0, _backup.backupTrustInfoFromLegacyTrustInfo)(checkResult.trustInfo)
    };
  }

  /**
   * Checks that a given cross-signing private key matches a given public key.
   * This can be used by the getCrossSigningKey callback to verify that the
   * private key it is about to supply is the one that was requested.
   *
   * @param privateKey - The private key
   * @param expectedPublicKey - The public key
   * @returns true if the key matches, otherwise false
   */
  checkCrossSigningPrivateKey(privateKey, expectedPublicKey) {
    let signing = null;
    try {
      signing = new global.Olm.PkSigning();
      const gotPubkey = signing.init_with_seed(privateKey);
      // make sure it agrees with the given pubkey
      return gotPubkey === expectedPublicKey;
    } finally {
      signing?.free();
    }
  }

  /**
   * Run various follow-up actions after cross-signing keys have changed locally
   * (either by resetting the keys for the account or by getting them from secret
   * storage), such as signing the current device, upgrading device
   * verifications, etc.
   */
  async afterCrossSigningLocalKeyChange() {
    _logger.logger.info("Starting cross-signing key change post-processing");

    // sign the current device with the new key, and upload to the server
    const device = this.deviceList.getStoredDevice(this.userId, this.deviceId);
    const signedDevice = await this.crossSigningInfo.signDevice(this.userId, device);
    _logger.logger.info(`Starting background key sig upload for ${this.deviceId}`);
    const upload = ({
      shouldEmit = false
    }) => {
      return this.baseApis.uploadKeySignatures({
        [this.userId]: {
          [this.deviceId]: signedDevice
        }
      }).then(response => {
        const {
          failures
        } = response || {};
        if (Object.keys(failures || []).length > 0) {
          if (shouldEmit) {
            this.baseApis.emit(CryptoEvent.KeySignatureUploadFailure, failures, "afterCrossSigningLocalKeyChange", upload // continuation
            );
          }
          throw new _errors.KeySignatureUploadError("Key upload failed", {
            failures
          });
        }
        _logger.logger.info(`Finished background key sig upload for ${this.deviceId}`);
      }).catch(e => {
        _logger.logger.error(`Error during background key sig upload for ${this.deviceId}`, e);
      });
    };
    upload({
      shouldEmit: true
    });
    const shouldUpgradeCb = this.baseApis.cryptoCallbacks.shouldUpgradeDeviceVerifications;
    if (shouldUpgradeCb) {
      _logger.logger.info("Starting device verification upgrade");

      // Check all users for signatures if upgrade callback present
      // FIXME: do this in batches
      const users = {};
      for (const [userId, crossSigningInfo] of Object.entries(this.deviceList.crossSigningInfo)) {
        const upgradeInfo = await this.checkForDeviceVerificationUpgrade(userId, _CrossSigning.CrossSigningInfo.fromStorage(crossSigningInfo, userId));
        if (upgradeInfo) {
          users[userId] = upgradeInfo;
        }
      }
      if (Object.keys(users).length > 0) {
        _logger.logger.info(`Found ${Object.keys(users).length} verif users to upgrade`);
        try {
          const usersToUpgrade = await shouldUpgradeCb({
            users: users
          });
          if (usersToUpgrade) {
            for (const userId of usersToUpgrade) {
              if (userId in users) {
                await this.baseApis.setDeviceVerified(userId, users[userId].crossSigningInfo.getId());
              }
            }
          }
        } catch (e) {
          _logger.logger.log("shouldUpgradeDeviceVerifications threw an error: not upgrading", e);
        }
      }
      _logger.logger.info("Finished device verification upgrade");
    }
    _logger.logger.info("Finished cross-signing key change post-processing");
  }

  /**
   * Check if a user's cross-signing key is a candidate for upgrading from device
   * verification.
   *
   * @param userId - the user whose cross-signing information is to be checked
   * @param crossSigningInfo - the cross-signing information to check
   */
  async checkForDeviceVerificationUpgrade(userId, crossSigningInfo) {
    // only upgrade if this is the first cross-signing key that we've seen for
    // them, and if their cross-signing key isn't already verified
    const trustLevel = this.crossSigningInfo.checkUserTrust(crossSigningInfo);
    if (crossSigningInfo.firstUse && !trustLevel.isVerified()) {
      const devices = this.deviceList.getRawStoredDevicesForUser(userId);
      const deviceIds = await this.checkForValidDeviceSignature(userId, crossSigningInfo.keys.master, devices);
      if (deviceIds.length) {
        return {
          devices: deviceIds.map(deviceId => _deviceinfo.DeviceInfo.fromStorage(devices[deviceId], deviceId)),
          crossSigningInfo
        };
      }
    }
  }

  /**
   * Check if the cross-signing key is signed by a verified device.
   *
   * @param userId - the user ID whose key is being checked
   * @param key - the key that is being checked
   * @param devices - the user's devices.  Should be a map from device ID
   *     to device info
   */
  async checkForValidDeviceSignature(userId, key, devices) {
    const deviceIds = [];
    if (devices && key.signatures && key.signatures[userId]) {
      for (const signame of Object.keys(key.signatures[userId])) {
        const [, deviceId] = signame.split(":", 2);
        if (deviceId in devices && devices[deviceId].verified === DeviceVerification.VERIFIED) {
          try {
            await olmlib.verifySignature(this.olmDevice, key, userId, deviceId, devices[deviceId].keys[signame]);
            deviceIds.push(deviceId);
          } catch (e) {}
        }
      }
    }
    return deviceIds;
  }

  /**
   * Get the user's cross-signing key ID.
   *
   * @param type - The type of key to get the ID of.  One of
   *     "master", "self_signing", or "user_signing".  Defaults to "master".
   *
   * @returns the key ID
   */
  getCrossSigningKeyId(type = _api.CrossSigningKey.Master) {
    return Promise.resolve(this.getCrossSigningId(type));
  }

  // old name, for backwards compatibility
  getCrossSigningId(type) {
    return this.crossSigningInfo.getId(type);
  }

  /**
   * Get the cross signing information for a given user.
   *
   * @param userId - the user ID to get the cross-signing info for.
   *
   * @returns the cross signing information for the user.
   */
  getStoredCrossSigningForUser(userId) {
    return this.deviceList.getStoredCrossSigningForUser(userId);
  }

  /**
   * Check whether a given user is trusted.
   *
   * @param userId - The ID of the user to check.
   *
   * @returns
   */
  checkUserTrust(userId) {
    const userCrossSigning = this.deviceList.getStoredCrossSigningForUser(userId);
    if (!userCrossSigning) {
      return new _CrossSigning.UserTrustLevel(false, false, false);
    }
    return this.crossSigningInfo.checkUserTrust(userCrossSigning);
  }

  /**
   * Implementation of {@link Crypto.CryptoApi.getUserVerificationStatus}.
   */
  async getUserVerificationStatus(userId) {
    return this.checkUserTrust(userId);
  }

  /**
   * Check whether a given device is trusted.
   *
   * @param userId - The ID of the user whose device is to be checked.
   * @param deviceId - The ID of the device to check
   */
  async getDeviceVerificationStatus(userId, deviceId) {
    const device = this.deviceList.getStoredDevice(userId, deviceId);
    if (!device) {
      return null;
    }
    return this.checkDeviceInfoTrust(userId, device);
  }

  /**
   * @deprecated Use {@link Crypto.CryptoApi.getDeviceVerificationStatus}.
   */
  checkDeviceTrust(userId, deviceId) {
    const device = this.deviceList.getStoredDevice(userId, deviceId);
    return this.checkDeviceInfoTrust(userId, device);
  }

  /**
   * Check whether a given deviceinfo is trusted.
   *
   * @param userId - The ID of the user whose devices is to be checked.
   * @param device - The device info object to check
   *
   * @deprecated Use {@link Crypto.CryptoApi.getDeviceVerificationStatus}.
   */
  checkDeviceInfoTrust(userId, device) {
    const trustedLocally = !!device?.isVerified();
    const userCrossSigning = this.deviceList.getStoredCrossSigningForUser(userId);
    if (device && userCrossSigning) {
      // The trustCrossSignedDevices only affects trust of other people's cross-signing
      // signatures
      const trustCrossSig = this.trustCrossSignedDevices || userId === this.userId;
      return this.crossSigningInfo.checkDeviceTrust(userCrossSigning, device, trustedLocally, trustCrossSig);
    } else {
      return new _CrossSigning.DeviceTrustLevel(false, false, trustedLocally, false);
    }
  }

  /**
   * Check whether one of our own devices is cross-signed by our
   * user's stored keys, regardless of whether we trust those keys yet.
   *
   * @param deviceId - The ID of the device to check
   *
   * @returns true if the device is cross-signed
   */
  checkIfOwnDeviceCrossSigned(deviceId) {
    const device = this.deviceList.getStoredDevice(this.userId, deviceId);
    if (!device) return false;
    const userCrossSigning = this.deviceList.getStoredCrossSigningForUser(this.userId);
    return userCrossSigning?.checkDeviceTrust(userCrossSigning, device, false, true).isCrossSigningVerified() ?? false;
  }
  /**
   * Check the copy of our cross-signing key that we have in the device list and
   * see if we can get the private key. If so, mark it as trusted.
   */
  async checkOwnCrossSigningTrust({
    allowPrivateKeyRequests = false
  } = {}) {
    const userId = this.userId;

    // Before proceeding, ensure our cross-signing public keys have been
    // downloaded via the device list.
    await this.downloadKeys([this.userId]);

    // Also check which private keys are locally cached.
    const crossSigningPrivateKeys = await this.crossSigningInfo.getCrossSigningKeysFromCache();

    // If we see an update to our own master key, check it against the master
    // key we have and, if it matches, mark it as verified

    // First, get the new cross-signing info
    const newCrossSigning = this.deviceList.getStoredCrossSigningForUser(userId);
    if (!newCrossSigning) {
      _logger.logger.error("Got cross-signing update event for user " + userId + " but no new cross-signing information found!");
      return;
    }
    const seenPubkey = newCrossSigning.getId();
    const masterChanged = this.crossSigningInfo.getId() !== seenPubkey;
    const masterExistsNotLocallyCached = newCrossSigning.getId() && !crossSigningPrivateKeys.has("master");
    if (masterChanged) {
      _logger.logger.info("Got new master public key", seenPubkey);
    }
    if (allowPrivateKeyRequests && (masterChanged || masterExistsNotLocallyCached)) {
      _logger.logger.info("Attempting to retrieve cross-signing master private key");
      let signing = null;
      // It's important for control flow that we leave any errors alone for
      // higher levels to handle so that e.g. cancelling access properly
      // aborts any larger operation as well.
      try {
        const ret = await this.crossSigningInfo.getCrossSigningKey("master", seenPubkey);
        signing = ret[1];
        _logger.logger.info("Got cross-signing master private key");
      } finally {
        signing?.free();
      }
    }
    const oldSelfSigningId = this.crossSigningInfo.getId("self_signing");
    const oldUserSigningId = this.crossSigningInfo.getId("user_signing");

    // Update the version of our keys in our cross-signing object and the local store
    this.storeTrustedSelfKeys(newCrossSigning.keys);
    const selfSigningChanged = oldSelfSigningId !== newCrossSigning.getId("self_signing");
    const userSigningChanged = oldUserSigningId !== newCrossSigning.getId("user_signing");
    const selfSigningExistsNotLocallyCached = newCrossSigning.getId("self_signing") && !crossSigningPrivateKeys.has("self_signing");
    const userSigningExistsNotLocallyCached = newCrossSigning.getId("user_signing") && !crossSigningPrivateKeys.has("user_signing");
    const keySignatures = {};
    if (selfSigningChanged) {
      _logger.logger.info("Got new self-signing key", newCrossSigning.getId("self_signing"));
    }
    if (allowPrivateKeyRequests && (selfSigningChanged || selfSigningExistsNotLocallyCached)) {
      _logger.logger.info("Attempting to retrieve cross-signing self-signing private key");
      let signing = null;
      try {
        const ret = await this.crossSigningInfo.getCrossSigningKey("self_signing", newCrossSigning.getId("self_signing"));
        signing = ret[1];
        _logger.logger.info("Got cross-signing self-signing private key");
      } finally {
        signing?.free();
      }
      const device = this.deviceList.getStoredDevice(this.userId, this.deviceId);
      const signedDevice = await this.crossSigningInfo.signDevice(this.userId, device);
      keySignatures[this.deviceId] = signedDevice;
    }
    if (userSigningChanged) {
      _logger.logger.info("Got new user-signing key", newCrossSigning.getId("user_signing"));
    }
    if (allowPrivateKeyRequests && (userSigningChanged || userSigningExistsNotLocallyCached)) {
      _logger.logger.info("Attempting to retrieve cross-signing user-signing private key");
      let signing = null;
      try {
        const ret = await this.crossSigningInfo.getCrossSigningKey("user_signing", newCrossSigning.getId("user_signing"));
        signing = ret[1];
        _logger.logger.info("Got cross-signing user-signing private key");
      } finally {
        signing?.free();
      }
    }
    if (masterChanged) {
      const masterKey = this.crossSigningInfo.keys.master;
      await this.signObject(masterKey);
      const deviceSig = masterKey.signatures[this.userId]["ed25519:" + this.deviceId];
      // Include only the _new_ device signature in the upload.
      // We may have existing signatures from deleted devices, which will cause
      // the entire upload to fail.
      keySignatures[this.crossSigningInfo.getId()] = Object.assign({}, masterKey, {
        signatures: {
          [this.userId]: {
            ["ed25519:" + this.deviceId]: deviceSig
          }
        }
      });
    }
    const keysToUpload = Object.keys(keySignatures);
    if (keysToUpload.length) {
      const upload = ({
        shouldEmit = false
      }) => {
        _logger.logger.info(`Starting background key sig upload for ${keysToUpload}`);
        return this.baseApis.uploadKeySignatures({
          [this.userId]: keySignatures
        }).then(response => {
          const {
            failures
          } = response || {};
          _logger.logger.info(`Finished background key sig upload for ${keysToUpload}`);
          if (Object.keys(failures || []).length > 0) {
            if (shouldEmit) {
              this.baseApis.emit(CryptoEvent.KeySignatureUploadFailure, failures, "checkOwnCrossSigningTrust", upload);
            }
            throw new _errors.KeySignatureUploadError("Key upload failed", {
              failures
            });
          }
        }).catch(e => {
          _logger.logger.error(`Error during background key sig upload for ${keysToUpload}`, e);
        });
      };
      upload({
        shouldEmit: true
      });
    }
    this.emit(CryptoEvent.UserTrustStatusChanged, userId, this.checkUserTrust(userId));
    if (masterChanged) {
      this.emit(CryptoEvent.KeysChanged, {});
      await this.afterCrossSigningLocalKeyChange();
    }

    // Now we may be able to trust our key backup
    await this.backupManager.checkKeyBackup();
    // FIXME: if we previously trusted the backup, should we automatically sign
    // the backup with the new key (if not already signed)?
  }

  /**
   * Implementation of {@link CryptoBackend#getBackupDecryptor}.
   */
  async getBackupDecryptor(backupInfo, privKey) {
    if (!(privKey instanceof Uint8Array)) {
      throw new Error(`getBackupDecryptor expects Uint8Array`);
    }
    const algorithm = await _backup.BackupManager.makeAlgorithm(backupInfo, async () => {
      return privKey;
    });

    // If the pubkey computed from the private data we've been given
    // doesn't match the one in the auth_data, the user has entered
    // a different recovery key / the wrong passphrase.
    if (!(await algorithm.keyMatches(privKey))) {
      return Promise.reject(new _httpApi.MatrixError({
        errcode: _client.MatrixClient.RESTORE_BACKUP_ERROR_BAD_KEY
      }));
    }
    return new _backup.LibOlmBackupDecryptor(algorithm);
  }

  /**
   * Implementation of {@link CryptoBackend#importBackedUpRoomKeys}.
   */
  importBackedUpRoomKeys(keys, backupVersion, opts = {}) {
    opts.source = "backup";
    return this.importRoomKeys(keys, opts);
  }

  /**
   * Store a set of keys as our own, trusted, cross-signing keys.
   *
   * @param keys - The new trusted set of keys
   */
  async storeTrustedSelfKeys(keys) {
    if (keys) {
      this.crossSigningInfo.setKeys(keys);
    } else {
      this.crossSigningInfo.clearKeys();
    }
    await this.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.cryptoStore.storeCrossSigningKeys(txn, this.crossSigningInfo.keys);
    });
  }

  /**
   * Check if the master key is signed by a verified device, and if so, prompt
   * the application to mark it as verified.
   *
   * @param userId - the user ID whose key should be checked
   */
  async checkDeviceVerifications(userId) {
    const shouldUpgradeCb = this.baseApis.cryptoCallbacks.shouldUpgradeDeviceVerifications;
    if (!shouldUpgradeCb) {
      // Upgrading skipped when callback is not present.
      return;
    }
    _logger.logger.info(`Starting device verification upgrade for ${userId}`);
    if (this.crossSigningInfo.keys.user_signing) {
      const crossSigningInfo = this.deviceList.getStoredCrossSigningForUser(userId);
      if (crossSigningInfo) {
        const upgradeInfo = await this.checkForDeviceVerificationUpgrade(userId, crossSigningInfo);
        if (upgradeInfo) {
          const usersToUpgrade = await shouldUpgradeCb({
            users: {
              [userId]: upgradeInfo
            }
          });
          if (usersToUpgrade.includes(userId)) {
            await this.baseApis.setDeviceVerified(userId, crossSigningInfo.getId());
          }
        }
      }
    }
    _logger.logger.info(`Finished device verification upgrade for ${userId}`);
  }

  /**
   */
  enableLazyLoading() {
    this.lazyLoadMembers = true;
  }

  /**
   * Tell the crypto module to register for MatrixClient events which it needs to
   * listen for
   *
   * @param eventEmitter - event source where we can register
   *    for event notifications
   */
  registerEventHandlers(eventEmitter) {
    eventEmitter.on(_roomMember.RoomMemberEvent.Membership, this.onMembership);
    eventEmitter.on(_client.ClientEvent.ToDeviceEvent, this.onToDeviceEvent);
    eventEmitter.on(_room.RoomEvent.Timeline, this.onTimelineEvent);
    eventEmitter.on(_event2.MatrixEventEvent.Decrypted, this.onTimelineEvent);
  }

  /**
   * @deprecated this does nothing and will be removed in a future version
   */
  start() {
    _logger.logger.warn("MatrixClient.crypto.start() is deprecated");
  }

  /** Stop background processes related to crypto */
  stop() {
    this.outgoingRoomKeyRequestManager.stop();
    this.deviceList.stop();
    this.dehydrationManager.stop();
    this.backupManager.stop();
  }

  /**
   * Get the Ed25519 key for this device
   *
   * @returns base64-encoded ed25519 key.
   *
   * @deprecated Use {@link Crypto.CryptoApi#getOwnDeviceKeys}.
   */
  getDeviceEd25519Key() {
    return this.olmDevice.deviceEd25519Key;
  }

  /**
   * Get the Curve25519 key for this device
   *
   * @returns base64-encoded curve25519 key.
   *
   * @deprecated Use {@link Crypto.CryptoApi#getOwnDeviceKeys}
   */
  getDeviceCurve25519Key() {
    return this.olmDevice.deviceCurve25519Key;
  }

  /**
   * Implementation of {@link Crypto.CryptoApi#getOwnDeviceKeys}.
   */
  async getOwnDeviceKeys() {
    if (!this.olmDevice.deviceCurve25519Key) {
      throw new Error("Curve25519 key not yet created");
    }
    if (!this.olmDevice.deviceEd25519Key) {
      throw new Error("Ed25519 key not yet created");
    }
    return {
      ed25519: this.olmDevice.deviceEd25519Key,
      curve25519: this.olmDevice.deviceCurve25519Key
    };
  }

  /**
   * Set the global override for whether the client should ever send encrypted
   * messages to unverified devices.  This provides the default for rooms which
   * do not specify a value.
   *
   * @param value - whether to blacklist all unverified devices by default
   *
   * @deprecated Set {@link Crypto.CryptoApi#globalBlacklistUnverifiedDevices | CryptoApi.globalBlacklistUnverifiedDevices} directly.
   */
  setGlobalBlacklistUnverifiedDevices(value) {
    this.globalBlacklistUnverifiedDevices = value;
  }

  /**
   * @returns whether to blacklist all unverified devices by default
   *
   * @deprecated Reference {@link Crypto.CryptoApi#globalBlacklistUnverifiedDevices | CryptoApi.globalBlacklistUnverifiedDevices} directly.
   */
  getGlobalBlacklistUnverifiedDevices() {
    return this.globalBlacklistUnverifiedDevices;
  }

  /**
   * Upload the device keys to the homeserver.
   * @returns A promise that will resolve when the keys are uploaded.
   */
  uploadDeviceKeys() {
    const deviceKeys = {
      algorithms: this.supportedAlgorithms,
      device_id: this.deviceId,
      keys: this.deviceKeys,
      user_id: this.userId
    };
    return this.signObject(deviceKeys).then(() => {
      return this.baseApis.uploadKeysRequest({
        device_keys: deviceKeys
      });
    });
  }
  getNeedsNewFallback() {
    return !!this.needsNewFallback;
  }

  // check if it's time to upload one-time keys, and do so if so.
  maybeUploadOneTimeKeys() {
    // frequency with which to check & upload one-time keys
    const uploadPeriod = 1000 * 60; // one minute

    // max number of keys to upload at once
    // Creating keys can be an expensive operation so we limit the
    // number we generate in one go to avoid blocking the application
    // for too long.
    const maxKeysPerCycle = 5;
    if (this.oneTimeKeyCheckInProgress) {
      return;
    }
    const now = Date.now();
    if (this.lastOneTimeKeyCheck !== null && now - this.lastOneTimeKeyCheck < uploadPeriod) {
      // we've done a key upload recently.
      return;
    }
    this.lastOneTimeKeyCheck = now;

    // We need to keep a pool of one time public keys on the server so that
    // other devices can start conversations with us. But we can only store
    // a finite number of private keys in the olm Account object.
    // To complicate things further then can be a delay between a device
    // claiming a public one time key from the server and it sending us a
    // message. We need to keep the corresponding private key locally until
    // we receive the message.
    // But that message might never arrive leaving us stuck with duff
    // private keys clogging up our local storage.
    // So we need some kind of engineering compromise to balance all of
    // these factors.

    // Check how many keys we can store in the Account object.
    const maxOneTimeKeys = this.olmDevice.maxNumberOfOneTimeKeys();
    // Try to keep at most half that number on the server. This leaves the
    // rest of the slots free to hold keys that have been claimed from the
    // server but we haven't received a message for.
    // If we run out of slots when generating new keys then olm will
    // discard the oldest private keys first. This will eventually clean
    // out stale private keys that won't receive a message.
    const keyLimit = Math.floor(maxOneTimeKeys / 2);
    const uploadLoop = async keyCount => {
      while (keyLimit > keyCount || this.getNeedsNewFallback()) {
        // Ask olm to generate new one time keys, then upload them to synapse.
        if (keyLimit > keyCount) {
          _logger.logger.info("generating oneTimeKeys");
          const keysThisLoop = Math.min(keyLimit - keyCount, maxKeysPerCycle);
          await this.olmDevice.generateOneTimeKeys(keysThisLoop);
        }
        if (this.getNeedsNewFallback()) {
          const fallbackKeys = await this.olmDevice.getFallbackKey();
          // if fallbackKeys is non-empty, we've already generated a
          // fallback key, but it hasn't been published yet, so we
          // can use that instead of generating a new one
          if (!fallbackKeys.curve25519 || Object.keys(fallbackKeys.curve25519).length == 0) {
            _logger.logger.info("generating fallback key");
            if (this.fallbackCleanup) {
              // cancel any pending fallback cleanup because generating
              // a new fallback key will already drop the old fallback
              // that would have been dropped, and we don't want to kill
              // the current key
              clearTimeout(this.fallbackCleanup);
              delete this.fallbackCleanup;
            }
            await this.olmDevice.generateFallbackKey();
          }
        }
        _logger.logger.info("calling uploadOneTimeKeys");
        const res = await this.uploadOneTimeKeys();
        if (res.one_time_key_counts && res.one_time_key_counts.signed_curve25519) {
          // if the response contains a more up to date value use this
          // for the next loop
          keyCount = res.one_time_key_counts.signed_curve25519;
        } else {
          throw new Error("response for uploading keys does not contain " + "one_time_key_counts.signed_curve25519");
        }
      }
    };
    this.oneTimeKeyCheckInProgress = true;
    Promise.resolve().then(() => {
      if (this.oneTimeKeyCount !== undefined) {
        // We already have the current one_time_key count from a /sync response.
        // Use this value instead of asking the server for the current key count.
        return Promise.resolve(this.oneTimeKeyCount);
      }
      // ask the server how many keys we have
      return this.baseApis.uploadKeysRequest({}).then(res => {
        return res.one_time_key_counts.signed_curve25519 || 0;
      });
    }).then(keyCount => {
      // Start the uploadLoop with the current keyCount. The function checks if
      // we need to upload new keys or not.
      // If there are too many keys on the server then we don't need to
      // create any more keys.
      return uploadLoop(keyCount);
    }).catch(e => {
      _logger.logger.error("Error uploading one-time keys", e.stack || e);
    }).finally(() => {
      // reset oneTimeKeyCount to prevent start uploading based on old data.
      // it will be set again on the next /sync-response
      this.oneTimeKeyCount = undefined;
      this.oneTimeKeyCheckInProgress = false;
    });
  }

  // returns a promise which resolves to the response
  async uploadOneTimeKeys() {
    const promises = [];
    let fallbackJson;
    if (this.getNeedsNewFallback()) {
      fallbackJson = {};
      const fallbackKeys = await this.olmDevice.getFallbackKey();
      for (const [keyId, key] of Object.entries(fallbackKeys.curve25519)) {
        const k = {
          key,
          fallback: true
        };
        fallbackJson["signed_curve25519:" + keyId] = k;
        promises.push(this.signObject(k));
      }
      this.needsNewFallback = false;
    }
    const oneTimeKeys = await this.olmDevice.getOneTimeKeys();
    const oneTimeJson = {};
    for (const keyId in oneTimeKeys.curve25519) {
      if (oneTimeKeys.curve25519.hasOwnProperty(keyId)) {
        const k = {
          key: oneTimeKeys.curve25519[keyId]
        };
        oneTimeJson["signed_curve25519:" + keyId] = k;
        promises.push(this.signObject(k));
      }
    }
    await Promise.all(promises);
    const requestBody = {
      one_time_keys: oneTimeJson
    };
    if (fallbackJson) {
      requestBody["org.matrix.msc2732.fallback_keys"] = fallbackJson;
      requestBody["fallback_keys"] = fallbackJson;
    }
    const res = await this.baseApis.uploadKeysRequest(requestBody);
    if (fallbackJson) {
      this.fallbackCleanup = setTimeout(() => {
        delete this.fallbackCleanup;
        this.olmDevice.forgetOldFallbackKey();
      }, 60 * 60 * 1000);
    }
    await this.olmDevice.markKeysAsPublished();
    return res;
  }

  /**
   * Download the keys for a list of users and stores the keys in the session
   * store.
   * @param userIds - The users to fetch.
   * @param forceDownload - Always download the keys even if cached.
   *
   * @returns A promise which resolves to a map `userId->deviceId->{@link DeviceInfo}`.
   */
  downloadKeys(userIds, forceDownload) {
    return this.deviceList.downloadKeys(userIds, !!forceDownload);
  }

  /**
   * Get the stored device keys for a user id
   *
   * @param userId - the user to list keys for.
   *
   * @returns list of devices, or null if we haven't
   * managed to get a list of devices for this user yet.
   */
  getStoredDevicesForUser(userId) {
    return this.deviceList.getStoredDevicesForUser(userId);
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
    // Keep the users without device to download theirs keys
    const usersWithoutDeviceInfo = [];
    for (const userId of userIds) {
      const deviceInfos = await this.getStoredDevicesForUser(userId);
      // If there are device infos for a userId, we transform it into a map
      // Else, the keys will be downloaded after
      if (deviceInfos) {
        const deviceMap = new Map(
        // Convert DeviceInfo to Device
        deviceInfos.map(deviceInfo => [deviceInfo.deviceId, (0, _deviceConverter.deviceInfoToDevice)(deviceInfo, userId)]));
        deviceMapByUserId.set(userId, deviceMap);
      } else {
        usersWithoutDeviceInfo.push(userId);
      }
    }

    // Download device info for users without device infos
    if (downloadUncached && usersWithoutDeviceInfo.length > 0) {
      const newDeviceInfoMap = await this.downloadKeys(usersWithoutDeviceInfo);
      newDeviceInfoMap.forEach((deviceInfoMap, userId) => {
        const deviceMap = new Map();
        // Convert DeviceInfo to Device
        deviceInfoMap.forEach((deviceInfo, deviceId) => deviceMap.set(deviceId, (0, _deviceConverter.deviceInfoToDevice)(deviceInfo, userId)));

        // Put the new device infos into the returned map
        deviceMapByUserId.set(userId, deviceMap);
      });
    }
    return deviceMapByUserId;
  }

  /**
   * Get the stored keys for a single device
   *
   *
   * @returns device, or undefined
   * if we don't know about this device
   */
  getStoredDevice(userId, deviceId) {
    return this.deviceList.getStoredDevice(userId, deviceId);
  }

  /**
   * Save the device list, if necessary
   *
   * @param delay - Time in ms before which the save actually happens.
   *     By default, the save is delayed for a short period in order to batch
   *     multiple writes, but this behaviour can be disabled by passing 0.
   *
   * @returns true if the data was saved, false if
   *     it was not (eg. because no changes were pending). The promise
   *     will only resolve once the data is saved, so may take some time
   *     to resolve.
   */
  saveDeviceList(delay) {
    return this.deviceList.saveIfDirty(delay);
  }

  /**
   * Mark the given device as locally verified.
   *
   * Implementation of {@link Crypto.CryptoApi#setDeviceVerified}.
   */
  async setDeviceVerified(userId, deviceId, verified = true) {
    await this.setDeviceVerification(userId, deviceId, verified);
  }

  /**
   * Blindly cross-sign one of our other devices.
   *
   * Implementation of {@link Crypto.CryptoApi#crossSignDevice}.
   */
  async crossSignDevice(deviceId) {
    await this.setDeviceVerified(this.userId, deviceId, true);
  }

  /**
   * Update the blocked/verified state of the given device
   *
   * @param userId - owner of the device
   * @param deviceId - unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param verified - whether to mark the device as verified. Null to
   *     leave unchanged.
   *
   * @param blocked - whether to mark the device as blocked. Null to
   *      leave unchanged.
   *
   * @param known - whether to mark that the user has been made aware of
   *      the existence of this device. Null to leave unchanged
   *
   * @param keys - The list of keys that was present
   * during the device verification. This will be double checked with the list
   * of keys the given device has currently.
   *
   * @returns updated DeviceInfo
   */
  async setDeviceVerification(userId, deviceId, verified = null, blocked = null, known = null, keys) {
    // Check if the 'device' is actually a cross signing key
    // The js-sdk's verification treats cross-signing keys as devices
    // and so uses this method to mark them verified.
    const xsk = this.deviceList.getStoredCrossSigningForUser(userId);
    if (xsk?.getId() === deviceId) {
      if (blocked !== null || known !== null) {
        throw new Error("Cannot set blocked or known for a cross-signing key");
      }
      if (!verified) {
        throw new Error("Cannot set a cross-signing key as unverified");
      }
      const gotKeyId = keys ? Object.values(keys)[0] : null;
      if (keys && (Object.values(keys).length !== 1 || gotKeyId !== xsk.getId())) {
        throw new Error(`Key did not match expected value: expected ${xsk.getId()}, got ${gotKeyId}`);
      }
      if (!this.crossSigningInfo.getId() && userId === this.crossSigningInfo.userId) {
        this.storeTrustedSelfKeys(xsk.keys);
        // This will cause our own user trust to change, so emit the event
        this.emit(CryptoEvent.UserTrustStatusChanged, this.userId, this.checkUserTrust(userId));
      }

      // Now sign the master key with our user signing key (unless it's ourself)
      if (userId !== this.userId) {
        _logger.logger.info("Master key " + xsk.getId() + " for " + userId + " marked verified. Signing...");
        const device = await this.crossSigningInfo.signUser(xsk);
        if (device) {
          const upload = async ({
            shouldEmit = false
          }) => {
            _logger.logger.info("Uploading signature for " + userId + "...");
            const response = await this.baseApis.uploadKeySignatures({
              [userId]: {
                [deviceId]: device
              }
            });
            const {
              failures
            } = response || {};
            if (Object.keys(failures || []).length > 0) {
              if (shouldEmit) {
                this.baseApis.emit(CryptoEvent.KeySignatureUploadFailure, failures, "setDeviceVerification", upload);
              }
              /* Throwing here causes the process to be cancelled and the other
               * user to be notified */
              throw new _errors.KeySignatureUploadError("Key upload failed", {
                failures
              });
            }
          };
          await upload({
            shouldEmit: true
          });

          // This will emit events when it comes back down the sync
          // (we could do local echo to speed things up)
        }
        return device;
      } else {
        return xsk;
      }
    }
    const devices = this.deviceList.getRawStoredDevicesForUser(userId);
    if (!devices || !devices[deviceId]) {
      throw new Error("Unknown device " + userId + ":" + deviceId);
    }
    const dev = devices[deviceId];
    let verificationStatus = dev.verified;
    if (verified) {
      if (keys) {
        for (const [keyId, key] of Object.entries(keys)) {
          if (dev.keys[keyId] !== key) {
            throw new Error(`Key did not match expected value: expected ${key}, got ${dev.keys[keyId]}`);
          }
        }
      }
      verificationStatus = DeviceVerification.VERIFIED;
    } else if (verified !== null && verificationStatus == DeviceVerification.VERIFIED) {
      verificationStatus = DeviceVerification.UNVERIFIED;
    }
    if (blocked) {
      verificationStatus = DeviceVerification.BLOCKED;
    } else if (blocked !== null && verificationStatus == DeviceVerification.BLOCKED) {
      verificationStatus = DeviceVerification.UNVERIFIED;
    }
    let knownStatus = dev.known;
    if (known !== null) {
      knownStatus = known;
    }
    if (dev.verified !== verificationStatus || dev.known !== knownStatus) {
      dev.verified = verificationStatus;
      dev.known = knownStatus;
      this.deviceList.storeDevicesForUser(userId, devices);
      this.deviceList.saveIfDirty();
    }

    // do cross-signing
    if (verified && userId === this.userId) {
      _logger.logger.info("Own device " + deviceId + " marked verified: signing");

      // Signing only needed if other device not already signed
      let device;
      const deviceTrust = this.checkDeviceTrust(userId, deviceId);
      if (deviceTrust.isCrossSigningVerified()) {
        _logger.logger.log(`Own device ${deviceId} already cross-signing verified`);
      } else {
        device = await this.crossSigningInfo.signDevice(userId, _deviceinfo.DeviceInfo.fromStorage(dev, deviceId));
      }
      if (device) {
        const upload = async ({
          shouldEmit = false
        }) => {
          _logger.logger.info("Uploading signature for " + deviceId);
          const response = await this.baseApis.uploadKeySignatures({
            [userId]: {
              [deviceId]: device
            }
          });
          const {
            failures
          } = response || {};
          if (Object.keys(failures || []).length > 0) {
            if (shouldEmit) {
              this.baseApis.emit(CryptoEvent.KeySignatureUploadFailure, failures, "setDeviceVerification", upload // continuation
              );
            }
            throw new _errors.KeySignatureUploadError("Key upload failed", {
              failures
            });
          }
        };
        await upload({
          shouldEmit: true
        });
        // XXX: we'll need to wait for the device list to be updated
      }
    }
    const deviceObj = _deviceinfo.DeviceInfo.fromStorage(dev, deviceId);
    this.emit(CryptoEvent.DeviceVerificationChanged, userId, deviceId, deviceObj);
    return deviceObj;
  }
  findVerificationRequestDMInProgress(roomId, userId) {
    return this.inRoomVerificationRequests.findRequestInProgress(roomId, userId);
  }
  getVerificationRequestsToDeviceInProgress(userId) {
    return this.toDeviceVerificationRequests.getRequestsInProgress(userId);
  }
  requestVerificationDM(userId, roomId) {
    const existingRequest = this.inRoomVerificationRequests.findRequestInProgress(roomId);
    if (existingRequest) {
      return Promise.resolve(existingRequest);
    }
    const channel = new _InRoomChannel.InRoomChannel(this.baseApis, roomId, userId);
    return this.requestVerificationWithChannel(userId, channel, this.inRoomVerificationRequests);
  }

  /** @deprecated Use `requestOwnUserVerificationToDevice` or `requestDeviceVerification` */
  requestVerification(userId, devices) {
    if (!devices) {
      devices = Object.keys(this.deviceList.getRawStoredDevicesForUser(userId));
    }
    const existingRequest = this.toDeviceVerificationRequests.findRequestInProgress(userId, devices);
    if (existingRequest) {
      return Promise.resolve(existingRequest);
    }
    const channel = new _ToDeviceChannel.ToDeviceChannel(this.baseApis, userId, devices, _ToDeviceChannel.ToDeviceChannel.makeTransactionId());
    return this.requestVerificationWithChannel(userId, channel, this.toDeviceVerificationRequests);
  }
  requestOwnUserVerification() {
    return this.requestVerification(this.userId);
  }
  requestDeviceVerification(userId, deviceId) {
    return this.requestVerification(userId, [deviceId]);
  }
  async requestVerificationWithChannel(userId, channel, requestsMap) {
    let request = new _VerificationRequest.VerificationRequest(channel, this.verificationMethods, this.baseApis);
    // if transaction id is already known, add request
    if (channel.transactionId) {
      requestsMap.setRequestByChannel(channel, request);
    }
    await request.sendRequest();
    // don't replace the request created by a racing remote echo
    const racingRequest = requestsMap.getRequestByChannel(channel);
    if (racingRequest) {
      request = racingRequest;
    } else {
      _logger.logger.log(`Crypto: adding new request to ` + `requestsByTxnId with id ${channel.transactionId} ${channel.roomId}`);
      requestsMap.setRequestByChannel(channel, request);
    }
    return request;
  }
  beginKeyVerification(method, userId, deviceId, transactionId = null) {
    let request;
    if (transactionId) {
      request = this.toDeviceVerificationRequests.getRequestBySenderAndTxnId(userId, transactionId);
      if (!request) {
        throw new Error(`No request found for user ${userId} with ` + `transactionId ${transactionId}`);
      }
    } else {
      transactionId = _ToDeviceChannel.ToDeviceChannel.makeTransactionId();
      const channel = new _ToDeviceChannel.ToDeviceChannel(this.baseApis, userId, [deviceId], transactionId, deviceId);
      request = new _VerificationRequest.VerificationRequest(channel, this.verificationMethods, this.baseApis);
      this.toDeviceVerificationRequests.setRequestBySenderAndTxnId(userId, transactionId, request);
    }
    return request.beginKeyVerification(method, {
      userId,
      deviceId
    });
  }
  async legacyDeviceVerification(userId, deviceId, method) {
    const transactionId = _ToDeviceChannel.ToDeviceChannel.makeTransactionId();
    const channel = new _ToDeviceChannel.ToDeviceChannel(this.baseApis, userId, [deviceId], transactionId, deviceId);
    const request = new _VerificationRequest.VerificationRequest(channel, this.verificationMethods, this.baseApis);
    this.toDeviceVerificationRequests.setRequestBySenderAndTxnId(userId, transactionId, request);
    const verifier = request.beginKeyVerification(method, {
      userId,
      deviceId
    });
    // either reject by an error from verify() while sending .start
    // or resolve when the request receives the
    // local (fake remote) echo for sending the .start event
    await Promise.race([verifier.verify(), request.waitFor(r => r.started)]);
    return request;
  }

  /**
   * Get information on the active olm sessions with a user
   * <p>
   * Returns a map from device id to an object with keys 'deviceIdKey' (the
   * device's curve25519 identity key) and 'sessions' (an array of objects in the
   * same format as that returned by
   * {@link OlmDevice#getSessionInfoForDevice}).
   * <p>
   * This method is provided for debugging purposes.
   *
   * @param userId - id of user to inspect
   */
  async getOlmSessionsForUser(userId) {
    const devices = this.getStoredDevicesForUser(userId) || [];
    const result = {};
    for (const device of devices) {
      const deviceKey = device.getIdentityKey();
      const sessions = await this.olmDevice.getSessionInfoForDevice(deviceKey);
      result[device.deviceId] = {
        deviceIdKey: deviceKey,
        sessions: sessions
      };
    }
    return result;
  }

  /**
   * Get the device which sent an event
   *
   * @param event - event to be checked
   */
  getEventSenderDeviceInfo(event) {
    const senderKey = event.getSenderKey();
    const algorithm = event.getWireContent().algorithm;
    if (!senderKey || !algorithm) {
      return null;
    }
    if (event.isKeySourceUntrusted()) {
      // we got the key for this event from a source that we consider untrusted
      return null;
    }

    // senderKey is the Curve25519 identity key of the device which the event
    // was sent from. In the case of Megolm, it's actually the Curve25519
    // identity key of the device which set up the Megolm session.

    const device = this.deviceList.getDeviceByIdentityKey(algorithm, senderKey);
    if (device === null) {
      // we haven't downloaded the details of this device yet.
      return null;
    }

    // so far so good, but now we need to check that the sender of this event
    // hadn't advertised someone else's Curve25519 key as their own. We do that
    // by checking the Ed25519 claimed by the event (or, in the case of megolm,
    // the event which set up the megolm session), to check that it matches the
    // fingerprint of the purported sending device.
    //
    // (see https://github.com/vector-im/vector-web/issues/2215)

    const claimedKey = event.getClaimedEd25519Key();
    if (!claimedKey) {
      _logger.logger.warn("Event " + event.getId() + " claims no ed25519 key: " + "cannot verify sending device");
      return null;
    }
    if (claimedKey !== device.getFingerprint()) {
      _logger.logger.warn("Event " + event.getId() + " claims ed25519 key " + claimedKey + " but sender device has key " + device.getFingerprint());
      return null;
    }
    return device;
  }

  /**
   * Get information about the encryption of an event
   *
   * @param event - event to be checked
   *
   * @returns An object with the fields:
   *    - encrypted: whether the event is encrypted (if not encrypted, some of the
   *      other properties may not be set)
   *    - senderKey: the sender's key
   *    - algorithm: the algorithm used to encrypt the event
   *    - authenticated: whether we can be sure that the owner of the senderKey
   *      sent the event
   *    - sender: the sender's device information, if available
   *    - mismatchedSender: if the event's ed25519 and curve25519 keys don't match
   *      (only meaningful if `sender` is set)
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
    if (event.isKeySourceUntrusted()) {
      // we got the key this event from somewhere else
      // TODO: check if we can trust the forwarders.
      ret.authenticated = false;
    } else {
      ret.authenticated = true;
    }

    // senderKey is the Curve25519 identity key of the device which the event
    // was sent from. In the case of Megolm, it's actually the Curve25519
    // identity key of the device which set up the Megolm session.

    ret.sender = this.deviceList.getDeviceByIdentityKey(ret.algorithm, ret.senderKey) ?? undefined;

    // so far so good, but now we need to check that the sender of this event
    // hadn't advertised someone else's Curve25519 key as their own. We do that
    // by checking the Ed25519 claimed by the event (or, in the case of megolm,
    // the event which set up the megolm session), to check that it matches the
    // fingerprint of the purported sending device.
    //
    // (see https://github.com/vector-im/vector-web/issues/2215)

    const claimedKey = event.getClaimedEd25519Key();
    if (!claimedKey) {
      _logger.logger.warn("Event " + event.getId() + " claims no ed25519 key: " + "cannot verify sending device");
      ret.mismatchedSender = true;
    }
    if (ret.sender && claimedKey !== ret.sender.getFingerprint()) {
      _logger.logger.warn("Event " + event.getId() + " claims ed25519 key " + claimedKey + "but sender device has key " + ret.sender.getFingerprint());
      ret.mismatchedSender = true;
    }
    return ret;
  }

  /**
   * Implementation of {@link Crypto.CryptoApi.getEncryptionInfoForEvent}.
   */
  async getEncryptionInfoForEvent(event) {
    const encryptionInfo = this.getEventEncryptionInfo(event);
    if (!encryptionInfo.encrypted) {
      return null;
    }
    const senderId = event.getSender();
    if (!senderId || encryptionInfo.mismatchedSender) {
      // something definitely wrong is going on here

      // previously: E2EState.Warning -> E2ePadlockUnverified -> Red/"Encrypted by an unverified session"
      return {
        shieldColour: _cryptoApi.EventShieldColour.RED,
        shieldReason: _cryptoApi.EventShieldReason.MISMATCHED_SENDER_KEY
      };
    }
    const userTrust = this.checkUserTrust(senderId);
    if (!userTrust.isCrossSigningVerified()) {
      // If the message is unauthenticated, then display a grey
      // shield, otherwise if the user isn't cross-signed then
      // nothing's needed
      if (!encryptionInfo.authenticated) {
        // previously: E2EState.Unauthenticated -> E2ePadlockUnauthenticated -> Grey/"The authenticity of this encrypted message can't be guaranteed on this device."
        return {
          shieldColour: _cryptoApi.EventShieldColour.GREY,
          shieldReason: _cryptoApi.EventShieldReason.AUTHENTICITY_NOT_GUARANTEED
        };
      } else {
        // previously: E2EState.Normal -> no icon
        return {
          shieldColour: _cryptoApi.EventShieldColour.NONE,
          shieldReason: null
        };
      }
    }
    const eventSenderTrust = senderId && encryptionInfo.sender && (await this.getDeviceVerificationStatus(senderId, encryptionInfo.sender.deviceId));
    if (!eventSenderTrust) {
      // previously: E2EState.Unknown -> E2ePadlockUnknown -> Grey/"Encrypted by a deleted session"
      return {
        shieldColour: _cryptoApi.EventShieldColour.GREY,
        shieldReason: _cryptoApi.EventShieldReason.UNKNOWN_DEVICE
      };
    }
    if (!eventSenderTrust.isVerified()) {
      // previously: E2EState.Warning -> E2ePadlockUnverified -> Red/"Encrypted by an unverified session"
      return {
        shieldColour: _cryptoApi.EventShieldColour.RED,
        shieldReason: _cryptoApi.EventShieldReason.UNSIGNED_DEVICE
      };
    }
    if (!encryptionInfo.authenticated) {
      // previously: E2EState.Unauthenticated -> E2ePadlockUnauthenticated -> Grey/"The authenticity of this encrypted message can't be guaranteed on this device."
      return {
        shieldColour: _cryptoApi.EventShieldColour.GREY,
        shieldReason: _cryptoApi.EventShieldReason.AUTHENTICITY_NOT_GUARANTEED
      };
    }

    // previously: E2EState.Verified -> no icon
    return {
      shieldColour: _cryptoApi.EventShieldColour.NONE,
      shieldReason: null
    };
  }

  /**
   * Forces the current outbound group session to be discarded such
   * that another one will be created next time an event is sent.
   *
   * @param roomId - The ID of the room to discard the session for
   *
   * This should not normally be necessary.
   */
  forceDiscardSession(roomId) {
    const alg = this.roomEncryptors.get(roomId);
    if (alg === undefined) throw new Error("Room not encrypted");
    if (alg.forceDiscardSession === undefined) {
      throw new Error("Room encryption algorithm doesn't support session discarding");
    }
    alg.forceDiscardSession();
    return Promise.resolve();
  }

  /**
   * Configure a room to use encryption (ie, save a flag in the cryptoStore).
   *
   * @param roomId - The room ID to enable encryption in.
   *
   * @param config - The encryption config for the room.
   *
   * @param inhibitDeviceQuery - true to suppress device list query for
   *   users in the room (for now). In case lazy loading is enabled,
   *   the device query is always inhibited as the members are not tracked.
   *
   * @deprecated It is normally incorrect to call this method directly. Encryption
   *   is enabled by receiving an `m.room.encryption` event (which we may have sent
   *   previously).
   */
  async setRoomEncryption(roomId, config, inhibitDeviceQuery) {
    const room = this.clientStore.getRoom(roomId);
    if (!room) {
      throw new Error(`Unable to enable encryption tracking devices in unknown room ${roomId}`);
    }
    await this.setRoomEncryptionImpl(room, config);
    if (!this.lazyLoadMembers && !inhibitDeviceQuery) {
      this.deviceList.refreshOutdatedDeviceLists();
    }
  }

  /**
   * Set up encryption for a room.
   *
   * This is called when an <tt>m.room.encryption</tt> event is received. It saves a flag
   * for the room in the cryptoStore (if it wasn't already set), sets up an "encryptor" for
   * the room, and enables device-list tracking for the room.
   *
   * It does <em>not</em> initiate a device list query for the room. That is normally
   * done once we finish processing the sync, in onSyncCompleted.
   *
   * @param room - The room to enable encryption in.
   * @param config - The encryption config for the room.
   */
  async setRoomEncryptionImpl(room, config) {
    const roomId = room.roomId;

    // ignore crypto events with no algorithm defined
    // This will happen if a crypto event is redacted before we fetch the room state
    // It would otherwise just throw later as an unknown algorithm would, but we may
    // as well catch this here
    if (!config.algorithm) {
      _logger.logger.log("Ignoring setRoomEncryption with no algorithm");
      return;
    }

    // if state is being replayed from storage, we might already have a configuration
    // for this room as they are persisted as well.
    // We just need to make sure the algorithm is initialized in this case.
    // However, if the new config is different,
    // we should bail out as room encryption can't be changed once set.
    const existingConfig = this.roomList.getRoomEncryption(roomId);
    if (existingConfig) {
      if (JSON.stringify(existingConfig) != JSON.stringify(config)) {
        _logger.logger.error("Ignoring m.room.encryption event which requests " + "a change of config in " + roomId);
        return;
      }
    }
    // if we already have encryption in this room, we should ignore this event,
    // as it would reset the encryption algorithm.
    // This is at least expected to be called twice, as sync calls onCryptoEvent
    // for both the timeline and state sections in the /sync response,
    // the encryption event would appear in both.
    // If it's called more than twice though,
    // it signals a bug on client or server.
    const existingAlg = this.roomEncryptors.get(roomId);
    if (existingAlg) {
      return;
    }

    // _roomList.getRoomEncryption will not race with _roomList.setRoomEncryption
    // because it first stores in memory. We should await the promise only
    // after all the in-memory state (roomEncryptors and _roomList) has been updated
    // to avoid races when calling this method multiple times. Hence keep a hold of the promise.
    let storeConfigPromise = null;
    if (!existingConfig) {
      storeConfigPromise = this.roomList.setRoomEncryption(roomId, config);
    }
    const AlgClass = algorithms.ENCRYPTION_CLASSES.get(config.algorithm);
    if (!AlgClass) {
      throw new Error("Unable to encrypt with " + config.algorithm);
    }
    const alg = new AlgClass({
      userId: this.userId,
      deviceId: this.deviceId,
      crypto: this,
      olmDevice: this.olmDevice,
      baseApis: this.baseApis,
      roomId,
      config
    });
    this.roomEncryptors.set(roomId, alg);
    if (storeConfigPromise) {
      await storeConfigPromise;
    }
    _logger.logger.log(`Enabling encryption in ${roomId}`);

    // we don't want to force a download of the full membership list of this room, but as soon as we have that
    // list we can start tracking the device list.
    if (room.membersLoaded()) {
      await this.trackRoomDevicesImpl(room);
    } else {
      // wait for the membership list to be loaded
      const onState = _state => {
        room.off(_roomState.RoomStateEvent.Update, onState);
        if (room.membersLoaded()) {
          this.trackRoomDevicesImpl(room).catch(e => {
            _logger.logger.error(`Error enabling device tracking in ${roomId}`, e);
          });
        }
      };
      room.on(_roomState.RoomStateEvent.Update, onState);
    }
  }

  /**
   * Make sure we are tracking the device lists for all users in this room.
   *
   * @param roomId - The room ID to start tracking devices in.
   * @returns when all devices for the room have been fetched and marked to track
   * @deprecated there's normally no need to call this function: device list tracking
   *    will be enabled as soon as we have the full membership list.
   */
  trackRoomDevices(roomId) {
    const room = this.clientStore.getRoom(roomId);
    if (!room) {
      throw new Error(`Unable to start tracking devices in unknown room ${roomId}`);
    }
    return this.trackRoomDevicesImpl(room);
  }

  /**
   * Make sure we are tracking the device lists for all users in this room.
   *
   * This is normally called when we are about to send an encrypted event, to make sure
   * we have all the devices in the room; but it is also called when processing an
   * m.room.encryption state event (if lazy-loading is disabled), or when members are
   * loaded (if lazy-loading is enabled), to prepare the device list.
   *
   * @param room - Room to enable device-list tracking in
   */
  trackRoomDevicesImpl(room) {
    const roomId = room.roomId;
    const trackMembers = async () => {
      // not an encrypted room
      if (!this.roomEncryptors.has(roomId)) {
        return;
      }
      _logger.logger.log(`Starting to track devices for room ${roomId} ...`);
      const members = await room.getEncryptionTargetMembers();
      members.forEach(m => {
        this.deviceList.startTrackingDeviceList(m.userId);
      });
    };
    let promise = this.roomDeviceTrackingState[roomId];
    if (!promise) {
      promise = trackMembers();
      this.roomDeviceTrackingState[roomId] = promise.catch(err => {
        delete this.roomDeviceTrackingState[roomId];
        throw err;
      });
    }
    return promise;
  }

  /**
   * Try to make sure we have established olm sessions for all known devices for
   * the given users.
   *
   * @param users - list of user ids
   * @param force - If true, force a new Olm session to be created. Default false.
   *
   * @returns resolves once the sessions are complete, to
   *    an Object mapping from userId to deviceId to
   *    `IOlmSessionResult`
   */
  ensureOlmSessionsForUsers(users, force) {
    // map user Id → DeviceInfo[]
    const devicesByUser = new Map();
    for (const userId of users) {
      const userDevices = [];
      devicesByUser.set(userId, userDevices);
      const devices = this.getStoredDevicesForUser(userId) || [];
      for (const deviceInfo of devices) {
        const key = deviceInfo.getIdentityKey();
        if (key == this.olmDevice.deviceCurve25519Key) {
          // don't bother setting up session to ourself
          continue;
        }
        if (deviceInfo.verified == DeviceVerification.BLOCKED) {
          // don't bother setting up sessions with blocked users
          continue;
        }
        userDevices.push(deviceInfo);
      }
    }
    return olmlib.ensureOlmSessionsForDevices(this.olmDevice, this.baseApis, devicesByUser, force);
  }

  /**
   * Get a list containing all of the room keys
   *
   * @returns a list of session export objects
   */
  async exportRoomKeys() {
    const exportedSessions = [];
    await this.cryptoStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS], txn => {
      this.cryptoStore.getAllEndToEndInboundGroupSessions(txn, s => {
        if (s === null) return;
        const sess = this.olmDevice.exportInboundGroupSession(s.senderKey, s.sessionId, s.sessionData);
        delete sess.first_known_index;
        sess.algorithm = olmlib.MEGOLM_ALGORITHM;
        exportedSessions.push(sess);
      });
    });
    return exportedSessions;
  }

  /**
   * Get a JSON list containing all of the room keys
   *
   * @returns a JSON string encoding a list of session
   *    export objects, each of which is an IMegolmSessionData
   */
  async exportRoomKeysAsJson() {
    return JSON.stringify(await this.exportRoomKeys());
  }

  /**
   * Import a list of room keys previously exported by exportRoomKeys
   *
   * @param keys - a list of session export objects
   * @returns a promise which resolves once the keys have been imported
   */
  importRoomKeys(keys, opts = {}) {
    let successes = 0;
    let failures = 0;
    const total = keys.length;
    function updateProgress() {
      opts.progressCallback?.({
        stage: "load_keys",
        successes,
        failures,
        total
      });
    }
    return Promise.all(keys.map(key => {
      if (!key.room_id || !key.algorithm) {
        _logger.logger.warn("ignoring room key entry with missing fields", key);
        failures++;
        if (opts.progressCallback) {
          updateProgress();
        }
        return null;
      }
      const alg = this.getRoomDecryptor(key.room_id, key.algorithm);
      return alg.importRoomKey(key, opts).finally(() => {
        successes++;
        if (opts.progressCallback) {
          updateProgress();
        }
      });
    })).then();
  }

  /**
   * Import a JSON string encoding a list of room keys previously
   * exported by exportRoomKeysAsJson
   *
   * @param keys - a JSON string encoding a list of session export
   *    objects, each of which is an IMegolmSessionData
   * @param opts - options object
   * @returns a promise which resolves once the keys have been imported
   */
  async importRoomKeysAsJson(keys, opts) {
    return await this.importRoomKeys(JSON.parse(keys));
  }

  /**
   * Counts the number of end to end session keys that are waiting to be backed up
   * @returns Promise which resolves to the number of sessions requiring backup
   */
  countSessionsNeedingBackup() {
    return this.backupManager.countSessionsNeedingBackup();
  }

  /**
   * Perform any background tasks that can be done before a message is ready to
   * send, in order to speed up sending of the message.
   *
   * @param room - the room the event is in
   */
  prepareToEncrypt(room) {
    const alg = this.roomEncryptors.get(room.roomId);
    if (alg) {
      alg.prepareToEncrypt(room);
    }
  }

  /**
   * Encrypt an event according to the configuration of the room.
   *
   * @param event -  event to be sent
   *
   * @param room - destination room.
   *
   * @returns Promise which resolves when the event has been
   *     encrypted, or null if nothing was needed
   */
  async encryptEvent(event, room) {
    const roomId = event.getRoomId();
    const alg = this.roomEncryptors.get(roomId);
    if (!alg) {
      // MatrixClient has already checked that this room should be encrypted,
      // so this is an unexpected situation.
      throw new Error("Room " + roomId + " was previously configured to use encryption, but is " + "no longer. Perhaps the homeserver is hiding the " + "configuration event.");
    }

    // wait for all the room devices to be loaded
    await this.trackRoomDevicesImpl(room);
    let content = event.getContent();
    // If event has an m.relates_to then we need
    // to put this on the wrapping event instead
    const mRelatesTo = content["m.relates_to"];
    if (mRelatesTo) {
      // Clone content here so we don't remove `m.relates_to` from the local-echo
      content = Object.assign({}, content);
      delete content["m.relates_to"];
    }

    // Treat element's performance metrics the same as `m.relates_to` (when present)
    const elementPerfMetrics = content["io.element.performance_metrics"];
    if (elementPerfMetrics) {
      content = Object.assign({}, content);
      delete content["io.element.performance_metrics"];
    }
    const encryptedContent = await alg.encryptMessage(room, event.getType(), content);
    if (mRelatesTo) {
      encryptedContent["m.relates_to"] = mRelatesTo;
    }
    if (elementPerfMetrics) {
      encryptedContent["io.element.performance_metrics"] = elementPerfMetrics;
    }
    event.makeEncrypted("m.room.encrypted", encryptedContent, this.olmDevice.deviceCurve25519Key, this.olmDevice.deviceEd25519Key);
  }

  /**
   * Decrypt a received event
   *
   *
   * @returns resolves once we have
   *  finished decrypting. Rejects with an `algorithms.DecryptionError` if there
   *  is a problem decrypting the event.
   */
  async decryptEvent(event) {
    if (event.isRedacted()) {
      // Try to decrypt the redaction event, to support encrypted
      // redaction reasons.  If we can't decrypt, just fall back to using
      // the original redacted_because.
      const redactionEvent = new _event2.MatrixEvent(_objectSpread({
        room_id: event.getRoomId()
      }, event.getUnsigned().redacted_because));
      let redactedBecause = event.getUnsigned().redacted_because;
      if (redactionEvent.isEncrypted()) {
        try {
          const decryptedEvent = await this.decryptEvent(redactionEvent);
          redactedBecause = decryptedEvent.clearEvent;
        } catch (e) {
          _logger.logger.warn("Decryption of redaction failed. Falling back to unencrypted event.", e);
        }
      }
      return {
        clearEvent: {
          room_id: event.getRoomId(),
          type: "m.room.message",
          content: {},
          unsigned: {
            redacted_because: redactedBecause
          }
        }
      };
    } else {
      const content = event.getWireContent();
      const alg = this.getRoomDecryptor(event.getRoomId(), content.algorithm);
      return alg.decryptEvent(event);
    }
  }

  /**
   * Handle the notification from /sync that device lists have
   * been changed.
   *
   * @param deviceLists - device_lists field from /sync
   */
  async processDeviceLists(deviceLists) {
    // Here, we're relying on the fact that we only ever save the sync data after
    // sucessfully saving the device list data, so we're guaranteed that the device
    // list store is at least as fresh as the sync token from the sync store, ie.
    // any device changes received in sync tokens prior to the 'next' token here
    // have been processed and are reflected in the current device list.
    // If we didn't make this assumption, we'd have to use the /keys/changes API
    // to get key changes between the sync token in the device list and the 'old'
    // sync token used here to make sure we didn't miss any.
    await this.evalDeviceListChanges(deviceLists);
  }

  /**
   * Send a request for some room keys, if we have not already done so
   *
   * @param resend - whether to resend the key request if there is
   *    already one
   *
   * @returns a promise that resolves when the key request is queued
   */
  requestRoomKey(requestBody, recipients, resend = false) {
    return this.outgoingRoomKeyRequestManager.queueRoomKeyRequest(requestBody, recipients, resend).then(() => {
      if (this.sendKeyRequestsImmediately) {
        this.outgoingRoomKeyRequestManager.sendQueuedRequests();
      }
    }).catch(e => {
      // this normally means we couldn't talk to the store
      _logger.logger.error("Error requesting key for event", e);
    });
  }

  /**
   * Cancel any earlier room key request
   *
   * @param requestBody - parameters to match for cancellation
   */
  cancelRoomKeyRequest(requestBody) {
    this.outgoingRoomKeyRequestManager.cancelRoomKeyRequest(requestBody).catch(e => {
      _logger.logger.warn("Error clearing pending room key requests", e);
    });
  }

  /**
   * Re-send any outgoing key requests, eg after verification
   * @returns
   */
  async cancelAndResendAllOutgoingKeyRequests() {
    await this.outgoingRoomKeyRequestManager.cancelAndResendAllOutgoingRequests();
  }

  /**
   * handle an m.room.encryption event
   *
   * @param room - in which the event was received
   * @param event - encryption event to be processed
   */
  async onCryptoEvent(room, event) {
    const content = event.getContent();
    await this.setRoomEncryptionImpl(room, content);
  }

  /**
   * Called before the result of a sync is processed
   *
   * @param syncData -  the data from the 'MatrixClient.sync' event
   */
  async onSyncWillProcess(syncData) {
    if (!syncData.oldSyncToken) {
      // If there is no old sync token, we start all our tracking from
      // scratch, so mark everything as untracked. onCryptoEvent will
      // be called for all e2e rooms during the processing of the sync,
      // at which point we'll start tracking all the users of that room.
      _logger.logger.log("Initial sync performed - resetting device tracking state");
      this.deviceList.stopTrackingAllDeviceLists();
      // we always track our own device list (for key backups etc)
      this.deviceList.startTrackingDeviceList(this.userId);
      this.roomDeviceTrackingState = {};
    }
    this.sendKeyRequestsImmediately = false;
  }

  /**
   * handle the completion of a /sync
   *
   * This is called after the processing of each successful /sync response.
   * It is an opportunity to do a batch process on the information received.
   *
   * @param syncData -  the data from the 'MatrixClient.sync' event
   */
  async onSyncCompleted(syncData) {
    this.deviceList.setSyncToken(syncData.nextSyncToken ?? null);
    this.deviceList.saveIfDirty();

    // we always track our own device list (for key backups etc)
    this.deviceList.startTrackingDeviceList(this.userId);
    this.deviceList.refreshOutdatedDeviceLists();

    // we don't start uploading one-time keys until we've caught up with
    // to-device messages, to help us avoid throwing away one-time-keys that we
    // are about to receive messages for
    // (https://github.com/vector-im/element-web/issues/2782).
    if (!syncData.catchingUp) {
      this.maybeUploadOneTimeKeys();
      this.processReceivedRoomKeyRequests();

      // likewise don't start requesting keys until we've caught up
      // on to_device messages, otherwise we'll request keys that we're
      // just about to get.
      this.outgoingRoomKeyRequestManager.sendQueuedRequests();

      // Sync has finished so send key requests straight away.
      this.sendKeyRequestsImmediately = true;
    }
  }

  /**
   * Trigger the appropriate invalidations and removes for a given
   * device list
   *
   * @param deviceLists - device_lists field from /sync, or response from
   * /keys/changes
   */
  async evalDeviceListChanges(deviceLists) {
    if (Array.isArray(deviceLists?.changed)) {
      deviceLists.changed.forEach(u => {
        this.deviceList.invalidateUserDeviceList(u);
      });
    }
    if (Array.isArray(deviceLists?.left) && deviceLists.left.length) {
      // Check we really don't share any rooms with these users
      // any more: the server isn't required to give us the
      // exact correct set.
      const e2eUserIds = new Set(await this.getTrackedE2eUsers());
      deviceLists.left.forEach(u => {
        if (!e2eUserIds.has(u)) {
          this.deviceList.stopTrackingDeviceList(u);
        }
      });
    }
  }

  /**
   * Get a list of all the IDs of users we share an e2e room with
   * for which we are tracking devices already
   *
   * @returns List of user IDs
   */
  async getTrackedE2eUsers() {
    const e2eUserIds = [];
    for (const room of this.getTrackedE2eRooms()) {
      const members = await room.getEncryptionTargetMembers();
      for (const member of members) {
        e2eUserIds.push(member.userId);
      }
    }
    return e2eUserIds;
  }

  /**
   * Get a list of the e2e-enabled rooms we are members of,
   * and for which we are already tracking the devices
   *
   * @returns
   */
  getTrackedE2eRooms() {
    return this.clientStore.getRooms().filter(room => {
      // check for rooms with encryption enabled
      const alg = this.roomEncryptors.get(room.roomId);
      if (!alg) {
        return false;
      }
      if (!this.roomDeviceTrackingState[room.roomId]) {
        return false;
      }

      // ignore any rooms which we have left
      const myMembership = room.getMyMembership();
      return myMembership === _membership.KnownMembership.Join || myMembership === _membership.KnownMembership.Invite;
    });
  }

  /**
   * Encrypts and sends a given object via Olm to-device messages to a given
   * set of devices.
   * @param userDeviceInfoArr - the devices to send to
   * @param payload - fields to include in the encrypted payload
   * @returns Promise which
   *     resolves once the message has been encrypted and sent to the given
   *     userDeviceMap, and returns the `{ contentMap, deviceInfoByDeviceId }`
   *     of the successfully sent messages.
   */
  async encryptAndSendToDevices(userDeviceInfoArr, payload) {
    const toDeviceBatch = {
      eventType: _event.EventType.RoomMessageEncrypted,
      batch: []
    };
    try {
      await Promise.all(userDeviceInfoArr.map(async ({
        userId,
        deviceInfo
      }) => {
        const deviceId = deviceInfo.deviceId;
        const encryptedContent = {
          algorithm: olmlib.OLM_ALGORITHM,
          sender_key: this.olmDevice.deviceCurve25519Key,
          ciphertext: {},
          [_event.ToDeviceMessageId]: (0, _uuid.v4)()
        };
        toDeviceBatch.batch.push({
          userId,
          deviceId,
          payload: encryptedContent
        });
        await olmlib.ensureOlmSessionsForDevices(this.olmDevice, this.baseApis, new Map([[userId, [deviceInfo]]]));
        await olmlib.encryptMessageForDevice(encryptedContent.ciphertext, this.userId, this.deviceId, this.olmDevice, userId, deviceInfo, payload);
      }));

      // prune out any devices that encryptMessageForDevice could not encrypt for,
      // in which case it will have just not added anything to the ciphertext object.
      // There's no point sending messages to devices if we couldn't encrypt to them,
      // since that's effectively a blank message.
      toDeviceBatch.batch = toDeviceBatch.batch.filter(msg => {
        if (Object.keys(msg.payload.ciphertext).length > 0) {
          return true;
        } else {
          _logger.logger.log(`No ciphertext for device ${msg.userId}:${msg.deviceId}: pruning`);
          return false;
        }
      });
      try {
        await this.baseApis.queueToDevice(toDeviceBatch);
      } catch (e) {
        _logger.logger.error("sendToDevice failed", e);
        throw e;
      }
    } catch (e) {
      _logger.logger.error("encryptAndSendToDevices promises failed", e);
      throw e;
    }
  }
  async preprocessToDeviceMessages(events) {
    // all we do here is filter out encrypted to-device messages with the wrong algorithm. Decryption
    // happens later in decryptEvent, via the EventMapper
    return events.filter(toDevice => {
      if (toDevice.type === _event.EventType.RoomMessageEncrypted && !["m.olm.v1.curve25519-aes-sha2"].includes(toDevice.content?.algorithm)) {
        _logger.logger.log("Ignoring invalid encrypted to-device event from " + toDevice.sender);
        return false;
      }
      return true;
    });
  }

  /**
   * Stores the current one_time_key count which will be handled later (in a call of
   * onSyncCompleted).
   *
   * @param currentCount - The current count of one_time_keys to be stored
   */
  updateOneTimeKeyCount(currentCount) {
    if (isFinite(currentCount)) {
      this.oneTimeKeyCount = currentCount;
    } else {
      throw new TypeError("Parameter for updateOneTimeKeyCount has to be a number");
    }
  }
  processKeyCounts(oneTimeKeysCounts, unusedFallbackKeys) {
    if (oneTimeKeysCounts !== undefined) {
      this.updateOneTimeKeyCount(oneTimeKeysCounts["signed_curve25519"] || 0);
    }
    if (unusedFallbackKeys !== undefined) {
      // If `unusedFallbackKeys` is defined, that means `device_unused_fallback_key_types`
      // is present in the sync response, which indicates that the server supports fallback keys.
      //
      // If there's no unused signed_curve25519 fallback key, we need a new one.
      this.needsNewFallback = !unusedFallbackKeys.includes("signed_curve25519");
    }
    return Promise.resolve();
  }
  /**
   * Handle a key event
   *
   * @internal
   * @param event - key event
   */
  onRoomKeyEvent(event) {
    const content = event.getContent();
    if (!content.room_id || !content.algorithm) {
      _logger.logger.error("key event is missing fields");
      return;
    }
    if (!this.backupManager.checkedForBackup) {
      // don't bother awaiting on this - the important thing is that we retry if we
      // haven't managed to check before
      this.backupManager.checkAndStart();
    }
    const alg = this.getRoomDecryptor(content.room_id, content.algorithm);
    alg.onRoomKeyEvent(event);
  }

  /**
   * Handle a key withheld event
   *
   * @internal
   * @param event - key withheld event
   */
  onRoomKeyWithheldEvent(event) {
    const content = event.getContent();
    if (content.code !== "m.no_olm" && (!content.room_id || !content.session_id) || !content.algorithm || !content.sender_key) {
      _logger.logger.error("key withheld event is missing fields");
      return;
    }
    _logger.logger.info(`Got room key withheld event from ${event.getSender()} ` + `for ${content.algorithm} session ${content.sender_key}|${content.session_id} ` + `in room ${content.room_id} with code ${content.code} (${content.reason})`);
    const alg = this.getRoomDecryptor(content.room_id, content.algorithm);
    if (alg.onRoomKeyWithheldEvent) {
      alg.onRoomKeyWithheldEvent(event);
    }
    if (!content.room_id) {
      // retry decryption for all events sent by the sender_key.  This will
      // update the events to show a message indicating that the olm session was
      // wedged.
      const roomDecryptors = this.getRoomDecryptors(content.algorithm);
      for (const decryptor of roomDecryptors) {
        decryptor.retryDecryptionFromSender(content.sender_key);
      }
    }
  }

  /**
   * Handle a general key verification event.
   *
   * @internal
   * @param event - verification start event
   */
  onKeyVerificationMessage(event) {
    if (!_ToDeviceChannel.ToDeviceChannel.validateEvent(event, this.baseApis)) {
      return;
    }
    const createRequest = event => {
      if (!_ToDeviceChannel.ToDeviceChannel.canCreateRequest(_ToDeviceChannel.ToDeviceChannel.getEventType(event))) {
        return;
      }
      const content = event.getContent();
      const deviceId = content && content.from_device;
      if (!deviceId) {
        return;
      }
      const userId = event.getSender();
      const channel = new _ToDeviceChannel.ToDeviceChannel(this.baseApis, userId, [deviceId]);
      return new _VerificationRequest.VerificationRequest(channel, this.verificationMethods, this.baseApis);
    };
    this.handleVerificationEvent(event, this.toDeviceVerificationRequests, createRequest);
  }
  async handleVerificationEvent(event, requestsMap, createRequest, isLiveEvent = true) {
    // Wait for event to get its final ID with pendingEventOrdering: "chronological", since DM channels depend on it.
    if (event.isSending() && event.status != _event2.EventStatus.SENT) {
      let eventIdListener;
      let statusListener;
      try {
        await new Promise((resolve, reject) => {
          eventIdListener = resolve;
          statusListener = () => {
            if (event.status == _event2.EventStatus.CANCELLED) {
              reject(new Error("Event status set to CANCELLED."));
            }
          };
          event.once(_event2.MatrixEventEvent.LocalEventIdReplaced, eventIdListener);
          event.on(_event2.MatrixEventEvent.Status, statusListener);
        });
      } catch (err) {
        _logger.logger.error("error while waiting for the verification event to be sent: ", err);
        return;
      } finally {
        event.removeListener(_event2.MatrixEventEvent.LocalEventIdReplaced, eventIdListener);
        event.removeListener(_event2.MatrixEventEvent.Status, statusListener);
      }
    }
    let request = requestsMap.getRequest(event);
    let isNewRequest = false;
    if (!request) {
      request = createRequest(event);
      // a request could not be made from this event, so ignore event
      if (!request) {
        _logger.logger.log(`Crypto: could not find VerificationRequest for ` + `${event.getType()}, and could not create one, so ignoring.`);
        return;
      }
      isNewRequest = true;
      requestsMap.setRequest(event, request);
    }
    event.setVerificationRequest(request);
    try {
      await request.channel.handleEvent(event, request, isLiveEvent);
    } catch (err) {
      _logger.logger.error("error while handling verification event", err);
    }
    const shouldEmit = isNewRequest && !request.initiatedByMe && !request.invalid &&
    // check it has enough events to pass the UNSENT stage
    !request.observeOnly;
    if (shouldEmit) {
      this.baseApis.emit(CryptoEvent.VerificationRequest, request);
      this.baseApis.emit(CryptoEvent.VerificationRequestReceived, request);
    }
  }

  /**
   * Handle a toDevice event that couldn't be decrypted
   *
   * @internal
   * @param event - undecryptable event
   */
  async onToDeviceBadEncrypted(event) {
    const content = event.getWireContent();
    const sender = event.getSender();
    const algorithm = content.algorithm;
    const deviceKey = content.sender_key;
    this.baseApis.emit(_client.ClientEvent.UndecryptableToDeviceEvent, event);

    // retry decryption for all events sent by the sender_key.  This will
    // update the events to show a message indicating that the olm session was
    // wedged.
    const retryDecryption = () => {
      const roomDecryptors = this.getRoomDecryptors(olmlib.MEGOLM_ALGORITHM);
      for (const decryptor of roomDecryptors) {
        decryptor.retryDecryptionFromSender(deviceKey);
      }
    };
    if (sender === undefined || deviceKey === undefined || deviceKey === undefined) {
      return;
    }

    // check when we can force a new session with this device: if we've already done so
    // recently, don't do it again.
    const forceNewSessionRetryTimeDevices = this.forceNewSessionRetryTime.getOrCreate(sender);
    const forceNewSessionRetryTime = forceNewSessionRetryTimeDevices.getOrCreate(deviceKey);
    if (forceNewSessionRetryTime > Date.now()) {
      _logger.logger.debug(`New session already forced with device ${sender}:${deviceKey}: ` + `not forcing another until at least ${new Date(forceNewSessionRetryTime).toUTCString()}`);
      await this.olmDevice.recordSessionProblem(deviceKey, "wedged", true);
      retryDecryption();
      return;
    }

    // make sure we don't retry to unwedge too soon even if we fail to create a new session
    forceNewSessionRetryTimeDevices.set(deviceKey, Date.now() + FORCE_SESSION_RETRY_INTERVAL_MS);

    // establish a new olm session with this device since we're failing to decrypt messages
    // on a current session.
    // Note that an undecryptable message from another device could easily be spoofed -
    // is there anything we can do to mitigate this?
    let device = this.deviceList.getDeviceByIdentityKey(algorithm, deviceKey);
    if (!device) {
      // if we don't know about the device, fetch the user's devices again
      // and retry before giving up
      await this.downloadKeys([sender], false);
      device = this.deviceList.getDeviceByIdentityKey(algorithm, deviceKey);
      if (!device) {
        _logger.logger.info("Couldn't find device for identity key " + deviceKey + ": not re-establishing session");
        await this.olmDevice.recordSessionProblem(deviceKey, "wedged", false);
        retryDecryption();
        return;
      }
    }
    const devicesByUser = new Map([[sender, [device]]]);
    await olmlib.ensureOlmSessionsForDevices(this.olmDevice, this.baseApis, devicesByUser, true);
    forceNewSessionRetryTimeDevices.set(deviceKey, Date.now() + MIN_FORCE_SESSION_INTERVAL_MS);

    // Now send a blank message on that session so the other side knows about it.
    // (The keyshare request is sent in the clear so that won't do)
    // We send this first such that, as long as the toDevice messages arrive in the
    // same order we sent them, the other end will get this first, set up the new session,
    // then get the keyshare request and send the key over this new session (because it
    // is the session it has most recently received a message on).
    const encryptedContent = {
      algorithm: olmlib.OLM_ALGORITHM,
      sender_key: this.olmDevice.deviceCurve25519Key,
      ciphertext: {},
      [_event.ToDeviceMessageId]: (0, _uuid.v4)()
    };
    await olmlib.encryptMessageForDevice(encryptedContent.ciphertext, this.userId, this.deviceId, this.olmDevice, sender, device, {
      type: "m.dummy"
    });
    await this.olmDevice.recordSessionProblem(deviceKey, "wedged", true);
    retryDecryption();
    await this.baseApis.sendToDevice("m.room.encrypted", new Map([[sender, new Map([[device.deviceId, encryptedContent]])]]));

    // Most of the time this probably won't be necessary since we'll have queued up a key request when
    // we failed to decrypt the message and will be waiting a bit for the key to arrive before sending
    // it. This won't always be the case though so we need to re-send any that have already been sent
    // to avoid races.
    const requestsToResend = await this.outgoingRoomKeyRequestManager.getOutgoingSentRoomKeyRequest(sender, device.deviceId);
    for (const keyReq of requestsToResend) {
      this.requestRoomKey(keyReq.requestBody, keyReq.recipients, true);
    }
  }

  /**
   * Handle a change in the membership state of a member of a room
   *
   * @internal
   * @param event -  event causing the change
   * @param member -  user whose membership changed
   * @param oldMembership -  previous membership
   */
  onRoomMembership(event, member, oldMembership) {
    // this event handler is registered on the *client* (as opposed to the room
    // member itself), which means it is only called on changes to the *live*
    // membership state (ie, it is not called when we back-paginate, nor when
    // we load the state in the initialsync).
    //
    // Further, it is automatically registered and called when new members
    // arrive in the room.

    const roomId = member.roomId;
    const alg = this.roomEncryptors.get(roomId);
    if (!alg) {
      // not encrypting in this room
      return;
    }
    // only mark users in this room as tracked if we already started tracking in this room
    // this way we don't start device queries after sync on behalf of this room which we won't use
    // the result of anyway, as we'll need to do a query again once all the members are fetched
    // by calling _trackRoomDevices
    if (roomId in this.roomDeviceTrackingState) {
      if (member.membership == _membership.KnownMembership.Join) {
        _logger.logger.log("Join event for " + member.userId + " in " + roomId);
        // make sure we are tracking the deviceList for this user
        this.deviceList.startTrackingDeviceList(member.userId);
      } else if (member.membership == _membership.KnownMembership.Invite && this.clientStore.getRoom(roomId)?.shouldEncryptForInvitedMembers()) {
        _logger.logger.log("Invite event for " + member.userId + " in " + roomId);
        this.deviceList.startTrackingDeviceList(member.userId);
      }
    }
    alg.onRoomMembership(event, member, oldMembership);
  }

  /**
   * Called when we get an m.room_key_request event.
   *
   * @internal
   * @param event - key request event
   */
  onRoomKeyRequestEvent(event) {
    const content = event.getContent();
    if (content.action === "request") {
      // Queue it up for now, because they tend to arrive before the room state
      // events at initial sync, and we want to see if we know anything about the
      // room before passing them on to the app.
      const req = new IncomingRoomKeyRequest(event);
      this.receivedRoomKeyRequests.push(req);
    } else if (content.action === "request_cancellation") {
      const req = new IncomingRoomKeyRequestCancellation(event);
      this.receivedRoomKeyRequestCancellations.push(req);
    }
  }

  /**
   * Process any m.room_key_request events which were queued up during the
   * current sync.
   *
   * @internal
   */
  async processReceivedRoomKeyRequests() {
    if (this.processingRoomKeyRequests) {
      // we're still processing last time's requests; keep queuing new ones
      // up for now.
      return;
    }
    this.processingRoomKeyRequests = true;
    try {
      // we need to grab and clear the queues in the synchronous bit of this method,
      // so that we don't end up racing with the next /sync.
      const requests = this.receivedRoomKeyRequests;
      this.receivedRoomKeyRequests = [];
      const cancellations = this.receivedRoomKeyRequestCancellations;
      this.receivedRoomKeyRequestCancellations = [];

      // Process all of the requests, *then* all of the cancellations.
      //
      // This makes sure that if we get a request and its cancellation in the
      // same /sync result, then we process the request before the
      // cancellation (and end up with a cancelled request), rather than the
      // cancellation before the request (and end up with an outstanding
      // request which should have been cancelled.)
      await Promise.all(requests.map(req => this.processReceivedRoomKeyRequest(req)));
      await Promise.all(cancellations.map(cancellation => this.processReceivedRoomKeyRequestCancellation(cancellation)));
    } catch (e) {
      _logger.logger.error(`Error processing room key requsts: ${e}`);
    } finally {
      this.processingRoomKeyRequests = false;
    }
  }

  /**
   * Helper for processReceivedRoomKeyRequests
   *
   */
  async processReceivedRoomKeyRequest(req) {
    const userId = req.userId;
    const deviceId = req.deviceId;
    const body = req.requestBody;
    const roomId = body.room_id;
    const alg = body.algorithm;
    _logger.logger.log(`m.room_key_request from ${userId}:${deviceId}` + ` for ${roomId} / ${body.session_id} (id ${req.requestId})`);
    if (userId !== this.userId) {
      if (!this.roomEncryptors.get(roomId)) {
        _logger.logger.debug(`room key request for unencrypted room ${roomId}`);
        return;
      }
      const encryptor = this.roomEncryptors.get(roomId);
      const device = this.deviceList.getStoredDevice(userId, deviceId);
      if (!device) {
        _logger.logger.debug(`Ignoring keyshare for unknown device ${userId}:${deviceId}`);
        return;
      }
      try {
        await encryptor.reshareKeyWithDevice(body.sender_key, body.session_id, userId, device);
      } catch (e) {
        _logger.logger.warn("Failed to re-share keys for session " + body.session_id + " with device " + userId + ":" + device.deviceId, e);
      }
      return;
    }
    if (deviceId === this.deviceId) {
      // We'll always get these because we send room key requests to
      // '*' (ie. 'all devices') which includes the sending device,
      // so ignore requests from ourself because apart from it being
      // very silly, it won't work because an Olm session cannot send
      // messages to itself.
      // The log here is probably superfluous since we know this will
      // always happen, but let's log anyway for now just in case it
      // causes issues.
      _logger.logger.log("Ignoring room key request from ourselves");
      return;
    }

    // todo: should we queue up requests we don't yet have keys for,
    // in case they turn up later?

    // if we don't have a decryptor for this room/alg, we don't have
    // the keys for the requested events, and can drop the requests.
    if (!this.roomDecryptors.has(roomId)) {
      _logger.logger.log(`room key request for unencrypted room ${roomId}`);
      return;
    }
    const decryptor = this.roomDecryptors.get(roomId).get(alg);
    if (!decryptor) {
      _logger.logger.log(`room key request for unknown alg ${alg} in room ${roomId}`);
      return;
    }
    if (!(await decryptor.hasKeysForKeyRequest(req))) {
      _logger.logger.log(`room key request for unknown session ${roomId} / ` + body.session_id);
      return;
    }
    req.share = () => {
      decryptor.shareKeysWithDevice(req);
    };

    // if the device is verified already, share the keys
    if (this.checkDeviceTrust(userId, deviceId).isVerified()) {
      _logger.logger.log("device is already verified: sharing keys");
      req.share();
      return;
    }
    this.emit(CryptoEvent.RoomKeyRequest, req);
  }

  /**
   * Helper for processReceivedRoomKeyRequests
   *
   */
  async processReceivedRoomKeyRequestCancellation(cancellation) {
    _logger.logger.log(`m.room_key_request cancellation for ${cancellation.userId}:` + `${cancellation.deviceId} (id ${cancellation.requestId})`);

    // we should probably only notify the app of cancellations we told it
    // about, but we don't currently have a record of that, so we just pass
    // everything through.
    this.emit(CryptoEvent.RoomKeyRequestCancellation, cancellation);
  }

  /**
   * Get a decryptor for a given room and algorithm.
   *
   * If we already have a decryptor for the given room and algorithm, return
   * it. Otherwise try to instantiate it.
   *
   * @internal
   *
   * @param roomId -   room id for decryptor. If undefined, a temporary
   * decryptor is instantiated.
   *
   * @param algorithm -  crypto algorithm
   *
   * @throws `DecryptionError` if the algorithm is unknown
   */
  getRoomDecryptor(roomId, algorithm) {
    let decryptors;
    let alg;
    if (roomId) {
      decryptors = this.roomDecryptors.get(roomId);
      if (!decryptors) {
        decryptors = new Map();
        this.roomDecryptors.set(roomId, decryptors);
      }
      alg = decryptors.get(algorithm);
      if (alg) {
        return alg;
      }
    }
    const AlgClass = algorithms.DECRYPTION_CLASSES.get(algorithm);
    if (!AlgClass) {
      throw new _CryptoBackend.DecryptionError(_cryptoApi.DecryptionFailureCode.UNKNOWN_ENCRYPTION_ALGORITHM, 'Unknown encryption algorithm "' + algorithm + '".');
    }
    alg = new AlgClass({
      userId: this.userId,
      crypto: this,
      olmDevice: this.olmDevice,
      baseApis: this.baseApis,
      roomId: roomId ?? undefined
    });
    if (decryptors) {
      decryptors.set(algorithm, alg);
    }
    return alg;
  }

  /**
   * Get all the room decryptors for a given encryption algorithm.
   *
   * @param algorithm - The encryption algorithm
   *
   * @returns An array of room decryptors
   */
  getRoomDecryptors(algorithm) {
    const decryptors = [];
    for (const d of this.roomDecryptors.values()) {
      if (d.has(algorithm)) {
        decryptors.push(d.get(algorithm));
      }
    }
    return decryptors;
  }

  /**
   * sign the given object with our ed25519 key
   *
   * @param obj -  Object to which we will add a 'signatures' property
   */
  async signObject(obj) {
    const sigs = new Map(Object.entries(obj.signatures || {}));
    const unsigned = obj.unsigned;
    delete obj.signatures;
    delete obj.unsigned;
    const userSignatures = sigs.get(this.userId) || {};
    sigs.set(this.userId, userSignatures);
    userSignatures["ed25519:" + this.deviceId] = await this.olmDevice.sign(_anotherJson.default.stringify(obj));
    obj.signatures = (0, _utils.recursiveMapToObject)(sigs);
    if (unsigned !== undefined) obj.unsigned = unsigned;
  }

  /**
   * @returns true if the room with the supplied ID is encrypted. False if the
   * room is not encrypted, or is unknown to us.
   */
  isRoomEncrypted(roomId) {
    return this.roomList.isRoomEncrypted(roomId);
  }

  /**
   * Implementation of {@link Crypto.CryptoApi#isEncryptionEnabledInRoom}.
   */
  async isEncryptionEnabledInRoom(roomId) {
    return this.isRoomEncrypted(roomId);
  }

  /**
   * @returns information about the encryption on the room with the supplied
   * ID, or null if the room is not encrypted or unknown to us.
   */
  getRoomEncryption(roomId) {
    return this.roomList.getRoomEncryption(roomId);
  }

  /**
   * Returns whether dehydrated devices are supported by the crypto backend
   * and by the server.
   */
  async isDehydrationSupported() {
    return false;
  }

  /**
   * Stub function -- dehydration is not implemented here, so throw error
   */
  async startDehydration(createNewKey) {
    throw new Error("Not implemented");
  }
}

/**
 * Fix up the backup key, that may be in the wrong format due to a bug in a
 * migration step.  Some backup keys were stored as a comma-separated list of
 * integers, rather than a base64-encoded byte array.  If this function is
 * passed a string that looks like a list of integers rather than a base64
 * string, it will attempt to convert it to the right format.
 *
 * @param key - the key to check
 * @returns If the key is in the wrong format, then the fixed
 * key will be returned. Otherwise null will be returned.
 *
 */
exports.Crypto = Crypto;
function fixBackupKey(key) {
  if (typeof key !== "string" || key.indexOf(",") < 0) {
    return null;
  }
  const fixedKey = Uint8Array.from(key.split(","), x => parseInt(x));
  return (0, _base.encodeBase64)(fixedKey);
}

/**
 * Represents a received m.room_key_request event
 */
class IncomingRoomKeyRequest {
  constructor(event) {
    /** user requesting the key */
    _defineProperty(this, "userId", void 0);
    /** device requesting the key */
    _defineProperty(this, "deviceId", void 0);
    /** unique id for the request */
    _defineProperty(this, "requestId", void 0);
    _defineProperty(this, "requestBody", void 0);
    /**
     * callback which, when called, will ask
     *    the relevant crypto algorithm implementation to share the keys for
     *    this request.
     */
    _defineProperty(this, "share", void 0);
    const content = event.getContent();
    this.userId = event.getSender();
    this.deviceId = content.requesting_device_id;
    this.requestId = content.request_id;
    this.requestBody = content.body || {};
    this.share = () => {
      throw new Error("don't know how to share keys for this request yet");
    };
  }
}

/**
 * Represents a received m.room_key_request cancellation
 */
exports.IncomingRoomKeyRequest = IncomingRoomKeyRequest;
class IncomingRoomKeyRequestCancellation {
  constructor(event) {
    /** user requesting the cancellation */
    _defineProperty(this, "userId", void 0);
    /** device requesting the cancellation */
    _defineProperty(this, "deviceId", void 0);
    /** unique id for the request to be cancelled */
    _defineProperty(this, "requestId", void 0);
    const content = event.getContent();
    this.userId = event.getSender();
    this.deviceId = content.requesting_device_id;
    this.requestId = content.request_id;
  }
}

// a number of types are re-exported for backwards compatibility, in case any applications are referencing it.