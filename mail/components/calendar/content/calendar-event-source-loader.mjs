/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * The route attributes that identify one calendar event.
 *
 * @typedef {object} CalendarEventSourceIdentity
 * @property {string} calendarId - The calendar ID.
 * @property {string} eventId - The event ID.
 * @property {?string} recurrenceId - The optional occurrence ID.
 */

/**
 * Serializable date and time data for an event snapshot.
 *
 * @typedef {object} CalendarEventDateTimeSnapshot
 * @property {string} icalString - The iCalendar date and time value.
 * @property {boolean} isDate - True for a date without a time.
 * @property {string} nativeTime - The exact microsecond time value.
 * @property {?string} timezoneId - The time zone ID, if one exists.
 */

/**
 * Serializable event fields for a dialog source session.
 *
 * @typedef {object} CalendarEventSourceEventSnapshot
 * @property {string} calendarId - The calendar ID.
 * @property {string} eventId - The event ID.
 * @property {?string} recurrenceId - The optional occurrence ID.
 * @property {?CalendarEventDateTimeSnapshot} start - The start data.
 * @property {?CalendarEventDateTimeSnapshot} end - The end data.
 * @property {string} title - The event title.
 */

/**
 * Serializable event data for a dialog source session.
 *
 * @typedef {object} CalendarEventSourceSnapshot
 * @property {CalendarEventSourceIdentity} identity - The route identity.
 * @property {CalendarEventSourceEventSnapshot} event - The event data.
 */

/**
 * An event and its serializable snapshot.
 *
 * @typedef {object} CalendarEventSource
 * @property {calIEvent} event - The platform event.
 * @property {CalendarEventSourceSnapshot} snapshot - The event snapshot.
 */

/**
 * A controlled error that identifies why an event source did not load.
 */
export class CalendarEventSourceError extends Error {
  /**
   * @param {string} code - The error code for callers.
   * @param {string} message - The error message.
   * @param {*} [cause] - The original error, if one exists.
   */
  constructor(code, message, cause = null) {
    super(message, cause ? { cause } : undefined);
    /**
     * The error code for callers.
     *
     * @type {string}
     */
    this.code = code;
  }
}

/**
 * Make serializable date and time data for Redux.
 *
 * @param {?calIDateTime} dateTime
 * @returns {?CalendarEventDateTimeSnapshot}
 */
function snapshotDateTime(dateTime) {
  if (!dateTime) {
    return null;
  }

  return {
    icalString: dateTime.icalString,
    isDate: dateTime.isDate,
    // nativeTime is a signed 64-bit microsecond value. Number can lose data.
    // BigInt cannot go in a JSON-compatible Redux snapshot. Keep the string.
    nativeTime: String(dateTime.nativeTime),
    timezoneId: dateTime.timezone?.tzid ?? null,
  };
}

/**
 * Make the serializable event data shared by event dialogs.
 *
 * Field components add data when they own that data.
 *
 * @param {CalendarEventSourceIdentity} identity
 * @param {calIEvent} event
 * @returns {CalendarEventSourceSnapshot}
 */
function snapshotEvent(identity, event) {
  return {
    identity: { ...identity },
    event: {
      calendarId: identity.calendarId,
      eventId: event.id,
      recurrenceId: event.recurrenceId
        ? String(event.recurrenceId.nativeTime)
        : null,
      start: snapshotDateTime(event.startDate),
      end: snapshotDateTime(event.endDate),
      title: event.title,
    },
  };
}

/**
 * Load an event from route attributes shared by event dialogs.
 *
 * This function does not use dialog elements or Redux. A caller maps the
 * platform event before it puts event data in Redux.
 *
 * @param {CalendarEventSourceIdentity} identity
 * @returns {Promise<CalendarEventSource>}
 */
export async function loadCalendarEventSource(identity) {
  const { calendarId, eventId, recurrenceId } = identity;
  const calendar = cal.manager.getCalendarById(calendarId);
  if (!calendar) {
    throw new CalendarEventSourceError(
      "calendar-not-found",
      `No calendar found for ${calendarId}`
    );
  }

  let event;
  try {
    event = await calendar.getItem(eventId);
  } catch (error) {
    throw new CalendarEventSourceError(
      "event-load-failed",
      `Could not load ${eventId} from ${calendarId}`,
      error
    );
  }

  if (!event) {
    throw new CalendarEventSourceError(
      "event-not-found",
      `No event found for ${eventId}`
    );
  }
  if (!event.isEvent()) {
    throw new CalendarEventSourceError(
      "item-not-event",
      `${eventId} is not an event`
    );
  }

  if (recurrenceId !== null) {
    // Route attributes are strings, while nativeTime is a signed 64-bit
    // integer. Validate the representation before assigning it to the
    // platform object so malformed attributes report an identity error rather
    // than being folded into a generic loading failure.
    if (!/^-?\d+$/.test(recurrenceId)) {
      throw new CalendarEventSourceError(
        "invalid-recurrence-id",
        `Invalid recurrence ID for ${eventId}`
      );
    }

    const occurrenceId = cal.createDateTime();
    try {
      occurrenceId.nativeTime = recurrenceId;
    } catch (error) {
      throw new CalendarEventSourceError(
        "invalid-recurrence-id",
        `Invalid recurrence ID for ${eventId}`,
        error
      );
    }
    if (!occurrenceId.isValid) {
      throw new CalendarEventSourceError(
        "invalid-recurrence-id",
        `Invalid recurrence ID for ${eventId}`
      );
    }

    try {
      if (event.recurrenceStartDate?.compare(occurrenceId) == 0) {
        event = event.recurrenceInfo?.getOccurrenceFor(occurrenceId);
      } else {
        // getOccurrenceFor creates a proxy for any recurrence ID, including
        // IDs that the item's rules do not produce. Find the next real
        // occurrence instead, beginning just before the requested instant.
        const instantBeforeOccurrence = occurrenceId.clone();
        instantBeforeOccurrence.addDuration(cal.createDuration("-PT1S"));
        event = event.recurrenceInfo?.getNextOccurrence(
          instantBeforeOccurrence
        );
        if (event?.recurrenceId?.compare(occurrenceId) != 0) {
          event = null;
        }
      }
    } catch (error) {
      throw new CalendarEventSourceError(
        "occurrence-load-failed",
        `Could not load the requested occurrence for ${eventId}`,
        error
      );
    }
    if (!event) {
      throw new CalendarEventSourceError(
        "occurrence-not-found",
        `No occurrence found for ${eventId}`
      );
    }
  }

  return { event, snapshot: snapshotEvent(identity, event) };
}
