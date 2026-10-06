/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

import { selectCalendarEventDraftState } from "./calendarEventDraftSlice.mjs";
import { selectCalendarEventCreateEditSession } from "./calendarEventCreateEditSessionSlice.mjs";

/**
 * These functions read app state for one dialog. They return data only and do
 * not change it. Field code uses the returned values to display fields.
 */

/**
 * Read a value from the application state for the supplied dialog session key.
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
 * Data for the calendar field.
 *
 * @typedef {object} CalendarEventCalendarViewModel
 * @property {?string} calendarId - The selected calendar ID, or null when absent.
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
 * Get "create" or "edit" mode, or null when the session is absent.
 *
 * @type {CalendarEventCreateEditSelector<"create"|"edit"|null>}
 */
export const selectDialogMode = createSelector(
  [selectCalendarEventCreateEditSession],
  session => session?.mode ?? null
);

/**
 * Get operation state, or null when the session is absent.
 *
 * @type {CalendarEventCreateEditSelector<?CalendarEventCreateEditOperation>}
 */
export const selectCurrentOperation = createSelector(
  [selectCalendarEventCreateEditSession],
  session => session?.operation ?? null
);

/**
 * Get editable values, or null before a draft exists.
 *
 * @type {CalendarEventCreateEditSelector<?CalendarEventDraft>}
 */
export const selectCurrentDraft = createSelector(
  [selectCalendarEventDraftState],
  draft => draft?.value ?? null
);

/**
 * Get names of sections that differ from their starting values.
 * Return an empty array when the draft is absent.
 *
 * @type {CalendarEventCreateEditSelector<string[]>}
 */
export const selectDirtySections = createSelector(
  [selectCalendarEventDraftState],
  draft => draft?.dirtySections ?? []
);

/**
 * Return true when at least one section differs from its starting values.
 *
 * @type {CalendarEventCreateEditSelector<boolean>}
 */
export const selectIsDirty = createSelector(
  [selectDirtySections],
  dirtySections => !!dirtySections.length
);

/**
 * Return true when a draft exists, no work is pending, and no stored validation
 * result is invalid. This does not check permissions, require validation from
 * every field, or save an event.
 *
 * @type {CalendarEventCreateEditSelector<boolean>}
 */
export const selectCanSave = createSelector(
  [selectCurrentDraft, selectCalendarEventDraftState, selectCurrentOperation],
  (draft, draftState, operation) =>
    draft !== null &&
    operation?.status != "pending" &&
    Object.values(draftState?.validation ?? {}).every(
      validity => validity.valid
    )
);

/**
 * Get the title and validation result for the title field.
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
 * Get the calendar ID and validation result for the calendar field.
 *
 * @type {CalendarEventCreateEditSelector<CalendarEventCalendarViewModel>}
 */
export const selectCalendarViewModel = createSelector(
  [selectCurrentDraft, selectCalendarEventDraftState],
  (draft, draftState) => ({
    calendarId: draft?.calendarId ?? null,
    validity: draftState?.validation.calendar ?? null,
  })
);

/**
 * Get start, end, and validation values for the date and time fields.
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
