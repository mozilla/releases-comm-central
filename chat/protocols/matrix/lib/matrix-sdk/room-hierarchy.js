"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomHierarchy = void 0;

var _event = require("./@types/event");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class RoomHierarchy {
  // Map from room id to list of servers which are listed as a via somewhere in the loaded hierarchy
  // Map from room id to list of rooms which claim this room as their child
  // Map from room id to object

  /**
   * Construct a new RoomHierarchy
   *
   * A RoomHierarchy instance allows you to easily make use of the /hierarchy API and paginate it.
   *
   * @param {Room} root the root of this hierarchy
   * @param {number} pageSize the maximum number of rooms to return per page, can be overridden per load request.
   * @param {number} maxDepth the maximum depth to traverse the hierarchy to
   * @param {boolean} suggestedOnly whether to only return rooms with suggested=true.
   * @constructor
   */
  constructor(root, pageSize, maxDepth, suggestedOnly = false) {
    this.root = root;
    this.pageSize = pageSize;
    this.maxDepth = maxDepth;
    this.suggestedOnly = suggestedOnly;

    _defineProperty(this, "viaMap", new Map());

    _defineProperty(this, "backRefs", new Map());

    _defineProperty(this, "roomMap", new Map());

    _defineProperty(this, "loadRequest", void 0);

    _defineProperty(this, "nextBatch", void 0);

    _defineProperty(this, "_rooms", void 0);

    _defineProperty(this, "serverSupportError", void 0);
  }

  get noSupport() {
    return !!this.serverSupportError;
  }

  get canLoadMore() {
    return !!this.serverSupportError || !!this.nextBatch || !this._rooms;
  }

  get loading() {
    return !!this.loadRequest;
  }

  get rooms() {
    return this._rooms;
  }

  async load(pageSize = this.pageSize) {
    if (this.loadRequest) return this.loadRequest.then(r => r.rooms);
    this.loadRequest = this.root.client.getRoomHierarchy(this.root.roomId, pageSize, this.maxDepth, this.suggestedOnly, this.nextBatch);
    let rooms;

    try {
      ({
        rooms,
        next_batch: this.nextBatch
      } = await this.loadRequest);
    } catch (e) {
      if (e.errcode === "M_UNRECOGNIZED") {
        this.serverSupportError = e;
      } else {
        throw e;
      }

      return [];
    } finally {
      this.loadRequest = null;
    }

    if (this._rooms) {
      this._rooms = this._rooms.concat(rooms);
    } else {
      this._rooms = rooms;
    }

    rooms.forEach(room => {
      this.roomMap.set(room.room_id, room);
      room.children_state.forEach(ev => {
        if (ev.type !== _event.EventType.SpaceChild) return;
        const childRoomId = ev.state_key; // track backrefs for quicker hierarchy navigation

        if (!this.backRefs.has(childRoomId)) {
          this.backRefs.set(childRoomId, []);
        }

        this.backRefs.get(childRoomId).push(ev.room_id); // fill viaMap

        if (Array.isArray(ev.content.via)) {
          if (!this.viaMap.has(childRoomId)) {
            this.viaMap.set(childRoomId, new Set());
          }

          const vias = this.viaMap.get(childRoomId);
          ev.content.via.forEach(via => vias.add(via));
        }
      });
    });
    return rooms;
  }

  getRelation(parentId, childId) {
    return this.roomMap.get(parentId)?.children_state.find(e => e.state_key === childId);
  }

  isSuggested(parentId, childId) {
    return this.getRelation(parentId, childId)?.content.suggested;
  } // locally remove a relation as a form of local echo


  removeRelation(parentId, childId) {
    const backRefs = this.backRefs.get(childId);

    if (backRefs?.length === 1) {
      this.backRefs.delete(childId);
    } else if (backRefs?.length) {
      this.backRefs.set(childId, backRefs.filter(ref => ref !== parentId));
    }

    const room = this.roomMap.get(parentId);

    if (room) {
      room.children_state = room.children_state.filter(ev => ev.state_key !== childId);
    }
  }

}

exports.RoomHierarchy = RoomHierarchy;