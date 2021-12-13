"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ThreadEvent = exports.Thread = void 0;

var _event = require("./event");

var _eventTimeline = require("./event-timeline");

var _eventTimelineSet = require("./event-timeline-set");

var _typedEventEmitter = require("./typed-event-emitter");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

let ThreadEvent;
/**
 * @experimental
 */

exports.ThreadEvent = ThreadEvent;

(function (ThreadEvent) {
  ThreadEvent["New"] = "Thread.new";
  ThreadEvent["Ready"] = "Thread.ready";
  ThreadEvent["Update"] = "Thread.update";
})(ThreadEvent || (exports.ThreadEvent = ThreadEvent = {}));

class Thread extends _typedEventEmitter.TypedEventEmitter {
  /**
   * A reference to the event ID at the top of the thread
   */

  /**
   * A reference to all the events ID at the bottom of the threads
   */
  constructor(events = [], room, client) {
    super();
    this.room = room;
    this.client = client;

    _defineProperty(this, "root", void 0);

    _defineProperty(this, "timelineSet", void 0);

    _defineProperty(this, "_currentUserParticipated", false);

    _defineProperty(this, "onEcho", event => {
      if (this.timelineSet.eventIdToTimeline(event.getId())) {
        this.emit(ThreadEvent.Update, this);
      }
    });

    if (events.length === 0) {
      throw new Error("Can't create an empty thread");
    }

    this.timelineSet = new _eventTimelineSet.EventTimelineSet(this.room, {
      unstableClientRelationAggregation: true,
      timelineSupport: true,
      pendingEvents: true
    });
    events.forEach(event => this.addEvent(event));
    room.on("Room.localEchoUpdated", this.onEcho);
    room.on("Room.timeline", this.onEcho);
  }

  /**
   * Add an event to the thread and updates
   * the tail/root references if needed
   * Will fire "Thread.update"
   * @param event The event to add
   */
  async addEvent(event, toStartOfTimeline = false) {
    if (this.timelineSet.findEventById(event.getId()) || event.status !== null) {
      return;
    }

    if (!this.root) {
      if (event.isThreadRelation) {
        this.root = event.threadRootId;
      } else {
        this.root = event.getId();
      }
    } // all the relevant membership info to hydrate events with a sender
    // is held in the main room timeline
    // We want to fetch the room state from there and pass it down to this thread
    // timeline set to let it reconcile an event with its relevant RoomMember


    const roomState = this.room.getLiveTimeline().getState(_eventTimeline.EventTimeline.FORWARDS);
    event.setThread(this);
    this.timelineSet.addEventToTimeline(event, this.timelineSet.getLiveTimeline(), toStartOfTimeline, false, roomState);

    if (!this._currentUserParticipated && event.getSender() === this.client.getUserId()) {
      this._currentUserParticipated = true;
    }

    await this.client.decryptEventIfNeeded(event, {});
    this.emit(ThreadEvent.Update, this);
  }
  /**
   * Finds an event by ID in the current thread
   */


  findEventById(eventId) {
    return this.timelineSet.findEventById(eventId);
  }
  /**
   * Return last reply to the thread
   */


  get lastReply() {
    const threadReplies = this.events.filter(event => event.isThreadRelation);
    return threadReplies[threadReplies.length - 1];
  }
  /**
   * The thread ID, which is the same as the root event ID
   */


  get id() {
    return this.root;
  }
  /**
   * The thread root event
   */


  get rootEvent() {
    return this.findEventById(this.root);
  }

  get roomId() {
    return this.rootEvent.getRoomId();
  }
  /**
   * The number of messages in the thread
   * Only count rel_type=m.thread as we want to
   * exclude annotations from that number
   */


  get length() {
    return this.events.filter(event => event.isThreadRelation).length;
  }
  /**
   * A getter for the last event added to the thread
   */


  get replyToEvent() {
    const events = this.events;
    return events[events.length - 1];
  }

  get events() {
    return this.timelineSet.getLiveTimeline().getEvents();
  }

  merge(thread) {
    thread.events.forEach(event => {
      this.addEvent(event);
    });
    this.events.forEach(event => event.setThread(this));
  }

  has(eventId) {
    return this.timelineSet.findEventById(eventId) instanceof _event.MatrixEvent;
  }

  get hasCurrentUserParticipated() {
    return this._currentUserParticipated;
  }

}

exports.Thread = Thread;