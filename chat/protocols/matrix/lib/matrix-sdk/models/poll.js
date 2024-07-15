"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isPollEvent = exports.PollEvent = exports.Poll = void 0;
var _matrixEventsSdk = require("matrix-events-sdk");
var _polls = require("../@types/polls");
var _relations = require("./relations");
var _typedEventEmitter = require("./typed-event-emitter");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

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
let PollEvent = exports.PollEvent = /*#__PURE__*/function (PollEvent) {
  PollEvent["New"] = "Poll.new";
  PollEvent["End"] = "Poll.end";
  PollEvent["Update"] = "Poll.update";
  PollEvent["Responses"] = "Poll.Responses";
  PollEvent["Destroy"] = "Poll.Destroy";
  PollEvent["UndecryptableRelations"] = "Poll.UndecryptableRelations";
  return PollEvent;
}({});
const filterResponseRelations = (relationEvents, pollEndTimestamp) => {
  const responseEvents = relationEvents.filter(event => {
    if (event.isDecryptionFailure()) {
      return;
    }
    return _polls.M_POLL_RESPONSE.matches(event.getType()) &&
    // From MSC3381:
    // "Votes sent on or before the end event's timestamp are valid votes"
    event.getTs() <= pollEndTimestamp;
  });
  return {
    responseEvents
  };
};
class Poll extends _typedEventEmitter.TypedEventEmitter {
  constructor(rootEvent, matrixClient, room) {
    super();
    this.rootEvent = rootEvent;
    this.matrixClient = matrixClient;
    this.room = room;
    _defineProperty(this, "roomId", void 0);
    _defineProperty(this, "pollEvent", void 0);
    _defineProperty(this, "_isFetchingResponses", false);
    _defineProperty(this, "relationsNextBatch", void 0);
    _defineProperty(this, "responses", null);
    _defineProperty(this, "endEvent", void 0);
    /**
     * Keep track of undecryptable relations
     * As incomplete result sets affect poll results
     */
    _defineProperty(this, "undecryptableRelationEventIds", new Set());
    _defineProperty(this, "countUndecryptableEvents", events => {
      const undecryptableEventIds = events.filter(event => event.isDecryptionFailure()).map(event => event.getId());
      const previousCount = this.undecryptableRelationsCount;
      this.undecryptableRelationEventIds = new Set([...this.undecryptableRelationEventIds, ...undecryptableEventIds]);
      if (this.undecryptableRelationsCount !== previousCount) {
        this.emit(PollEvent.UndecryptableRelations, this.undecryptableRelationsCount);
      }
    });
    if (!this.rootEvent.getRoomId() || !this.rootEvent.getId()) {
      throw new Error("Invalid poll start event.");
    }
    this.roomId = this.rootEvent.getRoomId();
    this.pollEvent = this.rootEvent.unstableExtensibleEvent;
  }
  get pollId() {
    return this.rootEvent.getId();
  }
  get endEventId() {
    return this.endEvent?.getId();
  }
  get isEnded() {
    return !!this.endEvent;
  }
  get isFetchingResponses() {
    return this._isFetchingResponses;
  }
  get undecryptableRelationsCount() {
    return this.undecryptableRelationEventIds.size;
  }
  async getResponses() {
    // if we have already fetched some responses
    // just return them
    if (this.responses) {
      return this.responses;
    }

    // if there is no fetching in progress
    // start fetching
    if (!this.isFetchingResponses) {
      await this.fetchResponses();
    }
    // return whatever responses we got from the first page
    return this.responses;
  }

  /**
   *
   * @param event - event with a relation to the rootEvent
   * @returns void
   */
  onNewRelation(event) {
    if (_polls.M_POLL_END.matches(event.getType()) && this.validateEndEvent(event)) {
      this.endEvent = event;
      this.refilterResponsesOnEnd();
      this.emit(PollEvent.End);
    }

    // wait for poll responses to be initialised
    if (!this.responses) {
      return;
    }
    const pollEndTimestamp = this.endEvent?.getTs() || Number.MAX_SAFE_INTEGER;
    const {
      responseEvents
    } = filterResponseRelations([event], pollEndTimestamp);
    this.countUndecryptableEvents([event]);
    if (responseEvents.length) {
      responseEvents.forEach(event => {
        this.responses.addEvent(event);
      });
      this.emit(PollEvent.Responses, this.responses);
    }
  }
  async fetchResponses() {
    this._isFetchingResponses = true;

    // we want:
    // - stable and unstable M_POLL_RESPONSE
    // - stable and unstable M_POLL_END
    // so make one api call and filter by event type client side
    const allRelations = await this.matrixClient.relations(this.roomId, this.rootEvent.getId(), "m.reference", undefined, {
      from: this.relationsNextBatch || undefined
    });
    await Promise.all(allRelations.events.map(event => this.matrixClient.decryptEventIfNeeded(event)));
    const responses = this.responses || new _relations.Relations("m.reference", _polls.M_POLL_RESPONSE.name, this.matrixClient, [_polls.M_POLL_RESPONSE.altName]);
    const pollEndEvent = allRelations.events.find(event => _polls.M_POLL_END.matches(event.getType()));
    if (this.validateEndEvent(pollEndEvent)) {
      this.endEvent = pollEndEvent;
      this.refilterResponsesOnEnd();
      this.emit(PollEvent.End);
    }
    const pollCloseTimestamp = this.endEvent?.getTs() || Number.MAX_SAFE_INTEGER;
    const {
      responseEvents
    } = filterResponseRelations(allRelations.events, pollCloseTimestamp);
    responseEvents.forEach(event => {
      responses.addEvent(event);
    });
    this.relationsNextBatch = allRelations.nextBatch ?? undefined;
    this.responses = responses;
    this.countUndecryptableEvents(allRelations.events);

    // while there are more pages of relations
    // fetch them
    if (this.relationsNextBatch) {
      // don't await
      // we want to return the first page as soon as possible
      this.fetchResponses();
    } else {
      // no more pages
      this._isFetchingResponses = false;
    }

    // emit after updating _isFetchingResponses state
    this.emit(PollEvent.Responses, this.responses);
  }

  /**
   * Only responses made before the poll ended are valid
   * Refilter after an end event is recieved
   * To ensure responses are valid
   */
  refilterResponsesOnEnd() {
    if (!this.responses) {
      return;
    }
    const pollEndTimestamp = this.endEvent?.getTs() || Number.MAX_SAFE_INTEGER;
    this.responses.getRelations().forEach(event => {
      if (event.getTs() > pollEndTimestamp) {
        this.responses?.removeEvent(event);
      }
    });
    this.emit(PollEvent.Responses, this.responses);
  }
  validateEndEvent(endEvent) {
    if (!endEvent) {
      return false;
    }
    /**
     * Repeated end events are ignored -
     * only the first (valid) closure event by origin_server_ts is counted.
     */
    if (this.endEvent && this.endEvent.getTs() < endEvent.getTs()) {
      return false;
    }

    /**
     * MSC3381
     * If a m.poll.end event is received from someone other than the poll creator or user with permission to redact
     * others' messages in the room, the event must be ignored by clients due to being invalid.
     */
    const roomCurrentState = this.room.currentState;
    const endEventSender = endEvent.getSender();
    return !!endEventSender && (endEventSender === this.rootEvent.getSender() || roomCurrentState.maySendRedactionForEvent(this.rootEvent, endEventSender));
  }
}

/**
 * Tests whether the event is a start, response or end poll event.
 *
 * @param event - Event to test
 * @returns true if the event is a poll event, else false
 */
exports.Poll = Poll;
const isPollEvent = event => {
  const eventType = event.getType();
  return _matrixEventsSdk.M_POLL_START.matches(eventType) || _polls.M_POLL_RESPONSE.matches(eventType) || _polls.M_POLL_END.matches(eventType);
};
exports.isPollEvent = isPollEvent;