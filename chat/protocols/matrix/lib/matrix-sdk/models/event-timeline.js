"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventTimeline = exports.Direction = void 0;
var _roomState = require("./room-state.js");
var _event = require("../@types/event.js");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2016 - 2021 The Matrix.org Foundation C.I.C.

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
let Direction = exports.Direction = /*#__PURE__*/function (Direction) {
  Direction["Backward"] = "b";
  Direction["Forward"] = "f";
  return Direction;
}({});
class EventTimeline {
  /**
   * Static helper method to set sender and target properties
   *
   * @param event -   the event whose metadata is to be set
   * @param stateContext -  the room state to be queried
   * @param toStartOfTimeline -  if true the event's forwardLooking flag is set false
   */
  static setEventMetadata(event, stateContext, toStartOfTimeline) {
    // When we try to generate a sentinel member before we have that member
    // in the members object, we still generate a sentinel but it doesn't
    // have a membership event, so test to see if events.member is set. We
    // check this to avoid overriding non-sentinel members by sentinel ones
    // when adding the event to a filtered timeline
    if (!event.sender?.events?.member) {
      event.sender = stateContext.getSentinelMember(event.getSender());
    }
    if (!event.target?.events?.member && event.getType() === _event.EventType.RoomMember) {
      event.target = stateContext.getSentinelMember(event.getStateKey());
    }
    if (event.isState()) {
      // room state has no concept of 'old' or 'current', but we want the
      // room state to regress back to previous values if toStartOfTimeline
      // is set, which means inspecting prev_content if it exists. This
      // is done by toggling the forwardLooking flag.
      if (toStartOfTimeline) {
        event.forwardLooking = false;
      }
    }
  }
  /**
   * Construct a new EventTimeline
   *
   * <p>An EventTimeline represents a contiguous sequence of events in a room.
   *
   * <p>As well as keeping track of the events themselves, it stores the state of
   * the room at the beginning and end of the timeline, and pagination tokens for
   * going backwards and forwards in the timeline.
   *
   * <p>In order that clients can meaningfully maintain an index into a timeline,
   * the EventTimeline object tracks a 'baseIndex'. This starts at zero, but is
   * incremented when events are prepended to the timeline. The index of an event
   * relative to baseIndex therefore remains constant.
   *
   * <p>Once a timeline joins up with its neighbour, they are linked together into a
   * doubly-linked list.
   *
   * @param eventTimelineSet - the set of timelines this is part of
   */
  constructor(eventTimelineSet) {
    this.eventTimelineSet = eventTimelineSet;
    _defineProperty(this, "roomId", void 0);
    _defineProperty(this, "name", void 0);
    _defineProperty(this, "events", []);
    _defineProperty(this, "baseIndex", 0);
    _defineProperty(this, "startState", void 0);
    _defineProperty(this, "endState", void 0);
    // If we have a roomId then we delegate pagination token storage to the room state objects `startState` and
    // `endState`, but for things like the notification timeline which mix multiple rooms we store the tokens ourselves.
    _defineProperty(this, "startToken", null);
    _defineProperty(this, "endToken", null);
    _defineProperty(this, "prevTimeline", null);
    _defineProperty(this, "nextTimeline", null);
    _defineProperty(this, "paginationRequests", {
      [Direction.Backward]: null,
      [Direction.Forward]: null
    });
    this.roomId = eventTimelineSet.room?.roomId ?? null;
    if (this.roomId) {
      this.startState = new _roomState.RoomState(this.roomId, undefined, true);
      this.endState = new _roomState.RoomState(this.roomId);
    }

    // this is used by client.js
    this.paginationRequests = {
      b: null,
      f: null
    };
    this.name = this.roomId + ":" + new Date().toISOString();
  }

  /**
   * Initialise the start and end state with the given events
   *
   * <p>This can only be called before any events are added.
   *
   * @param stateEvents - list of state events to initialise the
   * state with.
   * @throws Error if an attempt is made to call this after addEvent is called.
   */
  initialiseState(stateEvents, {
    timelineWasEmpty
  } = {}) {
    if (this.events.length > 0) {
      throw new Error("Cannot initialise state after events are added");
    }
    this.startState?.setStateEvents(stateEvents, {
      timelineWasEmpty
    });
    this.endState?.setStateEvents(stateEvents, {
      timelineWasEmpty
    });
  }

  /**
   * Forks the (live) timeline, taking ownership of the existing directional state of this timeline.
   * All attached listeners will keep receiving state updates from the new live timeline state.
   * The end state of this timeline gets replaced with an independent copy of the current RoomState,
   * and will need a new pagination token if it ever needs to paginate forwards.
    * @param direction -   EventTimeline.BACKWARDS to get the state at the
   *   start of the timeline; EventTimeline.FORWARDS to get the state at the end
   *   of the timeline.
   *
   * @returns the new timeline
   */
  forkLive(direction) {
    const forkState = this.getState(direction);
    const timeline = new EventTimeline(this.eventTimelineSet);
    timeline.startState = forkState?.clone();
    // Now clobber the end state of the new live timeline with that from the
    // previous live timeline. It will be identical except that we'll keep
    // using the same RoomMember objects for the 'live' set of members with any
    // listeners still attached
    timeline.endState = forkState;
    // Firstly, we just stole the current timeline's end state, so it needs a new one.
    // Make an immutable copy of the state so back pagination will get the correct sentinels.
    this.endState = forkState?.clone();
    return timeline;
  }

  /**
   * Creates an independent timeline, inheriting the directional state from this timeline.
   *
   * @param direction -   EventTimeline.BACKWARDS to get the state at the
   *   start of the timeline; EventTimeline.FORWARDS to get the state at the end
   *   of the timeline.
   *
   * @returns the new timeline
   */
  fork(direction) {
    const forkState = this.getState(direction);
    const timeline = new EventTimeline(this.eventTimelineSet);
    timeline.startState = forkState?.clone();
    timeline.endState = forkState?.clone();
    return timeline;
  }

  /**
   * Get the ID of the room for this timeline
   * @returns room ID
   */
  getRoomId() {
    return this.roomId;
  }

  /**
   * Get the filter for this timeline's timelineSet (if any)
   * @returns filter
   */
  getFilter() {
    return this.eventTimelineSet.getFilter();
  }

  /**
   * Get the timelineSet for this timeline
   * @returns timelineSet
   */
  getTimelineSet() {
    return this.eventTimelineSet;
  }

  /**
   * Get the base index.
   *
   * <p>This is an index which is incremented when events are prepended to the
   * timeline. An individual event therefore stays at the same index in the array
   * relative to the base index (although note that a given event's index may
   * well be less than the base index, thus giving that event a negative relative
   * index).
   */
  getBaseIndex() {
    return this.baseIndex;
  }

  /**
   * Get the list of events in this context
   *
   * @returns An array of MatrixEvents
   */
  getEvents() {
    return this.events;
  }

  /**
   * Get the room state at the start/end of the timeline
   *
   * @param direction -   EventTimeline.BACKWARDS to get the state at the
   *   start of the timeline; EventTimeline.FORWARDS to get the state at the end
   *   of the timeline.
   *
   * @returns state at the start/end of the timeline
   */
  getState(direction) {
    if (direction == EventTimeline.BACKWARDS) {
      return this.startState;
    } else if (direction == EventTimeline.FORWARDS) {
      return this.endState;
    } else {
      throw new Error("Invalid direction '" + direction + "'");
    }
  }

  /**
   * Get a pagination token
   *
   * @param direction - EventTimeline.BACKWARDS to get the pagination
   *   token for going backwards in time; EventTimeline.FORWARDS to get the
   *   pagination token for going forwards in time.
   *
   * @returns pagination token
   */
  getPaginationToken(direction) {
    if (this.roomId) {
      return this.getState(direction).paginationToken;
    } else if (direction === Direction.Backward) {
      return this.startToken;
    } else {
      return this.endToken;
    }
  }

  /**
   * Set a pagination token
   *
   * @param token -       pagination token
   *
   * @param direction -    EventTimeline.BACKWARDS to set the pagination
   *   token for going backwards in time; EventTimeline.FORWARDS to set the
   *   pagination token for going forwards in time.
   */
  setPaginationToken(token, direction) {
    if (this.roomId) {
      this.getState(direction).paginationToken = token;
    } else if (direction === Direction.Backward) {
      this.startToken = token;
    } else {
      this.endToken = token;
    }
  }

  /**
   * Get the next timeline in the series
   *
   * @param direction - EventTimeline.BACKWARDS to get the previous
   *   timeline; EventTimeline.FORWARDS to get the next timeline.
   *
   * @returns previous or following timeline, if they have been
   * joined up.
   */
  getNeighbouringTimeline(direction) {
    if (direction == EventTimeline.BACKWARDS) {
      return this.prevTimeline;
    } else if (direction == EventTimeline.FORWARDS) {
      return this.nextTimeline;
    } else {
      throw new Error("Invalid direction '" + direction + "'");
    }
  }

  /**
   * Set the next timeline in the series
   *
   * @param neighbour - previous/following timeline
   *
   * @param direction - EventTimeline.BACKWARDS to set the previous
   *   timeline; EventTimeline.FORWARDS to set the next timeline.
   *
   * @throws Error if an attempt is made to set the neighbouring timeline when
   * it is already set.
   */
  setNeighbouringTimeline(neighbour, direction) {
    if (this.getNeighbouringTimeline(direction)) {
      throw new Error("timeline already has a neighbouring timeline - " + "cannot reset neighbour (direction: " + direction + ")");
    }
    if (direction == EventTimeline.BACKWARDS) {
      this.prevTimeline = neighbour;
    } else if (direction == EventTimeline.FORWARDS) {
      this.nextTimeline = neighbour;
    } else {
      throw new Error("Invalid direction '" + direction + "'");
    }

    // make sure we don't try to paginate this timeline
    this.setPaginationToken(null, direction);
  }

  /**
   * Add a new event to the timeline, and update the state
   *
   * @param event - new event
   * @param options - addEvent options
   */
  addEvent(event, {
    toStartOfTimeline,
    roomState,
    timelineWasEmpty
  } = {
    toStartOfTimeline: false
  }) {
    if (!roomState) {
      roomState = toStartOfTimeline ? this.startState : this.endState;
    }
    const timelineSet = this.getTimelineSet();
    if (timelineSet.room) {
      EventTimeline.setEventMetadata(event, roomState, toStartOfTimeline);

      // modify state but only on unfiltered timelineSets
      if (event.isState() && timelineSet.room.getUnfilteredTimelineSet() === timelineSet) {
        roomState?.setStateEvents([event], {
          timelineWasEmpty
        });
        // it is possible that the act of setting the state event means we
        // can set more metadata (specifically sender/target props), so try
        // it again if the prop wasn't previously set. It may also mean that
        // the sender/target is updated (if the event set was a room member event)
        // so we want to use the *updated* member (new avatar/name) instead.
        //
        // However, we do NOT want to do this on member events if we're going
        // back in time, else we'll set the .sender value for BEFORE the given
        // member event, whereas we want to set the .sender value for the ACTUAL
        // member event itself.
        if (!event.sender || event.getType() === _event.EventType.RoomMember && !toStartOfTimeline) {
          EventTimeline.setEventMetadata(event, roomState, toStartOfTimeline);
        }
      }
    }
    let insertIndex;
    if (toStartOfTimeline) {
      insertIndex = 0;
    } else {
      insertIndex = this.events.length;
    }
    this.events.splice(insertIndex, 0, event); // insert element
    if (toStartOfTimeline) {
      this.baseIndex++;
    }
  }

  /**
   * Insert a new event into the timeline, and update the state.
   *
   * TEMPORARY: until we have recursive relations, we need this function
   * to exist to allow us to insert events in timeline order, which is our
   * best guess for Sync Order.
   * This is a copy of addEvent above, modified to allow inserting an event at
   * a specific index.
   *
   * @internal
   */
  insertEvent(event, insertIndex, roomState) {
    const timelineSet = this.getTimelineSet();
    if (timelineSet.room) {
      EventTimeline.setEventMetadata(event, roomState, false);

      // modify state but only on unfiltered timelineSets
      if (event.isState() && timelineSet.room.getUnfilteredTimelineSet() === timelineSet) {
        roomState.setStateEvents([event], {});
        // it is possible that the act of setting the state event means we
        // can set more metadata (specifically sender/target props), so try
        // it again if the prop wasn't previously set. It may also mean that
        // the sender/target is updated (if the event set was a room member event)
        // so we want to use the *updated* member (new avatar/name) instead.
        //
        // However, we do NOT want to do this on member events if we're going
        // back in time, else we'll set the .sender value for BEFORE the given
        // member event, whereas we want to set the .sender value for the ACTUAL
        // member event itself.
        if (!event.sender || event.getType() === _event.EventType.RoomMember) {
          EventTimeline.setEventMetadata(event, roomState, false);
        }
      }
    }
    this.events.splice(insertIndex, 0, event); // insert element
  }

  /**
   * Remove an event from the timeline
   *
   * @param eventId -  ID of event to be removed
   * @returns removed event, or null if not found
   */
  removeEvent(eventId) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (ev.getId() == eventId) {
        this.events.splice(i, 1);
        if (i < this.baseIndex) {
          this.baseIndex--;
        }
        return ev;
      }
    }
    return null;
  }

  /**
   * Return a string to identify this timeline, for debugging
   *
   * @returns name for this timeline
   */
  toString() {
    return this.name;
  }
}
exports.EventTimeline = EventTimeline;
/**
 * Symbolic constant for methods which take a 'direction' argument:
 * refers to the start of the timeline, or backwards in time.
 */
_defineProperty(EventTimeline, "BACKWARDS", Direction.Backward);
/**
 * Symbolic constant for methods which take a 'direction' argument:
 * refers to the end of the timeline, or forwards in time.
 */
_defineProperty(EventTimeline, "FORWARDS", Direction.Forward);