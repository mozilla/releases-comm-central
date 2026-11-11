/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

import {
  isCalendarEventDraftValid,
  selectCalendarEventDraftState,
} from "./calendarEventDraftSlice.mjs";
import { selectCalendarEventCreateEditSession } from "./calendarEventCreateEditSessionSlice.mjs";
import { selectCalendarSelection } from "./calendarEventCalendarSlice.mjs";

/**
 * A selector is a function that reads a value from the Redux application state.
 * `sessionKey` selects one dialog's data from the document's shared store.
 * These selectors combine data into view models: objects with the values that
 * controls display.
 *
 * `createSelector` keeps the previous result while its input values stay the
 * same. This is called memoization. The store observer compares the old and
 * new result by identity and skips controls whose selected result is unchanged.
 */

/**
 * Returns a value from the app state for the supplied dialog session key.
 *
 * @template T
 * @callback CalendarEventCreateEditSelector
 * @param {object} state - The application Redux state.
 * @param {string} sessionKey - The key for the dialog session.
 * @returns {T} The selected value.
 */

/**
 * Data for the title field.
 *
 * @typedef {object} CalendarEventTitleViewModel
 * @property {string} value - The title, or an empty string when absent.
 * @property {?CalendarEventDraftSectionValidity} validity - The validation
 *   result, or null when absent.
 */

/**
 * Values used to create one calendar option.
 *
 * @typedef {object} CalendarEventCalendarOption
 * @property {string} value - The calendar ID.
 * @property {string} label - The calendar name.
 * @property {boolean} disabled - Whether this option is unavailable.
 */

/**
 * Values applied together when the calendar control changes.
 *
 * @typedef {object} CalendarEventCalendarControlViewModel
 * @property {?number} generation - The request number, or null when selection
 *   state is absent.
 * @property {CalendarEventCalendarOption[]} options - The displayed choices.
 * @property {string} value - The selected calendar ID, or an empty string.
 */

/**
 * Values used to set the calendar control's disabled state and focus.
 *
 * @typedef {object} CalendarEventCalendarAvailabilityViewModel
 * @property {boolean} disabled - Whether calendar selection is unavailable.
 * @property {?number} generation - The request number, or null when selection
 *   state is absent.
 */

/**
 * Values that the dialog uses to render the calendar control.
 *
 * @typedef {object} CalendarEventCalendarViewModel
 * @property {?string} calendarId - The selected calendar ID, or null when absent.
 * @property {?number} generation - The route number that owns the choices,
 *   or null before choices are available.
 * @property {CalendarEventCalendarData[]} calendars - Allowed destination
 *   calendars.
 * @property {?CalendarEventCalendarData} calendar - Display data for
 *   `calendarId`, including an unavailable initial calendar, or null if no data
 *   matches.
 * @property {boolean} disabled - True if source permission or the list of
 *   destinations prevents selection.
 * @property {?CalendarEventDraftSectionValidity} validity - The validation
 *   result, or null when absent.
 */

/**
 * Data for the date and time fields.
 *
 * @typedef {object} CalendarEventDateTimeViewModel
 * @property {?CalendarEventDateTimeSnapshot} start - The start date and time,
 *   or null when absent.
 * @property {?CalendarEventDateTimeSnapshot} end - The end date and time,
 *   or null when absent.
 * @property {?CalendarEventDraftSectionValidity} validity - The validation
 *   result, or null when absent.
 */

/**
 * Returns "create" or "edit" mode, or null when the session is absent.
 *
 * @type {CalendarEventCreateEditSelector<"create"|"edit"|null>}
 */
export const selectDialogMode = createSelector(
  [selectCalendarEventCreateEditSession],
  session => session?.mode ?? null
);

/**
 * Returns work status and error data, or null when the session is absent.
 * The operation request ID identifies a Save attempt. A route generation
 * identifies the event load and calendar choices. They have separate lifetimes.
 *
 * @type {CalendarEventCreateEditSelector<?CalendarEventCreateEditOperation>}
 */
export const selectCurrentOperation = createSelector(
  [selectCalendarEventCreateEditSession],
  session => session?.operation ?? null
);

/**
 * Returns editable values, or null before a draft exists.
 *
 * @type {CalendarEventCreateEditSelector<?CalendarEventDraft>}
 */
export const selectCurrentDraft = createSelector(
  [selectCalendarEventDraftState],
  draft => draft?.value ?? null
);

/**
 * Returns names of field sections that differ from their starting values.
 * Returns an empty array when the draft is absent.
 *
 * @type {CalendarEventCreateEditSelector<string[]>}
 */
export const selectDirtySections = createSelector(
  [selectCalendarEventDraftState],
  draft => draft?.dirtySections ?? []
);

/**
 * Returns true when at least one section differs from its starting values.
 *
 * @type {CalendarEventCreateEditSelector<boolean>}
 */
export const selectIsDirty = createSelector(
  [selectDirtySections],
  dirtySections => !!dirtySections.length
);

/**
 * Returns true when a draft exists, no work is pending, and stored results for
 * enabled sections are valid. Ignores results for disabled rows.
 * Does not run validators, require results for every field, or check current
 * calendar permissions. The dialog uses this result for edit Save.
 * Create mode can keep the Save button enabled when this result is false so
 * the user can run validators again after correcting input.
 *
 * @type {CalendarEventCreateEditSelector<boolean>}
 */
export const selectCanSave = createSelector(
  [selectCurrentDraft, selectCalendarEventDraftState, selectCurrentOperation],
  // Field code supplies validation results. Disabled rows retain input and
  // validation, but their stored errors must not prevent saving active rows.
  (draft, draftState, operation) =>
    draft !== null &&
    operation?.status != "pending" &&
    isCalendarEventDraftValid(draftState)
);

/**
 * Returns the title and validation result for the title field.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventTitleViewModel>}
 */
export const selectTitleViewModel = createSelector(
  [selectCurrentDraft, selectCalendarEventDraftState],
  (draft, draftState) => ({
    validity: draftState?.validation.title ?? null,
    value: draft?.title ?? "",
  })
);

/**
 * Returns the selected calendar ID, or null before a draft exists.
 *
 * @type {CalendarEventCreateEditSelector<?string>}
 */
export const selectCalendarId = createSelector(
  [selectCurrentDraft],
  draft => draft?.calendarId ?? null
);

/**
 * Returns the request number for the calendar choices.
 * Returns null when selection state is absent.
 *
 * @type {CalendarEventCreateEditSelector<?number>}
 */
export const selectCalendarGeneration = createSelector(
  [selectCalendarSelection],
  selection => selection?.generation ?? null
);

/**
 * Returns the calendar field's validation result, or null when absent.
 *
 * @type {CalendarEventCreateEditSelector<?CalendarEventDraftSectionValidity>}
 */
export const selectCalendarValidity = createSelector(
  [selectCalendarEventDraftState],
  draft => draft?.validation.calendar ?? null
);

/**
 * Returns display data for the selected calendar, or null when no data matches.
 *
 * @type {CalendarEventCreateEditSelector<?CalendarEventCalendarData>}
 */
export const selectSelectedCalendar = createSelector(
  [selectCalendarId, selectCalendarSelection],
  (calendarId, selection) =>
    selection?.calendars.find(calendar => calendar.id == calendarId) ??
    (selection?.unavailableCalendar?.id === calendarId
      ? selection.unavailableCalendar
      : null) ??
    (selection?.calendar?.id === calendarId ? selection.calendar : null)
);

/**
 * Returns the calendar ID for the color swatch, or null if no data matches.
 *
 * @type {CalendarEventCreateEditSelector<?string>}
 */
export const selectCalendarColorId = createSelector(
  [selectSelectedCalendar],
  calendar => calendar?.id ?? null
);

/**
 * Returns true when calendar selection is unavailable.
 *
 * @type {CalendarEventCreateEditSelector<boolean>}
 */
export const selectCalendarDisabled = createSelector(
  [selectCalendarSelection, selectCurrentOperation],
  (selection, operation) =>
    operation?.status == "pending" ||
    !selection?.canChange ||
    !selection.calendars.length
);

/**
 * Returns the disabled state and request number for calendar focus updates.
 * The request number lets the dialog clear pending focus after an unavailable
 * event loads.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventCalendarAvailabilityViewModel>}
 */
export const selectCalendarAvailability = createSelector(
  [selectCalendarDisabled, selectCalendarGeneration],
  (disabled, generation) => ({ disabled, generation })
);

/**
 * Returns true when both lists describe the same option nodes.
 *
 * @param {CalendarEventCalendarOption[]} first - The previous options.
 * @param {CalendarEventCalendarOption[]} second - The new options.
 * @returns {boolean} Whether values, labels, and disabled states match in order.
 */
function calendarOptionsEqual(first, second) {
  return (
    first.length == second.length &&
    first.every((option, index) => {
      const other = second[index];

      return (
        option.value == other.value &&
        option.label == other.label &&
        option.disabled == other.disabled
      );
    })
  );
}

/**
 * Creates a selector that reuses matching calendar option data.
 *
 * @returns {CalendarEventCreateEditSelector<CalendarEventCalendarOption[]>}
 *   The cached options selector.
 */
function createCalendarOptionsSelector() {
  return createSelector(
    [selectCalendarSelection, selectCalendarId, selectSelectedCalendar],
    (selection, calendarId, selectedCalendar) => {
      const options = (selection?.calendars ?? []).map(calendar => ({
        value: calendar.id,
        label: calendar.name,
        disabled: false,
      }));

      if (
        selectedCalendar &&
        !options.some(option => option.value == calendarId)
      ) {
        // Keep an unavailable selected calendar visible as a disabled option.
        options.unshift({
          value: selectedCalendar.id,
          label: selectedCalendar.name,
          disabled: true,
        });
      }

      return options;
    },
    { memoizeOptions: { resultEqualityCheck: calendarOptionsEqual } }
  );
}

/**
 * Returns the options to display, including a selected unavailable calendar.
 * Use a control-selector instance for independent dialog caches.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventCalendarOption[]>}
 */
export const selectCalendarOptions = createCalendarOptionsSelector();

/**
 * Creates a calendar control selector with a cache for one dialog.
 * Separate instances keep another dialog's choices out of option comparisons.
 *
 * @returns {CalendarEventCreateEditSelector<CalendarEventCalendarControlViewModel>}
 *   The selector to observe for one dialog.
 */
export function createCalendarControlSelector() {
  const selectOptions = createCalendarOptionsSelector();

  return createSelector(
    [selectCalendarGeneration, selectOptions, selectCalendarId],
    (generation, options, calendarId) => ({
      generation,
      options,
      value: calendarId ?? "",
    })
  );
}

/**
 * Returns the request, options, and selected value for the calendar control.
 * These values are applied together because replacing options resets selection.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventCalendarControlViewModel>}
 */
export const selectCalendarControlViewModel = createSelector(
  [selectCalendarGeneration, selectCalendarOptions, selectCalendarId],
  (generation, options, calendarId) => ({
    generation,
    options,
    value: calendarId ?? "",
  })
);

/**
 * Returns the calendar field values for consumers that need a combined result.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventCalendarViewModel>}
 */
export const selectCalendarViewModel = createSelector(
  [
    selectCalendarId,
    selectCalendarValidity,
    selectCalendarGeneration,
    selectCalendarSelection,
    selectSelectedCalendar,
    selectCalendarDisabled,
  ],
  (calendarId, validity, generation, selection, calendar, disabled) => ({
    calendarId,
    validity,
    generation,
    calendars: selection?.calendars ?? [],
    calendar,
    disabled,
  })
);

/**
 * Returns start, end, and validation values for the date and time fields.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventDateTimeViewModel>}
 */
export const selectDateTimeViewModel = createSelector(
  [selectCurrentDraft, selectCalendarEventDraftState],
  (draft, draftState) => ({
    end: draft?.end ?? null,
    start: draft?.start ?? null,
    validity: draftState?.validation.dateTime ?? null,
  })
);
