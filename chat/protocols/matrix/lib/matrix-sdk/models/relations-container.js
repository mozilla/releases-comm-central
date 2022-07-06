"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RelationsContainer = void 0;

var _relations = require("./relations");

var _event = require("./event");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class RelationsContainer {
  // A tree of objects to access a set of related children for an event, as in:
  // this.relations[parentEventId][relationType][relationEventType]
  constructor(client, room) {
    this.client = client;
    this.room = room;

    _defineProperty(this, "relations", {});
  }
  /**
   * Get a collection of child events to a given event in this timeline set.
   *
   * @param {String} eventId
   * The ID of the event that you'd like to access child events for.
   * For example, with annotations, this would be the ID of the event being annotated.
   * @param {String} relationType
   * The type of relationship involved, such as "m.annotation", "m.reference", "m.replace", etc.
   * @param {String} eventType
   * The relation event's type, such as "m.reaction", etc.
   * @throws If <code>eventId</code>, <code>relationType</code> or <code>eventType</code>
   * are not valid.
   *
   * @returns {?Relations}
   * A container for relation events or undefined if there are no relation events for
   * the relationType.
   */


  getChildEventsForEvent(eventId, relationType, eventType) {
    return this.relations[eventId]?.[relationType]?.[eventType];
  }

  getAllChildEventsForEvent(parentEventId) {
    const relationsForEvent = this.relations[parentEventId] ?? {};
    const events = [];

    for (const relationsRecord of Object.values(relationsForEvent)) {
      for (const relations of Object.values(relationsRecord)) {
        events.push(...relations.getRelations());
      }
    }

    return events;
  }
  /**
   * Set an event as the target event if any Relations exist for it already.
   * Child events can point to other child events as their parent, so this method may be
   * called for events which are also logically child events.
   *
   * @param {MatrixEvent} event The event to check as relation target.
   */


  aggregateParentEvent(event) {
    const relationsForEvent = this.relations[event.getId()];
    if (!relationsForEvent) return;

    for (const relationsWithRelType of Object.values(relationsForEvent)) {
      for (const relationsWithEventType of Object.values(relationsWithRelType)) {
        relationsWithEventType.setTargetEvent(event);
      }
    }
  }
  /**
   * Add relation events to the relevant relation collection.
   *
   * @param {MatrixEvent} event The new child event to be aggregated.
   * @param {EventTimelineSet} timelineSet The event timeline set within which to search for the related event if any.
   */


  aggregateChildEvent(event, timelineSet) {
    if (event.isRedacted() || event.status === _event.EventStatus.CANCELLED) {
      return;
    }

    const relation = event.getRelation();
    if (!relation) return;

    const onEventDecrypted = () => {
      if (event.isDecryptionFailure()) {
        // This could for example happen if the encryption keys are not yet available.
        // The event may still be decrypted later. Register the listener again.
        event.once(_event.MatrixEventEvent.Decrypted, onEventDecrypted);
        return;
      }

      this.aggregateChildEvent(event, timelineSet);
    }; // If the event is currently encrypted, wait until it has been decrypted.


    if (event.isBeingDecrypted() || event.shouldAttemptDecryption()) {
      event.once(_event.MatrixEventEvent.Decrypted, onEventDecrypted);
      return;
    }

    const {
      event_id: relatesToEventId,
      rel_type: relationType
    } = relation;
    const eventType = event.getType();
    let relationsForEvent = this.relations[relatesToEventId];

    if (!relationsForEvent) {
      relationsForEvent = this.relations[relatesToEventId] = {};
    }

    let relationsWithRelType = relationsForEvent[relationType];

    if (!relationsWithRelType) {
      relationsWithRelType = relationsForEvent[relationType] = {};
    }

    let relationsWithEventType = relationsWithRelType[eventType];

    if (!relationsWithEventType) {
      relationsWithEventType = relationsWithRelType[eventType] = new _relations.Relations(relationType, eventType, this.client);
      const room = this.room ?? timelineSet?.room;
      const relatesToEvent = timelineSet?.findEventById(relatesToEventId) ?? room?.findEventById(relatesToEventId) ?? room?.getPendingEvent(relatesToEventId);

      if (relatesToEvent) {
        relationsWithEventType.setTargetEvent(relatesToEvent);
      }
    }

    relationsWithEventType.addEvent(event);
  }

}

exports.RelationsContainer = RelationsContainer;