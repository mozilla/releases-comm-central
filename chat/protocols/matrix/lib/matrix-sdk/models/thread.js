"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ThreadFilterType = exports.ThreadEvent = exports.Thread = exports.THREAD_RELATION_TYPE = exports.FILTER_RELATED_BY_SENDERS = exports.FILTER_RELATED_BY_REL_TYPES = void 0;

var _matrix = require("../matrix");

var _ReEmitter = require("../ReEmitter");

var _event = require("./event");

var _eventTimeline = require("./event-timeline");

var _eventTimelineSet = require("./event-timeline-set");

var _typedEventEmitter = require("./typed-event-emitter");

var _NamespacedValue = require("../NamespacedValue");

var _logger = require("../logger");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

let ThreadEvent;
exports.ThreadEvent = ThreadEvent;

(function (ThreadEvent) {
  ThreadEvent["New"] = "Thread.new";
  ThreadEvent["Update"] = "Thread.update";
  ThreadEvent["NewReply"] = "Thread.newReply";
  ThreadEvent["ViewThread"] = "Thread.viewThread";
})(ThreadEvent || (exports.ThreadEvent = ThreadEvent = {}));

/**
 * @experimental
 */
class Thread extends _typedEventEmitter.TypedEventEmitter {
  /**
   * A reference to all the events ID at the bottom of the threads
   */
  constructor(id, rootEvent, opts) {
    super();
    this.id = id;
    this.rootEvent = rootEvent;

    _defineProperty(this, "timelineSet", void 0);

    _defineProperty(this, "_currentUserParticipated", false);

    _defineProperty(this, "reEmitter", void 0);

    _defineProperty(this, "lastEvent", void 0);

    _defineProperty(this, "replyCount", 0);

    _defineProperty(this, "room", void 0);

    _defineProperty(this, "client", void 0);

    _defineProperty(this, "initialEventsFetched", !Thread.hasServerSideSupport);

    _defineProperty(this, "onBeforeRedaction", (event, redaction) => {
      if (event?.isRelation(THREAD_RELATION_TYPE.name) && this.room.eventShouldLiveIn(event).threadId === this.id && event.getId() !== this.id && // the root event isn't counted in the length so ignore this redaction
      !redaction.status // only respect it when it succeeds
      ) {
        this.replyCount--;
        this.emit(ThreadEvent.Update, this);
      }
    });

    _defineProperty(this, "onRedaction", event => {
      if (event.threadRootId !== this.id) return; // ignore redactions for other timelines

      const events = [...this.timelineSet.getLiveTimeline().getEvents()].reverse();
      this.lastEvent = events.find(e => !e.isRedacted() && e.isRelation(THREAD_RELATION_TYPE.name)) ?? this.rootEvent;
      this.emit(ThreadEvent.Update, this);
    });

    _defineProperty(this, "onEcho", event => {
      if (event.threadRootId !== this.id) return; // ignore echoes for other timelines

      if (this.lastEvent === event) return;
      if (!event.isRelation(THREAD_RELATION_TYPE.name)) return; // There is a risk that the `localTimestamp` approximation will not be accurate
      // when threads are used over federation. That could result in the reply
      // count value drifting away from the value returned by the server

      const isThreadReply = event.isRelation(THREAD_RELATION_TYPE.name);

      if (!this.lastEvent || this.lastEvent.isRedacted() || isThreadReply && event.getId() !== this.lastEvent.getId() && event.localTimestamp > this.lastEvent.localTimestamp) {
        this.lastEvent = event;

        if (this.lastEvent.getId() !== this.id) {
          // This counting only works when server side support is enabled as we started the counting
          // from the value returned within the bundled relationship
          if (Thread.hasServerSideSupport) {
            this.replyCount++;
          }

          this.emit(ThreadEvent.NewReply, this, event);
        }
      }

      this.emit(ThreadEvent.Update, this);
    });

    if (!opts?.room) {
      // Logging/debugging for https://github.com/vector-im/element-web/issues/22141
      // Hope is that we end up with a more obvious stack trace.
      throw new Error("element-web#22141: A thread requires a room in order to function");
    }

    this.room = opts.room;
    this.client = opts.client;
    this.timelineSet = new _eventTimelineSet.EventTimelineSet(this.room, {
      timelineSupport: true,
      pendingEvents: true
    }, this.client, this);
    this.reEmitter = new _ReEmitter.TypedReEmitter(this);
    this.reEmitter.reEmit(this.timelineSet, [_matrix.RoomEvent.Timeline, _matrix.RoomEvent.TimelineReset]);
    this.room.on(_matrix.MatrixEventEvent.BeforeRedaction, this.onBeforeRedaction);
    this.room.on(_matrix.RoomEvent.Redaction, this.onRedaction);
    this.room.on(_matrix.RoomEvent.LocalEchoUpdated, this.onEcho);
    this.timelineSet.on(_matrix.RoomEvent.Timeline, this.onEcho);

    if (opts.initialEvents) {
      this.addEvents(opts.initialEvents, false);
    } // even if this thread is thought to be originating from this client, we initialise it as we may be in a
    // gappy sync and a thread around this event may already exist.


    this.initialiseThread();
    this.rootEvent?.setThread(this);
  }

  async fetchRootEvent() {
    this.rootEvent = this.room.findEventById(this.id); // If the rootEvent does not exist in the local stores, then fetch it from the server.

    try {
      const eventData = await this.client.fetchRoomEvent(this.roomId, this.id);
      const mapper = this.client.getEventMapper();
      this.rootEvent = mapper(eventData); // will merge with existing event object if such is known
    } catch (e) {
      _logger.logger.error("Failed to fetch thread root to construct thread with", e);
    } // The root event might be not be visible to the person requesting it.
    // If it wasn't fetched successfully the thread will work in "limited" mode and won't
    // benefit from all the APIs a homeserver can provide to enhance the thread experience


    this.rootEvent?.setThread(this);
    this.emit(ThreadEvent.Update, this);
  }

  static setServerSideSupport(hasServerSideSupport, useStable) {
    Thread.hasServerSideSupport = hasServerSideSupport;

    if (!useStable) {
      FILTER_RELATED_BY_SENDERS.setPreferUnstable(true);
      FILTER_RELATED_BY_REL_TYPES.setPreferUnstable(true);
      THREAD_RELATION_TYPE.setPreferUnstable(true);
    }
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
    }
  }

  addEvents(events, toStartOfTimeline) {
    events.forEach(ev => this.addEvent(ev, toStartOfTimeline, false));
    this.emit(ThreadEvent.Update, this);
  }
  /**
   * Add an event to the thread and updates
   * the tail/root references if needed
   * Will fire "Thread.update"
   * @param event The event to add
   * @param {boolean} toStartOfTimeline whether the event is being added
   * to the start (and not the end) of the timeline.
   * @param {boolean} emit whether to emit the Update event if the thread was updated or not.
   */


  addEvent(event, toStartOfTimeline, emit = true) {
    event.setThread(this);

    if (!this._currentUserParticipated && event.getSender() === this.client.getUserId()) {
      this._currentUserParticipated = true;
    } // Add all incoming events to the thread's timeline set when there's  no server support


    if (!Thread.hasServerSideSupport) {
      // all the relevant membership info to hydrate events with a sender
      // is held in the main room timeline
      // We want to fetch the room state from there and pass it down to this thread
      // timeline set to let it reconcile an event with its relevant RoomMember
      this.addEventToTimeline(event, toStartOfTimeline);
      this.client.decryptEventIfNeeded(event, {});
    } else if (!toStartOfTimeline && this.initialEventsFetched && event.localTimestamp > this.lastReply()?.localTimestamp) {
      this.fetchEditsWhereNeeded(event);
      this.addEventToTimeline(event, false);
    } else if (event.isRelation(_matrix.RelationType.Annotation) || event.isRelation(_matrix.RelationType.Replace)) {
      // Apply annotations and replace relations to the relations of the timeline only
      this.timelineSet.relations.aggregateParentEvent(event);
      this.timelineSet.relations.aggregateChildEvent(event, this.timelineSet);
      return;
    } // If no thread support exists we want to count all thread relation
    // added as a reply. We can't rely on the bundled relationships count


    if ((!Thread.hasServerSideSupport || !this.rootEvent) && event.isRelation(THREAD_RELATION_TYPE.name)) {
      this.replyCount++;
    }

    if (emit) {
      this.emit(ThreadEvent.Update, this);
    }
  }

  getRootEventBundledRelationship(rootEvent = this.rootEvent) {
    return rootEvent?.getServerAggregatedRelation(THREAD_RELATION_TYPE.name);
  }

  async initialiseThread() {
    let bundledRelationship = this.getRootEventBundledRelationship();

    if (Thread.hasServerSideSupport && !bundledRelationship) {
      await this.fetchRootEvent();
      bundledRelationship = this.getRootEventBundledRelationship();
    }

    if (Thread.hasServerSideSupport && bundledRelationship) {
      this.replyCount = bundledRelationship.count;
      this._currentUserParticipated = bundledRelationship.current_user_participated;
      const event = new _event.MatrixEvent(bundledRelationship.latest_event);
      this.setEventMetadata(event);
      event.setThread(this);
      this.lastEvent = event;
      this.fetchEditsWhereNeeded(event);
    }

    this.emit(ThreadEvent.Update, this);
  } // XXX: Workaround for https://github.com/matrix-org/matrix-spec-proposals/pull/2676/files#r827240084


  async fetchEditsWhereNeeded(...events) {
    return Promise.all(events.filter(e => e.isEncrypted()).map(event => {
      if (event.isRelation()) return; // skip - relations don't get edits

      return this.client.relations(this.roomId, event.getId(), _matrix.RelationType.Replace, event.getType(), {
        limit: 1
      }).then(relations => {
        if (relations.events.length) {
          event.makeReplaced(relations.events[0]);
        }
      }).catch(e => {
        _logger.logger.error("Failed to load edits for encrypted thread event", e);
      });
    }));
  }

  async fetchInitialEvents() {
    if (this.initialEventsFetched) return;
    await this.fetchEvents();
    this.initialEventsFetched = true;
  }

  setEventMetadata(event) {
    _eventTimeline.EventTimeline.setEventMetadata(event, this.roomState, false);

    event.setThread(this);
  }
  /**
   * Finds an event by ID in the current thread
   */


  findEventById(eventId) {
    // Check the lastEvent as it may have been created based on a bundled relationship and not in a timeline
    if (this.lastEvent?.getId() === eventId) {
      return this.lastEvent;
    }

    return this.timelineSet.findEventById(eventId);
  }
  /**
   * Return last reply to the thread, if known.
   */


  lastReply(matches = () => true) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];

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
    return this.replyCount;
  }
  /**
   * A getter for the last event added to the thread, if known.
   */


  get replyToEvent() {
    return this.lastEvent ?? this.lastReply();
  }

  get events() {
    return this.liveTimeline.getEvents();
  }

  has(eventId) {
    return this.timelineSet.findEventById(eventId) instanceof _event.MatrixEvent;
  }

  get hasCurrentUserParticipated() {
    return this._currentUserParticipated;
  }

  get liveTimeline() {
    return this.timelineSet.getLiveTimeline();
  }

  async fetchEvents(opts = {
    limit: 20,
    direction: _eventTimeline.Direction.Backward
  }) {
    let {
      originalEvent,
      events,
      prevBatch,
      nextBatch
    } = await this.client.relations(this.room.roomId, this.id, THREAD_RELATION_TYPE.name, null, opts); // When there's no nextBatch returned with a `from` request we have reached
    // the end of the thread, and therefore want to return an empty one

    if (!opts.to && !nextBatch) {
      events = [...events, originalEvent];
    }

    await this.fetchEditsWhereNeeded(...events);
    await Promise.all(events.map(event => {
      this.setEventMetadata(event);
      return this.client.decryptEventIfNeeded(event);
    }));
    const prependEvents = (opts.direction ?? _eventTimeline.Direction.Backward) === _eventTimeline.Direction.Backward;
    this.timelineSet.addEventsToTimeline(events, prependEvents, this.liveTimeline, prependEvents ? nextBatch : prevBatch);
    return {
      originalEvent,
      events,
      prevBatch,
      nextBatch
    };
  }

}

exports.Thread = Thread;

_defineProperty(Thread, "hasServerSideSupport", void 0);

const FILTER_RELATED_BY_SENDERS = new _NamespacedValue.ServerControlledNamespacedValue("related_by_senders", "io.element.relation_senders");
exports.FILTER_RELATED_BY_SENDERS = FILTER_RELATED_BY_SENDERS;
const FILTER_RELATED_BY_REL_TYPES = new _NamespacedValue.ServerControlledNamespacedValue("related_by_rel_types", "io.element.relation_types");
exports.FILTER_RELATED_BY_REL_TYPES = FILTER_RELATED_BY_REL_TYPES;
const THREAD_RELATION_TYPE = new _NamespacedValue.ServerControlledNamespacedValue("m.thread", "io.element.thread");
exports.THREAD_RELATION_TYPE = THREAD_RELATION_TYPE;
let ThreadFilterType;
exports.ThreadFilterType = ThreadFilterType;

(function (ThreadFilterType) {
  ThreadFilterType[ThreadFilterType["My"] = 0] = "My";
  ThreadFilterType[ThreadFilterType["All"] = 1] = "All";
})(ThreadFilterType || (exports.ThreadFilterType = ThreadFilterType = {}));