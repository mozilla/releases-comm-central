"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MemoryStore = void 0;
var _roomState = require("../models/room-state.js");
var _utils = require("../utils.js");
var _membership = require("../@types/membership.js");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015 - 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/ /**
 * This is an internal module. See {@link MemoryStore} for the public class.
 */
function isValidFilterId(filterId) {
  const isValidStr = typeof filterId === "string" && !!filterId && filterId !== "undefined" &&
  // exclude these as we've serialized undefined in localStorage before
  filterId !== "null";
  return isValidStr || typeof filterId === "number";
}
class MemoryStore {
  /**
   * Construct a new in-memory data store for the Matrix Client.
   * @param opts - Config options
   */
  constructor(opts = {}) {
    _defineProperty(this, "rooms", {});
    // roomId: Room
    _defineProperty(this, "users", {});
    // userId: User
    _defineProperty(this, "syncToken", null);
    // userId: {
    //    filterId: Filter
    // }
    _defineProperty(this, "filters", new _utils.MapWithDefault(() => new Map()));
    _defineProperty(this, "accountData", new Map());
    // type: content
    _defineProperty(this, "localStorage", void 0);
    _defineProperty(this, "oobMembers", new Map());
    // roomId: [member events]
    _defineProperty(this, "pendingEvents", {});
    _defineProperty(this, "clientOptions", void 0);
    _defineProperty(this, "pendingToDeviceBatches", []);
    _defineProperty(this, "nextToDeviceBatchId", 0);
    _defineProperty(this, "createUser", void 0);
    /**
     * Called when a room member in a room being tracked by this store has been
     * updated.
     */
    _defineProperty(this, "onRoomMember", (event, state, member) => {
      if (member.membership === _membership.KnownMembership.Invite) {
        // We do NOT add invited members because people love to typo user IDs
        // which would then show up in these lists (!)
        return;
      }
      const user = this.users[member.userId] || this.createUser?.(member.userId);
      if (member.name) {
        user.setDisplayName(member.name);
        if (member.events.member) {
          user.setRawDisplayName(member.events.member.getDirectionalContent().displayname);
        }
      }
      if (member.events.member && member.events.member.getContent().avatar_url) {
        user.setAvatarUrl(member.events.member.getContent().avatar_url);
      }
      this.users[user.userId] = user;
    });
    this.localStorage = opts.localStorage;
  }

  /**
   * Retrieve the token to stream from.
   * @returns The token or null.
   */
  getSyncToken() {
    return this.syncToken;
  }

  /** @returns whether or not the database was newly created in this session. */
  isNewlyCreated() {
    return Promise.resolve(true);
  }

  /**
   * Set the token to stream from.
   * @param token - The token to stream from.
   */
  setSyncToken(token) {
    this.syncToken = token;
  }

  /**
   * Store the given room.
   * @param room - The room to be stored. All properties must be stored.
   */
  storeRoom(room) {
    this.rooms[room.roomId] = room;
    // add listeners for room member changes so we can keep the room member
    // map up-to-date.
    room.currentState.on(_roomState.RoomStateEvent.Members, this.onRoomMember);
    // add existing members
    room.currentState.getMembers().forEach(m => {
      this.onRoomMember(null, room.currentState, m);
    });
  }
  setUserCreator(creator) {
    this.createUser = creator;
  }
  /**
   * Retrieve a room by its' room ID.
   * @param roomId - The room ID.
   * @returns The room or null.
   */
  getRoom(roomId) {
    return this.rooms[roomId] || null;
  }

  /**
   * Retrieve all known rooms.
   * @returns A list of rooms, which may be empty.
   */
  getRooms() {
    return Object.values(this.rooms);
  }

  /**
   * Permanently delete a room.
   */
  removeRoom(roomId) {
    if (this.rooms[roomId]) {
      this.rooms[roomId].currentState.removeListener(_roomState.RoomStateEvent.Members, this.onRoomMember);
    }
    delete this.rooms[roomId];
  }

  /**
   * Retrieve a summary of all the rooms.
   * @returns A summary of each room.
   */
  getRoomSummaries() {
    return Object.values(this.rooms).map(function (room) {
      return room.summary;
    });
  }

  /**
   * Store a User.
   * @param user - The user to store.
   */
  storeUser(user) {
    this.users[user.userId] = user;
  }

  /**
   * Retrieve a User by its' user ID.
   * @param userId - The user ID.
   * @returns The user or null.
   */
  getUser(userId) {
    return this.users[userId] || null;
  }

  /**
   * Retrieve all known users.
   * @returns A list of users, which may be empty.
   */
  getUsers() {
    return Object.values(this.users);
  }

  /**
   * Retrieve scrollback for this room.
   * @param room - The matrix room
   * @param limit - The max number of old events to retrieve.
   * @returns An array of objects which will be at most 'limit'
   * length and at least 0. The objects are the raw event JSON.
   */
  scrollback(room, limit) {
    return [];
  }

  /**
   * Store events for a room. The events have already been added to the timeline
   * @param room - The room to store events for.
   * @param events - The events to store.
   * @param token - The token associated with these events.
   * @param toStart - True if these are paginated results.
   */
  storeEvents(room, events, token, toStart) {
    // no-op because they've already been added to the room instance.
  }

  /**
   * Store a filter.
   */
  storeFilter(filter) {
    if (!filter?.userId || !filter?.filterId) return;
    this.filters.getOrCreate(filter.userId).set(filter.filterId, filter);
  }

  /**
   * Retrieve a filter.
   * @returns A filter or null.
   */
  getFilter(userId, filterId) {
    return this.filters.get(userId)?.get(filterId) || null;
  }

  /**
   * Retrieve a filter ID with the given name.
   * @param filterName - The filter name.
   * @returns The filter ID or null.
   */
  getFilterIdByName(filterName) {
    if (!this.localStorage) {
      return null;
    }
    const key = "mxjssdk_memory_filter_" + filterName;
    // XXX Storage.getItem doesn't throw ...
    // or are we using something different
    // than window.localStorage in some cases
    // that does throw?
    // that would be very naughty
    try {
      const value = this.localStorage.getItem(key);
      if (isValidFilterId(value)) {
        return value;
      }
    } catch {}
    return null;
  }

  /**
   * Set a filter name to ID mapping.
   */
  setFilterIdByName(filterName, filterId) {
    if (!this.localStorage) {
      return;
    }
    const key = "mxjssdk_memory_filter_" + filterName;
    try {
      if (isValidFilterId(filterId)) {
        this.localStorage.setItem(key, filterId);
      } else {
        this.localStorage.removeItem(key);
      }
    } catch {}
  }

  /**
   * Store user-scoped account data events.
   * N.B. that account data only allows a single event per type, so multiple
   * events with the same type will replace each other.
   * @param events - The events to store.
   */
  storeAccountDataEvents(events) {
    events.forEach(event => {
      // MSC3391: an event with content of {} should be interpreted as deleted
      const isDeleted = !Object.keys(event.getContent()).length;
      if (isDeleted) {
        this.accountData.delete(event.getType());
      } else {
        this.accountData.set(event.getType(), event);
      }
    });
  }

  /**
   * Get account data event by event type
   * @param eventType - The event type being queried
   * @returns the user account_data event of given type, if any
   */
  getAccountData(eventType) {
    return this.accountData.get(eventType);
  }

  /**
   * setSyncData does nothing as there is no backing data store.
   *
   * @param syncData - The sync data
   * @returns An immediately resolved promise.
   */
  setSyncData(syncData) {
    return Promise.resolve();
  }

  /**
   * We never want to save becase we have nothing to save to.
   *
   * @returns If the store wants to save
   */
  wantsSave() {
    return false;
  }

  /**
   * Save does nothing as there is no backing data store.
   * @param force - True to force a save (but the memory
   *     store still can't save anything)
   */
  save(force) {
    return Promise.resolve();
  }

  /**
   * Startup does nothing as this store doesn't require starting up.
   * @returns An immediately resolved promise.
   */
  startup() {
    return Promise.resolve();
  }

  /**
   * @returns Promise which resolves with a sync response to restore the
   * client state to where it was at the last save, or null if there
   * is no saved sync data.
   */
  getSavedSync() {
    return Promise.resolve(null);
  }

  /**
   * @returns If there is a saved sync, the nextBatch token
   * for this sync, otherwise null.
   */
  getSavedSyncToken() {
    return Promise.resolve(null);
  }

  /**
   * Delete all data from this store.
   * @returns An immediately resolved promise.
   */
  deleteAllData() {
    this.rooms = {
      // roomId: Room
    };
    this.users = {
      // userId: User
    };
    this.syncToken = null;
    this.filters = new _utils.MapWithDefault(() => new Map());
    this.accountData = new Map(); // type : content
    return Promise.resolve();
  }

  /**
   * Returns the out-of-band membership events for this room that
   * were previously loaded.
   * @returns the events, potentially an empty array if OOB loading didn't yield any new members
   * @returns in case the members for this room haven't been stored yet
   */
  getOutOfBandMembers(roomId) {
    return Promise.resolve(this.oobMembers.get(roomId) || null);
  }

  /**
   * Stores the out-of-band membership events for this room. Note that
   * it still makes sense to store an empty array as the OOB status for the room is
   * marked as fetched, and getOutOfBandMembers will return an empty array instead of null
   * @param membershipEvents - the membership events to store
   * @returns when all members have been stored
   */
  setOutOfBandMembers(roomId, membershipEvents) {
    this.oobMembers.set(roomId, membershipEvents);
    return Promise.resolve();
  }
  clearOutOfBandMembers(roomId) {
    this.oobMembers.delete(roomId);
    return Promise.resolve();
  }
  getClientOptions() {
    return Promise.resolve(this.clientOptions);
  }
  storeClientOptions(options) {
    this.clientOptions = Object.assign({}, options);
    return Promise.resolve();
  }
  async getPendingEvents(roomId) {
    return this.pendingEvents[roomId] ?? [];
  }
  async setPendingEvents(roomId, events) {
    this.pendingEvents[roomId] = events;
  }
  saveToDeviceBatches(batches) {
    for (const batch of batches) {
      this.pendingToDeviceBatches.push({
        id: this.nextToDeviceBatchId++,
        eventType: batch.eventType,
        txnId: batch.txnId,
        batch: batch.batch
      });
    }
    return Promise.resolve();
  }
  async getOldestToDeviceBatch() {
    if (this.pendingToDeviceBatches.length === 0) return null;
    return this.pendingToDeviceBatches[0];
  }
  removeToDeviceBatch(id) {
    this.pendingToDeviceBatches = this.pendingToDeviceBatches.filter(batch => batch.id !== id);
    return Promise.resolve();
  }
  async destroy() {
    // Nothing to do
  }
}
exports.MemoryStore = MemoryStore;