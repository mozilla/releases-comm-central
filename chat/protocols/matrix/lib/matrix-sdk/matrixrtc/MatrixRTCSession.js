"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixRTCSessionEvent = exports.MatrixRTCSession = void 0;
var _logger = require("../logger");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _eventTimeline = require("../models/event-timeline");
var _event = require("../@types/event");
var _requests = require("../@types/requests");
var _CallMembership = require("./CallMembership");
var _roomState = require("../models/room-state");
var _randomstring = require("../randomstring");
var _base = require("../base64");
var _membership = require("../@types/membership");
var _LivekitFocus = require("./LivekitFocus");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
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
const MEMBERSHIP_EXPIRY_TIME = 60 * 60 * 1000;
const MEMBER_EVENT_CHECK_PERIOD = 2 * 60 * 1000; // How often we check to see if we need to re-send our member event
const CALL_MEMBER_EVENT_RETRY_DELAY_MIN = 3000;
const UPDATE_ENCRYPTION_KEY_THROTTLE = 3000;

// A delay after a member leaves before we create and publish a new key, because people
// tend to leave calls at the same time
const MAKE_KEY_DELAY = 3000;
// The delay between creating and sending a new key and starting to encrypt with it. This gives others
// a chance to receive the new key to minimise the chance they don't get media they can't decrypt.
// The total time between a member leaving and the call switching to new keys is therefore
// MAKE_KEY_DELAY + SEND_KEY_DELAY
const USE_KEY_DELAY = 5000;
const getParticipantId = (userId, deviceId) => `${userId}:${deviceId}`;
const getParticipantIdFromMembership = m => getParticipantId(m.sender, m.deviceId);
function keysEqual(a, b) {
  if (a === b) return true;
  return a && b && a.length === b.length && a.every((x, i) => x === b[i]);
}
let MatrixRTCSessionEvent = exports.MatrixRTCSessionEvent = /*#__PURE__*/function (MatrixRTCSessionEvent) {
  MatrixRTCSessionEvent["MembershipsChanged"] = "memberships_changed";
  MatrixRTCSessionEvent["JoinStateChanged"] = "join_state_changed";
  MatrixRTCSessionEvent["EncryptionKeyChanged"] = "encryption_key_changed";
  return MatrixRTCSessionEvent;
}({});
/**
 * A MatrixRTCSession manages the membership & properties of a MatrixRTC session.
 * This class doesn't deal with media at all, just membership & properties of a session.
 */
class MatrixRTCSession extends _typedEventEmitter.TypedEventEmitter {
  /**
   * The callId (sessionId) of the call.
   *
   * It can be undefined since the callId is only known once the first membership joins.
   * The callId is the property that, per definition, groups memberships into one call.
   */
  get callId() {
    return this._callId;
  }
  /**
   * Returns all the call memberships for a room, oldest first
   */
  static callMembershipsForRoom(room) {
    const roomState = room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
    if (!roomState) {
      _logger.logger.warn("Couldn't get state for room " + room.roomId);
      throw new Error("Could't get state for room " + room.roomId);
    }
    const callMemberEvents = roomState.getStateEvents(_event.EventType.GroupCallMemberPrefix);
    const callMemberships = [];
    for (const memberEvent of callMemberEvents) {
      const content = memberEvent.getContent();
      const eventKeysCount = Object.keys(content).length;
      // Dont even bother about empty events (saves us from costly type/"key in" checks in bigger rooms)
      if (eventKeysCount === 0) continue;
      let membershipContents = [];

      // We first decide if its a MSC4143 event (per device state key)
      if (eventKeysCount > 1 && "focus_active" in content) {
        // We have a MSC4143 event membership event
        membershipContents.push(content);
      } else if (eventKeysCount === 1 && "memberships" in content) {
        // we have a legacy (one event for all devices) event
        if (!Array.isArray(content["memberships"])) {
          _logger.logger.warn(`Malformed member event from ${memberEvent.getSender()}: memberships is not an array`);
          continue;
        }
        membershipContents = content["memberships"];
      }
      if (membershipContents.length === 0) continue;
      for (const membershipData of membershipContents) {
        try {
          const membership = new _CallMembership.CallMembership(memberEvent, membershipData);
          if (membership.callId !== "" || membership.scope !== "m.room") {
            // for now, just ignore anything that isn't a room scope call
            _logger.logger.info(`Ignoring user-scoped call`);
            continue;
          }
          if (membership.isExpired()) {
            _logger.logger.info(`Ignoring expired device membership ${membership.sender}/${membership.deviceId}`);
            continue;
          }
          if (!room.hasMembershipState(membership.sender ?? "", _membership.KnownMembership.Join)) {
            _logger.logger.info(`Ignoring membership of user ${membership.sender} who is not in the room.`);
            continue;
          }
          callMemberships.push(membership);
        } catch (e) {
          _logger.logger.warn("Couldn't construct call membership: ", e);
        }
      }
    }
    callMemberships.sort((a, b) => a.createdTs() - b.createdTs());
    if (callMemberships.length > 1) {
      _logger.logger.debug(`Call memberships in room ${room.roomId}, in order: `, callMemberships.map(m => [m.createdTs(), m.sender]));
    }
    return callMemberships;
  }

  /**
   * Return the MatrixRTC session for the room, whether there are currently active members or not
   */
  static roomSessionForRoom(client, room) {
    const callMemberships = MatrixRTCSession.callMembershipsForRoom(room);
    return new MatrixRTCSession(client, room, callMemberships);
  }
  constructor(client, room, memberships) {
    super();
    this.client = client;
    this.room = room;
    this.memberships = memberships;
    // The session Id of the call, this is the call_id of the call Member event.
    _defineProperty(this, "_callId", void 0);
    // How many ms after we joined the call, that our membership should expire, or undefined
    // if we're not yet joined
    _defineProperty(this, "relativeExpiry", void 0);
    // An identifier for our membership of the call. This will allow us to easily recognise
    // whether a membership was sent by this session or is stale from some other time.
    // It also forces our membership events to be unique, because otherwise we could try
    // to overwrite a membership from a previous session but it would do nothing because the
    // event content would be identical. We need the origin_server_ts to update though, so
    // forcing unique content fixes this.
    _defineProperty(this, "membershipId", void 0);
    _defineProperty(this, "memberEventTimeout", void 0);
    _defineProperty(this, "expiryTimeout", void 0);
    _defineProperty(this, "keysEventUpdateTimeout", void 0);
    _defineProperty(this, "makeNewKeyTimeout", void 0);
    _defineProperty(this, "setNewKeyTimeouts", new Set());
    // This is a Focus with the specified fields for an ActiveFocus (e.g. LivekitFocusActive for type="livekit")
    _defineProperty(this, "ownFocusActive", void 0);
    // This is a Foci array that contains the Focus objects this user is aware of and proposes to use.
    _defineProperty(this, "ownFociPreferred", void 0);
    _defineProperty(this, "updateCallMembershipRunning", false);
    _defineProperty(this, "needCallMembershipUpdate", false);
    _defineProperty(this, "manageMediaKeys", false);
    _defineProperty(this, "useLegacyMemberEvents", true);
    // userId:deviceId => array of keys
    _defineProperty(this, "encryptionKeys", new Map());
    _defineProperty(this, "lastEncryptionKeyUpdateRequest", void 0);
    /**
     * Re-sends the encryption keys room event
     */
    _defineProperty(this, "sendEncryptionKeysEvent", async () => {
      if (this.keysEventUpdateTimeout !== undefined) {
        clearTimeout(this.keysEventUpdateTimeout);
        this.keysEventUpdateTimeout = undefined;
      }
      this.lastEncryptionKeyUpdateRequest = Date.now();
      _logger.logger.info("Sending encryption keys event");
      if (!this.isJoined()) return;
      const userId = this.client.getUserId();
      const deviceId = this.client.getDeviceId();
      if (!userId) throw new Error("No userId");
      if (!deviceId) throw new Error("No deviceId");
      const myKeys = this.getKeysForParticipant(userId, deviceId);
      if (!myKeys) {
        _logger.logger.warn("Tried to send encryption keys event but no keys found!");
        return;
      }
      try {
        await this.client.sendEvent(this.room.roomId, _event.EventType.CallEncryptionKeysPrefix, {
          keys: myKeys.map((key, index) => {
            return {
              index,
              key: (0, _base.encodeUnpaddedBase64)(key)
            };
          }),
          device_id: deviceId,
          call_id: ""
        });
        _logger.logger.debug(`Embedded-E2EE-LOG updateEncryptionKeyEvent participantId=${userId}:${deviceId} numSent=${myKeys.length}`, this.encryptionKeys);
      } catch (error) {
        const matrixError = error;
        if (matrixError.event) {
          // cancel the pending event: we'll just generate a new one with our latest
          // keys when we resend
          this.client.cancelPendingEvent(matrixError.event);
        }
        if (this.keysEventUpdateTimeout === undefined) {
          const resendDelay = matrixError.data?.retry_after_ms ?? 5000;
          _logger.logger.warn(`Failed to send m.call.encryption_key, retrying in ${resendDelay}`, error);
          this.keysEventUpdateTimeout = setTimeout(this.sendEncryptionKeysEvent, resendDelay);
        } else {
          _logger.logger.info("Not scheduling key resend as another re-send is already pending");
        }
      }
    });
    _defineProperty(this, "onCallEncryption", event => {
      const userId = event.getSender();
      const content = event.getContent();
      const deviceId = content["device_id"];
      const callId = content["call_id"];
      if (!userId) {
        _logger.logger.warn(`Received m.call.encryption_keys with no userId: callId=${callId}`);
        return;
      }

      // We currently only handle callId = "" (which is the default for room scoped calls)
      if (callId !== "") {
        _logger.logger.warn(`Received m.call.encryption_keys with unsupported callId: userId=${userId}, deviceId=${deviceId}, callId=${callId}`);
        return;
      }
      if (!Array.isArray(content.keys)) {
        _logger.logger.warn(`Received m.call.encryption_keys where keys wasn't an array: callId=${callId}`);
        return;
      }
      if (userId === this.client.getUserId() && deviceId === this.client.getDeviceId()) {
        // We store our own sender key in the same set along with keys from others, so it's
        // important we don't allow our own keys to be set by one of these events (apart from
        // the fact that we don't need it anyway because we already know our own keys).
        _logger.logger.info("Ignoring our own keys event");
        return;
      }
      for (const key of content.keys) {
        if (!key) {
          _logger.logger.info("Ignoring false-y key in keys event");
          continue;
        }
        const encryptionKey = key.key;
        const encryptionKeyIndex = key.index;
        if (!encryptionKey || encryptionKeyIndex === undefined || encryptionKeyIndex === null || callId === undefined || callId === null || typeof deviceId !== "string" || typeof callId !== "string" || typeof encryptionKey !== "string" || typeof encryptionKeyIndex !== "number") {
          _logger.logger.warn(`Malformed call encryption_key: userId=${userId}, deviceId=${deviceId}, encryptionKeyIndex=${encryptionKeyIndex} callId=${callId}`);
        } else {
          _logger.logger.debug(`Embedded-E2EE-LOG onCallEncryption userId=${userId}:${deviceId} encryptionKeyIndex=${encryptionKeyIndex}`, this.encryptionKeys);
          this.setEncryptionKey(userId, deviceId, encryptionKeyIndex, encryptionKey);
        }
      }
    });
    _defineProperty(this, "onMembershipUpdate", () => {
      const oldMemberships = this.memberships;
      this.memberships = MatrixRTCSession.callMembershipsForRoom(this.room);
      this._callId = this._callId ?? this.memberships[0]?.callId;
      const changed = oldMemberships.length != this.memberships.length || oldMemberships.some((m, i) => !_CallMembership.CallMembership.equal(m, this.memberships[i]));
      if (changed) {
        _logger.logger.info(`Memberships for call in room ${this.room.roomId} have changed: emitting`);
        this.emit(MatrixRTCSessionEvent.MembershipsChanged, oldMemberships, this.memberships);
      }
      const isMyMembership = m => m.sender === this.client.getUserId() && m.deviceId === this.client.getDeviceId();
      if (this.manageMediaKeys && this.isJoined() && this.makeNewKeyTimeout === undefined) {
        const oldMebershipIds = new Set(oldMemberships.filter(m => !isMyMembership(m)).map(getParticipantIdFromMembership));
        const newMebershipIds = new Set(this.memberships.filter(m => !isMyMembership(m)).map(getParticipantIdFromMembership));
        const anyLeft = Array.from(oldMebershipIds).some(x => !newMebershipIds.has(x));
        const anyJoined = Array.from(newMebershipIds).some(x => !oldMebershipIds.has(x));
        if (anyLeft) {
          _logger.logger.debug(`Member(s) have left: queueing sender key rotation`);
          this.makeNewKeyTimeout = setTimeout(this.onRotateKeyTimeout, MAKE_KEY_DELAY);
        } else if (anyJoined) {
          _logger.logger.debug(`New member(s) have joined: re-sending keys`);
          this.requestKeyEventSend();
        }
      }
      this.setExpiryTimer();
    });
    _defineProperty(this, "triggerCallMembershipEventUpdate", async () => {
      if (this.updateCallMembershipRunning) {
        this.needCallMembershipUpdate = true;
        return;
      }
      this.updateCallMembershipRunning = true;
      try {
        // if anything triggers an update while the update is running, do another update afterwards
        do {
          this.needCallMembershipUpdate = false;
          await this.updateCallMembershipEvent();
        } while (this.needCallMembershipUpdate);
      } finally {
        this.updateCallMembershipRunning = false;
      }
    });
    _defineProperty(this, "onRotateKeyTimeout", () => {
      if (!this.manageMediaKeys) return;
      this.makeNewKeyTimeout = undefined;
      _logger.logger.info("Making new sender key for key rotation");
      this.makeNewSenderKey(true);
      // send immediately: if we're about to start sending with a new key, it's
      // important we get it out to others as soon as we can.
      this.sendEncryptionKeysEvent();
    });
    this._callId = memberships[0]?.callId;
    const roomState = this.room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
    roomState?.on(_roomState.RoomStateEvent.Members, this.onMembershipUpdate);
    this.setExpiryTimer();
  }

  /*
   * Returns true if we intend to be participating in the MatrixRTC session.
   * This is determined by checking if the relativeExpiry has been set.
   */
  isJoined() {
    return this.relativeExpiry !== undefined;
  }

  /**
   * Performs cleanup & removes timers for client shutdown
   */
  async stop() {
    await this.leaveRoomSession(1000);
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout);
      this.expiryTimeout = undefined;
    }
    if (this.memberEventTimeout) {
      clearTimeout(this.memberEventTimeout);
      this.memberEventTimeout = undefined;
    }
    const roomState = this.room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
    roomState?.off(_roomState.RoomStateEvent.Members, this.onMembershipUpdate);
  }

  /**
   * Announces this user and device as joined to the MatrixRTC session,
   * and continues to update the membership event to keep it valid until
   * leaveRoomSession() is called
   * This will not subscribe to updates: remember to call subscribe() separately if
   * desired.
   * This method will return immediately and the session will be joined in the background.
   *
   * @param fociActive - The object representing the active focus. (This depends on the focus type.)
   * @param fociPreferred - The list of preferred foci this member proposes to use/knows/has access to.
   *                        For the livekit case this is a list of foci generated from the homeserver well-known, the current rtc session,
   *                        or optionally other room members homeserver well known.
   * @param joinConfig - Additional configuration for the joined session.
   */
  joinRoomSession(fociPreferred, fociActive, joinConfig) {
    if (this.isJoined()) {
      _logger.logger.info(`Already joined to session in room ${this.room.roomId}: ignoring join call`);
      return;
    }
    this.ownFocusActive = fociActive;
    this.ownFociPreferred = fociPreferred;
    this.relativeExpiry = MEMBERSHIP_EXPIRY_TIME;
    this.manageMediaKeys = joinConfig?.manageMediaKeys ?? this.manageMediaKeys;
    this.useLegacyMemberEvents = joinConfig?.useLegacyMemberEvents ?? this.useLegacyMemberEvents;
    this.membershipId = (0, _randomstring.randomString)(5);
    _logger.logger.info(`Joining call session in room ${this.room.roomId} with manageMediaKeys=${this.manageMediaKeys}`);
    if (joinConfig?.manageMediaKeys) {
      this.makeNewSenderKey();
      this.requestKeyEventSend();
    }
    // We don't wait for this, mostly because it may fail and schedule a retry, so this
    // function returning doesn't really mean anything at all.
    this.triggerCallMembershipEventUpdate();
    this.emit(MatrixRTCSessionEvent.JoinStateChanged, true);
  }

  /**
   * Announces this user and device as having left the MatrixRTC session
   * and stops scheduled updates.
   * This will not unsubscribe from updates: remember to call unsubscribe() separately if
   * desired.
   * The membership update required to leave the session will retry if it fails.
   * Without network connection the promise will never resolve.
   * A timeout can be provided so that there is a guarantee for the promise to resolve.
   */
  async leaveRoomSession(timeout = undefined) {
    if (!this.isJoined()) {
      _logger.logger.info(`Not joined to session in room ${this.room.roomId}: ignoring leave call`);
      return new Promise(resolve => resolve(false));
    }
    const userId = this.client.getUserId();
    const deviceId = this.client.getDeviceId();
    if (!userId) throw new Error("No userId");
    if (!deviceId) throw new Error("No deviceId");

    // clear our encryption keys as we're done with them now (we'll
    // make new keys if we rejoin). We leave keys for other participants
    // as they may still be using the same ones.
    this.encryptionKeys.set(getParticipantId(userId, deviceId), []);
    if (this.makeNewKeyTimeout !== undefined) {
      clearTimeout(this.makeNewKeyTimeout);
      this.makeNewKeyTimeout = undefined;
    }
    for (const t of this.setNewKeyTimeouts) {
      clearTimeout(t);
    }
    this.setNewKeyTimeouts.clear();
    _logger.logger.info(`Leaving call session in room ${this.room.roomId}`);
    this.relativeExpiry = undefined;
    this.ownFocusActive = undefined;
    this.manageMediaKeys = false;
    this.membershipId = undefined;
    this.emit(MatrixRTCSessionEvent.JoinStateChanged, false);
    const timeoutPromise = new Promise(r => {
      if (timeout) {
        // will never resolve if timeout is not set
        setTimeout(r, timeout, "timeout");
      }
    });
    return new Promise(resolve => {
      Promise.race([this.triggerCallMembershipEventUpdate(), timeoutPromise]).then(value => {
        // The timeoutPromise returns the string 'timeout' and the membership update void
        // A success implies that the membership update was quicker then the timeout.
        resolve(value != "timeout");
      });
    });
  }
  getActiveFocus() {
    if (this.ownFocusActive && (0, _LivekitFocus.isLivekitFocusActive)(this.ownFocusActive)) {
      // A livekit active focus
      if (this.ownFocusActive.focus_selection === "oldest_membership") {
        const oldestMembership = this.getOldestMembership();
        return oldestMembership?.getPreferredFoci()[0];
      }
    }
    if (!this.ownFocusActive) {
      // we use the legacy call.member events so default to oldest member
      const oldestMembership = this.getOldestMembership();
      return oldestMembership?.getPreferredFoci()[0];
    }
  }
  getKeysForParticipant(userId, deviceId) {
    return this.encryptionKeys.get(getParticipantId(userId, deviceId));
  }

  /**
   * A map of keys used to encrypt and decrypt (we are using a symmetric
   * cipher) given participant's media. This also includes our own key
   */
  getEncryptionKeys() {
    return this.encryptionKeys.entries();
  }
  getNewEncryptionKeyIndex() {
    const userId = this.client.getUserId();
    const deviceId = this.client.getDeviceId();
    if (!userId) throw new Error("No userId!");
    if (!deviceId) throw new Error("No deviceId!");
    return (this.getKeysForParticipant(userId, deviceId)?.length ?? 0) % 16;
  }

  /**
   * Sets an encryption key at a specified index for a participant.
   * The encryption keys for the local participanmt are also stored here under the
   * user and device ID of the local participant.
   * @param userId - The user ID of the participant
   * @param deviceId - Device ID of the participant
   * @param encryptionKeyIndex - The index of the key to set
   * @param encryptionKeyString - The string representation of the key to set in base64
   * @param delayBeforeuse - If true, delay before emitting a key changed event. Useful when setting
   *                         encryption keys for the local participant to allow time for the key to
   *                         be distributed.
   */
  setEncryptionKey(userId, deviceId, encryptionKeyIndex, encryptionKeyString, delayBeforeuse = false) {
    const keyBin = (0, _base.decodeBase64)(encryptionKeyString);
    const participantId = getParticipantId(userId, deviceId);
    const encryptionKeys = this.encryptionKeys.get(participantId) ?? [];
    if (keysEqual(encryptionKeys[encryptionKeyIndex], keyBin)) return;
    encryptionKeys[encryptionKeyIndex] = keyBin;
    this.encryptionKeys.set(participantId, encryptionKeys);
    if (delayBeforeuse) {
      const useKeyTimeout = setTimeout(() => {
        this.setNewKeyTimeouts.delete(useKeyTimeout);
        _logger.logger.info(`Delayed-emitting key changed event for ${participantId} idx ${encryptionKeyIndex}`);
        this.emit(MatrixRTCSessionEvent.EncryptionKeyChanged, keyBin, encryptionKeyIndex, participantId);
      }, USE_KEY_DELAY);
      this.setNewKeyTimeouts.add(useKeyTimeout);
    } else {
      this.emit(MatrixRTCSessionEvent.EncryptionKeyChanged, keyBin, encryptionKeyIndex, participantId);
    }
  }

  /**
   * Generate a new sender key and add it at the next available index
   * @param delayBeforeUse - If true, wait for a short period before setting the key for the
   *                         media encryptor to use. If false, set the key immediately.
   */
  makeNewSenderKey(delayBeforeUse = false) {
    const userId = this.client.getUserId();
    const deviceId = this.client.getDeviceId();
    if (!userId) throw new Error("No userId");
    if (!deviceId) throw new Error("No deviceId");
    const encryptionKey = (0, _randomstring.secureRandomBase64Url)(16);
    const encryptionKeyIndex = this.getNewEncryptionKeyIndex();
    _logger.logger.info("Generated new key at index " + encryptionKeyIndex);
    this.setEncryptionKey(userId, deviceId, encryptionKeyIndex, encryptionKey, delayBeforeUse);
  }

  /**
   * Requests that we resend our keys to the room. May send a keys event immediately
   * or queue for alter if one has already been sent recently.
   */
  requestKeyEventSend() {
    if (!this.manageMediaKeys) return;
    if (this.lastEncryptionKeyUpdateRequest && this.lastEncryptionKeyUpdateRequest + UPDATE_ENCRYPTION_KEY_THROTTLE > Date.now()) {
      _logger.logger.info("Last encryption key event sent too recently: postponing");
      if (this.keysEventUpdateTimeout === undefined) {
        this.keysEventUpdateTimeout = setTimeout(this.sendEncryptionKeysEvent, UPDATE_ENCRYPTION_KEY_THROTTLE);
      }
      return;
    }
    this.sendEncryptionKeysEvent();
  }
  /**
   * Sets a timer for the soonest membership expiry
   */
  setExpiryTimer() {
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout);
      this.expiryTimeout = undefined;
    }
    let soonestExpiry;
    for (const membership of this.memberships) {
      const thisExpiry = membership.getMsUntilExpiry();
      // If getMsUntilExpiry is undefined we have a MSC4143 (MatrixRTC) compliant event - it never expires
      // but will be reliably resent on disconnect.
      if (thisExpiry !== undefined && (soonestExpiry === undefined || thisExpiry < soonestExpiry)) {
        soonestExpiry = thisExpiry;
      }
    }
    if (soonestExpiry != undefined) {
      this.expiryTimeout = setTimeout(this.onMembershipUpdate, soonestExpiry);
    }
  }
  getOldestMembership() {
    return this.memberships[0];
  }
  getFocusInUse() {
    const oldestMembership = this.getOldestMembership();
    if (oldestMembership?.getFocusSelection() === "oldest_membership") {
      return oldestMembership.getPreferredFoci()[0];
    }
  }
  /**
   * Constructs our own membership
   * @param prevMembership - The previous value of our call membership, if any
   */
  makeMyMembershipLegacy(deviceId, prevMembership) {
    if (this.relativeExpiry === undefined) {
      throw new Error("Tried to create our own membership event when we're not joined!");
    }
    if (this.membershipId === undefined) {
      throw new Error("Tried to create our own membership event when we have no membership ID!");
    }
    const createdTs = prevMembership?.createdTs();
    return _objectSpread({
      call_id: "",
      scope: "m.room",
      application: "m.call",
      device_id: deviceId,
      expires: this.relativeExpiry,
      // TODO: Date.now() should be the origin_server_ts (now).
      expires_ts: this.relativeExpiry + (createdTs ?? Date.now()),
      // we use the fociPreferred since this is the list of foci.
      // it is named wrong in the Legacy events.
      foci_active: this.ownFociPreferred,
      membershipID: this.membershipId
    }, createdTs ? {
      created_ts: createdTs
    } : {});
  }
  /**
   * Constructs our own membership
   */
  makeMyMembership(deviceId) {
    return {
      call_id: "",
      scope: "m.room",
      application: "m.call",
      device_id: deviceId,
      focus_active: {
        type: "livekit",
        focus_selection: "oldest_membership"
      },
      foci_preferred: this.ownFociPreferred ?? []
    };
  }

  /**
   * Returns true if our membership event needs to be updated
   */
  membershipEventNeedsUpdate(myPrevMembershipData, myPrevMembership) {
    if (myPrevMembership && myPrevMembership.getMsUntilExpiry() === undefined) return false;

    // Need to update if there's a membership for us but we're not joined (valid or otherwise)
    if (!this.isJoined()) return !!myPrevMembershipData;

    // ...or if we are joined, but there's no valid membership event
    if (!myPrevMembership) return true;
    const expiryTime = myPrevMembership.getMsUntilExpiry();
    if (expiryTime !== undefined && expiryTime < MEMBERSHIP_EXPIRY_TIME / 2) {
      // ...or if the expiry time needs bumping
      this.relativeExpiry += MEMBERSHIP_EXPIRY_TIME;
      return true;
    }
    return false;
  }
  makeNewMembership(deviceId) {
    // If we're joined, add our own
    if (this.isJoined()) {
      return this.makeMyMembership(deviceId);
    }
    return {};
  }
  /**
   * Makes a new membership list given the old list alonng with this user's previous membership event
   * (if any) and this device's previous membership (if any)
   */
  makeNewLegacyMemberships(oldMemberships, localDeviceId, myCallMemberEvent, myPrevMembership) {
    const filterExpired = m => {
      let membershipObj;
      try {
        membershipObj = new _CallMembership.CallMembership(myCallMemberEvent, m);
      } catch (e) {
        return false;
      }
      return !membershipObj.isExpired();
    };
    const transformMemberships = m => {
      if (m.created_ts === undefined) {
        // we need to fill this in with the origin_server_ts from its original event
        m.created_ts = myCallMemberEvent.getTs();
      }
      return m;
    };

    // Filter our any invalid or expired memberships, and also our own - we'll add that back in next
    let newMemberships = oldMemberships.filter(filterExpired).filter(m => m.device_id !== localDeviceId);

    // Fix up any memberships that need their created_ts adding
    newMemberships = newMemberships.map(transformMemberships);

    // If we're joined, add our own
    if (this.isJoined()) {
      newMemberships.push(this.makeMyMembershipLegacy(localDeviceId, myPrevMembership));
    }
    return {
      memberships: newMemberships
    };
  }
  async updateCallMembershipEvent() {
    if (this.memberEventTimeout) {
      clearTimeout(this.memberEventTimeout);
      this.memberEventTimeout = undefined;
    }
    const roomState = this.room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
    if (!roomState) throw new Error("Couldn't get room state for room " + this.room.roomId);
    const localUserId = this.client.getUserId();
    const localDeviceId = this.client.getDeviceId();
    if (!localUserId || !localDeviceId) throw new Error("User ID or device ID was null!");
    const callMemberEvents = roomState.events.get(_event.EventType.GroupCallMemberPrefix);
    const legacy = !!this.useLegacyMemberEvents || callMemberEvents?.size && this.stateEventsContainOngoingLegacySession(callMemberEvents);
    let newContent = {};
    if (legacy) {
      const myCallMemberEvent = callMemberEvents?.get(localUserId);
      const content = myCallMemberEvent?.getContent() ?? {};
      let myPrevMembership;
      // We know its CallMembershipDataLegacy
      const memberships = Array.isArray(content["memberships"]) ? content["memberships"] : [];
      const myPrevMembershipData = memberships.find(m => m.device_id === localDeviceId);
      try {
        if (myCallMemberEvent && myPrevMembershipData && (0, _CallMembership.isLegacyCallMembershipData)(myPrevMembershipData) && myPrevMembershipData.membershipID === this.membershipId) {
          myPrevMembership = new _CallMembership.CallMembership(myCallMemberEvent, myPrevMembershipData);
        }
      } catch (e) {
        // This would indicate a bug or something weird if our own call membership
        // wasn't valid
        _logger.logger.warn("Our previous call membership was invalid - this shouldn't happen.", e);
      }
      if (myPrevMembership) {
        _logger.logger.debug(`${myPrevMembership.getMsUntilExpiry()} until our membership expires`);
      }
      if (!this.membershipEventNeedsUpdate(myPrevMembershipData, myPrevMembership)) {
        // nothing to do - reschedule the check again
        this.memberEventTimeout = setTimeout(this.triggerCallMembershipEventUpdate, MEMBER_EVENT_CHECK_PERIOD);
        return;
      }
      newContent = this.makeNewLegacyMemberships(memberships, localDeviceId, myCallMemberEvent, myPrevMembership);
    } else {
      newContent = this.makeNewMembership(localDeviceId);
    }
    const stateKey = legacy ? localUserId : this.makeMembershipStateKey(localUserId, localDeviceId);
    try {
      await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallMemberPrefix, newContent, stateKey);
      _logger.logger.info(`Sent updated call member event.`);

      // check periodically to see if we need to refresh our member event
      if (this.isJoined()) {
        if (legacy) {
          this.memberEventTimeout = setTimeout(this.triggerCallMembershipEventUpdate, MEMBER_EVENT_CHECK_PERIOD);
        } else {
          try {
            // TODO: If delayed event times out, re-join!
            const res = await this.client._unstable_sendDelayedStateEvent(this.room.roomId, {
              delay: 8000
            }, _event.EventType.GroupCallMemberPrefix, {},
            // leave event
            stateKey);
            this.scheduleDelayDisconnection(res.delay_id);
          } catch (e) {
            _logger.logger.error("Failed to send delayed event:", e);
          }
        }
      }
    } catch (e) {
      const resendDelay = CALL_MEMBER_EVENT_RETRY_DELAY_MIN + Math.random() * 2000;
      _logger.logger.warn(`Failed to send call member event (retrying in ${resendDelay}): ${e}`);
      await new Promise(resolve => setTimeout(resolve, resendDelay));
      await this.triggerCallMembershipEventUpdate();
    }
  }
  scheduleDelayDisconnection(delayId) {
    this.memberEventTimeout = setTimeout(() => this.delayDisconnection(delayId), 5000);
  }
  async delayDisconnection(delayId) {
    try {
      await this.client._unstable_updateDelayedEvent(delayId, _requests.UpdateDelayedEventAction.Restart);
      this.scheduleDelayDisconnection(delayId);
    } catch (e) {
      _logger.logger.error("Failed to delay our disconnection event", e);
    }
  }
  stateEventsContainOngoingLegacySession(callMemberEvents) {
    for (const callMemberEvent of callMemberEvents.values()) {
      const content = callMemberEvent.getContent();
      if (Array.isArray(content["memberships"])) {
        for (const membership of content.memberships) {
          if (!new _CallMembership.CallMembership(callMemberEvent, membership).isExpired()) {
            return true;
          }
        }
      }
    }
    return false;
  }
  makeMembershipStateKey(localUserId, localDeviceId) {
    const stateKey = `${localUserId}_${localDeviceId}`;
    if (/^org\.matrix\.msc(3757|3779)\b/.exec(this.room.getVersion())) {
      return stateKey;
    } else {
      return `_${stateKey}`;
    }
  }
}
exports.MatrixRTCSession = MatrixRTCSession;