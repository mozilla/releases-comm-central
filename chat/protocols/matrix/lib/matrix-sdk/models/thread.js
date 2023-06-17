"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ThreadFilterType = exports.ThreadEvent = exports.Thread = exports.THREAD_RELATION_TYPE = exports.FeatureSupport = exports.FILTER_RELATED_BY_SENDERS = exports.FILTER_RELATED_BY_REL_TYPES = void 0;
exports.determineFeatureSupport = determineFeatureSupport;
exports.threadFilterTypeToFilter = threadFilterTypeToFilter;
var _client = require("../client");
var _ReEmitter = require("../ReEmitter");
var _event = require("../@types/event");
var _event2 = require("./event");
var _eventTimeline = require("./event-timeline");
var _eventTimelineSet = require("./event-timeline-set");
var _room = require("./room");
var _NamespacedValue = require("../NamespacedValue");
var _logger = require("../logger");
var _readReceipt = require("./read-receipt");
var _read_receipts = require("../@types/read_receipts");
var _feature = require("../feature");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2021 - 2023 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
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
let ThreadEvent = /*#__PURE__*/function (ThreadEvent) {
  ThreadEvent["New"] = "Thread.new";
  ThreadEvent["Update"] = "Thread.update";
  ThreadEvent["NewReply"] = "Thread.newReply";
  ThreadEvent["ViewThread"] = "Thread.viewThread";
  ThreadEvent["Delete"] = "Thread.delete";
  return ThreadEvent;
}({});
exports.ThreadEvent = ThreadEvent;
let FeatureSupport = /*#__PURE__*/function (FeatureSupport) {
  FeatureSupport[FeatureSupport["None"] = 0] = "None";
  FeatureSupport[FeatureSupport["Experimental"] = 1] = "Experimental";
  FeatureSupport[FeatureSupport["Stable"] = 2] = "Stable";
  return FeatureSupport;
}({});
exports.FeatureSupport = FeatureSupport;
function determineFeatureSupport(stable, unstable) {
  if (stable) {
    return FeatureSupport.Stable;
  } else if (unstable) {
    return FeatureSupport.Experimental;
  } else {
    return FeatureSupport.None;
  }
}
class Thread extends _readReceipt.ReadReceipt {
  constructor(id, rootEvent, opts) {
    super();
    this.id = id;
    this.rootEvent = rootEvent;
    /**
     * A reference to all the events ID at the bottom of the threads
     */
    _defineProperty(this, "timelineSet", void 0);
    _defineProperty(this, "timeline", []);
    _defineProperty(this, "_currentUserParticipated", false);
    _defineProperty(this, "reEmitter", void 0);
    _defineProperty(this, "lastEvent", void 0);
    _defineProperty(this, "replyCount", 0);
    _defineProperty(this, "lastPendingEvent", void 0);
    _defineProperty(this, "pendingReplyCount", 0);
    _defineProperty(this, "room", void 0);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "pendingEventOrdering", void 0);
    _defineProperty(this, "initialEventsFetched", !Thread.hasServerSideSupport);
    /**
     * An array of events to add to the timeline once the thread has been initialised
     * with server suppport.
     */
    _defineProperty(this, "replayEvents", []);
    _defineProperty(this, "onBeforeRedaction", (event, redaction) => {
      if (event?.isRelation(THREAD_RELATION_TYPE.name) && this.room.eventShouldLiveIn(event).threadId === this.id && event.getId() !== this.id &&
      // the root event isn't counted in the length so ignore this redaction
      !redaction.status // only respect it when it succeeds
      ) {
        this.replyCount--;
        this.updatePendingReplyCount();
        this.emit(ThreadEvent.Update, this);
      }
    });
    _defineProperty(this, "onRedaction", async event => {
      if (event.threadRootId !== this.id) return; // ignore redactions for other timelines
      if (this.replyCount <= 0) {
        for (const threadEvent of this.timeline) {
          this.clearEventMetadata(threadEvent);
        }
        this.lastEvent = this.rootEvent;
        this._currentUserParticipated = false;
        this.emit(ThreadEvent.Delete, this);
      } else {
        await this.updateThreadMetadata();
      }
    });
    _defineProperty(this, "onTimelineEvent", (event, room, toStartOfTimeline) => {
      // Add a synthesized receipt when paginating forward in the timeline
      if (!toStartOfTimeline) {
        const sender = event.getSender();
        if (sender && room && this.shouldSendLocalEchoReceipt(sender, event)) {
          room.addLocalEchoReceipt(sender, event, _read_receipts.ReceiptType.Read);
        }
      }
      this.onEcho(event, toStartOfTimeline ?? false);
    });
    _defineProperty(this, "onLocalEcho", event => {
      this.onEcho(event, false);
    });
    _defineProperty(this, "onEcho", async (event, toStartOfTimeline) => {
      if (event.threadRootId !== this.id) return; // ignore echoes for other timelines
      if (this.lastEvent === event) return; // ignore duplicate events
      await this.updateThreadMetadata();
      if (!event.isRelation(THREAD_RELATION_TYPE.name)) return; // don't send a new reply event for reactions or edits
      if (toStartOfTimeline) return; // ignore messages added to the start of the timeline
      this.emit(ThreadEvent.NewReply, this, event);
    });
    if (!opts?.room) {
      // Logging/debugging for https://github.com/vector-im/element-web/issues/22141
      // Hope is that we end up with a more obvious stack trace.
      throw new Error("element-web#22141: A thread requires a room in order to function");
    }
    this.room = opts.room;
    this.client = opts.client;
    this.pendingEventOrdering = opts.pendingEventOrdering ?? _client.PendingEventOrdering.Chronological;
    this.timelineSet = new _eventTimelineSet.EventTimelineSet(this.room, {
      timelineSupport: true,
      pendingEvents: true
    }, this.client, this);
    this.reEmitter = new _ReEmitter.TypedReEmitter(this);
    this.reEmitter.reEmit(this.timelineSet, [_room.RoomEvent.Timeline, _room.RoomEvent.TimelineReset]);
    this.room.on(_event2.MatrixEventEvent.BeforeRedaction, this.onBeforeRedaction);
    this.room.on(_room.RoomEvent.Redaction, this.onRedaction);
    this.room.on(_room.RoomEvent.LocalEchoUpdated, this.onLocalEcho);
    this.timelineSet.on(_room.RoomEvent.Timeline, this.onTimelineEvent);
    this.processReceipts(opts.receipts);

    // even if this thread is thought to be originating from this client, we initialise it as we may be in a
    // gappy sync and a thread around this event may already exist.
    this.updateThreadMetadata();
    this.setEventMetadata(this.rootEvent);
  }
  async fetchRootEvent() {
    this.rootEvent = this.room.findEventById(this.id);
    // If the rootEvent does not exist in the local stores, then fetch it from the server.
    try {
      const eventData = await this.client.fetchRoomEvent(this.roomId, this.id);
      const mapper = this.client.getEventMapper();
      this.rootEvent = mapper(eventData); // will merge with existing event object if such is known
    } catch (e) {
      _logger.logger.error("Failed to fetch thread root to construct thread with", e);
    }
    await this.processEvent(this.rootEvent);
  }
  static setServerSideSupport(status) {
    Thread.hasServerSideSupport = status;
    if (status !== FeatureSupport.Stable) {
      FILTER_RELATED_BY_SENDERS.setPreferUnstable(true);
      FILTER_RELATED_BY_REL_TYPES.setPreferUnstable(true);
      THREAD_RELATION_TYPE.setPreferUnstable(true);
    }
  }
  static setServerSideListSupport(status) {
    Thread.hasServerSideListSupport = status;
  }
  static setServerSideFwdPaginationSupport(status) {
    Thread.hasServerSideFwdPaginationSupport = status;
  }
  shouldSendLocalEchoReceipt(sender, event) {
    const recursionSupport = this.client.canSupport.get(_feature.Feature.RelationsRecursion) ?? _feature.ServerSupport.Unsupported;
    if (recursionSupport === _feature.ServerSupport.Unsupported) {
      // Normally we add a local receipt, but if we don't have
      // recursion support, then events may arrive out of order, so we
      // only create a receipt if it's after our existing receipt.
      const oldReceiptEventId = this.getReadReceiptForUserId(sender)?.eventId;
      if (oldReceiptEventId) {
        const receiptEvent = this.findEventById(oldReceiptEventId);
        if (receiptEvent && receiptEvent.getTs() > event.getTs()) {
          return false;
        }
      }
    }
    return true;
  }
  get roomState() {
    return this.room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
  }
  addEventToTimeline(event, toStartOfTimeline) {
    if (!this.findEventById(event.getId())) {
      this.timelineSet.addEventToTimeline(event, this.liveTimeline, {
        toStartOfTimeline,
        fromCache: false,
        roomState: this.roomState
      });
      this.timeline = this.events;
    }
  }

  /**
   * TEMPORARY. Only call this when MSC3981 is not available, and we have some
   * late-arriving events to insert, because we recursively found them as part
   * of populating a thread. When we have MSC3981 we won't need it, because
   * they will all be supplied by the homeserver in one request, and they will
   * already be in the right order in that response.
   * This is a copy of addEventToTimeline above, modified to call
   * insertEventIntoTimeline so this event is inserted into our best guess of
   * the right place based on timestamp. (We should be using Sync Order but we
   * don't have it.)
   *
   * @internal
   */
  insertEventIntoTimeline(event) {
    const eventId = event.getId();
    if (!eventId) {
      return;
    }
    // If the event is already in this thread, bail out
    if (this.findEventById(eventId)) {
      return;
    }
    this.timelineSet.insertEventIntoTimeline(event, this.liveTimeline, this.roomState);

    // As far as we know, timeline should always be the same as events
    this.timeline = this.events;
  }
  addEvents(events, toStartOfTimeline) {
    events.forEach(ev => this.addEvent(ev, toStartOfTimeline, false));
    this.updateThreadMetadata();
  }

  /**
   * Add an event to the thread and updates
   * the tail/root references if needed
   * Will fire "Thread.update"
   * @param event - The event to add
   * @param toStartOfTimeline - whether the event is being added
   * to the start (and not the end) of the timeline.
   * @param emit - whether to emit the Update event if the thread was updated or not.
   */
  async addEvent(event, toStartOfTimeline, emit = true) {
    this.setEventMetadata(event);
    const lastReply = this.lastReply();
    const isNewestReply = !lastReply || event.localTimestamp >= lastReply.localTimestamp;

    // Add all incoming events to the thread's timeline set when there's  no server support
    if (!Thread.hasServerSideSupport) {
      // all the relevant membership info to hydrate events with a sender
      // is held in the main room timeline
      // We want to fetch the room state from there and pass it down to this thread
      // timeline set to let it reconcile an event with its relevant RoomMember
      this.addEventToTimeline(event, toStartOfTimeline);
      this.client.decryptEventIfNeeded(event, {});
    } else if (!toStartOfTimeline && this.initialEventsFetched && isNewestReply) {
      this.addEventToTimeline(event, false);
      this.fetchEditsWhereNeeded(event);
    } else if (event.isRelation(_event.RelationType.Annotation) || event.isRelation(_event.RelationType.Replace)) {
      if (!this.initialEventsFetched) {
        /**
         * A thread can be fully discovered via a single sync response
         * And when that's the case we still ask the server to do an initialisation
         * as it's the safest to ensure we have everything.
         * However when we are in that scenario we might loose annotation or edits
         *
         * This fix keeps a reference to those events and replay them once the thread
         * has been initialised properly.
         */
        this.replayEvents?.push(event);
      } else {
        const recursionSupport = this.client.canSupport.get(_feature.Feature.RelationsRecursion) ?? _feature.ServerSupport.Unsupported;
        if (recursionSupport === _feature.ServerSupport.Unsupported) {
          this.insertEventIntoTimeline(event);
        } else {
          this.addEventToTimeline(event, toStartOfTimeline);
        }
      }
      // Apply annotations and replace relations to the relations of the timeline only
      this.timelineSet.relations?.aggregateParentEvent(event);
      this.timelineSet.relations?.aggregateChildEvent(event, this.timelineSet);
      return;
    }

    // If no thread support exists we want to count all thread relation
    // added as a reply. We can't rely on the bundled relationships count
    if ((!Thread.hasServerSideSupport || !this.rootEvent) && event.isRelation(THREAD_RELATION_TYPE.name)) {
      this.replyCount++;
    }
    if (emit) {
      this.emit(ThreadEvent.NewReply, this, event);
      this.updateThreadMetadata();
    }
  }
  async processEvent(event) {
    if (event) {
      this.setEventMetadata(event);
      await this.fetchEditsWhereNeeded(event);
    }
    this.timeline = this.events;
  }

  /**
   * Processes the receipts that were caught during initial sync
   * When clients become aware of a thread, they try to retrieve those read receipts
   * and apply them to the current thread
   * @param receipts - A collection of the receipts cached from initial sync
   */
  processReceipts(receipts = []) {
    for (const {
      eventId,
      receiptType,
      userId,
      receipt,
      synthetic
    } of receipts) {
      this.addReceiptToStructure(eventId, receiptType, userId, receipt, synthetic);
    }
  }
  getRootEventBundledRelationship(rootEvent = this.rootEvent) {
    return rootEvent?.getServerAggregatedRelation(THREAD_RELATION_TYPE.name);
  }
  async processRootEvent() {
    const bundledRelationship = this.getRootEventBundledRelationship();
    if (Thread.hasServerSideSupport && bundledRelationship) {
      this.replyCount = bundledRelationship.count;
      this._currentUserParticipated = !!bundledRelationship.current_user_participated;
      const mapper = this.client.getEventMapper();
      // re-insert roomId
      this.lastEvent = mapper(_objectSpread(_objectSpread({}, bundledRelationship.latest_event), {}, {
        room_id: this.roomId
      }));
      this.updatePendingReplyCount();
      await this.processEvent(this.lastEvent);
    }
  }
  updatePendingReplyCount() {
    const unfilteredPendingEvents = this.pendingEventOrdering === _client.PendingEventOrdering.Detached ? this.room.getPendingEvents() : this.events;
    const pendingEvents = unfilteredPendingEvents.filter(ev => ev.threadRootId === this.id && ev.isRelation(THREAD_RELATION_TYPE.name) && ev.status !== null && ev.getId() !== this.lastEvent?.getId());
    this.lastPendingEvent = pendingEvents.length ? pendingEvents[pendingEvents.length - 1] : undefined;
    this.pendingReplyCount = pendingEvents.length;
  }

  /**
   * Reset the live timeline of all timelineSets, and start new ones.
   *
   * <p>This is used when /sync returns a 'limited' timeline. 'Limited' means that there's a gap between the messages
   * /sync returned, and the last known message in our timeline. In such a case, our live timeline isn't live anymore
   * and has to be replaced by a new one. To make sure we can continue paginating our timelines correctly, we have to
   * set new pagination tokens on the old and the new timeline.
   *
   * @param backPaginationToken -   token for back-paginating the new timeline
   * @param forwardPaginationToken - token for forward-paginating the old live timeline,
   * if absent or null, all timelines are reset, removing old ones (including the previous live
   * timeline which would otherwise be unable to paginate forwards without this token).
   * Removing just the old live timeline whilst preserving previous ones is not supported.
   */
  async resetLiveTimeline(backPaginationToken, forwardPaginationToken) {
    const oldLive = this.liveTimeline;
    this.timelineSet.resetLiveTimeline(backPaginationToken ?? undefined, forwardPaginationToken ?? undefined);
    const newLive = this.liveTimeline;

    // FIXME: Remove the following as soon as https://github.com/matrix-org/synapse/issues/14830 is resolved.
    //
    // The pagination API for thread timelines currently can't handle the type of pagination tokens returned by sync
    //
    // To make this work anyway, we'll have to transform them into one of the types that the API can handle.
    // One option is passing the tokens to /messages, which can handle sync tokens, and returns the right format.
    // /messages does not return new tokens on requests with a limit of 0.
    // This means our timelines might overlap a slight bit, but that's not an issue, as we deduplicate messages
    // anyway.

    let newBackward;
    let oldForward;
    if (backPaginationToken) {
      const res = await this.client.createMessagesRequest(this.roomId, backPaginationToken, 1, _eventTimeline.Direction.Forward);
      newBackward = res.end;
    }
    if (forwardPaginationToken) {
      const res = await this.client.createMessagesRequest(this.roomId, forwardPaginationToken, 1, _eventTimeline.Direction.Backward);
      oldForward = res.start;
    }
    // Only replace the token if we don't have paginated away from this position already. This situation doesn't
    // occur today, but if the above issue is resolved, we'd have to go down this path.
    if (forwardPaginationToken && oldLive.getPaginationToken(_eventTimeline.Direction.Forward) === forwardPaginationToken) {
      oldLive.setPaginationToken(oldForward ?? null, _eventTimeline.Direction.Forward);
    }
    if (backPaginationToken && newLive.getPaginationToken(_eventTimeline.Direction.Backward) === backPaginationToken) {
      newLive.setPaginationToken(newBackward ?? null, _eventTimeline.Direction.Backward);
    }
  }
  async updateThreadMetadata() {
    this.updatePendingReplyCount();
    if (Thread.hasServerSideSupport) {
      // Ensure we show *something* as soon as possible, we'll update it as soon as we get better data, but we
      // don't want the thread preview to be empty if we can avoid it
      if (!this.initialEventsFetched) {
        await this.processRootEvent();
      }
      await this.fetchRootEvent();
    }
    await this.processRootEvent();
    if (!this.initialEventsFetched) {
      this.initialEventsFetched = true;
      // fetch initial event to allow proper pagination
      try {
        // if the thread has regular events, this will just load the last reply.
        // if the thread is newly created, this will load the root event.
        if (this.replyCount === 0 && this.rootEvent) {
          this.timelineSet.addEventsToTimeline([this.rootEvent], true, this.liveTimeline, null);
          this.liveTimeline.setPaginationToken(null, _eventTimeline.Direction.Backward);
        } else {
          await this.client.paginateEventTimeline(this.liveTimeline, {
            backwards: true,
            limit: Math.max(1, this.length)
          });
        }
        for (const event of this.replayEvents) {
          this.addEvent(event, false);
        }
        this.replayEvents = null;
        // just to make sure that, if we've created a timeline window for this thread before the thread itself
        // existed (e.g. when creating a new thread), we'll make sure the panel is force refreshed correctly.
        this.emit(_room.RoomEvent.TimelineReset, this.room, this.timelineSet, true);
      } catch (e) {
        _logger.logger.error("Failed to load start of newly created thread: ", e);
        this.initialEventsFetched = false;
      }
    }
    this.emit(ThreadEvent.Update, this);
  }

  // XXX: Workaround for https://github.com/matrix-org/matrix-spec-proposals/pull/2676/files#r827240084
  async fetchEditsWhereNeeded(...events) {
    const recursionSupport = this.client.canSupport.get(_feature.Feature.RelationsRecursion) ?? _feature.ServerSupport.Unsupported;
    if (recursionSupport === _feature.ServerSupport.Unsupported) {
      return Promise.all(events.filter(isAnEncryptedThreadMessage).map(async event => {
        try {
          const relations = await this.client.relations(this.roomId, event.getId(), _event.RelationType.Replace, event.getType(), {
            limit: 1
          });
          if (relations.events.length) {
            const editEvent = relations.events[0];
            event.makeReplaced(editEvent);
            this.insertEventIntoTimeline(editEvent);
          }
        } catch (e) {
          _logger.logger.error("Failed to load edits for encrypted thread event", e);
        }
      }));
    }
  }
  setEventMetadata(event) {
    if (event) {
      _eventTimeline.EventTimeline.setEventMetadata(event, this.roomState, false);
      event.setThread(this);
    }
  }
  clearEventMetadata(event) {
    if (event) {
      event.setThread(undefined);
      delete event.event?.unsigned?.["m.relations"]?.[THREAD_RELATION_TYPE.name];
    }
  }

  /**
   * Finds an event by ID in the current thread
   */
  findEventById(eventId) {
    return this.timelineSet.findEventById(eventId);
  }

  /**
   * Return last reply to the thread, if known.
   */
  lastReply(matches = () => true) {
    for (let i = this.timeline.length - 1; i >= 0; i--) {
      const event = this.timeline[i];
      if (matches(event)) {
        return event;
      }
    }
    return null;
  }
  get roomId() {
    return this.room.roomId;
  }

  /**
   * The number of messages in the thread
   * Only count rel_type=m.thread as we want to
   * exclude annotations from that number
   */
  get length() {
    return this.replyCount + this.pendingReplyCount;
  }

  /**
   * A getter for the last event of the thread.
   * This might be a synthesized event, if so, it will not emit any events to listeners.
   */
  get replyToEvent() {
    return this.lastPendingEvent ?? this.lastEvent ?? this.lastReply();
  }
  get events() {
    return this.liveTimeline.getEvents();
  }
  has(eventId) {
    return this.timelineSet.findEventById(eventId) instanceof _event2.MatrixEvent;
  }
  get hasCurrentUserParticipated() {
    return this._currentUserParticipated;
  }
  get liveTimeline() {
    return this.timelineSet.getLiveTimeline();
  }
  getUnfilteredTimelineSet() {
    return this.timelineSet;
  }
  addReceipt(event, synthetic) {
    throw new Error("Unsupported function on the thread model");
  }

  /**
   * Get the ID of the event that a given user has read up to within this thread,
   * or null if we have received no read receipt (at all) from them.
   * @param userId - The user ID to get read receipt event ID for
   * @param ignoreSynthesized - If true, return only receipts that have been
   *                            sent by the server, not implicit ones generated
   *                            by the JS SDK.
   * @returns ID of the latest event that the given user has read, or null.
   */
  getEventReadUpTo(userId, ignoreSynthesized) {
    const isCurrentUser = userId === this.client.getUserId();
    const lastReply = this.timeline[this.timeline.length - 1];
    if (isCurrentUser && lastReply) {
      // If the last activity in a thread is prior to the first threaded read receipt
      // sent in the room (suggesting that it was sent before the user started
      // using a client that supported threaded read receipts), we want to
      // consider this thread as read.
      const beforeFirstThreadedReceipt = lastReply.getTs() < this.room.getOldestThreadedReceiptTs();
      const lastReplyId = lastReply.getId();
      // Some unsent events do not have an ID, we do not want to consider them read
      if (beforeFirstThreadedReceipt && lastReplyId) {
        return lastReplyId;
      }
    }
    const readUpToId = super.getEventReadUpTo(userId, ignoreSynthesized);

    // Check whether the unthreaded read receipt for that user is more recent
    // than the read receipt inside that thread.
    if (lastReply) {
      const unthreadedReceipt = this.room.getLastUnthreadedReceiptFor(userId);
      if (!unthreadedReceipt) {
        return readUpToId;
      }
      for (let i = this.timeline?.length - 1; i >= 0; --i) {
        const ev = this.timeline[i];
        // If we encounter the `readUpToId` we do not need to look further
        // there is no "more recent" unthreaded read receipt
        if (ev.getId() === readUpToId) return readUpToId;

        // Inspecting events from most recent to oldest, we're checking
        // whether an unthreaded read receipt is more recent that the current event.
        // We usually prefer relying on the order of the DAG but in this scenario
        // it is not possible and we have to rely on timestamp
        if (ev.getTs() < unthreadedReceipt.ts) return ev.getId() ?? readUpToId;
      }
    }
    return readUpToId;
  }

  /**
   * Determine if the given user has read a particular event.
   *
   * It is invalid to call this method with an event that is not part of this thread.
   *
   * This is not a definitive check as it only checks the events that have been
   * loaded client-side at the time of execution.
   * @param userId - The user ID to check the read state of.
   * @param eventId - The event ID to check if the user read.
   * @returns True if the user has read the event, false otherwise.
   */
  hasUserReadEvent(userId, eventId) {
    if (userId === this.client.getUserId()) {
      // Consider an event read if it's part of a thread that is before the
      // first threaded receipt sent in that room. It is likely that it is
      // part of a thread that was created before MSC3771 was implemented.
      // Or before the last unthreaded receipt for the logged in user
      const beforeFirstThreadedReceipt = (this.lastReply()?.getTs() ?? 0) < this.room.getOldestThreadedReceiptTs();
      const unthreadedReceiptTs = this.room.getLastUnthreadedReceiptFor(userId)?.ts ?? 0;
      const beforeLastUnthreadedReceipt = (this?.lastReply()?.getTs() ?? 0) < unthreadedReceiptTs;
      if (beforeFirstThreadedReceipt || beforeLastUnthreadedReceipt) {
        return true;
      }
    }
    return super.hasUserReadEvent(userId, eventId);
  }
  setUnread(type, count) {
    return this.room.setThreadUnreadNotificationCount(this.id, type, count);
  }
}

/**
 * Decide whether an event deserves to have its potential edits fetched.
 *
 * @returns true if this event is encrypted and is a message that is part of a
 * thread - either inside it, or a root.
 */
exports.Thread = Thread;
_defineProperty(Thread, "hasServerSideSupport", FeatureSupport.None);
_defineProperty(Thread, "hasServerSideListSupport", FeatureSupport.None);
_defineProperty(Thread, "hasServerSideFwdPaginationSupport", FeatureSupport.None);
function isAnEncryptedThreadMessage(event) {
  return event.isEncrypted() && (event.isRelation(THREAD_RELATION_TYPE.name) || event.isThreadRoot);
}
const FILTER_RELATED_BY_SENDERS = new _NamespacedValue.ServerControlledNamespacedValue("related_by_senders", "io.element.relation_senders");
exports.FILTER_RELATED_BY_SENDERS = FILTER_RELATED_BY_SENDERS;
const FILTER_RELATED_BY_REL_TYPES = new _NamespacedValue.ServerControlledNamespacedValue("related_by_rel_types", "io.element.relation_types");
exports.FILTER_RELATED_BY_REL_TYPES = FILTER_RELATED_BY_REL_TYPES;
const THREAD_RELATION_TYPE = new _NamespacedValue.ServerControlledNamespacedValue("m.thread", "io.element.thread");
exports.THREAD_RELATION_TYPE = THREAD_RELATION_TYPE;
let ThreadFilterType = /*#__PURE__*/function (ThreadFilterType) {
  ThreadFilterType[ThreadFilterType["My"] = 0] = "My";
  ThreadFilterType[ThreadFilterType["All"] = 1] = "All";
  return ThreadFilterType;
}({});
exports.ThreadFilterType = ThreadFilterType;
function threadFilterTypeToFilter(type) {
  switch (type) {
    case ThreadFilterType.My:
      return "participated";
    default:
      return "all";
  }
}