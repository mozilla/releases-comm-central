"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PollEndEvent = void 0;
var _extensible_events = require("../@types/extensible_events");
var _polls = require("../@types/polls");
var _ExtensibleEvent = require("./ExtensibleEvent");
var _InvalidEventError = require("./InvalidEventError");
var _MessageEvent = require("./MessageEvent");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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