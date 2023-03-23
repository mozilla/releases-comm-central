"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PollEvent = exports.Poll = void 0;
var _polls = require("../@types/polls");
var _relations = require("./relations");
var _typedEventEmitter = require("./typed-event-emitter");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
let PollEvent;
exports.PollEvent = PollEvent;
(function (PollEvent) {
  PollEvent["New"] = "Poll.new";
  PollEvent["End"] = "Poll.end";
  PollEvent["Update"] = "Poll.update";
  PollEvent["Responses"] = "Poll.Responses";
  PollEvent["Destroy"] = "Poll.Destroy";
  PollEvent["UndecryptableRelations"] = "Poll.UndecryptableRelations";
})(PollEvent || (exports.PollEvent = PollEvent = {}));
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
  /**
   * Keep track of undecryptable relations
   * As incomplete result sets affect poll results
   */

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
exports.Poll = Poll;