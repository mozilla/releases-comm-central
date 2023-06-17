"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ReadReceipt = void 0;
exports.synthesizeReceipt = synthesizeReceipt;
var _read_receipts = require("../@types/read_receipts");
var _typedEventEmitter = require("./typed-event-emitter");
var _utils = require("../utils");
var _event = require("./event");
var _event2 = require("../@types/event");
var _room = require("./room");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
function synthesizeReceipt(userId, event, receiptType) {
  return new _event.MatrixEvent({
    content: {
      [event.getId()]: {
        [receiptType]: {
          [userId]: {
            ts: event.getTs(),
            thread_id: event.threadRootId ?? _read_receipts.MAIN_ROOM_TIMELINE
          }
        }
      }
    },
    type: _event2.EventType.Receipt,
    room_id: event.getRoomId()
  });
}
const ReceiptPairRealIndex = 0;
const ReceiptPairSyntheticIndex = 1;
class ReadReceipt extends _typedEventEmitter.TypedEventEmitter {
  constructor(...args) {
    super(...args);
    // receipts should clobber based on receipt_type and user_id pairs hence
    // the form of this structure. This is sub-optimal for the exposed APIs
    // which pass in an event ID and get back some receipts, so we also store
    // a pre-cached list for this purpose.
    // Map: receipt type → user Id → receipt
    _defineProperty(this, "receipts", new _utils.MapWithDefault(() => new Map()));
    _defineProperty(this, "receiptCacheByEventId", new Map());
    _defineProperty(this, "timeline", void 0);
  }
  /**
   * Gets the latest receipt for a given user in the room
   * @param userId - The id of the user for which we want the receipt
   * @param ignoreSynthesized - Whether to ignore synthesized receipts or not
   * @param receiptType - Optional. The type of the receipt we want to get
   * @returns the latest receipts of the chosen type for the chosen user
   */
  getReadReceiptForUserId(userId, ignoreSynthesized = false, receiptType = _read_receipts.ReceiptType.Read) {
    const [realReceipt, syntheticReceipt] = this.receipts.get(receiptType)?.get(userId) ?? [null, null];
    if (ignoreSynthesized) {
      return realReceipt;
    }
    return syntheticReceipt ?? realReceipt;
  }

  /**
   * Get the ID of the event that a given user has read up to, or null if we
   * have received no read receipts from them.
   * @param userId - The user ID to get read receipt event ID for
   * @param ignoreSynthesized - If true, return only receipts that have been
   *                                    sent by the server, not implicit ones generated
   *                                    by the JS SDK.
   * @returns ID of the latest event that the given user has read, or null.
   */
  getEventReadUpTo(userId, ignoreSynthesized = false) {
    // XXX: This is very very ugly and I hope I won't have to ever add a new
    // receipt type here again. IMHO this should be done by the server in
    // some more intelligent manner or the client should just use timestamps

    const timelineSet = this.getUnfilteredTimelineSet();
    const publicReadReceipt = this.getReadReceiptForUserId(userId, ignoreSynthesized, _read_receipts.ReceiptType.Read);
    const privateReadReceipt = this.getReadReceiptForUserId(userId, ignoreSynthesized, _read_receipts.ReceiptType.ReadPrivate);

    // If we have both, compare them
    let comparison;
    if (publicReadReceipt?.eventId && privateReadReceipt?.eventId) {
      comparison = timelineSet.compareEventOrdering(publicReadReceipt?.eventId, privateReadReceipt?.eventId);
    }

    // If we didn't get a comparison try to compare the ts of the receipts
    if (!comparison && publicReadReceipt?.data?.ts && privateReadReceipt?.data?.ts) {
      comparison = publicReadReceipt?.data?.ts - privateReadReceipt?.data?.ts;
    }

    // The public receipt is more likely to drift out of date so the private
    // one has precedence
    if (!comparison) return privateReadReceipt?.eventId ?? publicReadReceipt?.eventId ?? null;

    // If public read receipt is older, return the private one
    return (comparison < 0 ? privateReadReceipt?.eventId : publicReadReceipt?.eventId) ?? null;
  }
  addReceiptToStructure(eventId, receiptType, userId, receipt, synthetic) {
    const receiptTypesMap = this.receipts.getOrCreate(receiptType);
    let pair = receiptTypesMap.get(userId);
    if (!pair) {
      pair = [null, null];
      receiptTypesMap.set(userId, pair);
    }
    let existingReceipt = pair[ReceiptPairRealIndex];
    if (synthetic) {
      existingReceipt = pair[ReceiptPairSyntheticIndex] ?? pair[ReceiptPairRealIndex];
    }
    if (existingReceipt) {
      // we only want to add this receipt if we think it is later than the one we already have.
      // This is managed server-side, but because we synthesize RRs locally we have to do it here too.
      const ordering = this.getUnfilteredTimelineSet().compareEventOrdering(existingReceipt.eventId, eventId);
      if (ordering !== null && ordering >= 0) {
        return;
      }
    }
    const wrappedReceipt = {
      eventId,
      data: receipt
    };
    const realReceipt = synthetic ? pair[ReceiptPairRealIndex] : wrappedReceipt;
    const syntheticReceipt = synthetic ? wrappedReceipt : pair[ReceiptPairSyntheticIndex];
    let ordering = null;
    if (realReceipt && syntheticReceipt) {
      ordering = this.getUnfilteredTimelineSet().compareEventOrdering(realReceipt.eventId, syntheticReceipt.eventId);
    }
    const preferSynthetic = ordering === null || ordering < 0;

    // we don't bother caching just real receipts by event ID as there's nothing that would read it.
    // Take the current cached receipt before we overwrite the pair elements.
    const cachedReceipt = pair[ReceiptPairSyntheticIndex] ?? pair[ReceiptPairRealIndex];
    if (synthetic && preferSynthetic) {
      pair[ReceiptPairSyntheticIndex] = wrappedReceipt;
    } else if (!synthetic) {
      pair[ReceiptPairRealIndex] = wrappedReceipt;
      if (!preferSynthetic) {
        pair[ReceiptPairSyntheticIndex] = null;
      }
    }
    const newCachedReceipt = pair[ReceiptPairSyntheticIndex] ?? pair[ReceiptPairRealIndex];
    if (cachedReceipt === newCachedReceipt) return;

    // clean up any previous cache entry
    if (cachedReceipt && this.receiptCacheByEventId.get(cachedReceipt.eventId)) {
      const previousEventId = cachedReceipt.eventId;
      // Remove the receipt we're about to clobber out of existence from the cache
      this.receiptCacheByEventId.set(previousEventId, this.receiptCacheByEventId.get(previousEventId).filter(r => {
        return r.type !== receiptType || r.userId !== userId;
      }));
      if (this.receiptCacheByEventId.get(previousEventId).length < 1) {
        this.receiptCacheByEventId.delete(previousEventId); // clean up the cache keys
      }
    }

    // cache the new one
    if (!this.receiptCacheByEventId.get(eventId)) {
      this.receiptCacheByEventId.set(eventId, []);
    }
    this.receiptCacheByEventId.get(eventId).push({
      userId: userId,
      type: receiptType,
      data: receipt
    });
  }

  /**
   * Get a list of receipts for the given event.
   * @param event - the event to get receipts for
   * @returns A list of receipts with a userId, type and data keys or
   * an empty list.
   */
  getReceiptsForEvent(event) {
    return this.receiptCacheByEventId.get(event.getId()) || [];
  }
  /**
   * This issue should also be addressed on synapse's side and is tracked as part
   * of https://github.com/matrix-org/synapse/issues/14837
   *
   * Retrieves the read receipt for the logged in user and checks if it matches
   * the last event in the room and whether that event originated from the logged
   * in user.
   * Under those conditions we can consider the context as read. This is useful
   * because we never send read receipts against our own events
   * @param userId - the logged in user
   */
  fixupNotifications(userId) {
    const receipt = this.getReadReceiptForUserId(userId, false);
    const lastEvent = this.timeline[this.timeline.length - 1];
    if (lastEvent && receipt?.eventId === lastEvent.getId() && userId === lastEvent.getSender()) {
      this.setUnread(_room.NotificationCountType.Total, 0);
      this.setUnread(_room.NotificationCountType.Highlight, 0);
    }
  }

  /**
   * Add a temporary local-echo receipt to the room to reflect in the
   * client the fact that we've sent one.
   * @param userId - The user ID if the receipt sender
   * @param e - The event that is to be acknowledged
   * @param receiptType - The type of receipt
   */
  addLocalEchoReceipt(userId, e, receiptType) {
    this.addReceipt(synthesizeReceipt(userId, e, receiptType), true);
  }

  /**
   * Get a list of user IDs who have <b>read up to</b> the given event.
   * @param event - the event to get read receipts for.
   * @returns A list of user IDs.
   */
  getUsersReadUpTo(event) {
    return this.getReceiptsForEvent(event).filter(function (receipt) {
      return (0, _utils.isSupportedReceiptType)(receipt.type);
    }).map(function (receipt) {
      return receipt.userId;
    });
  }

  /**
   * Determines if the given user has read a particular event ID with the known
   * history of the room. This is not a definitive check as it relies only on
   * what is available to the room at the time of execution.
   * @param userId - The user ID to check the read state of.
   * @param eventId - The event ID to check if the user read.
   * @returns True if the user has read the event, false otherwise.
   */
  hasUserReadEvent(userId, eventId) {
    const readUpToId = this.getEventReadUpTo(userId, false);
    if (readUpToId === eventId) return true;
    if (this.timeline?.length && this.timeline[this.timeline.length - 1].getSender() && this.timeline[this.timeline.length - 1].getSender() === userId) {
      // It doesn't matter where the event is in the timeline, the user has read
      // it because they've sent the latest event.
      return true;
    }
    for (let i = this.timeline?.length - 1; i >= 0; --i) {
      const ev = this.timeline[i];

      // If we encounter the target event first, the user hasn't read it
      // however if we encounter the readUpToId first then the user has read
      // it. These rules apply because we're iterating bottom-up.
      if (ev.getId() === eventId) return false;
      if (ev.getId() === readUpToId) return true;
    }

    // We don't know if the user has read it, so assume not.
    return false;
  }
}
exports.ReadReceipt = ReadReceipt;