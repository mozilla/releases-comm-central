"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ReadReceipt = exports.MAIN_ROOM_TIMELINE = void 0;
exports.synthesizeReceipt = synthesizeReceipt;
var _read_receipts = require("../@types/read_receipts");
var _matrix = require("../matrix");
var _typedEventEmitter = require("./typed-event-emitter");
var utils = _interopRequireWildcard(require("../utils"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
const MAIN_ROOM_TIMELINE = "main";
exports.MAIN_ROOM_TIMELINE = MAIN_ROOM_TIMELINE;
function synthesizeReceipt(userId, event, receiptType) {
  return new _matrix.MatrixEvent({
    content: {
      [event.getId()]: {
        [receiptType]: {
          [userId]: {
            ts: event.getTs(),
            threadId: event.threadRootId ?? MAIN_ROOM_TIMELINE
          }
        }
      }
    },
    type: _matrix.EventType.Receipt,
    room_id: event.getRoomId()
  });
}
const ReceiptPairRealIndex = 0;
const ReceiptPairSyntheticIndex = 1;
// We will only hold a synthetic receipt if we do not have a real receipt or the synthetic is newer.

class ReadReceipt extends _typedEventEmitter.TypedEventEmitter {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "receipts", {});
    _defineProperty(this, "receiptCacheByEventId", {});
    _defineProperty(this, "timeline", void 0);
  }
  /**
   * Gets the latest receipt for a given user in the room
   * @param userId The id of the user for which we want the receipt
   * @param ignoreSynthesized Whether to ignore synthesized receipts or not
   * @param receiptType Optional. The type of the receipt we want to get
   * @returns the latest receipts of the chosen type for the chosen user
   */
  getReadReceiptForUserId(userId, ignoreSynthesized = false, receiptType = _read_receipts.ReceiptType.Read) {
    const [realReceipt, syntheticReceipt] = this.receipts[receiptType]?.[userId] ?? [];
    if (ignoreSynthesized) {
      return realReceipt;
    }
    return syntheticReceipt ?? realReceipt;
  }

  /**
   * Get the ID of the event that a given user has read up to, or null if we
   * have received no read receipts from them.
   * @param {String} userId The user ID to get read receipt event ID for
   * @param {Boolean} ignoreSynthesized If true, return only receipts that have been
   *                                    sent by the server, not implicit ones generated
   *                                    by the JS SDK.
   * @return {String} ID of the latest event that the given user has read, or null.
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
    if (!this.receipts[receiptType]) {
      this.receipts[receiptType] = {};
    }
    if (!this.receipts[receiptType][userId]) {
      this.receipts[receiptType][userId] = [null, null];
    }
    const pair = this.receipts[receiptType][userId];
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
    if (cachedReceipt && this.receiptCacheByEventId[cachedReceipt.eventId]) {
      const previousEventId = cachedReceipt.eventId;
      // Remove the receipt we're about to clobber out of existence from the cache
      this.receiptCacheByEventId[previousEventId] = this.receiptCacheByEventId[previousEventId].filter(r => {
        return r.type !== receiptType || r.userId !== userId;
      });
      if (this.receiptCacheByEventId[previousEventId].length < 1) {
        delete this.receiptCacheByEventId[previousEventId]; // clean up the cache keys
      }
    }

    // cache the new one
    if (!this.receiptCacheByEventId[eventId]) {
      this.receiptCacheByEventId[eventId] = [];
    }
    this.receiptCacheByEventId[eventId].push({
      userId: userId,
      type: receiptType,
      data: receipt
    });
  }

  /**
   * Get a list of receipts for the given event.
   * @param {MatrixEvent} event the event to get receipts for
   * @return {Object[]} A list of receipts with a userId, type and data keys or
   * an empty list.
   */
  getReceiptsForEvent(event) {
    return this.receiptCacheByEventId[event.getId()] || [];
  }
  /**
   * Add a temporary local-echo receipt to the room to reflect in the
   * client the fact that we've sent one.
   * @param {string} userId The user ID if the receipt sender
   * @param {MatrixEvent} e The event that is to be acknowledged
   * @param {ReceiptType} receiptType The type of receipt
   */
  addLocalEchoReceipt(userId, e, receiptType) {
    this.addReceipt(synthesizeReceipt(userId, e, receiptType), true);
  }

  /**
   * Get a list of user IDs who have <b>read up to</b> the given event.
   * @param {MatrixEvent} event the event to get read receipts for.
   * @return {String[]} A list of user IDs.
   */
  getUsersReadUpTo(event) {
    return this.getReceiptsForEvent(event).filter(function (receipt) {
      return utils.isSupportedReceiptType(receipt.type);
    }).map(function (receipt) {
      return receipt.userId;
    });
  }

  /**
   * Determines if the given user has read a particular event ID with the known
   * history of the room. This is not a definitive check as it relies only on
   * what is available to the room at the time of execution.
   * @param {String} userId The user ID to check the read state of.
   * @param {String} eventId The event ID to check if the user read.
   * @returns {Boolean} True if the user has read the event, false otherwise.
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