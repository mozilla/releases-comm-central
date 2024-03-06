"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixRTCSessionManagerEvents = exports.MatrixRTCSessionManager = void 0;
var _logger = require("../logger");
var _client = require("../client");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _room = require("../models/room");
var _roomState = require("../models/room-state");
var _MatrixRTCSession = require("./MatrixRTCSession");
var _event = require("../@types/event");
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
let MatrixRTCSessionManagerEvents = exports.MatrixRTCSessionManagerEvents = /*#__PURE__*/function (MatrixRTCSessionManagerEvents) {
  MatrixRTCSessionManagerEvents["SessionStarted"] = "session_started";
  MatrixRTCSessionManagerEvents["SessionEnded"] = "session_ended";
  return MatrixRTCSessionManagerEvents;
}({});
/**
 * Holds all active MatrixRTC session objects and creates new ones as events arrive.
 * This interface is UNSTABLE and may change without warning.
 */
class MatrixRTCSessionManager extends _typedEventEmitter.TypedEventEmitter {
  constructor(client) {
    super();
    this.client = client;
    // All the room-scoped sessions we know about. This will include any where the app
    // has queried for the MatrixRTC sessions in a room, whether it's ever had any members
    // or not). We keep a (lazily created) session object for every room to ensure that there
    // is only ever one single room session object for any given room for the lifetime of the
    // client: that way there can never be any code holding onto a stale object that is no
    // longer the correct session object for the room.
    _defineProperty(this, "roomSessions", new Map());
    _defineProperty(this, "onTimeline", event => {
      this.consumeCallEncryptionEvent(event);
    });
    _defineProperty(this, "onRoom", room => {
      this.refreshRoom(room);
    });
    _defineProperty(this, "onRoomState", (event, _state) => {
      const room = this.client.getRoom(event.getRoomId());
      if (!room) {
        _logger.logger.error(`Got room state event for unknown room ${event.getRoomId()}!`);
        return;
      }
      if (event.getType() == _event.EventType.GroupCallMemberPrefix) {
        this.refreshRoom(room);
      }
    });
  }
  start() {
    // We shouldn't need to null-check here, but matrix-client.spec.ts mocks getRooms
    // returing nothing, and breaks tests if you change it to return an empty array :'(
    for (const room of this.client.getRooms() ?? []) {
      const session = _MatrixRTCSession.MatrixRTCSession.roomSessionForRoom(this.client, room);
      if (session.memberships.length > 0) {
        this.roomSessions.set(room.roomId, session);
      }
    }
    this.client.on(_client.ClientEvent.Room, this.onRoom);
    this.client.on(_room.RoomEvent.Timeline, this.onTimeline);
    this.client.on(_roomState.RoomStateEvent.Events, this.onRoomState);
  }
  stop() {
    for (const sess of this.roomSessions.values()) {
      sess.stop();
    }
    this.roomSessions.clear();
    this.client.removeListener(_client.ClientEvent.Room, this.onRoom);
    this.client.removeListener(_room.RoomEvent.Timeline, this.onTimeline);
    this.client.removeListener(_roomState.RoomStateEvent.Events, this.onRoomState);
  }

  /**
   * Gets the main MatrixRTC session for a room, or undefined if there is
   * no current session
   */
  getActiveRoomSession(room) {
    return this.roomSessions.get(room.roomId);
  }

  /**
   * Gets the main MatrixRTC session for a room, returning an empty session
   * if no members are currently participating
   */
  getRoomSession(room) {
    if (!this.roomSessions.has(room.roomId)) {
      this.roomSessions.set(room.roomId, _MatrixRTCSession.MatrixRTCSession.roomSessionForRoom(this.client, room));
    }
    return this.roomSessions.get(room.roomId);
  }
  async consumeCallEncryptionEvent(event) {
    await this.client.decryptEventIfNeeded(event);
    if (event.getType() !== _event.EventType.CallEncryptionKeysPrefix) return Promise.resolve();
    const room = this.client.getRoom(event.getRoomId());
    if (!room) {
      _logger.logger.error(`Got room state event for unknown room ${event.getRoomId()}!`);
      return Promise.resolve();
    }
    this.getRoomSession(room).onCallEncryption(event);
  }
  refreshRoom(room) {
    const isNewSession = !this.roomSessions.has(room.roomId);
    const sess = this.getRoomSession(room);
    const wasActiveAndKnown = sess.memberships.length > 0 && !isNewSession;
    sess.onMembershipUpdate();
    const nowActive = sess.memberships.length > 0;
    if (wasActiveAndKnown && !nowActive) {
      this.emit(MatrixRTCSessionManagerEvents.SessionEnded, room.roomId, this.roomSessions.get(room.roomId));
    } else if (!wasActiveAndKnown && nowActive) {
      this.emit(MatrixRTCSessionManagerEvents.SessionStarted, room.roomId, this.roomSessions.get(room.roomId));
    }
  }
}
exports.MatrixRTCSessionManager = MatrixRTCSessionManager;