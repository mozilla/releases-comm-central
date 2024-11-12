"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PollEndEvent = void 0;
var _extensible_events = require("../@types/extensible_events.js");
var _polls = require("../@types/polls.js");
var _ExtensibleEvent = require("./ExtensibleEvent.js");
var _InvalidEventError = require("./InvalidEventError.js");
var _MessageEvent = require("./MessageEvent.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2022 - 2023 The Matrix.org Foundation C.I.C.

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
 * Represents a poll end/closure event.
 */
class PollEndEvent extends _ExtensibleEvent.ExtensibleEvent {
  /**
   * Creates a new PollEndEvent from a pure format. Note that the event is *not*
   * parsed here: it will be treated as a literal m.poll.response primary typed event.
   * @param wireFormat - The event.
   */
  constructor(wireFormat) {
    super(wireFormat);
    /**
     * The poll start event ID referenced by the response.
     */
    _defineProperty(this, "pollEventId", void 0);
    /**
     * The closing message for the event.
     */
    _defineProperty(this, "closingMessage", void 0);
    const rel = this.wireContent["m.relates_to"];
    if (!_extensible_events.REFERENCE_RELATION.matches(rel?.rel_type) || typeof rel?.event_id !== "string") {
      throw new _InvalidEventError.InvalidEventError("Relationship must be a reference to an event");
    }
    this.pollEventId = rel.event_id;
    this.closingMessage = new _MessageEvent.MessageEvent(this.wireFormat);
  }
  isEquivalentTo(primaryEventType) {
    return (0, _extensible_events.isEventTypeSame)(primaryEventType, _polls.M_POLL_END);
  }
  serialize() {
    return {
      type: _polls.M_POLL_END.name,
      content: _objectSpread({
        "m.relates_to": {
          rel_type: _extensible_events.REFERENCE_RELATION.name,
          event_id: this.pollEventId
        },
        [_polls.M_POLL_END.name]: {}
      }, this.closingMessage.serialize().content)
    };
  }

  /**
   * Creates a new PollEndEvent from a poll event ID.
   * @param pollEventId - The poll start event ID.
   * @param message - A closing message, typically revealing the top answer.
   * @returns The representative poll closure event.
   */
  static from(pollEventId, message) {
    return new PollEndEvent({
      type: _polls.M_POLL_END.name,
      content: {
        "m.relates_to": {
          rel_type: _extensible_events.REFERENCE_RELATION.name,
          event_id: pollEventId
        },
        [_polls.M_POLL_END.name]: {},
        [_extensible_events.M_TEXT.name]: message
      }
    });
  }
}
exports.PollEndEvent = PollEndEvent;