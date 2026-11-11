/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createSelector,
  createSlice,
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";
import { updateSection } from "./calendarEventDraftSlice.mjs";

/**
 * Initial calendar data and current permission for one dialog route.
 * A route is one request to create or edit an event. The route generation
 * changes when a new request replaces the old request in the same dialog.
 *
 * @typedef {object} CalendarEventCalendarSource
 * @property {number} generation - The route number that owns this source data.
 * @property {?CalendarEventCalendarData} calendar - The initial calendar,
 *   including an unavailable calendar that must still be displayed.
 * @property {boolean} canChange - Whether the route permits a calendar change.
 *   The control also needs at least one allowed destination to be enabled.
 */

/**
 * Calendar choices that remain available across routes in one dialog.
 *
 * @typedef {object} CalendarEventCalendarChoices
 * @property {CalendarEventCalendarData[]} calendars - Allowed calendars.
 * @property {?CalendarEventCalendarData} unavailableCalendar - Display data for
 *   a selected calendar that was removed from the allowed choices.
 */

/**
 * Source data and current choices combined for selection consumers.
 *
 * @typedef {CalendarEventCalendarSource & CalendarEventCalendarChoices} CalendarEventCalendarState
 */

/**
 * Calendar selection state for all dialogs in this document.
 *
 * @typedef {object} CalendarEventCalendarSliceState
 * @property {Record<string, CalendarEventCalendarSource>} sessions - Entries
 *   indexed by the fixed key assigned to each dialog instance.
 * @property {Record<string, CalendarEventCalendarChoices>} choices - Calendar
 *   choices indexed by the same dialog keys, independent of route changes.
 */

/**
 * Stores calendar choices separately from the editable event values.
 * A Redux slice defines one part of the app state and the reducers that change
 * it. Redux Toolkit creates an action function for each reducer below. A caller
 * sends an action to the store with `dispatch` to run the matching reducer.
 */
export const calendarEventCalendarSlice = createSlice({
  name: "calendarEventCalendar",
  initialState: { sessions: {}, choices: {} },
  reducers: {
    /**
     * Replaces choices and updates source permission without resetting the draft.
     *
     * @param {CalendarEventCalendarSliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     * @param {CalendarEventCalendarData[]} action.payload.calendars - The new
     *   allowed calendars.
     * @param {?string} [action.payload.calendarId] - The current draft calendar
     *   ID. Its previous display data remains visible if that choice disappears.
     * @param {boolean} [action.payload.canChange] - The current source permission.
     *   If omitted, keeps the previous permission.
     */
    setCalendarOptions(
      state,
      { payload: { sessionKey, calendars, calendarId, canChange } }
    ) {
      const previous = state.choices[sessionKey];
      const unavailable = previous?.unavailableCalendar;
      const selected =
        previous?.calendars.find(calendar => calendar.id === calendarId) ??
        (unavailable?.id === calendarId ? (unavailable ?? null) : null);

      state.choices[sessionKey] = {
        calendars: structuredClone(calendars),
        unavailableCalendar: calendars.some(
          calendar => calendar.id === calendarId
        )
          ? null
          : selected,
      };

      if (state.sessions[sessionKey] && canChange !== undefined) {
        state.sessions[sessionKey].canChange = canChange;
      }
    },
    /**
     * Removes cached choices when a dialog disconnects.
     *
     * @param {CalendarEventCalendarSliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     */
    clearCalendarOptions(state, { payload: { sessionKey } }) {
      delete state.choices[sessionKey];
    },
    /**
     * Removes source data for one route and keeps the dialog's allowed choices.
     *
     * @param {CalendarEventCalendarSliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     */
    clearCalendarSelection(state, { payload: { sessionKey } }) {
      delete state.sessions[sessionKey];

      if (state.choices[sessionKey]) {
        state.choices[sessionKey].unavailableCalendar = null;
      }
    },
    /**
     * Replaces a dialog's source data with a copy of the supplied data.
     * The draft's selected calendar ID remains in `calendarEventDraftSlice`.
     *
     * @param {CalendarEventCalendarSliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     * @param {number} action.payload.generation - The current route number.
     * @param {?CalendarEventCalendarData} action.payload.calendar - Display data
     *   for the initial calendar, even if that calendar is unavailable.
     * @param {boolean} action.payload.canChange - Whether selection is allowed.
     */
    setCalendarSelection(
      state,
      { payload: { sessionKey, generation, calendar, canChange } }
    ) {
      const requestChanged =
        state.sessions[sessionKey]?.generation !== generation;

      state.sessions[sessionKey] = {
        generation,
        calendar: calendar ? structuredClone(calendar) : null,
        canChange,
      };

      if (requestChanged && state.choices[sessionKey]) {
        state.choices[sessionKey].unavailableCalendar = null;
      }
    },
  },
  selectors: {
    /**
     * Returns the source data for a route, or null if absent.
     *
     * @param {CalendarEventCalendarSliceState} state - This slice's state.
     * @param {string} sessionKey - The fixed dialog key.
     * @returns {?CalendarEventCalendarSource} The stored source data.
     */
    selectCalendarSource: (state, sessionKey) =>
      state.sessions[sessionKey] ?? null,
    /**
     * Returns the choices cached for a dialog, or null before loading.
     *
     * @param {CalendarEventCalendarSliceState} state - This slice's state.
     * @param {string} sessionKey - The fixed dialog key.
     * @returns {?CalendarEventCalendarChoices} The stored choices.
     */
    selectCalendarOptions: (state, sessionKey) =>
      state.choices[sessionKey] ?? null,
  },
});

// Add this slice to the document's store. The exported selector then accepts
// the full app state and reads this slice's entry from it.
const injectedSlice = calendarEventCalendarSlice.injectInto(rootReducer);
const { selectCalendarSource, selectCalendarOptions } = injectedSlice.selectors;
export const {
  clearCalendarOptions,
  clearCalendarSelection,
  setCalendarOptions,
  setCalendarSelection,
} = calendarEventCalendarSlice.actions;

const emptyChoices = { calendars: [], unavailableCalendar: null };

/**
 * Returns allowed choices independently of the dialog's current route.
 *
 * @param {object} state - The application Redux state.
 * @param {string} sessionKey - The fixed dialog key.
 * @returns {CalendarEventCalendarData[]} The allowed calendars, or an empty list.
 */
export const selectCalendarChoices = createSelector(
  [selectCalendarOptions],
  choices => (choices ?? emptyChoices).calendars
);

/**
 * Combines current source data and choices for a dialog, or returns null.
 * Reuses the result while both stored values remain unchanged.
 *
 * @param {object} state - The application Redux state.
 * @param {string} sessionKey - The fixed dialog key.
 * @returns {?CalendarEventCalendarState} The current selection data.
 */
export const selectCalendarSelection = createSelector(
  [selectCalendarSource, selectCalendarOptions],
  (source, choices) =>
    source ? { ...source, ...(choices ?? emptyChoices) } : null
);

/**
 * Returns a function that changes the calendar ID in the current event draft.
 *
 * Pass the result to `dispatch`. Redux calls this function with `dispatch` to
 * send actions and `getState` to read the latest app state. Redux calls this
 * kind of function a thunk. It checks the current permission and allowed choices
 * when it runs. It rejects a supplied request number that does not match.
 *
 * @param {object} selection - The choice made in the calendar control.
 * @param {string} selection.sessionKey - The fixed dialog key.
 * @param {number} [selection.generation] - The request number to match. If
 *   omitted, the choice applies to the current request.
 * @param {string} selection.calendarId - The chosen calendar ID.
 * @returns {function(function(object): void, function(): object): void}
 *   A function that updates the draft if the current route permits the choice.
 */
export function changeCalendar({ sessionKey, generation, calendarId }) {
  return (dispatch, getState) => {
    const selection = selectCalendarSelection(getState(), sessionKey);
    if (
      !selection ||
      (generation !== undefined && selection.generation !== generation) ||
      !selection.canChange ||
      !selection.calendars.some(calendar => calendar.id == calendarId)
    ) {
      return;
    }

    // Update only the draft. The draft reducer also compares the selected ID
    // with its starting value to track whether the calendar section changed.
    dispatch(
      updateSection({ sessionKey, section: "calendar", patch: { calendarId } })
    );
  };
}
