"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ReceiptAccumulator = void 0;
var _event = require("./@types/event");
var _utils = require("./utils");
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
 * Summarises the read receipts within a room. Used by the sync accumulator.
 *
 * Given receipts for users, picks the most recently-received one and provides
 * the results in a new fake receipt event returned from
 * buildAccumulatedReceiptEvent().
 *
 * Handles unthreaded receipts and receipts in each thread separately, so the
 * returned event contains the most recently received unthreaded receipt, and
 * the most recently received receipt in each thread.
 */
class ReceiptAccumulator {
  constructor() {
    /** user_id -\> most-recently-received unthreaded receipt */
    _defineProperty(this, "unthreadedReadReceipts", new Map());
    /** thread_id -\> user_id -\> most-recently-received receipt for this thread */
    _defineProperty(this, "threadedReadReceipts", new _utils.MapWithDefault(() => new Map()));
  }
  /**
   * Provide an unthreaded receipt for this user. Overwrites any other
   * unthreaded receipt we have for this user.
   */
  setUnthreaded(userId, receipt) {
    this.unthreadedReadReceipts.set(userId, receipt);
  }

  /**
   * Provide a receipt for this user in this thread. Overwrites any other
   * receipt we have for this user in this thread.
   */
  setThreaded(threadId, userId, receipt) {
    this.threadedReadReceipts.getOrCreate(threadId).set(userId, receipt);
  }

  /**
   * @returns an iterator of pairs of [userId, AccumulatedReceipt] - all the
   *          most recently-received unthreaded receipts for each user.
   */
  allUnthreaded() {
    return this.unthreadedReadReceipts.entries();
  }

  /**
   * @returns an iterator of pairs of [userId, AccumulatedReceipt] - all the
   *          most recently-received threaded receipts for each user, in all
   *          threads.
   */
  *allThreaded() {
    for (const receiptsForThread of this.threadedReadReceipts.values()) {
      for (const e of receiptsForThread.entries()) {
        yield e;
      }
    }
  }

  /**
   * Given a list of ephemeral events, find the receipts and store the
   * relevant ones to be returned later from buildAccumulatedReceiptEvent().
   */
  consumeEphemeralEvents(events) {
    events?.forEach(e => {
      if (e.type !== _event.EventType.Receipt || !e.content) {
        // This means we'll drop unknown ephemeral events but that
        // seems okay.
        return;
      }

      // Handle m.receipt events. They clobber based on:
      //   (user_id, receipt_type)
      // but they are keyed in the event as:
      //   content:{ $event_id: { $receipt_type: { $user_id: {json} }}}
      // so store them in the former so we can accumulate receipt deltas
      // quickly and efficiently (we expect a lot of them). Fold the
      // receipt type into the key name since we only have 1 at the
      // moment (m.read) and nested JSON objects are slower and more
      // of a hassle to work with. We'll inflate this back out when
      // getJSON() is called.
      Object.keys(e.content).forEach(eventId => {
        Object.entries(e.content[eventId]).forEach(([key, value]) => {
          if (!(0, _utils.isSupportedReceiptType)(key)) return;
          for (const userId of Object.keys(value)) {
            const data = e.content[eventId][key][userId];
            const receipt = {
              data: e.content[eventId][key][userId],
              type: key,
              eventId
            };

            // In a world that supports threads, read receipts normally have
            // a `thread_id` which is either the thread they belong in or
            // `MAIN_ROOM_TIMELINE`, so we normally use `setThreaded(...)`
            // here. The `MAIN_ROOM_TIMELINE` is just treated as another
            // thread.
            //
            // We still encounter read receipts that are "unthreaded"
            // (missing the `thread_id` property). These come from clients
            // that don't support threads, and from threaded clients that
            // are doing a "Mark room as read" operation. Unthreaded
            // receipts mark everything "before" them as read, in all
            // threads, where "before" means in Sync Order i.e. the order
            // the events were received from the homeserver in a sync.
            // [Note: we have some bugs where we use timestamp order instead
            // of Sync Order, because we don't correctly remember the Sync
            // Order. See #3325.]
            //
            // Calling the wrong method will cause incorrect behavior like
            // messages re-appearing as "new" when you already read them
            // previously.
            if (!data.thread_id) {
              this.setUnthreaded(userId, receipt);
            } else {
              this.setThreaded(data.thread_id, userId, receipt);
            }
          }
        });
      });
    });
  }

  /**
   * Build a receipt event that contains all relevant information for this
   * room, taking the most recently received receipt for each user in an
   * unthreaded context, and in each thread.
   */
  buildAccumulatedReceiptEvent(roomId) {
    const receiptEvent = {
      type: _event.EventType.Receipt,
      room_id: roomId,
      content: {
        // $event_id: { "m.read": { $user_id: $json } }
      }
    };
    const receiptEventContent = new _utils.MapWithDefault(() => new _utils.MapWithDefault(() => new Map()));
    for (const [userId, receiptData] of this.allUnthreaded()) {
      receiptEventContent.getOrCreate(receiptData.eventId).getOrCreate(receiptData.type).set(userId, receiptData.data);
    }
    for (const [userId, receiptData] of this.allThreaded()) {
      receiptEventContent.getOrCreate(receiptData.eventId).getOrCreate(receiptData.type).set(userId, receiptData.data);
    }
    receiptEvent.content = (0, _utils.recursiveMapToObject)(receiptEventContent);
    return receiptEventContent.size > 0 ? receiptEvent : null;
  }
}
exports.ReceiptAccumulator = ReceiptAccumulator;