"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Filter = void 0;

var _filterComponent = require("./filter-component");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * @param {Object} obj
 * @param {string} keyNesting
 * @param {*} val
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

/**
 * Construct a new Filter.
 * @constructor
 * @param {string} userId The user ID for this filter.
 * @param {string=} filterId The filter ID if known.
 * @prop {string} userId The user ID of the filter
 * @prop {?string} filterId The filter ID
 */
class Filter {
  /**
   * Create a filter from existing data.
   * @static
   * @param {string} userId
   * @param {string} filterId
   * @param {Object} jsonObj
   * @return {Filter}
   */
  static fromJson(userId, filterId, jsonObj) {
    const filter = new Filter(userId, filterId);
    filter.setDefinition(jsonObj);
    return filter;
  }

  constructor(userId, filterId) {
    this.userId = userId;
    this.filterId = filterId;

    _defineProperty(this, "definition", {});

    _defineProperty(this, "roomFilter", void 0);

    _defineProperty(this, "roomTimelineFilter", void 0);
  }
  /**
   * Get the ID of this filter on your homeserver (if known)
   * @return {?string} The filter ID
   */


  getFilterId() {
    return this.filterId;
  }
  /**
   * Get the JSON body of the filter.
   * @return {Object} The filter definition
   */


  getDefinition() {
    return this.definition;
  }
  /**
   * Set the JSON body of the filter
   * @param {Object} definition The filter definition
   */


  setDefinition(definition) {
    this.definition = definition; // This is all ported from synapse's FilterCollection()
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

    const roomFilterJson = definition.room; // consider the top level rooms/not_rooms filter

    const roomFilterFields = {};

    if (roomFilterJson) {
      if (roomFilterJson.rooms) {
        roomFilterFields.rooms = roomFilterJson.rooms;
      }

      if (roomFilterJson.rooms) {
        roomFilterFields.not_rooms = roomFilterJson.not_rooms;
      }
    }

    this.roomFilter = new _filterComponent.FilterComponent(roomFilterFields);
    this.roomTimelineFilter = new _filterComponent.FilterComponent(roomFilterJson?.timeline || {}); // don't bother porting this from synapse yet:
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
   * @return {FilterComponent} room timeline filter component
   */


  getRoomTimelineFilterComponent() {
    return this.roomTimelineFilter;
  }
  /**
   * Filter the list of events based on whether they are allowed in a timeline
   * based on this filter
   * @param {MatrixEvent[]} events  the list of events being filtered
   * @return {MatrixEvent[]} the list of events which match the filter
   */


  filterRoomTimeline(events) {
    return this.roomTimelineFilter.filter(this.roomFilter.filter(events));
  }
  /**
   * Set the max number of events to return for each room's timeline.
   * @param {Number} limit The max number of events to return for each room.
   */


  setTimelineLimit(limit) {
    setProp(this.definition, "room.timeline.limit", limit);
  }

  setLazyLoadMembers(enabled) {
    setProp(this.definition, "room.state.lazy_load_members", !!enabled);
  }
  /**
   * Control whether left rooms should be included in responses.
   * @param {boolean} includeLeave True to make rooms the user has left appear
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