"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RustCrypto = void 0;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-js"));
var _logger = require("../logger");
var _CrossSigning = require("../crypto/CrossSigning");
var _RoomEncryptor = require("./RoomEncryptor");
var _OutgoingRequestProcessor = require("./OutgoingRequestProcessor");
var _KeyClaimManager = require("./KeyClaimManager");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/**
 * An implementation of {@link CryptoBackend} using the Rust matrix-sdk-crypto.
 */
class RustCrypto {
  /** whether {@link stop} has been called */

  /** whether {@link outgoingRequestLoop} is currently running */

  /** mapping of roomId → encryptor class */

  constructor(olmMachine, http, _userId, _deviceId) {
    this.olmMachine = olmMachine;
    _defineProperty(this, "globalBlacklistUnverifiedDevices", false);
    _defineProperty(this, "globalErrorOnUnknownDevices", false);
    _defineProperty(this, "stopped", false);
    _defineProperty(this, "outgoingRequestLoopRunning", false);
    _defineProperty(this, "roomEncryptors", {});
    _defineProperty(this, "keyClaimManager", void 0);
    _defineProperty(this, "outgoingRequestProcessor", void 0);
    this.outgoingRequestProcessor = new _OutgoingRequestProcessor.OutgoingRequestProcessor(olmMachine, http);
    this.keyClaimManager = new _KeyClaimManager.KeyClaimManager(olmMachine, this.outgoingRequestProcessor);
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
  prepareToEncrypt(room) {
    const encryptor = this.roomEncryptors[room.roomId];
    if (encryptor) {
      encryptor.ensureEncryptionSession();
    }
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
    const res = await this.olmMachine.decryptRoomEvent(JSON.stringify({
      event_id: event.getId(),
      type: event.getWireType(),
      sender: event.getSender(),
      state_key: event.getStateKey(),
      content: event.getWireContent(),
      origin_server_ts: event.getTs()
    }), new RustSdkCryptoJs.RoomId(event.getRoomId()));
    return {
      clearEvent: JSON.parse(res.event),
      claimedEd25519Key: res.senderClaimedEd25519Key,
      senderCurve25519Key: res.senderCurve25519Key,
      forwardingCurve25519KeyChain: res.forwardingCurve25519KeyChain
    };
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
  async userHasCrossSigningKeys() {
    // TODO
    return false;
  }
  async exportRoomKeys() {
    // TODO
    return [];
  }
  checkUserTrust(userId) {
    // TODO
    return new _CrossSigning.UserTrustLevel(false, false, false);
  }
  checkDeviceTrust(userId, deviceId) {
    // TODO
    return new _CrossSigning.DeviceTrustLevel(false, false, false, false);
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // SyncCryptoCallbacks implementation
  //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /** called by the sync loop to preprocess incoming to-device messages
   *
   * @param events - the received to-device messages
   * @returns A list of preprocessed to-device messages.
   */
  async preprocessToDeviceMessages(events) {
    // send the received to-device messages into receiveSyncChanges. We have no info on device-list changes,
    // one-time-keys, or fallback keys, so just pass empty data.
    const result = await this.olmMachine.receiveSyncChanges(JSON.stringify(events), new RustSdkCryptoJs.DeviceLists(), new Map(), new Set());

    // receiveSyncChanges returns a JSON-encoded list of decrypted to-device messages.
    return JSON.parse(result);
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
      this.roomEncryptors[room.roomId] = new _RoomEncryptor.RoomEncryptor(this.olmMachine, this.keyClaimManager, room, config);
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