"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomReceipts = void 0;
var _read_receipts = require("../@types/read_receipts.js");
var _client = require("../client.js");
var _room = require("./room.js");
var _logger = require("../logger.js");
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
/**
 * The latest receipts we have for a room.
 */
class RoomReceipts {
  constructor(room) {
    _defineProperty(this, "room", void 0);
    _defineProperty(this, "threadedReceipts", void 0);
    _defineProperty(this, "unthreadedReceipts", void 0);
    _defineProperty(this, "danglingReceipts", void 0);
    /**
     * Look for dangling receipts for the given event ID,
     * and add them to the thread of unthread receipts if found.
     * @param event - the event to look for
     */
    _defineProperty(this, "onTimelineEvent", event => {
      const eventId = event.getId();
      if (!eventId) return;
      const danglingReceipts = this.danglingReceipts.remove(eventId);
      danglingReceipts?.forEach(danglingReceipt => {
        // The receipt is a thread receipt
        if (danglingReceipt.receipt.thread_id) {
          this.threadedReceipts.set(danglingReceipt.receipt.thread_id, danglingReceipt.eventId, danglingReceipt.receiptType, danglingReceipt.userId, danglingReceipt.receipt.ts, danglingReceipt.synthetic);
        } else {
          this.unthreadedReceipts.set(eventId, danglingReceipt.receiptType, danglingReceipt.userId, danglingReceipt.receipt.ts, danglingReceipt.synthetic);
        }
      });
    });
    this.room = room;
    this.threadedReceipts = new ThreadedReceipts(room);
    this.unthreadedReceipts = new ReceiptsByUser(room);
    this.danglingReceipts = new DanglingReceipts();
    // We listen for timeline events so we can process dangling receipts
    room.on(_room.RoomEvent.Timeline, this.onTimelineEvent);
  }

  /**
   * Remember the receipt information supplied. For each receipt:
   *
   * If we don't have the event for this receipt, store it as "dangling" so we
   * can process it later.
   *
   * Otherwise store it per-user in either the threaded store for its
   * thread_id, or the unthreaded store if there is no thread_id.
   *
   * Ignores any receipt that is before an existing receipt for the same user
   * (in the same thread, if applicable). "Before" is defined by the
   * unfilteredTimelineSet of the room.
   */
  add(receiptContent, synthetic) {
    /*
        Transform this structure:
        {
          "$EVENTID": {
            "m.read|m.read.private": {
              "@user:example.org": {
                "ts": 1661,
                "thread_id": "main|$THREAD_ROOT_ID" // or missing/undefined for an unthreaded receipt
              }
            }
          },
          ...
        }
        into maps of:
        threaded :: threadid :: userId :: ReceiptInfo
        unthreaded :: userId :: ReceiptInfo
        dangling :: eventId :: DanglingReceipt
    */
    for (const [eventId, eventReceipt] of Object.entries(receiptContent)) {
      for (const [receiptType, receiptsByUser] of Object.entries(eventReceipt)) {
        for (const [userId, receipt] of Object.entries(receiptsByUser)) {
          const referencedEvent = this.room.findEventById(eventId);
          if (!referencedEvent) {
            this.danglingReceipts.add(new DanglingReceipt(eventId, receiptType, userId, receipt, synthetic));
          } else if (receipt.thread_id) {
            this.threadedReceipts.set(receipt.thread_id, eventId, receiptType, userId, receipt.ts, synthetic);
          } else {
            this.unthreadedReceipts.set(eventId, receiptType, userId, receipt.ts, synthetic);
          }
        }
      }
    }
  }
  hasUserReadEvent(userId, eventId) {
    const unthreaded = this.unthreadedReceipts.get(userId);
    if (unthreaded) {
      if (isAfterOrSame(unthreaded.eventId, eventId, this.room)) {
        // The unthreaded receipt is after this event, so we have read it.
        return true;
      }
    }
    const event = this.room.findEventById(eventId);
    if (!event) {
      // We don't know whether the user has read it - default to caution and say no.
      // This shouldn't really happen and feels like it ought to be an exception: let's
      // log a warn for now.
      _logger.logger.warn(`hasUserReadEvent event ID ${eventId} not found in room ${this.room.roomId}: this shouldn't happen!`);
      return false;
    }
    const threadId = (0, _client.threadIdForReceipt)(event);
    const threaded = this.threadedReceipts.get(threadId, userId);
    if (threaded) {
      if (isAfterOrSame(threaded.eventId, eventId, this.room)) {
        // The threaded receipt is after this event, so we have read it.
        return true;
      }
    }

    // TODO: what if they sent the second-last event in the thread?
    if (this.userSentLatestEventInThread(threadId, userId)) {
      // The user sent the latest message in this event's thread, so we
      // consider everything in the thread to be read.
      //
      // Note: maybe we don't need this because synthetic receipts should
      // do this job for us?
      return true;
    }

    // Neither of the receipts were after the event, so it's unread.
    return false;
  }

  /**
   * @returns true if the thread with this ID can be found, and the supplied
   *          user sent the latest message in it.
   */
  userSentLatestEventInThread(threadId, userId) {
    const timeline = threadId === _read_receipts.MAIN_ROOM_TIMELINE ? this.room.getLiveTimeline().getEvents() : this.room.getThread(threadId)?.timeline;
    return !!(timeline && timeline.length > 0 && timeline[timeline.length - 1].getSender() === userId);
  }
}

// --- implementation details ---

/**
 * The information "inside" a receipt once it has been stored inside
 * RoomReceipts - what eventId it refers to, its type, and its ts.
 *
 * Does not contain userId or threadId since these are stored as keys of the
 * maps in RoomReceipts.
 */
exports.RoomReceipts = RoomReceipts;
class ReceiptInfo {
  constructor(eventId, receiptType, ts) {
    this.eventId = eventId;
    this.receiptType = receiptType;
    this.ts = ts;
  }
}

/**
 * Everything we know about a receipt that is "dangling" because we can't find
 * the event to which it refers.
 */
class DanglingReceipt {
  constructor(eventId, receiptType, userId, receipt, synthetic) {
    this.eventId = eventId;
    this.receiptType = receiptType;
    this.userId = userId;
    this.receipt = receipt;
    this.synthetic = synthetic;
  }
}
class UserReceipts {
  constructor(room) {
    _defineProperty(this, "room", void 0);
    /**
     * The real receipt for this user.
     */
    _defineProperty(this, "real", void 0);
    /**
     * The synthetic receipt for this user. If this is defined, it is later than real.
     */
    _defineProperty(this, "synthetic", void 0);
    this.room = room;
    this.real = undefined;
    this.synthetic = undefined;
  }
  set(synthetic, receiptInfo) {
    if (synthetic) {
      this.synthetic = receiptInfo;
    } else {
      this.real = receiptInfo;
    }

    // Preserve the invariant: synthetic is only defined if it's later than real
    if (this.synthetic && this.real) {
      if (isAfterOrSame(this.real.eventId, this.synthetic.eventId, this.room)) {
        this.synthetic = undefined;
      }
    }
  }

  /**
   * Return the latest receipt we have - synthetic if we have one (and it's
   * later), otherwise real.
   */
  get() {
    // Relies on the invariant that synthetic is only defined if it's later than real.
    return this.synthetic ?? this.real;
  }

  /**
   * Return the latest receipt we have of the specified type (synthetic or not).
   */
  getByType(synthetic) {
    return synthetic ? this.synthetic : this.real;
  }
}

/**
 * The latest receipt info we have, either for a single thread, or all the
 * unthreaded receipts for a room.
 *
 * userId: ReceiptInfo
 */
class ReceiptsByUser {
  constructor(room) {
    _defineProperty(this, "room", void 0);
    /** map of userId: UserReceipts */
    _defineProperty(this, "data", void 0);
    this.room = room;
    this.data = new Map();
  }

  /**
   * Add the supplied receipt to our structure, if it is not earlier than the
   * one we already hold for this user.
   */
  set(eventId, receiptType, userId, ts, synthetic) {
    const userReceipts = getOrCreate(this.data, userId, () => new UserReceipts(this.room));
    const existingReceipt = userReceipts.getByType(synthetic);
    if (existingReceipt && isAfter(existingReceipt.eventId, eventId, this.room)) {
      // The new receipt is before the existing one - don't store it.
      return;
    }

    // Possibilities:
    //
    // 1. there was no existing receipt, or
    // 2. the existing receipt was before this one, or
    // 3. we were unable to compare the receipts.
    //
    // In the case of 3 it's difficult to decide what to do, so the
    // most-recently-received receipt wins.
    //
    // Case 3 can only happen if the events for these receipts have
    // disappeared, which is quite unlikely since the new one has just been
    // checked, and the old one was checked before it was inserted here.
    //
    // We go ahead and store this receipt (replacing the other if it exists)
    userReceipts.set(synthetic, new ReceiptInfo(eventId, receiptType, ts));
  }

  /**
   * Find the latest receipt we have for this user. (Note - there is only one
   * receipt per user, because we are already inside a specific thread or
   * unthreaded list.)
   *
   * If there is a later synthetic receipt for this user, return that.
   * Otherwise, return the real receipt.
   *
   * @returns the found receipt info, or undefined if we have no receipt for this user.
   */
  get(userId) {
    return this.data.get(userId)?.get();
  }
}

/**
 * The latest threaded receipts we have for a room.
 */
class ThreadedReceipts {
  constructor(room) {
    _defineProperty(this, "room", void 0);
    /** map of threadId: ReceiptsByUser */
    _defineProperty(this, "data", void 0);
    this.room = room;
    this.data = new Map();
  }

  /**
   * Add the supplied receipt to our structure, if it is not earlier than one
   * we already hold for this user in this thread.
   */
  set(threadId, eventId, receiptType, userId, ts, synthetic) {
    const receiptsByUser = getOrCreate(this.data, threadId, () => new ReceiptsByUser(this.room));
    receiptsByUser.set(eventId, receiptType, userId, ts, synthetic);
  }

  /**
   * Find the latest threaded receipt for the supplied user in the supplied thread.
   *
   * @returns the found receipt info or undefined if we don't have one.
   */
  get(threadId, userId) {
    return this.data.get(threadId)?.get(userId);
  }
}

/**
 * All the receipts that we have received but can't process because we can't
 * find the event they refer to.
 *
 * We hold on to them so we can process them if their event arrives later.
 */
class DanglingReceipts {
  constructor() {
    /**
     * eventId: DanglingReceipt[]
     */
    _defineProperty(this, "data", new Map());
  }
  /**
   * Remember the supplied dangling receipt.
   */
  add(danglingReceipt) {
    const danglingReceipts = getOrCreate(this.data, danglingReceipt.eventId, () => []);
    danglingReceipts.push(danglingReceipt);
  }

  /**
   * Remove and return the dangling receipts for the given event ID.
   * @param eventId - the event ID to look for
   * @returns the found dangling receipts, or undefined if we don't have one.
   */
  remove(eventId) {
    const danglingReceipts = this.data.get(eventId);
    this.data.delete(eventId);
    return danglingReceipts;
  }
}
function getOrCreate(m, key, createFn) {
  const found = m.get(key);
  if (found) {
    return found;
  } else {
    const created = createFn();
    m.set(key, created);
    return created;
  }
}

/**
 * Is left after right (or the same)?
 *
 * Only returns true if both events can be found, and left is after or the same
 * as right.
 *
 * @returns left \>= right
 */
function isAfterOrSame(leftEventId, rightEventId, room) {
  const comparison = room.compareEventOrdering(leftEventId, rightEventId);
  return comparison !== null && comparison >= 0;
}

/**
 * Is left strictly after right?
 *
 * Only returns true if both events can be found, and left is strictly after right.
 *
 * @returns left \> right
 */
function isAfter(leftEventId, rightEventId, room) {
  const comparison = room.compareEventOrdering(leftEventId, rightEventId);
  return comparison !== null && comparison > 0;
}