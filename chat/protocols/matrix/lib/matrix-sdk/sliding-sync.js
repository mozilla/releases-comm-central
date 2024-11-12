"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SlidingSyncState = exports.SlidingSyncEvent = exports.SlidingSync = exports.MSC3575_WILDCARD = exports.MSC3575_STATE_KEY_ME = exports.MSC3575_STATE_KEY_LAZY = exports.ExtensionState = void 0;
var _logger = require("./logger.js");
var _typedEventEmitter = require("./models/typed-event-emitter.js");
var _utils = require("./utils.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2022 The Matrix.org Foundation C.I.C.

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
// /sync requests allow you to set a timeout= but the request may continue
// beyond that and wedge forever, so we need to track how long we are willing
// to keep open the connection. This constant is *ADDED* to the timeout= value
// to determine the max time we're willing to wait.
const BUFFER_PERIOD_MS = 10 * 1000;
const MSC3575_WILDCARD = exports.MSC3575_WILDCARD = "*";
const MSC3575_STATE_KEY_ME = exports.MSC3575_STATE_KEY_ME = "$ME";
const MSC3575_STATE_KEY_LAZY = exports.MSC3575_STATE_KEY_LAZY = "$LAZY";

/**
 * Represents a subscription to a room or set of rooms. Controls which events are returned.
 */

/**
 * Controls which rooms are returned in a given list.
 */

/**
 * Represents a list subscription.
 */

/**
 * A complete Sliding Sync request.
 */

/**
 * A complete Sliding Sync response
 */
let SlidingSyncState = exports.SlidingSyncState = /*#__PURE__*/function (SlidingSyncState) {
  SlidingSyncState["RequestFinished"] = "FINISHED";
  SlidingSyncState["Complete"] = "COMPLETE";
  return SlidingSyncState;
}({});
/**
 * Internal Class. SlidingList represents a single list in sliding sync. The list can have filters,
 * multiple sliding windows, and maintains the index-\>room_id mapping.
 */
class SlidingList {
  /**
   * Construct a new sliding list.
   * @param list - The range, sort and filter values to use for this list.
   */
  constructor(list) {
    _defineProperty(this, "list", void 0);
    _defineProperty(this, "isModified", void 0);
    // returned data
    _defineProperty(this, "roomIndexToRoomId", {});
    _defineProperty(this, "joinedCount", 0);
    this.replaceList(list);
  }

  /**
   * Mark this list as modified or not. Modified lists will return sticky params with calls to getList.
   * This is useful for the first time the list is sent, or if the list has changed in some way.
   * @param modified - True to mark this list as modified so all sticky parameters will be re-sent.
   */
  setModified(modified) {
    this.isModified = modified;
  }

  /**
   * Update the list range for this list. Does not affect modified status as list ranges are non-sticky.
   * @param newRanges - The new ranges for the list
   */
  updateListRange(newRanges) {
    this.list.ranges = JSON.parse(JSON.stringify(newRanges));
  }

  /**
   * Replace list parameters. All fields will be replaced with the new list parameters.
   * @param list - The new list parameters
   */
  replaceList(list) {
    list.filters = list.filters || {};
    list.ranges = list.ranges || [];
    this.list = JSON.parse(JSON.stringify(list));
    this.isModified = true;

    // reset values as the join count may be very different (if filters changed) including the rooms
    // (e.g. sort orders or sliding window ranges changed)

    // the constantly changing sliding window ranges. Not an array for performance reasons
    // E.g. tracking ranges 0-99, 500-599, we don't want to have a 600 element array
    this.roomIndexToRoomId = {};
    // the total number of joined rooms according to the server, always >= len(roomIndexToRoomId)
    this.joinedCount = 0;
  }

  /**
   * Return a copy of the list suitable for a request body.
   * @param forceIncludeAllParams - True to forcibly include all params even if the list
   * hasn't been modified. Callers may want to do this if they are modifying the list prior to calling
   * updateList.
   */
  getList(forceIncludeAllParams) {
    let list = {
      ranges: JSON.parse(JSON.stringify(this.list.ranges))
    };
    if (this.isModified || forceIncludeAllParams) {
      list = JSON.parse(JSON.stringify(this.list));
    }
    return list;
  }

  /**
   * Check if a given index is within the list range. This is required even though the /sync API
   * provides explicit updates with index positions because of the following situation:
   *   0 1 2 3 4 5 6 7 8   indexes
   *   a b c       d e f   COMMANDS: SYNC 0 2 a b c; SYNC 6 8 d e f;
   *   a b c       d _ f   COMMAND: DELETE 7;
   *   e a b c       d f   COMMAND: INSERT 0 e;
   *   c=3 is wrong as we are not tracking it, ergo we need to see if `i` is in range else drop it
   * @param i - The index to check
   * @returns True if the index is within a sliding window
   */
  isIndexInRange(i) {
    for (const r of this.list.ranges) {
      if (r[0] <= i && i <= r[1]) {
        return true;
      }
    }
    return false;
  }
}

/**
 * When onResponse extensions should be invoked: before or after processing the main response.
 */
let ExtensionState = exports.ExtensionState = /*#__PURE__*/function (ExtensionState) {
  ExtensionState["PreProcess"] = "ExtState.PreProcess";
  ExtensionState["PostProcess"] = "ExtState.PostProcess";
  return ExtensionState;
}({});
/**
 * An interface that must be satisfied to register extensions
 */
/**
 * Events which can be fired by the SlidingSync class. These are designed to provide different levels
 * of information when processing sync responses.
 *  - RoomData: concerns rooms, useful for SlidingSyncSdk to update its knowledge of rooms.
 *  - Lifecycle: concerns callbacks at various well-defined points in the sync process.
 *  - List: concerns lists, useful for UI layers to re-render room lists.
 * Specifically, the order of event invocation is:
 *  - Lifecycle (state=RequestFinished)
 *  - RoomData (N times)
 *  - Lifecycle (state=Complete)
 *  - List (at most once per list)
 */
let SlidingSyncEvent = exports.SlidingSyncEvent = /*#__PURE__*/function (SlidingSyncEvent) {
  SlidingSyncEvent["RoomData"] = "SlidingSync.RoomData";
  SlidingSyncEvent["Lifecycle"] = "SlidingSync.Lifecycle";
  SlidingSyncEvent["List"] = "SlidingSync.List";
  return SlidingSyncEvent;
}({});
/**
 * SlidingSync is a high-level data structure which controls the majority of sliding sync.
 * It has no hooks into JS SDK except for needing a MatrixClient to perform the HTTP request.
 * This means this class (and everything it uses) can be used in isolation from JS SDK if needed.
 * To hook this up with the JS SDK, you need to use SlidingSyncSdk.
 */
class SlidingSync extends _typedEventEmitter.TypedEventEmitter {
  /**
   * Create a new sliding sync instance
   * @param proxyBaseUrl - The base URL of the sliding sync proxy
   * @param lists - The lists to use for sliding sync.
   * @param roomSubscriptionInfo - The params to use for room subscriptions.
   * @param client - The client to use for /sync calls.
   * @param timeoutMS - The number of milliseconds to wait for a response.
   */
  constructor(proxyBaseUrl, lists, roomSubscriptionInfo, client, timeoutMS) {
    super();
    this.proxyBaseUrl = proxyBaseUrl;
    this.roomSubscriptionInfo = roomSubscriptionInfo;
    this.client = client;
    this.timeoutMS = timeoutMS;
    _defineProperty(this, "lists", void 0);
    _defineProperty(this, "listModifiedCount", 0);
    _defineProperty(this, "terminated", false);
    // flag set when resend() is called because we cannot rely on detecting AbortError in JS SDK :(
    _defineProperty(this, "needsResend", false);
    // the txn_id to send with the next request.
    _defineProperty(this, "txnId", null);
    // a list (in chronological order of when they were sent) of objects containing the txn ID and
    // a defer to resolve/reject depending on whether they were successfully sent or not.
    _defineProperty(this, "txnIdDefers", []);
    // map of extension name to req/resp handler
    _defineProperty(this, "extensions", {});
    _defineProperty(this, "desiredRoomSubscriptions", new Set());
    // the *desired* room subscriptions
    _defineProperty(this, "confirmedRoomSubscriptions", new Set());
    // map of custom subscription name to the subscription
    _defineProperty(this, "customSubscriptions", new Map());
    // map of room ID to custom subscription name
    _defineProperty(this, "roomIdToCustomSubscription", new Map());
    _defineProperty(this, "pendingReq", void 0);
    _defineProperty(this, "abortController", void 0);
    this.lists = new Map();
    lists.forEach((list, key) => {
      this.lists.set(key, new SlidingList(list));
    });
  }

  /**
   * Add a custom room subscription, referred to by an arbitrary name. If a subscription with this
   * name already exists, it is replaced. No requests are sent by calling this method.
   * @param name - The name of the subscription. Only used to reference this subscription in
   * useCustomSubscription.
   * @param sub - The subscription information.
   */
  addCustomSubscription(name, sub) {
    if (this.customSubscriptions.has(name)) {
      _logger.logger.warn(`addCustomSubscription: ${name} already exists as a custom subscription, ignoring.`);
      return;
    }
    this.customSubscriptions.set(name, sub);
  }

  /**
   * Use a custom subscription previously added via addCustomSubscription. No requests are sent
   * by calling this method. Use modifyRoomSubscriptions to resend subscription information.
   * @param roomId - The room to use the subscription in.
   * @param name - The name of the subscription. If this name is unknown, the default subscription
   * will be used.
   */
  useCustomSubscription(roomId, name) {
    // We already know about this custom subscription, as it is immutable,
    // we don't need to unconfirm the subscription.
    if (this.roomIdToCustomSubscription.get(roomId) === name) {
      return;
    }
    this.roomIdToCustomSubscription.set(roomId, name);
    // unconfirm this subscription so a resend() will send it up afresh.
    this.confirmedRoomSubscriptions.delete(roomId);
  }

  /**
   * Get the room index data for a list.
   * @param key - The list key
   * @returns The list data which contains the rooms in this list
   */
  getListData(key) {
    const data = this.lists.get(key);
    if (!data) {
      return null;
    }
    return {
      joinedCount: data.joinedCount,
      roomIndexToRoomId: Object.assign({}, data.roomIndexToRoomId)
    };
  }

  /**
   * Get the full request list parameters for a list index. This function is provided for callers to use
   * in conjunction with setList to update fields on an existing list.
   * @param key - The list key to get the params for.
   * @returns A copy of the list params or undefined.
   */
  getListParams(key) {
    const params = this.lists.get(key);
    if (!params) {
      return null;
    }
    return params.getList(true);
  }

  /**
   * Set new ranges for an existing list. Calling this function when _only_ the ranges have changed
   * is more efficient than calling setList(index,list) as this function won't resend sticky params,
   * whereas setList always will.
   * @param key - The list key to modify
   * @param ranges - The new ranges to apply.
   * @returns A promise which resolves to the transaction ID when it has been received down sync
   * (or rejects with the transaction ID if the action was not applied e.g the request was cancelled
   * immediately after sending, in which case the action will be applied in the subsequent request)
   */
  setListRanges(key, ranges) {
    const list = this.lists.get(key);
    if (!list) {
      return Promise.reject(new Error("no list with key " + key));
    }
    list.updateListRange(ranges);
    return this.resend();
  }

  /**
   * Add or replace a list. Calling this function will interrupt the /sync request to resend new
   * lists.
   * @param key - The key to modify
   * @param list - The new list parameters.
   * @returns A promise which resolves to the transaction ID when it has been received down sync
   * (or rejects with the transaction ID if the action was not applied e.g the request was cancelled
   * immediately after sending, in which case the action will be applied in the subsequent request)
   */
  setList(key, list) {
    const existingList = this.lists.get(key);
    if (existingList) {
      existingList.replaceList(list);
      this.lists.set(key, existingList);
    } else {
      this.lists.set(key, new SlidingList(list));
    }
    this.listModifiedCount += 1;
    return this.resend();
  }

  /**
   * Get the room subscriptions for the sync API.
   * @returns A copy of the desired room subscriptions.
   */
  getRoomSubscriptions() {
    return new Set(Array.from(this.desiredRoomSubscriptions));
  }

  /**
   * Modify the room subscriptions for the sync API. Calling this function will interrupt the
   * /sync request to resend new subscriptions. If the /sync stream has not started, this will
   * prepare the room subscriptions for when start() is called.
   * @param s - The new desired room subscriptions.
   * @returns A promise which resolves to the transaction ID when it has been received down sync
   * (or rejects with the transaction ID if the action was not applied e.g the request was cancelled
   * immediately after sending, in which case the action will be applied in the subsequent request)
   */
  modifyRoomSubscriptions(s) {
    this.desiredRoomSubscriptions = s;
    return this.resend();
  }

  /**
   * Modify which events to retrieve for room subscriptions. Invalidates all room subscriptions
   * such that they will be sent up afresh.
   * @param rs - The new room subscription fields to fetch.
   * @returns A promise which resolves to the transaction ID when it has been received down sync
   * (or rejects with the transaction ID if the action was not applied e.g the request was cancelled
   * immediately after sending, in which case the action will be applied in the subsequent request)
   */
  modifyRoomSubscriptionInfo(rs) {
    this.roomSubscriptionInfo = rs;
    this.confirmedRoomSubscriptions = new Set();
    return this.resend();
  }

  /**
   * Register an extension to send with the /sync request.
   * @param ext - The extension to register.
   */
  registerExtension(ext) {
    if (this.extensions[ext.name()]) {
      throw new Error(`registerExtension: ${ext.name()} already exists as an extension`);
    }
    this.extensions[ext.name()] = ext;
  }
  getExtensionRequest(isInitial) {
    const ext = {};
    Object.keys(this.extensions).forEach(extName => {
      ext[extName] = this.extensions[extName].onRequest(isInitial);
    });
    return ext;
  }
  async onPreExtensionsResponse(ext) {
    await Promise.all(Object.keys(ext).map(async extName => {
      if (this.extensions[extName].when() == ExtensionState.PreProcess) {
        await this.extensions[extName].onResponse(ext[extName]);
      }
    }));
  }
  async onPostExtensionsResponse(ext) {
    await Promise.all(Object.keys(ext).map(async extName => {
      if (this.extensions[extName].when() == ExtensionState.PostProcess) {
        await this.extensions[extName].onResponse(ext[extName]);
      }
    }));
  }

  /**
   * Invoke all attached room data listeners.
   * @param roomId - The room which received some data.
   * @param roomData - The raw sliding sync response JSON.
   */
  async invokeRoomDataListeners(roomId, roomData) {
    if (!roomData.required_state) {
      roomData.required_state = [];
    }
    if (!roomData.timeline) {
      roomData.timeline = [];
    }
    await this.emitPromised(SlidingSyncEvent.RoomData, roomId, roomData);
  }

  /**
   * Invoke all attached lifecycle listeners.
   * @param state - The Lifecycle state
   * @param resp - The raw sync response JSON
   * @param err - Any error that occurred when making the request e.g. network errors.
   */
  invokeLifecycleListeners(state, resp, err) {
    this.emit(SlidingSyncEvent.Lifecycle, state, resp, err);
  }
  shiftRight(listKey, hi, low) {
    const list = this.lists.get(listKey);
    if (!list) {
      return;
    }
    //     l   h
    // 0,1,2,3,4 <- before
    // 0,1,2,2,3 <- after, hi is deleted and low is duplicated
    for (let i = hi; i > low; i--) {
      if (list.isIndexInRange(i)) {
        list.roomIndexToRoomId[i] = list.roomIndexToRoomId[i - 1];
      }
    }
  }
  shiftLeft(listKey, hi, low) {
    const list = this.lists.get(listKey);
    if (!list) {
      return;
    }
    //     l   h
    // 0,1,2,3,4 <- before
    // 0,1,3,4,4 <- after, low is deleted and hi is duplicated
    for (let i = low; i < hi; i++) {
      if (list.isIndexInRange(i)) {
        list.roomIndexToRoomId[i] = list.roomIndexToRoomId[i + 1];
      }
    }
  }
  removeEntry(listKey, index) {
    const list = this.lists.get(listKey);
    if (!list) {
      return;
    }
    // work out the max index
    let max = -1;
    for (const n in list.roomIndexToRoomId) {
      if (Number(n) > max) {
        max = Number(n);
      }
    }
    if (max < 0 || index > max) {
      return;
    }
    // Everything higher than the gap needs to be shifted left.
    this.shiftLeft(listKey, max, index);
    delete list.roomIndexToRoomId[max];
  }
  addEntry(listKey, index) {
    const list = this.lists.get(listKey);
    if (!list) {
      return;
    }
    // work out the max index
    let max = -1;
    for (const n in list.roomIndexToRoomId) {
      if (Number(n) > max) {
        max = Number(n);
      }
    }
    if (max < 0 || index > max) {
      return;
    }
    // Everything higher than the gap needs to be shifted right, +1 so we don't delete the highest element
    this.shiftRight(listKey, max + 1, index);
  }
  processListOps(list, listKey) {
    let gapIndex = -1;
    const listData = this.lists.get(listKey);
    if (!listData) {
      return;
    }
    list.ops.forEach(op => {
      if (!listData) {
        return;
      }
      switch (op.op) {
        case "DELETE":
          {
            _logger.logger.debug("DELETE", listKey, op.index, ";");
            delete listData.roomIndexToRoomId[op.index];
            if (gapIndex !== -1) {
              // we already have a DELETE operation to process, so process it.
              this.removeEntry(listKey, gapIndex);
            }
            gapIndex = op.index;
            break;
          }
        case "INSERT":
          {
            _logger.logger.debug("INSERT", listKey, op.index, op.room_id, ";");
            if (listData.roomIndexToRoomId[op.index]) {
              // something is in this space, shift items out of the way
              if (gapIndex < 0) {
                // we haven't been told where to shift from, so make way for a new room entry.
                this.addEntry(listKey, op.index);
              } else if (gapIndex > op.index) {
                // the gap is further down the list, shift every element to the right
                // starting at the gap so we can just shift each element in turn:
                // [A,B,C,_] gapIndex=3, op.index=0
                // [A,B,C,C] i=3
                // [A,B,B,C] i=2
                // [A,A,B,C] i=1
                // Terminate. We'll assign into op.index next.
                this.shiftRight(listKey, gapIndex, op.index);
              } else if (gapIndex < op.index) {
                // the gap is further up the list, shift every element to the left
                // starting at the gap so we can just shift each element in turn
                this.shiftLeft(listKey, op.index, gapIndex);
              }
            }
            // forget the gap, we don't need it anymore. This is outside the check for
            // a room being present in this index position because INSERTs always universally
            // forget the gap, not conditionally based on the presence of a room in the INSERT
            // position. Without this, DELETE 0; INSERT 0; would do the wrong thing.
            gapIndex = -1;
            listData.roomIndexToRoomId[op.index] = op.room_id;
            break;
          }
        case "INVALIDATE":
          {
            const startIndex = op.range[0];
            for (let i = startIndex; i <= op.range[1]; i++) {
              delete listData.roomIndexToRoomId[i];
            }
            _logger.logger.debug("INVALIDATE", listKey, op.range[0], op.range[1], ";");
            break;
          }
        case "SYNC":
          {
            const startIndex = op.range[0];
            for (let i = startIndex; i <= op.range[1]; i++) {
              const roomId = op.room_ids[i - startIndex];
              if (!roomId) {
                break; // we are at the end of list
              }
              listData.roomIndexToRoomId[i] = roomId;
            }
            _logger.logger.debug("SYNC", listKey, op.range[0], op.range[1], (op.room_ids || []).join(" "), ";");
            break;
          }
      }
    });
    if (gapIndex !== -1) {
      // we already have a DELETE operation to process, so process it
      // Everything higher than the gap needs to be shifted left.
      this.removeEntry(listKey, gapIndex);
    }
  }

  /**
   * Resend a Sliding Sync request. Used when something has changed in the request. Resolves with
   * the transaction ID of this request on success. Rejects with the transaction ID of this request
   * on failure.
   */
  resend() {
    if (this.needsResend && this.txnIdDefers.length > 0) {
      // we already have a resend queued, so just return the same promise
      return this.txnIdDefers[this.txnIdDefers.length - 1].promise;
    }
    this.needsResend = true;
    this.txnId = this.client.makeTxnId();
    const d = (0, _utils.defer)();
    this.txnIdDefers.push(_objectSpread(_objectSpread({}, d), {}, {
      txnId: this.txnId
    }));
    this.abortController?.abort();
    this.abortController = new AbortController();
    return d.promise;
  }
  resolveTransactionDefers(txnId) {
    if (!txnId) {
      return;
    }
    // find the matching index
    let txnIndex = -1;
    for (let i = 0; i < this.txnIdDefers.length; i++) {
      if (this.txnIdDefers[i].txnId === txnId) {
        txnIndex = i;
        break;
      }
    }
    if (txnIndex === -1) {
      // this shouldn't happen; we shouldn't be seeing txn_ids for things we don't know about,
      // whine about it.
      _logger.logger.warn(`resolveTransactionDefers: seen ${txnId} but it isn't a pending txn, ignoring.`);
      return;
    }
    // This list is sorted in time, so if the input txnId ACKs in the middle of this array,
    // then everything before it that hasn't been ACKed yet never will and we should reject them.
    for (let i = 0; i < txnIndex; i++) {
      this.txnIdDefers[i].reject(this.txnIdDefers[i].txnId);
    }
    this.txnIdDefers[txnIndex].resolve(txnId);
    // clear out settled promises, including the one we resolved.
    this.txnIdDefers = this.txnIdDefers.slice(txnIndex + 1);
  }

  /**
   * Stop syncing with the server.
   */
  stop() {
    this.terminated = true;
    this.abortController?.abort();
    // remove all listeners so things can be GC'd
    this.removeAllListeners(SlidingSyncEvent.Lifecycle);
    this.removeAllListeners(SlidingSyncEvent.List);
    this.removeAllListeners(SlidingSyncEvent.RoomData);
  }

  /**
   * Re-setup this connection e.g in the event of an expired session.
   */
  resetup() {
    _logger.logger.warn("SlidingSync: resetting connection info");
    // any pending txn ID defers will be forgotten already by the server, so clear them out
    this.txnIdDefers.forEach(d => {
      d.reject(d.txnId);
    });
    this.txnIdDefers = [];
    // resend sticky params and de-confirm all subscriptions
    this.lists.forEach(l => {
      l.setModified(true);
    });
    this.confirmedRoomSubscriptions = new Set(); // leave desired ones alone though!
    // reset the connection as we might be wedged
    this.needsResend = true;
    this.abortController?.abort();
    this.abortController = new AbortController();
  }

  /**
   * Start syncing with the server. Blocks until stopped.
   */
  async start() {
    this.abortController = new AbortController();
    let currentPos;
    while (!this.terminated) {
      this.needsResend = false;
      let doNotUpdateList = false;
      let resp;
      try {
        const listModifiedCount = this.listModifiedCount;
        const reqLists = {};
        this.lists.forEach((l, key) => {
          reqLists[key] = l.getList(false);
        });
        const reqBody = {
          lists: reqLists,
          pos: currentPos,
          timeout: this.timeoutMS,
          clientTimeout: this.timeoutMS + BUFFER_PERIOD_MS,
          extensions: this.getExtensionRequest(currentPos === undefined)
        };
        // check if we are (un)subscribing to a room and modify request this one time for it
        const newSubscriptions = difference(this.desiredRoomSubscriptions, this.confirmedRoomSubscriptions);
        const unsubscriptions = difference(this.confirmedRoomSubscriptions, this.desiredRoomSubscriptions);
        if (unsubscriptions.size > 0) {
          reqBody.unsubscribe_rooms = Array.from(unsubscriptions);
        }
        if (newSubscriptions.size > 0) {
          reqBody.room_subscriptions = {};
          for (const roomId of newSubscriptions) {
            const customSubName = this.roomIdToCustomSubscription.get(roomId);
            let sub = this.roomSubscriptionInfo;
            if (customSubName && this.customSubscriptions.has(customSubName)) {
              sub = this.customSubscriptions.get(customSubName);
            }
            reqBody.room_subscriptions[roomId] = sub;
          }
        }
        if (this.txnId) {
          reqBody.txn_id = this.txnId;
          this.txnId = null;
        }
        this.pendingReq = this.client.slidingSync(reqBody, this.proxyBaseUrl, this.abortController.signal);
        resp = await this.pendingReq;
        currentPos = resp.pos;
        // update what we think we're subscribed to.
        for (const roomId of newSubscriptions) {
          this.confirmedRoomSubscriptions.add(roomId);
        }
        for (const roomId of unsubscriptions) {
          this.confirmedRoomSubscriptions.delete(roomId);
        }
        if (listModifiedCount !== this.listModifiedCount) {
          // the lists have been modified whilst we were waiting for 'await' to return, but the abort()
          // call did nothing. It is NOT SAFE to modify the list array now. We'll process the response but
          // not update list pointers.
          _logger.logger.debug("list modified during await call, not updating list");
          doNotUpdateList = true;
        }
        // mark all these lists as having been sent as sticky so we don't keep sending sticky params
        this.lists.forEach(l => {
          l.setModified(false);
        });
        // set default empty values so we don't need to null check
        resp.lists = resp.lists || {};
        resp.rooms = resp.rooms || {};
        resp.extensions = resp.extensions || {};
        Object.keys(resp.lists).forEach(key => {
          const list = this.lists.get(key);
          if (!list || !resp) {
            return;
          }
          list.joinedCount = resp.lists[key].count;
        });
        this.invokeLifecycleListeners(SlidingSyncState.RequestFinished, resp);
      } catch (err) {
        if (err.httpStatus) {
          this.invokeLifecycleListeners(SlidingSyncState.RequestFinished, null, err);
          if (err.httpStatus === 400) {
            // session probably expired TODO: assign an errcode
            // so drop state and re-request
            this.resetup();
            currentPos = undefined;
            await (0, _utils.sleep)(50); // in case the 400 was for something else; don't tightloop
            continue;
          } // else fallthrough to generic error handling
        } else if (this.needsResend || err.name === "AbortError") {
          continue; // don't sleep as we caused this error by abort()ing the request.
        }
        _logger.logger.error(err);
        await (0, _utils.sleep)(5000);
      }
      if (!resp) {
        continue;
      }
      await this.onPreExtensionsResponse(resp.extensions);
      for (const roomId in resp.rooms) {
        await this.invokeRoomDataListeners(roomId, resp.rooms[roomId]);
      }
      const listKeysWithUpdates = new Set();
      if (!doNotUpdateList) {
        for (const [key, list] of Object.entries(resp.lists)) {
          list.ops = list.ops || [];
          if (list.ops.length > 0) {
            listKeysWithUpdates.add(key);
          }
          this.processListOps(list, key);
        }
      }
      this.invokeLifecycleListeners(SlidingSyncState.Complete, resp);
      await this.onPostExtensionsResponse(resp.extensions);
      listKeysWithUpdates.forEach(listKey => {
        const list = this.lists.get(listKey);
        if (!list) {
          return;
        }
        this.emit(SlidingSyncEvent.List, listKey, list.joinedCount, Object.assign({}, list.roomIndexToRoomId));
      });
      this.resolveTransactionDefers(resp.txn_id);
    }
  }
}
exports.SlidingSync = SlidingSync;
const difference = (setA, setB) => {
  const diff = new Set(setA);
  for (const elem of setB) {
    diff.delete(elem);
  }
  return diff;
};