"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GroupCallEventHandlerEvent = exports.GroupCallEventHandler = void 0;
var _client = require("../client");
var _groupCall = require("./groupCall");
var _roomState = require("../models/room-state");
var _logger = require("../logger");
var _event = require("../@types/event");
var _sync = require("../sync");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

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
let GroupCallEventHandlerEvent = exports.GroupCallEventHandlerEvent = /*#__PURE__*/function (GroupCallEventHandlerEvent) {
  GroupCallEventHandlerEvent["Incoming"] = "GroupCall.incoming";
  GroupCallEventHandlerEvent["Outgoing"] = "GroupCall.outgoing";
  GroupCallEventHandlerEvent["Ended"] = "GroupCall.ended";
  GroupCallEventHandlerEvent["Participants"] = "GroupCall.participants";
  return GroupCallEventHandlerEvent;
}({});
class GroupCallEventHandler {
  constructor(client) {
    this.client = client;
    _defineProperty(this, "groupCalls", new Map());
    // roomId -> GroupCall
    // All rooms we know about and whether we've seen a 'Room' event
    // for them. The promise will be fulfilled once we've processed that
    // event which means we're "up to date" on what calls are in a room
    // and get
    _defineProperty(this, "roomDeferreds", new Map());
    _defineProperty(this, "onRoomsChanged", room => {
      this.createGroupCallForRoom(room);
    });
    _defineProperty(this, "onRoomStateChanged", (event, state) => {
      const eventType = event.getType();
      if (eventType === _event.EventType.GroupCallPrefix) {
        const groupCallId = event.getStateKey();
        const content = event.getContent();
        const currentGroupCall = this.groupCalls.get(state.roomId);
        if (!currentGroupCall && !content["m.terminated"] && !event.isRedacted()) {
          this.createGroupCallFromRoomStateEvent(event);
        } else if (currentGroupCall && currentGroupCall.groupCallId === groupCallId) {
          if (content["m.terminated"] || event.isRedacted()) {
            currentGroupCall.terminate(false);
          } else if (content["m.type"] !== currentGroupCall.type) {
            // TODO: Handle the callType changing when the room state changes
            _logger.logger.warn(`GroupCallEventHandler onRoomStateChanged() currently does not support changing type (roomId=${state.roomId})`);
          }
        } else if (currentGroupCall && currentGroupCall.groupCallId !== groupCallId) {
          // TODO: Handle new group calls and multiple group calls
          _logger.logger.warn(`GroupCallEventHandler onRoomStateChanged() currently does not support multiple calls (roomId=${state.roomId})`);
        }
      }
    });
  }
  async start() {
    // We wait until the client has started syncing for real.
    // This is because we only support one call at a time, and want
    // the latest. We therefore want the latest state of the room before
    // we create a group call for the room so we can be fairly sure that
    // the group call we create is really the latest one.
    if (this.client.getSyncState() !== _sync.SyncState.Syncing) {
      _logger.logger.debug("GroupCallEventHandler start() waiting for client to start syncing");
      await new Promise(resolve => {
        const onSync = () => {
          if (this.client.getSyncState() === _sync.SyncState.Syncing) {
            this.client.off(_client.ClientEvent.Sync, onSync);
            return resolve();
          }
        };
        this.client.on(_client.ClientEvent.Sync, onSync);
      });
    }
    const rooms = this.client.getRooms();
    for (const room of rooms) {
      this.createGroupCallForRoom(room);
    }
    this.client.on(_client.ClientEvent.Room, this.onRoomsChanged);
    this.client.on(_roomState.RoomStateEvent.Events, this.onRoomStateChanged);
  }
  stop() {
    this.client.removeListener(_client.ClientEvent.Room, this.onRoomsChanged);
    this.client.removeListener(_roomState.RoomStateEvent.Events, this.onRoomStateChanged);
  }
  getRoomDeferred(roomId) {
    let deferred = this.roomDeferreds.get(roomId);
    if (deferred === undefined) {
      let resolveFunc;
      deferred = {
        prom: new Promise(resolve => {
          resolveFunc = resolve;
        })
      };
      deferred.resolve = resolveFunc;
      this.roomDeferreds.set(roomId, deferred);
    }
    return deferred;
  }
  waitUntilRoomReadyForGroupCalls(roomId) {
    return this.getRoomDeferred(roomId).prom;
  }
  getGroupCallById(groupCallId) {
    return [...this.groupCalls.values()].find(groupCall => groupCall.groupCallId === groupCallId);
  }
  createGroupCallForRoom(room) {
    const callEvents = room.currentState.getStateEvents(_event.EventType.GroupCallPrefix);
    const sortedCallEvents = callEvents.sort((a, b) => b.getTs() - a.getTs());
    for (const callEvent of sortedCallEvents) {
      const content = callEvent.getContent();
      if (content["m.terminated"] || callEvent.isRedacted()) {
        continue;
      }
      _logger.logger.debug(`GroupCallEventHandler createGroupCallForRoom() choosing group call from possible calls (stateKey=${callEvent.getStateKey()}, ts=${callEvent.getTs()}, roomId=${room.roomId}, numOfPossibleCalls=${callEvents.length})`);
      this.createGroupCallFromRoomStateEvent(callEvent);
      break;
    }
    this.getRoomDeferred(room.roomId).resolve();
  }
  createGroupCallFromRoomStateEvent(event) {
    const roomId = event.getRoomId();
    const content = event.getContent();
    const room = this.client.getRoom(roomId);
    if (!room) {
      _logger.logger.warn(`GroupCallEventHandler createGroupCallFromRoomStateEvent() couldn't find room for call (roomId=${roomId})`);
      return;
    }
    const groupCallId = event.getStateKey();
    const callType = content["m.type"];
    if (!Object.values(_groupCall.GroupCallType).includes(callType)) {
      _logger.logger.warn(`GroupCallEventHandler createGroupCallFromRoomStateEvent() received invalid call type (type=${callType}, roomId=${roomId})`);
      return;
    }
    const callIntent = content["m.intent"];
    if (!Object.values(_groupCall.GroupCallIntent).includes(callIntent)) {
      _logger.logger.warn(`Received invalid group call intent (type=${callType}, roomId=${roomId})`);
      return;
    }
    const isPtt = Boolean(content["io.element.ptt"]);
    let dataChannelOptions;
    if (content?.dataChannelsEnabled && content?.dataChannelOptions) {
      // Pull out just the dataChannelOptions we want to support.
      const {
        ordered,
        maxPacketLifeTime,
        maxRetransmits,
        protocol
      } = content.dataChannelOptions;
      dataChannelOptions = {
        ordered,
        maxPacketLifeTime,
        maxRetransmits,
        protocol
      };
    }
    const groupCall = new _groupCall.GroupCall(this.client, room, callType, isPtt, callIntent, groupCallId,
    // Because without Media section a WebRTC connection is not possible, so need a RTCDataChannel to set up a
    // no media WebRTC connection anyway.
    content?.dataChannelsEnabled || this.client.isVoipWithNoMediaAllowed, dataChannelOptions, this.client.isVoipWithNoMediaAllowed, this.client.useLivekitForGroupCalls, content["io.element.livekit_service_url"]);
    this.groupCalls.set(room.roomId, groupCall);
    this.client.emit(GroupCallEventHandlerEvent.Incoming, groupCall);
    return groupCall;
  }
}
exports.GroupCallEventHandler = GroupCallEventHandler;