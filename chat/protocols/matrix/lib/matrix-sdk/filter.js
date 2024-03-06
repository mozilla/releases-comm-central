"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Filter = void 0;
var _sync = require("./@types/sync");
var _filterComponent = require("./filter-component");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015 - 2021 Matrix.org Foundation C.I.C.

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
 */
function setProp(obj, keyNesting, val) {
  const nestedKeys = keyNesting.split(".");
  let currentObj = obj;
  for (let i = 0; i < nestedKeys.length - 1; i++) {
    if (!currentObj[nestedKeys[i]]) {
      currentObj[nestedKeys[i]] = {};
    }
    currentObj = currentObj[nestedKeys[i]];
  }
  currentObj[nestedKeys[nestedKeys.length - 1]] = val;
}

/* eslint-disable camelcase */

/* eslint-enable camelcase */

class Filter {
  /**
   * Create a filter from existing data.
   */
  static fromJson(userId, filterId, jsonObj) {
    const filter = new Filter(userId, filterId);
    filter.setDefinition(jsonObj);
    return filter;
  }
  /**
   * Construct a new Filter.
   * @param userId - The user ID for this filter.
   * @param filterId - The filter ID if known.
   */
  constructor(userId, filterId) {
    this.userId = userId;
    this.filterId = filterId;
    _defineProperty(this, "definition", {});
    _defineProperty(this, "roomFilter", void 0);
    _defineProperty(this, "roomTimelineFilter", void 0);
  }

  /**
   * Get the ID of this filter on your homeserver (if known)
   * @returns The filter ID
   */
  getFilterId() {
    return this.filterId;
  }

  /**
   * Get the JSON body of the filter.
   * @returns The filter definition
   */
  getDefinition() {
    return this.definition;
  }

  /**
   * Set the JSON body of the filter
   * @param definition - The filter definition
   */
  setDefinition(definition) {
    this.definition = definition;

    // This is all ported from synapse's FilterCollection()

    // definitions look something like:
    // {
    //   "room": {
    //     "rooms": ["!abcde:example.com"],
    //     "not_rooms": ["!123456:example.com"],
    //     "state": {
    //       "types": ["m.room.*"],
    //       "not_rooms": ["!726s6s6q:example.com"],
    //       "lazy_load_members": true,
    //     },
    //     "timeline": {
    //       "limit": 10,
    //       "types": ["m.room.message"],
    //       "not_rooms": ["!726s6s6q:example.com"],
    //       "not_senders": ["@spam:example.com"]
    //       "contains_url": true
    //     },
    //     "ephemeral": {
    //       "types": ["m.receipt", "m.typing"],
    //       "not_rooms": ["!726s6s6q:example.com"],
    //       "not_senders": ["@spam:example.com"]
    //     }
    //   },
    //   "presence": {
    //     "types": ["m.presence"],
    //     "not_senders": ["@alice:example.com"]
    //   },
    //   "event_format": "client",
    //   "event_fields": ["type", "content", "sender"]
    // }

    const roomFilterJson = definition.room;

    // consider the top level rooms/not_rooms filter
    const roomFilterFields = {};
    if (roomFilterJson) {
      if (roomFilterJson.rooms) {
        roomFilterFields.rooms = roomFilterJson.rooms;
      }
      if (roomFilterJson.rooms) {
        roomFilterFields.not_rooms = roomFilterJson.not_rooms;
      }
    }
    this.roomFilter = new _filterComponent.FilterComponent(roomFilterFields, this.userId);
    this.roomTimelineFilter = new _filterComponent.FilterComponent(roomFilterJson?.timeline || {}, this.userId);

    // don't bother porting this from synapse yet:
    // this._room_state_filter =
    //     new FilterComponent(roomFilterJson.state || {});
    // this._room_ephemeral_filter =
    //     new FilterComponent(roomFilterJson.ephemeral || {});
    // this._room_account_data_filter =
    //     new FilterComponent(roomFilterJson.account_data || {});
    // this._presence_filter =
    //     new FilterComponent(definition.presence || {});
    // this._account_data_filter =
    //     new FilterComponent(definition.account_data || {});
  }

  /**
   * Get the room.timeline filter component of the filter
   * @returns room timeline filter component
   */
  getRoomTimelineFilterComponent() {
    return this.roomTimelineFilter;
  }

  /**
   * Filter the list of events based on whether they are allowed in a timeline
   * based on this filter
   * @param events -  the list of events being filtered
   * @returns the list of events which match the filter
   */
  filterRoomTimeline(events) {
    if (this.roomFilter) {
      events = this.roomFilter.filter(events);
    }
    if (this.roomTimelineFilter) {
      events = this.roomTimelineFilter.filter(events);
    }
    return events;
  }

  /**
   * Set the max number of events to return for each room's timeline.
   * @param limit - The max number of events to return for each room.
   */
  setTimelineLimit(limit) {
    setProp(this.definition, "room.timeline.limit", limit);
  }

  /**
   * Enable threads unread notification
   */
  setUnreadThreadNotifications(enabled) {
    this.definition = _objectSpread(_objectSpread({}, this.definition), {}, {
      room: _objectSpread(_objectSpread({}, this.definition?.room), {}, {
        timeline: _objectSpread(_objectSpread({}, this.definition?.room?.timeline), {}, {
          [_sync.UNREAD_THREAD_NOTIFICATIONS.name]: enabled
        })
      })
    });
  }
  setLazyLoadMembers(enabled) {
    setProp(this.definition, "room.state.lazy_load_members", enabled);
  }

  /**
   * Control whether left rooms should be included in responses.
   * @param includeLeave - True to make rooms the user has left appear
   * in responses.
   */
  setIncludeLeaveRooms(includeLeave) {
    setProp(this.definition, "room.include_leave", includeLeave);
  }
}
exports.Filter = Filter;
_defineProperty(Filter, "LAZY_LOADING_MESSAGES_FILTER", {
  lazy_load_members: true
});