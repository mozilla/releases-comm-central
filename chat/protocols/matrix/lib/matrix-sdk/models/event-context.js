"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventContext = void 0;

var _eventTimeline = require("./event-timeline");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * @module models/event-context
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
   * @param {MatrixEvent} ourEvent  the event at the centre of this context
   *
   * @constructor
   */
  constructor(ourEvent) {
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
   * @return {MatrixEvent} The event at the centre of this context.
   */


  getEvent() {
    return this.timeline[this.ourEventIndex];
  }
  /**
   * Get the list of events in this context
   *
   * @return {Array} An array of MatrixEvents
   */


  getTimeline() {
    return this.timeline;
  }
  /**
   * Get the index in the timeline of our event
   *
   * @return {Number}
   */


  getOurEventIndex() {
    return this.ourEventIndex;
  }
  /**
   * Get a pagination token.
   *
   * @param {boolean} backwards   true to get the pagination token for going
   *                                  backwards in time
   * @return {string}
   */


  getPaginateToken(backwards = false) {
    return this.paginateTokens[backwards ? _eventTimeline.Direction.Backward : _eventTimeline.Direction.Forward];
  }
  /**
   * Set a pagination token.
   *
   * Generally this will be used only by the matrix js sdk.
   *
   * @param {string} token        pagination token
   * @param {boolean} backwards   true to set the pagination token for going
   *                                   backwards in time
   */


  setPaginateToken(token, backwards = false) {
    this.paginateTokens[backwards ? _eventTimeline.Direction.Backward : _eventTimeline.Direction.Forward] = token;
  }
  /**
   * Add more events to the timeline
   *
   * @param {Array} events      new events, in timeline order
   * @param {boolean} atStart   true to insert new events at the start
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