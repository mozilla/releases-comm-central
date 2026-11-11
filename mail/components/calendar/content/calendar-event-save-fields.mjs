/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * Converts one optional draft section to Calendar event properties.
 * For example, a location field can copy `location` to the event's LOCATION
 * property. `keys` lists the draft properties passed to `apply`.
 *
 * Save calls `apply` for an enabled row and `remove` for a disabled row.
 * On Save, a disabled row removes its event properties but retains draft input.
 * Field code supplies defaults and checks permissions for its own values.
 *
 * @typedef {object} CalendarEventSaveField
 * @property {string[]} keys - Draft properties owned by this field.
 * @property {(event: calIEvent, values: CalendarEventDraft) => void} apply
 *   - Writes enabled values into the mutable event copy.
 * @property {(event: calIEvent) => void} remove - Removes this field's old
 *   properties from the mutable event copy.
 */

/**
 * Copies field values for Save without clearing retained draft values.
 * Treats a missing enabled flag as enabled. Disabled fields receive no values.
 *
 * @param {CalendarEventDraft} draft - The retained draft.
 * @param {Record<string, CalendarEventSaveField>} fields - Field conversion code.
 * @returns {Record<string, {enabled: boolean, values: CalendarEventDraft}>}
 *   Copied values and enabled state for each field.
 */
export function prepareCalendarEventSave(draft, fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([section, field]) => {
      const enabled = draft.enabledRows?.[section] !== false;
      const values = {};

      // Copy only properties owned by this field. Disabled rows keep an empty
      // values object while their draft values remain available for retry.
      if (enabled) {
        for (const key of field.keys) {
          if (Object.hasOwn(draft, key)) {
            values[key] = structuredClone(draft[key]);
          }
        }
      }

      return [section, { enabled, values }];
    })
  );
}

/**
 * Copies changed title and date values into a mutable event.
 * `baseline` contains the starting draft values. Comparing with that baseline
 * identifies user changes, even if another editor has since saved the event.
 * Unchanged values retain the event's latest saved data.
 *
 * An occurrence is one event in a repeating series. If the user chooses to edit
 * the whole series from an occurrence, applies that occurrence's date change
 * to the parent series. For example, moving the occurrence one hour later moves
 * the parent dates one hour later; it does not copy the occurrence's date.
 *
 * @param {calIEvent} event - The mutable event copy selected for Save.
 * @param {CalendarEventDraft} draft - Entered values.
 * @param {CalendarEventDraft} baseline - Values at the start of editing.
 * @param {calIEvent} occurrence - The requested live event or occurrence.
 */
export function applyCalendarEventDraft(event, draft, baseline, occurrence) {
  // Compare with the original draft, not the reloaded event. Values the user
  // did not change must preserve updates from earlier saves.
  if (draft.title !== baseline.title) {
    event.title = draft.title;
  }

  for (const [key, property] of [
    ["start", "startDate"],
    ["end", "endDate"],
  ]) {
    if (JSON.stringify(draft[key]) === JSON.stringify(baseline[key])) {
      continue;
    }

    const value = draft[key];
    if (!value) {
      event[property] = null;
      continue;
    }

    // The draft stores date text and a time zone ID, not a calIDateTime object.
    // Recreate that object and restore whether the value has a time of day.
    const date = cal.createDateTime(value.icalString);
    date.timezone = cal.timezoneService.getTimezone(value.timezoneId);
    date.isDate = value.isDate;

    if (occurrence.recurrenceId && !event.recurrenceId) {
      // A whole-series edit starts with the selected occurrence's values.
      // Apply that occurrence's date difference to the parent series date.
      const shifted = event[property].clone();
      shifted.addDuration(date.subtractDate(occurrence[property]));
      shifted.isDate = date.isDate;
      event[property] = shifted.getInTimezone(date.timezone);
    } else {
      event[property] = date;
    }
  }
}
