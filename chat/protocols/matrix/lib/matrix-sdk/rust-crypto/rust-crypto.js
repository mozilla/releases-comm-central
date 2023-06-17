"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RustCrypto = void 0;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-js"));
var _logger = require("../logger");
var _httpApi = require("../http-api");
var _CrossSigning = require("../crypto/CrossSigning");
var _RoomEncryptor = require("./RoomEncryptor");
var _OutgoingRequestProcessor = require("./OutgoingRequestProcessor");
var _KeyClaimManager = require("./KeyClaimManager");
var _utils = require("../utils");
var _cryptoApi = require("../crypto-api");
var _deviceConverter = require("./device-converter");
var _api = require("../crypto/api");
var _CrossSigningIdentity = require("./CrossSigningIdentity");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
/**
 * An implementation of {@link CryptoBackend} using the Rust matrix-sdk-crypto.
 */
class RustCrypto {
  constructor( /** The `OlmMachine` from the underlying rust crypto sdk. */
  olmMachine,
  /**
   * Low-level HTTP interface: used to make outgoing requests required by the rust SDK.
   *
   * We expect it to set the access token, etc.
   */
  http, /** The local user's User ID. */
  _userId, /** The local user's Device ID. */
  _deviceId, /** Interface to server-side secret storage */
  _secretStorage) {
    this.olmMachine = olmMachine;
    this.http = http;
    _defineProperty(this, "globalErrorOnUnknownDevices", false);
    _defineProperty(this, "_trustCrossSignedDevices", true);
    /** whether {@link stop} has been called */
    _defineProperty(this, "stopped", false);
    /** whether {@link outgoingRequestLoop} is currently running */
    _defineProperty(this, "outgoingRequestLoopRunning", false);
    /** mapping of roomId → encryptor class */
    _defineProperty(this, "roomEncryptors", {});
    _defineProperty(this, "eventDecryptor", void 0);
    _defineProperty(this, "keyClaimManager", void 0);
    _defineProperty(this, "outgoingRequestProcessor", void 0);
    _defineProperty(this, "crossSigningIdentity", void 0);
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // CryptoApi implementation
    //
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    _defineProperty(this, "globalBlacklistUnverifiedDevices", false);
    this.outgoingRequestProcessor = new _OutgoingRequestProcessor.OutgoingRequestProcessor(olmMachine, http);
    this.keyClaimManager = new _KeyClaimManager.KeyClaimManager(olmMachine, this.outgoingRequestProcessor);
    this.eventDecryptor = new EventDecryptor(olmMachine);
    this.crossSigningIdentity = new _CrossSigningIdentity.CrossSigningIdentity(olmMachine, this.outgoingRequestProcessor);
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // CryptoBackend implementation
  //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  stop() {
    // stop() may be called multiple times, but attempting to close() the OlmMachine twice
    // will cause an error.
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.keyClaimManager.stop();

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
    await encryptor.encryptEvent(event);
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
  getEventEncryptionInfo(event) {
    // TODO: make this work properly. Or better, replace it.

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
  checkUserTrust(userId) {
    // TODO
    return new _CrossSigning.UserTrustLevel(false, false, false);
  }

  /**
   * Finds a DM verification request that is already in progress for the given room id
   *
   * @param roomId - the room to use for verification
   *
   * @returns the VerificationRequest that is in progress, if any
   */
  findVerificationRequestDMInProgress(roomId) {
    // TODO
    return;
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
  async userHasCrossSigningKeys() {
    // TODO
    return false;
  }
  prepareToEncrypt(room) {
    const encryptor = this.roomEncryptors[room.roomId];
    if (encryptor) {
      encryptor.ensureEncryptionSession();
    }
  }
  forceDiscardSession(roomId) {
    return this.roomEncryptors[roomId]?.forceDiscardSession();
  }
  async exportRoomKeys() {
    // TODO
    return [];
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
    const rustTrackedUsers = await this.olmMachine.trackedUsers();

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
    const devices = await this.olmMachine.getUserDevices(rustUserId);
    return new Map(devices.devices().map(device => [device.deviceId.toString(), (0, _deviceConverter.rustDeviceToJsDevice)(device, rustUserId)]));
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
   * Implementation of {@link CryptoApi#getDeviceVerificationStatus}.
   */
  async getDeviceVerificationStatus(userId, deviceId) {
    const device = await this.olmMachine.getDevice(new RustSdkCryptoJs.UserId(userId), new RustSdkCryptoJs.DeviceId(deviceId));
    if (!device) return null;
    return new _cryptoApi.DeviceVerificationStatus({
      signedByOwner: device.isCrossSignedByOwner(),
      crossSigningVerified: device.isCrossSigningTrusted(),
      localVerified: device.isLocallyTrusted(),
      trustCrossSignedDevices: this._trustCrossSignedDevices
    });
  }

  /**
   * Implementation of {@link CryptoApi#isCrossSigningReady}
   */
  async isCrossSigningReady() {
    return false;
  }

  /**
   * Implementation of {@link CryptoApi#getCrossSigningKeyId}
   */
  async getCrossSigningKeyId(type = _api.CrossSigningKey.Master) {
    // TODO
    return null;
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
    return false;
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
    const result = await this.olmMachine.receiveSyncChanges(events ? JSON.stringify(events) : "[]", devices, oneTimeKeysCounts, unusedFallbackKeys);

    // receiveSyncChanges returns a JSON-encoded list of decrypted to-device messages.
    return JSON.parse(result);
  }

  /** called by the sync loop to preprocess incoming to-device messages
   *
   * @param events - the received to-device messages
   * @returns A list of preprocessed to-device messages.
   */
  preprocessToDeviceMessages(events) {
    // send the received to-device messages into receiveSyncChanges. We have no info on device-list changes,
    // one-time-keys, or fallback keys, so just pass empty data.
    return this.receiveSyncChanges({
      events
    });
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
    const existingEncryptor = this.roomEncryptors[room.roomId];
    if (existingEncryptor) {
      existingEncryptor.onCryptoEvent(config);
    } else {
      this.roomEncryptors[room.roomId] = new _RoomEncryptor.RoomEncryptor(this.olmMachine, this.keyClaimManager, this.outgoingRequestProcessor, room, config);
    }

    // start tracking devices for any users already known to be in this room.
    const members = await room.getEncryptionTargetMembers();
    _logger.logger.debug(`[${room.roomId} encryption] starting to track devices for: `, members.map(u => `${u.userId} (${u.membership})`));
    await this.olmMachine.updateTrackedUsers(members.map(u => new RustSdkCryptoJs.UserId(u.userId)));
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
    this.outgoingRequestLoop();
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
  }
  onRoomKeyUpdated(key) {
    _logger.logger.debug(`Got update for session ${key.senderKey.toBase64()}|${key.sessionId} in ${key.roomId.toString()}`);
    const pendingList = this.eventDecryptor.getEventsPendingRoomKey(key);
    if (pendingList.length === 0) return;
    _logger.logger.debug("Retrying decryption on events:", pendingList.map(e => `${e.getId()}`));

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
        _logger.logger.info(`Still unable to decrypt event ${ev.getId()} after receiving key`);
      });
    }
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // Outgoing requests
  //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  async outgoingRequestLoop() {
    if (this.outgoingRequestLoopRunning) {
      return;
    }
    this.outgoingRequestLoopRunning = true;
    try {
      while (!this.stopped) {
        const outgoingRequests = await this.olmMachine.outgoingRequests();
        if (outgoingRequests.length == 0 || this.stopped) {
          // no more messages to send (or we have been told to stop): exit the loop
          return;
        }
        for (const msg of outgoingRequests) {
          await this.outgoingRequestProcessor.makeOutgoingRequest(msg);
        }
      }
    } catch (e) {
      _logger.logger.error("Error processing outgoing-message requests from rust crypto-sdk", e);
    } finally {
      this.outgoingRequestLoopRunning = false;
    }
  }
}
exports.RustCrypto = RustCrypto;
class EventDecryptor {
  constructor(olmMachine) {
    this.olmMachine = olmMachine;
    /**
     * Events which we couldn't decrypt due to unknown sessions / indexes.
     *
     * Map from senderKey to sessionId to Set of MatrixEvents
     */
    _defineProperty(this, "eventsPendingKey", new _utils.MapWithDefault(() => new _utils.MapWithDefault(() => new Set())));
  }
  async attemptEventDecryption(event) {
    _logger.logger.info("Attempting decryption of event", event);
    // add the event to the pending list *before* attempting to decrypt.
    // then, if the key turns up while decryption is in progress (and
    // decryption fails), we will schedule a retry.
    // (fixes https://github.com/vector-im/element-web/issues/5001)
    this.addEventToPendingList(event);
    const res = await this.olmMachine.decryptRoomEvent(JSON.stringify({
      event_id: event.getId(),
      type: event.getWireType(),
      sender: event.getSender(),
      state_key: event.getStateKey(),
      content: event.getWireContent(),
      origin_server_ts: event.getTs()
    }), new RustSdkCryptoJs.RoomId(event.getRoomId()));

    // Success. We can remove the event from the pending list, if
    // that hasn't already happened.
    this.removeEventFromPendingList(event);
    return {
      clearEvent: JSON.parse(res.event),
      claimedEd25519Key: res.senderClaimedEd25519Key,
      senderCurve25519Key: res.senderCurve25519Key,
      forwardingCurve25519KeyChain: res.forwardingCurve25519KeyChain
    };
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