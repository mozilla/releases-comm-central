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
 * Edit Save skips unchanged categories and Video. For each field it saves,
 * edit Save calls `apply` for an enabled row or `remove` for a disabled row.
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
 * Copies selected category names to the event being saved.
 *
 * Keeps each name intact, including commas and names absent from preferences.
 * Missing or empty categories clear the event's categories. Edit Save uses
 * this helper when the enabled state or enabled selection changes. Turning
 * off the row calls `remove`. Create Save skips a disabled row. The draft
 * keeps its selected names for retry. Save writes the event through a Calendar
 * transaction after this helper updates it.
 *
 * @type {CalendarEventSaveField}
 */
export const calendarEventCategorySaveField = {
  keys: ["categories"],
  apply: (event, values) => event.setCategories(values.categories ?? []),
  remove: event => event.setCategories([]),
};

/**
 * Returns whether the event's CONFERENCE property is a video conference.
 * Only a FEATURE parameter that lists VIDEO makes it one. A property without
 * FEATURE, or with other features such as PHONE, belongs to no row.
 *
 * @param {calIEvent} event - The event to read.
 * @returns {boolean} True if the FEATURE parameter lists VIDEO.
 */
function isVideoConference(event) {
  const features = event.getPropertyParameter("CONFERENCE", "FEATURE") ?? "";

  return features.toUpperCase().split(",").includes("VIDEO");
}

/**
 * Returns the URL of the event's video conference, or an empty string.
 * Phone, chat, and other conferences return an empty string. Save leaves them
 * unchanged unless the user adds a new video URL.
 *
 * @param {calIEvent} event - The event to read.
 * @returns {string} The video URL, or an empty string.
 */
export function getEventVideoUrl(event) {
  return isVideoConference(event)
    ? (event.getProperty("CONFERENCE") ?? "")
    : "";
}

/**
 * Copies the Video URL to the event's CONFERENCE property.
 *
 * Writes the trimmed URL with `VALUE=URI` and `FEATURE=VIDEO`. An empty URL
 * writes nothing and removes an old video conference. If the event already has
 * the same video URL, leaves the property and its other parameters unchanged.
 * A new URL replaces any existing CONFERENCE property, because an event keeps
 * one value for each property name. Edit Save skips this row if the draft has
 * the same URL and enabled state as its starting values. Otherwise, it calls
 * `remove` for a disabled row, which removes only a video conference. Create
 * Save skips a disabled row. The draft keeps its URL for retry.
 *
 * @type {CalendarEventSaveField}
 */
export const calendarEventVideoSaveField = {
  keys: ["videoUrl"],
  apply: (event, values) => {
    const url = values.videoUrl?.trim() ?? "";

    if (!url) {
      calendarEventVideoSaveField.remove(event);
      return;
    }

    if (getEventVideoUrl(event) == url) {
      return;
    }

    event.deleteProperty("CONFERENCE");
    event.setProperty("CONFERENCE", url);
    event.setPropertyParameter("CONFERENCE", "VALUE", "URI");
    event.setPropertyParameter("CONFERENCE", "FEATURE", "VIDEO");
  },
  remove: event => {
    if (isVideoConference(event)) {
      event.deleteProperty("CONFERENCE");
    }
  },
};

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
