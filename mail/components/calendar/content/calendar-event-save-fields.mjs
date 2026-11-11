/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * Defines how Save checks and copies one section of unsaved values.
 * A section groups related fields, such as the start and end times.
 * `keys` lists the draft properties passed to `apply` and `validate`.
 * For example, a location helper copies `location` to the event's LOCATION
 * property. The event is a Calendar object; the draft contains plain data.
 *
 * For enabled fields, create Save calls `validate` when supplied. After
 * validation succeeds, create Save calls `apply` for those fields.
 * Disabled fields add no properties to a new event.
 * Edit Save calls `apply` for enabled fields. For disabled fields, edit Save
 * calls `remove` to delete their properties from the existing event copy.
 * Both paths keep disabled fields' input in the draft for retry.
 * Field code supplies defaults and checks permissions for its own values.
 *
 * @typedef {object} CalendarEventSaveField
 * @property {string[]} keys - Draft properties owned by this field.
 * @property {(event: calIEvent, values: CalendarEventDraft) => void} apply
 *   - Copies enabled values to an event whose properties can still change.
 * @property {(event: calIEvent) => void} [remove] - Removes this field's old
 *   properties from the mutable event copy. Required for optional rows used by
 *   edit Save.
 * @property {(values: CalendarEventDraft) => CalendarEventDraftSectionValidity}
 *   [validate] - Checks enabled values and displays errors during create Save.
 *   Returns the result for Save to store. Edit Save uses stored results instead.
 */

/**
 * Copies field values for Save without clearing retained draft values.
 * Copies only the properties listed in each helper's `keys`.
 * An `enabledRows` flag of false disables a section. A missing flag keeps the
 * section enabled. Disabled sections receive an empty `values` object.
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
