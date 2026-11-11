/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Orders saves of the same event across dialog documents. These documents use
 * this shared system-module instance, but each has its own Redux store. Keeping
 * this queue here makes a later Save wait for an earlier Save before reloading
 * the event. The queue does not write events; the supplied `edit` callback does.
 *
 * An identity contains calendarId, eventId, and an optional recurrenceId.
 * Moving an event changes its calendarId. Moving a repeating series can change
 * recurrenceId, the original date that identifies one occurrence in the series.
 * Pending requests must follow these changes to edit the intended saved item.
 * Independent copies in different calendars retain separate identities.
 *
 * Queue entries exist only while work is pending. They are not saved to disk
 * and do not track completed moves after the queue becomes empty.
 */

/**
 * Pending edits for one event ID and the current identity of each calendar copy.
 *
 * @typedef {object} CalendarEventEditQueue
 * @property {Promise<CalendarEventSourceIdentity>} tail - Completion of the last
 *   queued edit. A failed edit resolves this promise with the preceding identity
 *   so the next edit can run. The failing caller still receives its error.
 * @property {Map<string, CalendarEventSourceIdentity>} identities - Calendar IDs
 *   and the current identities reached by successful moves.
 * @property {Set<CalendarEventSourceIdentity>} requests - Routes of pending edits.
 */

/** @type {Map<string, CalendarEventEditQueue>} */
const pendingEdits = new Map();

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
  CalRecurrenceDate: "resource:///modules/CalRecurrenceDate.sys.mjs",
});

/**
 * Records a successful series date change for pending occurrence requests.
 *
 * @callback CalendarEventRecurrenceShift
 * @param {calIEvent} oldEvent - The series before Save.
 * @param {calIEvent} newEvent - The series after Save.
 */

/**
 * Returns the new ID for a queued occurrence after its series dates change.
 * An occurrence is one event in a repeating series. A rule generates dates,
 * such as every Monday. An explicit recurrence date adds one date. A stored
 * exception changes one occurrence, whose start can differ from its ID.
 *
 * Rule-generated occurrences keep their local clock time across daylight-saving
 * changes. Exceptions and explicit dates follow the Calendar recurrence code's
 * shift by elapsed time: the difference between the series start times in UTC.
 * If the rules exclude the shifted date, tries the occurrence's position in the
 * updated series instead. If no replacement exists, retains the calculated date.
 *
 * @param {string} recurrenceId - The occurrence ID before Save, represented as
 *   a string containing microseconds in Calendar's `nativeTime` format.
 * @param {calIEvent} oldEvent - The series before Save.
 * @param {calIEvent} newEvent - The series after Save.
 * @returns {string} The occurrence's native time after Save.
 */
function shiftRecurrenceId(recurrenceId, oldEvent, newEvent) {
  const oldStart = oldEvent.startDate;
  const newStart = newEvent.startDate;

  // The queue stores only native time. Restore the old series date form before
  // looking for an explicit recurrence date or a stored exception.
  let date = lazy.cal.createDateTime();
  date.nativeTime = recurrenceId;
  date.isDate = oldStart.isDate;
  date = date.getInTimezone(oldStart.timezone);

  const explicitDate = oldEvent.recurrenceInfo
    .getRecurrenceItems()
    .some(
      item =>
        (item instanceof lazy.CalRecurrenceDate ||
          item instanceof Ci.calIRecurrenceDate) &&
        item.date.compare(date) == 0
    );

  if (explicitDate || oldEvent.recurrenceInfo.getExceptionFor(date)) {
    // CalRecurrenceInfo shifts explicit dates and exception IDs by elapsed
    // time. Use the same UTC difference to follow their updated IDs.
    date = date.getInTimezone(newStart.timezone);
    date.addDuration(
      newStart
        .getInTimezone(lazy.cal.dtz.UTC)
        .subtractDate(oldStart.getInTimezone(lazy.cal.dtz.UTC))
    );
  } else {
    // Rule-generated dates follow local time across daylight-saving changes.
    // A floating time has no time zone. These temporary floating copies compare
    // clock values without adding an offset for either time zone.
    const oldDate = date.clone();
    const oldLocal = oldStart.clone();
    const newLocal = newStart.clone();
    oldLocal.timezone = lazy.cal.dtz.floating;
    newLocal.timezone = lazy.cal.dtz.floating;
    date.timezone = newStart.timezone;
    date.addDuration(newLocal.subtractDate(oldLocal));
    date.isDate = newStart.isDate;

    // A shifted date may no longer match a rule, such as a weekly day filter.
    // First check whether the updated series still produces that exact date.
    const rangeEnd = date.clone();
    rangeEnd.addDuration(lazy.cal.createDuration(date.isDate ? "P1D" : "PT1S"));
    const occurrences = newEvent.recurrenceInfo.getOccurrences(
      date,
      rangeEnd,
      0
    );
    if (
      !occurrences.some(
        occurrence => occurrence.recurrenceId.compare(date) == 0
      )
    ) {
      // If the date is excluded, follow the occurrence's old position in the
      // series. This keeps a queued edit on the corresponding new occurrence.
      const oldRangeEnd = oldDate.clone();
      oldRangeEnd.addDuration(
        lazy.cal.createDuration(oldDate.isDate ? "P1D" : "PT1S")
      );
      const index = oldEvent.recurrenceInfo
        .getOccurrences(oldStart, oldRangeEnd, 0)
        .findIndex(occurrence => occurrence.recurrenceId.compare(oldDate) == 0);

      if (index != -1) {
        // Include the new series start when it is an occurrence. Otherwise,
        // begin with the first occurrence after the cursor just before it.
        const cursor = newStart.clone();
        cursor.isDate = false;
        cursor.addDuration(lazy.cal.createDuration("-PT1S"));
        const startEnd = newStart.clone();
        startEnd.addDuration(
          lazy.cal.createDuration(newStart.isDate ? "P1D" : "PT1S")
        );
        let replacement = newEvent.recurrenceInfo
          .getOccurrences(newStart, startEnd, 0)
          .find(occurrence => occurrence.recurrenceId.compare(newStart) == 0);
        replacement ??= newEvent.recurrenceInfo.getNextOccurrence(cursor);

        for (let i = 0; i < index && replacement; i++) {
          replacement = newEvent.recurrenceInfo.getNextOccurrence(
            replacement.recurrenceStartDate
          );
        }

        if (replacement) {
          date = replacement.recurrenceId.clone();
        }
      }
    }
  }

  date.isDate = newStart.isDate;
  return String(date.nativeTime);
}

/**
 * Runs edits with the same event ID in request order across windows. Destination
 * editors also wait while a move is pending. Successful moves update the live
 * calendar used by earlier editors. Separate calendar copies keep their own
 * identities. Successful series shifts update pending occurrence routes.
 * Failed edits keep the preceding identities available for retry.
 *
 * @param {CalendarEventSourceIdentity} identity - The event being edited.
 * @param {(identity: CalendarEventSourceIdentity, shift: CalendarEventRecurrenceShift) => Promise<CalendarEventSourceIdentity>} edit
 *   - Save the event and return its new identity. Call `shift` after a successful
 *   whole-series date change. Live objects stay outside Redux.
 * @returns {Promise<CalendarEventSourceIdentity>} The saved identity after
 *   earlier queued edits finish and pending calendar and occurrence IDs update.
 *   Rejects if `edit` or the update of pending IDs fails.
 */
export async function queueCalendarEventEdit(identity, edit) {
  // Use one queue across calendars. A destination editor must wait for an
  // earlier move of this event ID before it loads the destination copy.
  const key = identity.eventId;
  const queue = pendingEdits.get(key) ?? {
    tail: Promise.resolve(identity),
    identities: new Map(),
    requests: new Set(),
  };

  // Copy the route so series shifts can update queued occurrence IDs without
  // changing the caller's identity object.
  const request = { ...identity };
  queue.requests.add(request);
  let currentIdentity = identity;

  const result = queue.tail.then(async () => {
    // Resolve the calendar after the preceding queued edits finish.
    // A successful earlier move may have changed the original calendar route.
    const latest = queue.identities.get(request.calendarId) ?? request;
    currentIdentity = { ...latest, recurrenceId: request.recurrenceId };

    let recurrenceShift;
    const savedIdentity = {
      ...(await edit(currentIdentity, (oldEvent, newEvent) => {
        recurrenceShift = { oldEvent, newEvent };
      })),
    };

    // Redirect all known routes that reached this same calendar copy. Copies
    // in other calendars retain their own identities even with the same ID.
    for (const [calendarId, previous] of queue.identities) {
      if (previous.calendarId == currentIdentity.calendarId) {
        queue.identities.set(calendarId, savedIdentity);
      }
    }

    queue.identities.set(currentIdentity.calendarId, savedIdentity);
    queue.identities.set(savedIdentity.calendarId, savedIdentity);

    // Only requests for the saved calendar copy follow its series date change.
    if (recurrenceShift) {
      for (const pending of queue.requests) {
        const calendarId =
          queue.identities.get(pending.calendarId)?.calendarId ??
          pending.calendarId;
        if (calendarId != savedIdentity.calendarId || !pending.recurrenceId) {
          continue;
        }

        pending.recurrenceId = shiftRecurrenceId(
          pending.recurrenceId,
          recurrenceShift.oldEvent,
          recurrenceShift.newEvent
        );
      }

      savedIdentity.recurrenceId = request.recurrenceId;
    }

    return savedIdentity;
  });

  // A rejection still reaches this caller through result. The queue continues
  // with the preceding identity so later requests can retry after a failure.
  const next = result.catch(() => currentIdentity);
  queue.tail = next;
  pendingEdits.set(key, queue);

  try {
    return await result;
  } finally {
    queue.requests.delete(request);

    // An earlier completion must not remove a queue with newer pending work.
    if (queue.tail === next) {
      pendingEdits.delete(key);
    }
  }
}
