"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PollResponseEvent = void 0;
var _ExtensibleEvent = require("./ExtensibleEvent");
var _polls = require("../@types/polls");
var _extensible_events = require("../@types/extensible_events");
var _InvalidEventError = require("./InvalidEventError");
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
 * Represents a poll response event.
 */
class PollResponseEvent extends _ExtensibleEvent.ExtensibleEvent {
  /**
   * The provided answers for the poll. Note that this may be falsy/unpredictable if
   * the `spoiled` property is true.
   */
  get answerIds() {
    return this.internalAnswerIds;
  }

  /**
   * The poll start event ID referenced by the response.
   */

  /**
   * Whether the vote is spoiled.
   */
  get spoiled() {
    return this.internalSpoiled;
  }

  /**
   * Creates a new PollResponseEvent from a pure format. Note that the event is *not*
   * parsed here: it will be treated as a literal m.poll.response primary typed event.
   *
   * To validate the response against a poll, call `validateAgainst` after creation.
   * @param wireFormat - The event.
   */
  constructor(wireFormat) {
    super(wireFormat);
    _defineProperty(this, "internalAnswerIds", []);
    _defineProperty(this, "internalSpoiled", false);
    _defineProperty(this, "pollEventId", void 0);
    const rel = this.wireContent["m.relates_to"];
    if (!_extensible_events.REFERENCE_RELATION.matches(rel?.rel_type) || typeof rel?.event_id !== "string") {
      throw new _InvalidEventError.InvalidEventError("Relationship must be a reference to an event");
    }
    this.pollEventId = rel.event_id;
    this.validateAgainst(null);
  }

  /**
   * Validates the poll response using the poll start event as a frame of reference. This
   * is used to determine if the vote is spoiled, whether the answers are valid, etc.
   * @param poll - The poll start event.
   */
  validateAgainst(poll) {
    const response = _polls.M_POLL_RESPONSE.findIn(this.wireContent);
    if (!Array.isArray(response?.answers)) {
      this.internalSpoiled = true;
      this.internalAnswerIds = [];
      return;
    }
    let answers = response?.answers ?? [];
    if (answers.some(a => typeof a !== "string") || answers.length === 0) {
      this.internalSpoiled = true;
      this.internalAnswerIds = [];
      return;
    }
    if (poll) {
      if (answers.some(a => !poll.answers.some(pa => pa.id === a))) {
        this.internalSpoiled = true;
        this.internalAnswerIds = [];
        return;
      }
      answers = answers.slice(0, poll.maxSelections);
    }
    this.internalAnswerIds = answers;
    this.internalSpoiled = false;
  }
  isEquivalentTo(primaryEventType) {
    return (0, _extensible_events.isEventTypeSame)(primaryEventType, _polls.M_POLL_RESPONSE);
  }
  serialize() {
    return {
      type: _polls.M_POLL_RESPONSE.name,
      content: {
        "m.relates_to": {
          rel_type: _extensible_events.REFERENCE_RELATION.name,
          event_id: this.pollEventId
        },
        [_polls.M_POLL_RESPONSE.name]: {
          answers: this.spoiled ? undefined : this.answerIds
        }
      }
    };
  }

  /**
   * Creates a new PollResponseEvent from a set of answers. To spoil the vote, pass an empty
   * answers array.
   * @param answers - The user's answers. Should be valid from a poll's answer IDs.
   * @param pollEventId - The poll start event ID.
   * @returns The representative poll response event.
   */
  static from(answers, pollEventId) {
    return new PollResponseEvent({
      type: _polls.M_POLL_RESPONSE.name,
      content: {
        "m.relates_to": {
          rel_type: _extensible_events.REFERENCE_RELATION.name,
          event_id: pollEventId
        },
        [_polls.M_POLL_RESPONSE.name]: {
          answers: answers
        }
      }
    });
  }
}
exports.PollResponseEvent = PollResponseEvent;