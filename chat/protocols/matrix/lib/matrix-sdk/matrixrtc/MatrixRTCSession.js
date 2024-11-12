"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixRTCSessionEvent = exports.MatrixRTCSession = void 0;
var _logger = require("../logger.js");
var _typedEventEmitter = require("../models/typed-event-emitter.js");
var _eventTimeline = require("../models/event-timeline.js");
var _event = require("../@types/event.js");
var _requests = require("../@types/requests.js");
var _CallMembership = require("./CallMembership.js");
var _roomState = require("../models/room-state.js");
var _randomstring = require("../randomstring.js");
var _base = require("../base64.js");
var _membership = require("../@types/membership.js");
var _LivekitFocus = require("./LivekitFocus.js");
var _utils = require("../utils.js");
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
const logger = _logger.logger.getChild("MatrixRTCSession");
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
  return !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
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
      logger.warn("Couldn't get state for room " + room.roomId);
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
          logger.warn(`Malformed member event from ${memberEvent.getSender()}: memberships is not an array`);
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
            logger.info(`Ignoring user-scoped call`);
            continue;
          }
          if (membership.isExpired()) {
            logger.info(`Ignoring expired device membership ${membership.sender}/${membership.deviceId}`);
            continue;
          }
          if (!room.hasMembershipState(membership.sender ?? "", _membership.KnownMembership.Join)) {
            logger.info(`Ignoring membership of user ${membership.sender} who is not in the room.`);
            continue;
          }
          callMemberships.push(membership);
        } catch (e) {
          logger.warn("Couldn't construct call membership: ", e);
        }
      }
    }
    callMemberships.sort((a, b) => a.createdTs() - b.createdTs());
    if (callMemberships.length > 1) {
      logger.debug(`Call memberships in room ${room.roomId}, in order: `, callMemberships.map(m => [m.createdTs(), m.sender]));
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
    // userId:deviceId => array of (key, timestamp)
    _defineProperty(this, "encryptionKeys", new Map());
    _defineProperty(this, "lastEncryptionKeyUpdateRequest", void 0);
    _defineProperty(this, "disconnectDelayId", void 0);
    // We use this to store the last membership fingerprints we saw, so we can proactively re-send encryption keys
    // if it looks like a membership has been updated.
    _defineProperty(this, "lastMembershipFingerprints", void 0);
    _defineProperty(this, "currentEncryptionKeyIndex", -1);
    /**
     * The statistics for this session.
     */
    _defineProperty(this, "statistics", {
      counters: {
        /**
         * The number of times we have sent a room event containing encryption keys.
         */
        roomEventEncryptionKeysSent: 0,
        /**
         * The number of times we have received a room event containing encryption keys.
         */
        roomEventEncryptionKeysReceived: 0
      },
      totals: {
        /**
         * The total age (in milliseconds) of all room events containing encryption keys that we have received.
         * We track the total age so that we can later calculate the average age of all keys received.
         */
        roomEventEncryptionKeysReceivedTotalAge: 0
      }
    });
    /**
     * Re-sends the encryption keys room event
     */
    _defineProperty(this, "sendEncryptionKeysEvent", async indexToSend => {
      if (this.keysEventUpdateTimeout !== undefined) {
        clearTimeout(this.keysEventUpdateTimeout);
        this.keysEventUpdateTimeout = undefined;
      }
      this.lastEncryptionKeyUpdateRequest = Date.now();
      if (!this.isJoined()) return;
      logger.info(`Sending encryption keys event. indexToSend=${indexToSend}`);
      const userId = this.client.getUserId();
      const deviceId = this.client.getDeviceId();
      if (!userId) throw new Error("No userId");
      if (!deviceId) throw new Error("No deviceId");
      const myKeys = this.getKeysForParticipant(userId, deviceId);
      if (!myKeys) {
        logger.warn("Tried to send encryption keys event but no keys found!");
        return;
      }
      if (typeof indexToSend !== "number" && this.currentEncryptionKeyIndex === -1) {
        logger.warn("Tried to send encryption keys event but no current key index found!");
        return;
      }
      const keyIndexToSend = indexToSend ?? this.currentEncryptionKeyIndex;
      const keyToSend = myKeys[keyIndexToSend];
      try {
        const content = {
          keys: [{
            index: keyIndexToSend,
            key: (0, _base.encodeUnpaddedBase64)(keyToSend)
          }],
          device_id: deviceId,
          call_id: "",
          sent_ts: Date.now()
        };
        this.statistics.counters.roomEventEncryptionKeysSent += 1;
        await this.client.sendEvent(this.room.roomId, _event.EventType.CallEncryptionKeysPrefix, content);
        logger.debug(`Embedded-E2EE-LOG updateEncryptionKeyEvent participantId=${userId}:${deviceId} numKeys=${myKeys.length} currentKeyIndex=${this.currentEncryptionKeyIndex} keyIndexToSend=${keyIndexToSend}`, this.encryptionKeys);
      } catch (error) {
        const matrixError = error;
        if (matrixError.event) {
          // cancel the pending event: we'll just generate a new one with our latest
          // keys when we resend
          this.client.cancelPendingEvent(matrixError.event);
        }
        if (this.keysEventUpdateTimeout === undefined) {
          const resendDelay = matrixError.data?.retry_after_ms ?? 5000;
          logger.warn(`Failed to send m.call.encryption_key, retrying in ${resendDelay}`, error);
          this.keysEventUpdateTimeout = setTimeout(this.sendEncryptionKeysEvent, resendDelay);
        } else {
          logger.info("Not scheduling key resend as another re-send is already pending");
        }
      }
    });
    /**
     * Process `m.call.encryption_keys` events to track the encryption keys for call participants.
     * This should be called each time the relevant event is received from a room timeline.
     * If the event is malformed then it will be logged and ignored.
     *
     * @param event the event to process
     */
    _defineProperty(this, "onCallEncryption", event => {
      const userId = event.getSender();
      const content = event.getContent();
      const deviceId = content["device_id"];
      const callId = content["call_id"];
      if (!userId) {
        logger.warn(`Received m.call.encryption_keys with no userId: callId=${callId}`);
        return;
      }

      // We currently only handle callId = "" (which is the default for room scoped calls)
      if (callId !== "") {
        logger.warn(`Received m.call.encryption_keys with unsupported callId: userId=${userId}, deviceId=${deviceId}, callId=${callId}`);
        return;
      }
      if (!Array.isArray(content.keys)) {
        logger.warn(`Received m.call.encryption_keys where keys wasn't an array: callId=${callId}`);
        return;
      }
      if (userId === this.client.getUserId() && deviceId === this.client.getDeviceId()) {
        // We store our own sender key in the same set along with keys from others, so it's
        // important we don't allow our own keys to be set by one of these events (apart from
        // the fact that we don't need it anyway because we already know our own keys).
        logger.info("Ignoring our own keys event");
        return;
      }
      this.statistics.counters.roomEventEncryptionKeysReceived += 1;
      const age = Date.now() - (typeof content.sent_ts === "number" ? content.sent_ts : event.getTs());
      this.statistics.totals.roomEventEncryptionKeysReceivedTotalAge += age;
      for (const key of content.keys) {
        if (!key) {
          logger.info("Ignoring false-y key in keys event");
          continue;
        }
        const encryptionKey = key.key;
        const encryptionKeyIndex = key.index;
        if (!encryptionKey || encryptionKeyIndex === undefined || encryptionKeyIndex === null || callId === undefined || callId === null || typeof deviceId !== "string" || typeof callId !== "string" || typeof encryptionKey !== "string" || typeof encryptionKeyIndex !== "number") {
          logger.warn(`Malformed call encryption_key: userId=${userId}, deviceId=${deviceId}, encryptionKeyIndex=${encryptionKeyIndex} callId=${callId}`);
        } else {
          logger.debug(`Embedded-E2EE-LOG onCallEncryption userId=${userId}:${deviceId} encryptionKeyIndex=${encryptionKeyIndex} age=${age}ms`, this.encryptionKeys);
          this.setEncryptionKey(userId, deviceId, encryptionKeyIndex, encryptionKey, event.getTs());
        }
      }
    });
    _defineProperty(this, "isMyMembership", m => m.sender === this.client.getUserId() && m.deviceId === this.client.getDeviceId());
    /**
     * Examines the latest call memberships and handles any encryption key sending or rotation that is needed.
     *
     * This function should be called when the room members or call memberships might have changed.
     */
    _defineProperty(this, "onMembershipUpdate", () => {
      const oldMemberships = this.memberships;
      this.memberships = MatrixRTCSession.callMembershipsForRoom(this.room);
      this._callId = this._callId ?? this.memberships[0]?.callId;
      const changed = oldMemberships.length != this.memberships.length || oldMemberships.some((m, i) => !_CallMembership.CallMembership.equal(m, this.memberships[i]));
      if (changed) {
        logger.info(`Memberships for call in room ${this.room.roomId} have changed: emitting`);
        this.emit(MatrixRTCSessionEvent.MembershipsChanged, oldMemberships, this.memberships);
      }
      if (this.manageMediaKeys && this.isJoined() && this.makeNewKeyTimeout === undefined) {
        const oldMembershipIds = new Set(oldMemberships.filter(m => !this.isMyMembership(m)).map(getParticipantIdFromMembership));
        const newMembershipIds = new Set(this.memberships.filter(m => !this.isMyMembership(m)).map(getParticipantIdFromMembership));

        // We can use https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/symmetricDifference
        // for this once available
        const anyLeft = Array.from(oldMembershipIds).some(x => !newMembershipIds.has(x));
        const anyJoined = Array.from(newMembershipIds).some(x => !oldMembershipIds.has(x));
        const oldFingerprints = this.lastMembershipFingerprints;
        // always store the fingerprints of these latest memberships
        this.storeLastMembershipFingerprints();
        if (anyLeft) {
          logger.debug(`Member(s) have left: queueing sender key rotation`);
          this.makeNewKeyTimeout = setTimeout(this.onRotateKeyTimeout, MAKE_KEY_DELAY);
        } else if (anyJoined) {
          logger.debug(`New member(s) have joined: re-sending keys`);
          this.requestSendCurrentKey();
        } else if (oldFingerprints) {
          // does it look like any of the members have updated their memberships?
          const newFingerprints = this.lastMembershipFingerprints;

          // We can use https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/symmetricDifference
          // for this once available
          const candidateUpdates = Array.from(oldFingerprints).some(x => !newFingerprints.has(x)) || Array.from(newFingerprints).some(x => !oldFingerprints.has(x));
          if (candidateUpdates) {
            logger.debug(`Member(s) have updated/reconnected: re-sending keys to everyone`);
            this.requestSendCurrentKey();
          }
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
    _defineProperty(this, "delayDisconnection", async () => {
      try {
        await this.client._unstable_updateDelayedEvent(this.disconnectDelayId, _requests.UpdateDelayedEventAction.Restart);
        this.scheduleDelayDisconnection();
      } catch (e) {
        // TODO: Retry if rate-limited
        logger.error("Failed to delay our disconnection event:", e);
      }
    });
    _defineProperty(this, "onRotateKeyTimeout", () => {
      if (!this.manageMediaKeys) return;
      this.makeNewKeyTimeout = undefined;
      logger.info("Making new sender key for key rotation");
      const newKeyIndex = this.makeNewSenderKey(true);
      // send immediately: if we're about to start sending with a new key, it's
      // important we get it out to others as soon as we can.
      this.sendEncryptionKeysEvent(newKeyIndex);
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
      logger.info(`Already joined to session in room ${this.room.roomId}: ignoring join call`);
      return;
    }
    this.ownFocusActive = fociActive;
    this.ownFociPreferred = fociPreferred;
    this.relativeExpiry = MEMBERSHIP_EXPIRY_TIME;
    this.manageMediaKeys = joinConfig?.manageMediaKeys ?? this.manageMediaKeys;
    this.useLegacyMemberEvents = joinConfig?.useLegacyMemberEvents ?? this.useLegacyMemberEvents;
    this.membershipId = (0, _randomstring.randomString)(5);
    logger.info(`Joining call session in room ${this.room.roomId} with manageMediaKeys=${this.manageMediaKeys}`);
    if (joinConfig?.manageMediaKeys) {
      this.makeNewSenderKey();
      this.requestSendCurrentKey();
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
   * @returns Whether the membership update was attempted and did not time out.
   */
  async leaveRoomSession(timeout = undefined) {
    if (!this.isJoined()) {
      logger.info(`Not joined to session in room ${this.room.roomId}: ignoring leave call`);
      return false;
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
    logger.info(`Leaving call session in room ${this.room.roomId}`);
    this.relativeExpiry = undefined;
    this.ownFocusActive = undefined;
    this.manageMediaKeys = false;
    this.membershipId = undefined;
    this.emit(MatrixRTCSessionEvent.JoinStateChanged, false);
    if (timeout) {
      // The sleep promise returns the string 'timeout' and the membership update void
      // A success implies that the membership update was quicker then the timeout.
      const raceResult = await Promise.race([this.triggerCallMembershipEventUpdate(), (0, _utils.sleep)(timeout, "timeout")]);
      return raceResult !== "timeout";
    } else {
      await this.triggerCallMembershipEventUpdate();
      return true;
    }
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

  /**
   * Re-emit an EncryptionKeyChanged event for each tracked encryption key. This can be used to export
   * the keys.
   */
  reemitEncryptionKeys() {
    this.encryptionKeys.forEach((keys, participantId) => {
      keys.forEach((key, index) => {
        this.emit(MatrixRTCSessionEvent.EncryptionKeyChanged, key.key, index, participantId);
      });
    });
  }

  /**
   * Get the known encryption keys for a given participant device.
   *
   * @param userId the user ID of the participant
   * @param deviceId the device ID of the participant
   * @returns The encryption keys for the given participant, or undefined if they are not known.
   *
   * @deprecated This will be made private in a future release.
   */
  getKeysForParticipant(userId, deviceId) {
    return this.getKeysForParticipantInternal(userId, deviceId);
  }
  getKeysForParticipantInternal(userId, deviceId) {
    return this.encryptionKeys.get(getParticipantId(userId, deviceId))?.map(entry => entry.key);
  }

  /**
   * A map of keys used to encrypt and decrypt (we are using a symmetric
   * cipher) given participant's media. This also includes our own key
   *
   * @deprecated This will be made private in a future release.
   */
  getEncryptionKeys() {
    // the returned array doesn't contain the timestamps
    return Array.from(this.encryptionKeys.entries()).map(([participantId, keys]) => [participantId, keys.map(k => k.key)]).values();
  }
  getNewEncryptionKeyIndex() {
    if (this.currentEncryptionKeyIndex === -1) {
      return 0;
    }

    // maximum key index is 255
    return (this.currentEncryptionKeyIndex + 1) % 256;
  }

  /**
   * Sets an encryption key at a specified index for a participant.
   * The encryption keys for the local participant are also stored here under the
   * user and device ID of the local participant.
   * If the key is older than the existing key at the index, it will be ignored.
   * @param userId - The user ID of the participant
   * @param deviceId - Device ID of the participant
   * @param encryptionKeyIndex - The index of the key to set
   * @param encryptionKeyString - The string representation of the key to set in base64
   * @param timestamp - The timestamp of the key. We assume that these are monotonic for each participant device.
   * @param delayBeforeUse - If true, delay before emitting a key changed event. Useful when setting
   *                         encryption keys for the local participant to allow time for the key to
   *                         be distributed.
   */
  setEncryptionKey(userId, deviceId, encryptionKeyIndex, encryptionKeyString, timestamp, delayBeforeUse = false) {
    const keyBin = (0, _base.decodeBase64)(encryptionKeyString);
    const participantId = getParticipantId(userId, deviceId);
    if (!this.encryptionKeys.has(participantId)) {
      this.encryptionKeys.set(participantId, []);
    }
    const participantKeys = this.encryptionKeys.get(participantId);
    const existingKeyAtIndex = participantKeys[encryptionKeyIndex];
    if (existingKeyAtIndex) {
      if (existingKeyAtIndex.timestamp > timestamp) {
        logger.info(`Ignoring new key at index ${encryptionKeyIndex} for ${participantId} as it is older than existing known key`);
        return;
      }
      if (keysEqual(existingKeyAtIndex.key, keyBin)) {
        existingKeyAtIndex.timestamp = timestamp;
        return;
      }
    }
    participantKeys[encryptionKeyIndex] = {
      key: keyBin,
      timestamp
    };
    if (delayBeforeUse) {
      const useKeyTimeout = setTimeout(() => {
        this.setNewKeyTimeouts.delete(useKeyTimeout);
        logger.info(`Delayed-emitting key changed event for ${participantId} idx ${encryptionKeyIndex}`);
        if (userId === this.client.getUserId() && deviceId === this.client.getDeviceId()) {
          this.currentEncryptionKeyIndex = encryptionKeyIndex;
        }
        this.emit(MatrixRTCSessionEvent.EncryptionKeyChanged, keyBin, encryptionKeyIndex, participantId);
      }, USE_KEY_DELAY);
      this.setNewKeyTimeouts.add(useKeyTimeout);
    } else {
      if (userId === this.client.getUserId() && deviceId === this.client.getDeviceId()) {
        this.currentEncryptionKeyIndex = encryptionKeyIndex;
      }
      this.emit(MatrixRTCSessionEvent.EncryptionKeyChanged, keyBin, encryptionKeyIndex, participantId);
    }
  }

  /**
   * Generate a new sender key and add it at the next available index
   * @param delayBeforeUse - If true, wait for a short period before setting the key for the
   *                         media encryptor to use. If false, set the key immediately.
   * @returns The index of the new key
   */
  makeNewSenderKey(delayBeforeUse = false) {
    const userId = this.client.getUserId();
    const deviceId = this.client.getDeviceId();
    if (!userId) throw new Error("No userId");
    if (!deviceId) throw new Error("No deviceId");
    const encryptionKey = (0, _randomstring.secureRandomBase64Url)(16);
    const encryptionKeyIndex = this.getNewEncryptionKeyIndex();
    logger.info("Generated new key at index " + encryptionKeyIndex);
    this.setEncryptionKey(userId, deviceId, encryptionKeyIndex, encryptionKey, Date.now(), delayBeforeUse);
    return encryptionKeyIndex;
  }

  /**
   * Requests that we resend our current keys to the room. May send a keys event immediately
   * or queue for alter if one has already been sent recently.
   */
  requestSendCurrentKey() {
    if (!this.manageMediaKeys) return;
    if (this.lastEncryptionKeyUpdateRequest && this.lastEncryptionKeyUpdateRequest + UPDATE_ENCRYPTION_KEY_THROTTLE > Date.now()) {
      logger.info("Last encryption key event sent too recently: postponing");
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
  storeLastMembershipFingerprints() {
    this.lastMembershipFingerprints = new Set(this.memberships.filter(m => !this.isMyMembership(m)).map(m => `${getParticipantIdFromMembership(m)}:${m.membershipID}:${m.createdTs()}`));
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
      } catch {
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
    const legacy = this.stateEventsContainOngoingLegacySession(callMemberEvents);
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
        logger.warn("Our previous call membership was invalid - this shouldn't happen.", e);
      }
      if (myPrevMembership) {
        logger.debug(`${myPrevMembership.getMsUntilExpiry()} until our membership expires`);
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
    try {
      if (legacy) {
        await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallMemberPrefix, newContent, localUserId);
        if (this.isJoined()) {
          // check periodically to see if we need to refresh our member event
          this.memberEventTimeout = setTimeout(this.triggerCallMembershipEventUpdate, MEMBER_EVENT_CHECK_PERIOD);
        }
      } else if (this.isJoined()) {
        const stateKey = this.makeMembershipStateKey(localUserId, localDeviceId);
        const prepareDelayedDisconnection = async () => {
          try {
            // TODO: If delayed event times out, re-join!
            const res = await this.client._unstable_sendDelayedStateEvent(this.room.roomId, {
              delay: 8000
            }, _event.EventType.GroupCallMemberPrefix, {},
            // leave event
            stateKey);
            this.disconnectDelayId = res.delay_id;
          } catch (e) {
            // TODO: Retry if rate-limited
            logger.error("Failed to prepare delayed disconnection event:", e);
          }
        };
        await prepareDelayedDisconnection();
        // Send join event _after_ preparing the delayed disconnection event
        await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallMemberPrefix, newContent, stateKey);
        // If sending state cancels your own delayed state, prepare another delayed state
        // TODO: Remove this once MSC4140 is stable & doesn't cancel own delayed state
        if (this.disconnectDelayId !== undefined) {
          try {
            await this.client._unstable_updateDelayedEvent(this.disconnectDelayId, _requests.UpdateDelayedEventAction.Restart);
          } catch (e) {
            // TODO: Make embedded client include errcode, and retry only if not M_NOT_FOUND (or rate-limited)
            logger.warn("Failed to update delayed disconnection event, prepare it again:", e);
            this.disconnectDelayId = undefined;
            await prepareDelayedDisconnection();
          }
        }
        if (this.disconnectDelayId !== undefined) {
          this.scheduleDelayDisconnection();
        }
      } else {
        let sentDelayedDisconnect = false;
        if (this.disconnectDelayId !== undefined) {
          try {
            await this.client._unstable_updateDelayedEvent(this.disconnectDelayId, _requests.UpdateDelayedEventAction.Send);
            sentDelayedDisconnect = true;
          } catch (e) {
            // TODO: Retry if rate-limited
            logger.error("Failed to send our delayed disconnection event:", e);
          }
          this.disconnectDelayId = undefined;
        }
        if (!sentDelayedDisconnect) {
          await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallMemberPrefix, {}, this.makeMembershipStateKey(localUserId, localDeviceId));
        }
      }
      logger.info("Sent updated call member event.");
    } catch (e) {
      const resendDelay = CALL_MEMBER_EVENT_RETRY_DELAY_MIN + Math.random() * 2000;
      logger.warn(`Failed to send call member event (retrying in ${resendDelay}): ${e}`);
      await (0, _utils.sleep)(resendDelay);
      await this.triggerCallMembershipEventUpdate();
    }
  }
  scheduleDelayDisconnection() {
    this.memberEventTimeout = setTimeout(this.delayDisconnection, 5000);
  }
  stateEventsContainOngoingLegacySession(callMemberEvents) {
    if (!callMemberEvents?.size) {
      return this.useLegacyMemberEvents;
    }
    let containsAnyOngoingSession = false;
    let containsUnknownOngoingSession = false;
    for (const callMemberEvent of callMemberEvents.values()) {
      const content = callMemberEvent.getContent();
      if (Array.isArray(content["memberships"])) {
        for (const membership of content.memberships) {
          if (!new _CallMembership.CallMembership(callMemberEvent, membership).isExpired()) {
            return true;
          }
        }
      } else if (Object.keys(content).length > 0) {
        containsAnyOngoingSession ||= true;
        containsUnknownOngoingSession ||= !("focus_active" in content);
      }
    }
    return containsAnyOngoingSession && !containsUnknownOngoingSession ? false : this.useLegacyMemberEvents;
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