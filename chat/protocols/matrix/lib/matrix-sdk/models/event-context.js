"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventContext = void 0;
var _eventTimeline = require("./event-timeline");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015 - 2021 The Matrix.org Foundation C.I.C.

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
class EventContext {
  /**
   * Construct a new EventContext
   *
   * An eventcontext is used for circumstances such as search results, when we
   * have a particular event of interest, and a bunch of events before and after
   * it.
   *
   * It also stores pagination tokens for going backwards and forwards in the
   * timeline.
   *
   * @param ourEvent - the event at the centre of this context
   */
  constructor(ourEvent) {
    this.ourEvent = ourEvent;
    _defineProperty(this, "timeline", void 0);
    _defineProperty(this, "ourEventIndex", 0);
    _defineProperty(this, "paginateTokens", {
      [_eventTimeline.Direction.Backward]: null,
      [_eventTimeline.Direction.Forward]: null
    });
    this.timeline = [ourEvent];
  }

  /**
   * Get the main event of interest
   *
   * This is a convenience function for getTimeline()[getOurEventIndex()].
   *
   * @returns The event at the centre of this context.
   */
  getEvent() {
    return this.timeline[this.ourEventIndex];
  }

  /**
   * Get the list of events in this context
   *
   * @returns An array of MatrixEvents
   */
  getTimeline() {
    return this.timeline;
  }

  /**
   * Get the index in the timeline of our event
   */
  getOurEventIndex() {
    return this.ourEventIndex;
  }

  /**
   * Get a pagination token.
   *
   * @param backwards -   true to get the pagination token for going
   */
  getPaginateToken(backwards = false) {
    return this.paginateTokens[backwards ? _eventTimeline.Direction.Backward : _eventTimeline.Direction.Forward];
  }

  /**
   * Set a pagination token.
   *
   * Generally this will be used only by the matrix js sdk.
   *
   * @param token -        pagination token
   * @param backwards -   true to set the pagination token for going
   *                                   backwards in time
   */
  setPaginateToken(token, backwards = false) {
    this.paginateTokens[backwards ? _eventTimeline.Direction.Backward : _eventTimeline.Direction.Forward] = token ?? null;
  }

  /**
   * Add more events to the timeline
   *
   * @param events -      new events, in timeline order
   * @param atStart -   true to insert new events at the start
   */
  addEvents(events, atStart = false) {
    // TODO: should we share logic with Room.addEventsToTimeline?
    // Should Room even use EventContext?

    if (atStart) {
      this.timeline = events.concat(this.timeline);
      this.ourEventIndex += events.length;
    } else {
      this.timeline = this.timeline.concat(events);
    }
  }
}
exports.EventContext = EventContext;