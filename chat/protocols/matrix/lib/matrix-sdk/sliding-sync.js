"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SlidingSyncState = exports.SlidingSyncEvent = exports.SlidingSync = exports.ExtensionState = void 0;
var _logger = require("./logger");
var _typedEventEmitter = require("./models/typed-event-emitter");
var _utils = require("./utils");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
// /sync requests allow you to set a timeout= but the request may continue
// beyond that and wedge forever, so we need to track how long we are willing
// to keep open the connection. This constant is *ADDED* to the timeout= value
// to determine the max time we're willing to wait.
const BUFFER_PERIOD_MS = 10 * 1000;

/**
 * Represents a subscription to a room or set of rooms. Controls which events are returned.
 */
let SlidingSyncState;
/**
 * Internal Class. SlidingList represents a single list in sliding sync. The list can have filters,
 * multiple sliding windows, and maintains the index->room_id mapping.
 */
exports.SlidingSyncState = SlidingSyncState;
(function (SlidingSyncState) {
  SlidingSyncState["RequestFinished"] = "FINISHED";
  SlidingSyncState["Complete"] = "COMPLETE";
})(SlidingSyncState || (exports.SlidingSyncState = SlidingSyncState = {}));
class SlidingList {
  // returned data

  /**
   * Construct a new sliding list.
   * @param {MSC3575List} list The range, sort and filter values to use for this list.
   */
  constructor(list) {
    _defineProperty(this, "list", void 0);
    _defineProperty(this, "isModified", void 0);
    _defineProperty(this, "roomIndexToRoomId", {});
    _defineProperty(this, "joinedCount", 0);
    this.replaceList(list);
  }

  /**
   * Mark this list as modified or not. Modified lists will return sticky params with calls to getList.
   * This is useful for the first time the list is sent, or if the list has changed in some way.
   * @param modified True to mark this list as modified so all sticky parameters will be re-sent.
   */
  setModified(modified) {
    this.isModified = modified;
  }

  /**
   * Update the list range for this list. Does not affect modified status as list ranges are non-sticky.
   * @param newRanges The new ranges for the list
   */
  updateListRange(newRanges) {
    this.list.ranges = JSON.parse(JSON.stringify(newRanges));
  }

  /**
   * Replace list parameters. All fields will be replaced with the new list parameters.
   * @param list The new list parameters
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
   * @param {boolean} forceIncludeAllParams True to forcibly include all params even if the list
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
   * @param i The index to check
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
let ExtensionState;
/**
 * An interface that must be satisfied to register extensions
 */
exports.ExtensionState = ExtensionState;
(function (ExtensionState) {
  ExtensionState["PreProcess"] = "ExtState.PreProcess";
  ExtensionState["PostProcess"] = "ExtState.PostProcess";
})(ExtensionState || (exports.ExtensionState = ExtensionState = {}));
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
let SlidingSyncEvent;
exports.SlidingSyncEvent = SlidingSyncEvent;
(function (SlidingSyncEvent) {
  SlidingSyncEvent["RoomData"] = "SlidingSync.RoomData";
  SlidingSyncEvent["Lifecycle"] = "SlidingSync.Lifecycle";
  SlidingSyncEvent["List"] = "SlidingSync.List";
})(SlidingSyncEvent || (exports.SlidingSyncEvent = SlidingSyncEvent = {}));
/**
 * SlidingSync is a high-level data structure which controls the majority of sliding sync.
 * It has no hooks into JS SDK except for needing a MatrixClient to perform the HTTP request.
 * This means this class (and everything it uses) can be used in isolation from JS SDK if needed.
 * To hook this up with the JS SDK, you need to use SlidingSyncSdk.
 */
class SlidingSync extends _typedEventEmitter.TypedEventEmitter {
  // flag set when resend() is called because we cannot rely on detecting AbortError in JS SDK :(

  // the txn_id to send with the next request.

  // a list (in chronological order of when they were sent) of objects containing the txn ID and
  // a defer to resolve/reject depending on whether they were successfully sent or not.

  // map of extension name to req/resp handler

  // the *desired* room subscriptions

  /**
   * Create a new sliding sync instance
   * @param {string} proxyBaseUrl The base URL of the sliding sync proxy
   * @param {MSC3575List[]} lists The lists to use for sliding sync.
   * @param {MSC3575RoomSubscription} roomSubscriptionInfo The params to use for room subscriptions.
   * @param {MatrixClient} client The client to use for /sync calls.
   * @param {number} timeoutMS The number of milliseconds to wait for a response.
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
    _defineProperty(this, "needsResend", false);
    _defineProperty(this, "txnId", null);
    _defineProperty(this, "txnIdDefers", []);
    _defineProperty(this, "extensions", {});
    _defineProperty(this, "desiredRoomSubscriptions", new Set());
    _defineProperty(this, "confirmedRoomSubscriptions", new Set());
    _defineProperty(this, "pendingReq", void 0);
    _defineProperty(this, "abortController", void 0);
    this.lists = lists.map(l => new SlidingList(l));
  }

  /**
   * Get the length of the sliding lists.
   * @returns The number of lists in the sync request
   */
  listLength() {
    return this.lists.length;
  }

  /**
   * Get the room data for a list.
   * @param index The list index
   * @returns The list data which contains the rooms in this list
   */
  getListData(index) {
    if (!this.lists[index]) {
      return null;
    }
    return {
      joinedCount: this.lists[index].joinedCount,
      roomIndexToRoomId: Object.assign({}, this.lists[index].roomIndexToRoomId)
    };
  }

  /**
   * Get the full list parameters for a list index. This function is provided for callers to use
   * in conjunction with setList to update fields on an existing list.
   * @param index The list index to get the list for.
   * @returns A copy of the list or undefined.
   */
  getList(index) {
    if (!this.lists[index]) {
      return null;
    }
    return this.lists[index].getList(true);
  }

  /**
   * Set new ranges for an existing list. Calling this function when _only_ the ranges have changed
   * is more efficient than calling setList(index,list) as this function won't resend sticky params,
   * whereas setList always will.
   * @param index The list index to modify
   * @param ranges The new ranges to apply.
   * @return A promise which resolves to the transaction ID when it has been received down sync
   * (or rejects with the transaction ID if the action was not applied e.g the request was cancelled
   * immediately after sending, in which case the action will be applied in the subsequent request)
   */
  setListRanges(index, ranges) {
    this.lists[index].updateListRange(ranges);
    return this.resend();
  }

  /**
   * Add or replace a list. Calling this function will interrupt the /sync request to resend new
   * lists.
   * @param index The index to modify
   * @param list The new list parameters.
   * @return A promise which resolves to the transaction ID when it has been received down sync
   * (or rejects with the transaction ID if the action was not applied e.g the request was cancelled
   * immediately after sending, in which case the action will be applied in the subsequent request)
   */
  setList(index, list) {
    if (this.lists[index]) {
      this.lists[index].replaceList(list);
    } else {
      this.lists[index] = new SlidingList(list);
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
   * @param s The new desired room subscriptions.
   * @return A promise which resolves to the transaction ID when it has been received down sync
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
   * @param rs The new room subscription fields to fetch.
   * @return A promise which resolves to the transaction ID when it has been received down sync
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
   * @param ext The extension to register.
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
  onPreExtensionsResponse(ext) {
    Object.keys(ext).forEach(extName => {
      if (this.extensions[extName].when() == ExtensionState.PreProcess) {
        this.extensions[extName].onResponse(ext[extName]);
      }
    });
  }
  onPostExtensionsResponse(ext) {
    Object.keys(ext).forEach(extName => {
      if (this.extensions[extName].when() == ExtensionState.PostProcess) {
        this.extensions[extName].onResponse(ext[extName]);
      }
    });
  }

  /**
   * Invoke all attached room data listeners.
   * @param {string} roomId The room which received some data.
   * @param {object} roomData The raw sliding sync response JSON.
   */
  invokeRoomDataListeners(roomId, roomData) {
    if (!roomData.required_state) {
      roomData.required_state = [];
    }
    if (!roomData.timeline) {
      roomData.timeline = [];
    }
    this.emit(SlidingSyncEvent.RoomData, roomId, roomData);
  }

  /**
   * Invoke all attached lifecycle listeners.
   * @param {SlidingSyncState} state The Lifecycle state
   * @param {object} resp The raw sync response JSON
   * @param {Error?} err Any error that occurred when making the request e.g. network errors.
   */
  invokeLifecycleListeners(state, resp, err) {
    this.emit(SlidingSyncEvent.Lifecycle, state, resp, err);
  }
  shiftRight(listIndex, hi, low) {
    //     l   h
    // 0,1,2,3,4 <- before
    // 0,1,2,2,3 <- after, hi is deleted and low is duplicated
    for (let i = hi; i > low; i--) {
      if (this.lists[listIndex].isIndexInRange(i)) {
        this.lists[listIndex].roomIndexToRoomId[i] = this.lists[listIndex].roomIndexToRoomId[i - 1];
      }
    }
  }
  shiftLeft(listIndex, hi, low) {
    //     l   h
    // 0,1,2,3,4 <- before
    // 0,1,3,4,4 <- after, low is deleted and hi is duplicated
    for (let i = low; i < hi; i++) {
      if (this.lists[listIndex].isIndexInRange(i)) {
        this.lists[listIndex].roomIndexToRoomId[i] = this.lists[listIndex].roomIndexToRoomId[i + 1];
      }
    }
  }
  removeEntry(listIndex, index) {
    // work out the max index
    let max = -1;
    for (const n in this.lists[listIndex].roomIndexToRoomId) {
      if (Number(n) > max) {
        max = Number(n);
      }
    }
    if (max < 0 || index > max) {
      return;
    }
    // Everything higher than the gap needs to be shifted left.
    this.shiftLeft(listIndex, max, index);
    delete this.lists[listIndex].roomIndexToRoomId[max];
  }
  addEntry(listIndex, index) {
    // work out the max index
    let max = -1;
    for (const n in this.lists[listIndex].roomIndexToRoomId) {
      if (Number(n) > max) {
        max = Number(n);
      }
    }
    if (max < 0 || index > max) {
      return;
    }
    // Everything higher than the gap needs to be shifted right, +1 so we don't delete the highest element
    this.shiftRight(listIndex, max + 1, index);
  }
  processListOps(list, listIndex) {
    let gapIndex = -1;
    list.ops.forEach(op => {
      switch (op.op) {
        case "DELETE":
          {
            _logger.logger.debug("DELETE", listIndex, op.index, ";");
            delete this.lists[listIndex].roomIndexToRoomId[op.index];
            if (gapIndex !== -1) {
              // we already have a DELETE operation to process, so process it.
              this.removeEntry(listIndex, gapIndex);
            }
            gapIndex = op.index;
            break;
          }
        case "INSERT":
          {
            _logger.logger.debug("INSERT", listIndex, op.index, op.room_id, ";");
            if (this.lists[listIndex].roomIndexToRoomId[op.index]) {
              // something is in this space, shift items out of the way
              if (gapIndex < 0) {
                // we haven't been told where to shift from, so make way for a new room entry.
                this.addEntry(listIndex, op.index);
              } else if (gapIndex > op.index) {
                // the gap is further down the list, shift every element to the right
                // starting at the gap so we can just shift each element in turn:
                // [A,B,C,_] gapIndex=3, op.index=0
                // [A,B,C,C] i=3
                // [A,B,B,C] i=2
                // [A,A,B,C] i=1
                // Terminate. We'll assign into op.index next.
                this.shiftRight(listIndex, gapIndex, op.index);
              } else if (gapIndex < op.index) {
                // the gap is further up the list, shift every element to the left
                // starting at the gap so we can just shift each element in turn
                this.shiftLeft(listIndex, op.index, gapIndex);
              }
            }
            // forget the gap, we don't need it anymore. This is outside the check for
            // a room being present in this index position because INSERTs always universally
            // forget the gap, not conditionally based on the presence of a room in the INSERT
            // position. Without this, DELETE 0; INSERT 0; would do the wrong thing.
            gapIndex = -1;
            this.lists[listIndex].roomIndexToRoomId[op.index] = op.room_id;
            break;
          }
        case "INVALIDATE":
          {
            const startIndex = op.range[0];
            for (let i = startIndex; i <= op.range[1]; i++) {
              delete this.lists[listIndex].roomIndexToRoomId[i];
            }
            _logger.logger.debug("INVALIDATE", listIndex, op.range[0], op.range[1], ";");
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

              this.lists[listIndex].roomIndexToRoomId[i] = roomId;
            }
            _logger.logger.debug("SYNC", listIndex, op.range[0], op.range[1], (op.room_ids || []).join(" "), ";");
            break;
          }
      }
    });
    if (gapIndex !== -1) {
      // we already have a DELETE operation to process, so process it
      // Everything higher than the gap needs to be shifted left.
      this.removeEntry(listIndex, gapIndex);
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
        const reqBody = {
          lists: this.lists.map(l => {
            return l.getList(false);
          }),
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
            reqBody.room_subscriptions[roomId] = this.roomSubscriptionInfo;
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
        resp.lists = resp.lists || [];
        resp.rooms = resp.rooms || {};
        resp.extensions = resp.extensions || {};
        resp.lists.forEach((val, i) => {
          this.lists[i].joinedCount = val.count;
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
      this.onPreExtensionsResponse(resp.extensions);
      Object.keys(resp.rooms).forEach(roomId => {
        this.invokeRoomDataListeners(roomId, resp.rooms[roomId]);
      });
      const listIndexesWithUpdates = new Set();
      if (!doNotUpdateList) {
        resp.lists.forEach((list, listIndex) => {
          list.ops = list.ops || [];
          if (list.ops.length > 0) {
            listIndexesWithUpdates.add(listIndex);
          }
          this.processListOps(list, listIndex);
        });
      }
      this.invokeLifecycleListeners(SlidingSyncState.Complete, resp);
      this.onPostExtensionsResponse(resp.extensions);
      listIndexesWithUpdates.forEach(i => {
        this.emit(SlidingSyncEvent.List, i, this.lists[i].joinedCount, Object.assign({}, this.lists[i].roomIndexToRoomId));
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