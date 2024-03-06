"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomEncryptor = void 0;
exports.toRustHistoryVisibility = toRustHistoryVisibility;
var _matrixSdkCryptoWasm = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var RustSdkCryptoJs = _matrixSdkCryptoWasm;
var _event = require("../@types/event");
var _logger = require("../logger");
var _partials = require("../@types/partials");
var _utils = require("../utils");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

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
 * RoomEncryptor: responsible for encrypting messages to a given room
 *
 * @internal
 */
class RoomEncryptor {
  /**
   * @param olmMachine - The rust-sdk's OlmMachine
   * @param keyClaimManager - Our KeyClaimManager, which manages the queue of one-time-key claim requests
   * @param outgoingRequestManager - The OutgoingRequestManager, which manages the queue of outgoing requests.
   * @param room - The room we want to encrypt for
   * @param encryptionSettings - body of the m.room.encryption event currently in force in this room
   */
  constructor(olmMachine, keyClaimManager, outgoingRequestManager, room, encryptionSettings) {
    this.olmMachine = olmMachine;
    this.keyClaimManager = keyClaimManager;
    this.outgoingRequestManager = outgoingRequestManager;
    this.room = room;
    this.encryptionSettings = encryptionSettings;
    _defineProperty(this, "prefixedLogger", void 0);
    /** whether the room members have been loaded and tracked for the first time */
    _defineProperty(this, "lazyLoadedMembersResolved", false);
    /**
     * Ensures that there is only one encryption operation at a time for that room.
     *
     * An encryption operation is either a {@link prepareForEncryption} or an {@link encryptEvent} call.
     */
    _defineProperty(this, "currentEncryptionPromise", Promise.resolve());
    this.prefixedLogger = _logger.logger.getChild(`[${room.roomId} encryption]`);

    // start tracking devices for any users already known to be in this room.
    // Do not load members here, would defeat lazy loading.
    const members = room.getJoinedMembers();

    // At this point just mark the known members as tracked, it might not be the full list of members
    // because of lazy loading. This is fine, because we will get a member list update when sending a message for
    // the first time, see `RoomEncryptor#ensureEncryptionSession`
    this.olmMachine.updateTrackedUsers(members.map(u => new RustSdkCryptoJs.UserId(u.userId))).catch(e => this.prefixedLogger.error("Error initializing tracked users", e));
  }

  /**
   * Handle a new `m.room.encryption` event in this room
   *
   * @param config - The content of the encryption event
   */
  onCryptoEvent(config) {
    if (JSON.stringify(this.encryptionSettings) != JSON.stringify(config)) {
      // This should currently be unreachable, since the Rust SDK will reject any attempts to change config.
      throw new Error("Cannot reconfigure an active RoomEncryptor");
    }
  }

  /**
   * Handle a new `m.room.member` event in this room
   *
   * @param member - new membership state
   */
  onRoomMembership(member) {
    if (member.membership == "join" || member.membership == "invite" && this.room.shouldEncryptForInvitedMembers()) {
      // make sure we are tracking the deviceList for this user
      (0, _utils.logDuration)(this.prefixedLogger, "updateTrackedUsers", async () => {
        this.olmMachine.updateTrackedUsers([new _matrixSdkCryptoWasm.UserId(member.userId)]).catch(e => {
          this.prefixedLogger.error("Unable to update tracked users", e);
        });
      });
    }

    // TODO: handle leaves (including our own)
  }

  /**
   * Prepare to encrypt events in this room.
   *
   * This ensures that we have a megolm session ready to use and that we have shared its key with all the devices
   * in the room.
   *
   * @param globalBlacklistUnverifiedDevices - When `true`, it will not send encrypted messages to unverified devices
   */
  async prepareForEncryption(globalBlacklistUnverifiedDevices) {
    // We consider a prepareForEncryption as an encryption promise as it will potentially share keys
    // even if it doesn't send an event.
    // Usually this is called when the user starts typing, so we want to make sure we have keys ready when the
    // message is finally sent.
    // If `encryptEvent` is invoked before `prepareForEncryption` has completed, the `encryptEvent` call will wait for
    // `prepareForEncryption` to complete before executing.
    // The part where `encryptEvent` shares the room key will then usually be a no-op as it was already performed by `prepareForEncryption`.
    await this.encryptEvent(null, globalBlacklistUnverifiedDevices);
  }

  /**
   * Encrypt an event for this room, or prepare for encryption.
   *
   * This will ensure that we have a megolm session for this room, share it with the devices in the room, and
   * then, if an event is provided, encrypt it using the session.
   *
   * @param event - Event to be encrypted, or null if only preparing for encryption (in which case we will pre-share the room key).
   * @param globalBlacklistUnverifiedDevices - When `true`, it will not send encrypted messages to unverified devices
   */
  encryptEvent(event, globalBlacklistUnverifiedDevices) {
    const logger = new _logger.LogSpan(this.prefixedLogger, event ? event.getTxnId() ?? "" : "prepareForEncryption");
    // Ensure order of encryption to avoid message ordering issues, as the scheduler only ensures
    // events order after they have been encrypted.
    const prom = this.currentEncryptionPromise.catch(() => {
      // Any errors in the previous call will have been reported already, so there is nothing to do here.
      // we just throw away the error and start anew.
    }).then(async () => {
      await (0, _utils.logDuration)(logger, "ensureEncryptionSession", async () => {
        await this.ensureEncryptionSession(logger, globalBlacklistUnverifiedDevices);
      });
      if (event) {
        await (0, _utils.logDuration)(logger, "encryptEventInner", async () => {
          await this.encryptEventInner(logger, event);
        });
      }
    });
    this.currentEncryptionPromise = prom;
    return prom;
  }

  /**
   * Prepare to encrypt events in this room.
   *
   * This ensures that we have a megolm session ready to use and that we have shared its key with all the devices
   * in the room.
   *
   * @param logger - a place to write diagnostics to
   * @param globalBlacklistUnverifiedDevices - When `true`, it will not send encrypted messages to unverified devices
   */
  async ensureEncryptionSession(logger, globalBlacklistUnverifiedDevices) {
    if (this.encryptionSettings.algorithm !== "m.megolm.v1.aes-sha2") {
      throw new Error(`Cannot encrypt in ${this.room.roomId} for unsupported algorithm '${this.encryptionSettings.algorithm}'`);
    }
    logger.debug("Starting encryption");
    const members = await this.room.getEncryptionTargetMembers();

    // If this is the first time we are sending a message to the room, we may not yet have seen all the members
    // (so the Crypto SDK might not have a device list for them). So, if this is the first time we are encrypting
    // for this room, give the SDK the full list of members, to be on the safe side.
    //
    // This could end up being racy (if two calls to ensureEncryptionSession happen at the same time), but that's
    // not a particular problem, since `OlmMachine.updateTrackedUsers` just adds any users that weren't already tracked.
    if (!this.lazyLoadedMembersResolved) {
      await (0, _utils.logDuration)(this.prefixedLogger, "loadMembersIfNeeded: updateTrackedUsers", async () => {
        await this.olmMachine.updateTrackedUsers(members.map(u => new RustSdkCryptoJs.UserId(u.userId)));
      });
      logger.debug(`Updated tracked users`);
      this.lazyLoadedMembersResolved = true;

      // Query keys in case we don't have them for newly tracked members.
      // It's important after loading members for the first time, as likely most of them won't be
      // known yet and will be unable to decrypt messages despite being in the room for long.
      // This must be done before ensuring sessions. If not the devices of these users are not
      // known yet and will not get the room key.
      // We don't have API to only get the keys queries related to this member list, so we just
      // process the pending requests from the olmMachine. (usually these are processed
      // at the end of the sync, but we can't wait for that).
      // XXX future improvement process only KeysQueryRequests for the users that have never been queried.
      logger.debug(`Processing outgoing requests`);
      await (0, _utils.logDuration)(this.prefixedLogger, "doProcessOutgoingRequests", async () => {
        await this.outgoingRequestManager.doProcessOutgoingRequests();
      });
    } else {
      // If members are already loaded it's less critical to await on key queries.
      // We might still want to trigger a processOutgoingRequests here.
      // The call to `ensureSessionsForUsers` below will wait a bit on in-flight key queries we are
      // interested in. If a sync handling happens in the meantime, and some new members are added to the room
      // or have new devices it would give us a chance to query them before sending.
      // It's less critical due to the racy nature of this process.
      logger.debug(`Processing outgoing requests in background`);
      this.outgoingRequestManager.doProcessOutgoingRequests();
    }
    logger.debug(`Encrypting for users (shouldEncryptForInvitedMembers: ${this.room.shouldEncryptForInvitedMembers()}):`, members.map(u => `${u.userId} (${u.membership})`));
    const userList = members.map(u => new _matrixSdkCryptoWasm.UserId(u.userId));
    await (0, _utils.logDuration)(this.prefixedLogger, "ensureSessionsForUsers", async () => {
      await this.keyClaimManager.ensureSessionsForUsers(logger, userList);
    });
    const rustEncryptionSettings = new _matrixSdkCryptoWasm.EncryptionSettings();
    rustEncryptionSettings.historyVisibility = toRustHistoryVisibility(this.room.getHistoryVisibility());

    // We only support megolm
    rustEncryptionSettings.algorithm = _matrixSdkCryptoWasm.EncryptionAlgorithm.MegolmV1AesSha2;

    // We need to convert the rotation period from milliseconds to microseconds
    // See https://spec.matrix.org/v1.8/client-server-api/#mroomencryption and
    // https://matrix-org.github.io/matrix-rust-sdk-crypto-wasm/classes/EncryptionSettings.html#rotationPeriod
    if (typeof this.encryptionSettings.rotation_period_ms === "number") {
      rustEncryptionSettings.rotationPeriod = BigInt(this.encryptionSettings.rotation_period_ms * 1000);
    }
    if (typeof this.encryptionSettings.rotation_period_msgs === "number") {
      rustEncryptionSettings.rotationPeriodMessages = BigInt(this.encryptionSettings.rotation_period_msgs);
    }

    // When this.room.getBlacklistUnverifiedDevices() === null, the global settings should be used
    // See Room#getBlacklistUnverifiedDevices
    rustEncryptionSettings.onlyAllowTrustedDevices = this.room.getBlacklistUnverifiedDevices() ?? globalBlacklistUnverifiedDevices;
    await (0, _utils.logDuration)(this.prefixedLogger, "shareRoomKey", async () => {
      const shareMessages = await this.olmMachine.shareRoomKey(new _matrixSdkCryptoWasm.RoomId(this.room.roomId),
      // safe to pass without cloning, as it's not reused here (before or after)
      userList, rustEncryptionSettings);
      if (shareMessages) {
        for (const m of shareMessages) {
          await this.outgoingRequestManager.outgoingRequestProcessor.makeOutgoingRequest(m);
        }
      }
    });
  }

  /**
   * Discard any existing group session for this room
   */
  async forceDiscardSession() {
    const r = await this.olmMachine.invalidateGroupSession(new _matrixSdkCryptoWasm.RoomId(this.room.roomId));
    if (r) {
      this.prefixedLogger.info("Discarded existing group session");
    }
  }
  async encryptEventInner(logger, event) {
    logger.debug("Encrypting actual message content");
    const encryptedContent = await this.olmMachine.encryptRoomEvent(new _matrixSdkCryptoWasm.RoomId(this.room.roomId), event.getType(), JSON.stringify(event.getContent()));
    event.makeEncrypted(_event.EventType.RoomMessageEncrypted, JSON.parse(encryptedContent), this.olmMachine.identityKeys.curve25519.toBase64(), this.olmMachine.identityKeys.ed25519.toBase64());
    logger.debug("Encrypted event successfully");
  }
}

/**
 * Convert a HistoryVisibility to a RustHistoryVisibility
 * @param visibility - HistoryVisibility enum
 * @returns a RustHistoryVisibility enum
 */
exports.RoomEncryptor = RoomEncryptor;
function toRustHistoryVisibility(visibility) {
  switch (visibility) {
    case _partials.HistoryVisibility.Invited:
      return _matrixSdkCryptoWasm.HistoryVisibility.Invited;
    case _partials.HistoryVisibility.Joined:
      return _matrixSdkCryptoWasm.HistoryVisibility.Joined;
    case _partials.HistoryVisibility.Shared:
      return _matrixSdkCryptoWasm.HistoryVisibility.Shared;
    case _partials.HistoryVisibility.WorldReadable:
      return _matrixSdkCryptoWasm.HistoryVisibility.WorldReadable;
  }
}