/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSlice } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";
import {
  selectCalendarEventDraftState,
  updateSection,
} from "./calendarEventDraftSlice.mjs";
import { selectCalendarEventCreateEditSession } from "./calendarEventCreateEditSessionSlice.mjs";

/**
 * Category options for each dialog in this document.
 *
 * @typedef {object} CalendarEventCategorySliceState
 * @property {Record<string, CalendarEventCategoryOption[]>} sessions - Loaded
 *   options keyed by the fixed dialog session key. A missing entry means that
 *   options have not loaded or that the route has been cleared.
 */

/**
 * Stores available category options separately from the selected draft names.
 */
export const calendarEventCategorySlice = createSlice({
  name: "calendarEventCategory",
  initialState: { sessions: {} },
  reducers: {
    /**
     * Removes the loaded options for one dialog.
     *
     * @param {CalendarEventCategorySliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     */
    clearCategoryOptions(state, { payload: { sessionKey } }) {
      delete state.sessions[sessionKey];
    },
    /**
     * Copies the loaded options for one dialog.
     * Selected draft names stay unchanged.
     *
     * @param {CalendarEventCategorySliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     * @param {CalendarEventCategoryOption[]} action.payload.options - Loaded
     *   options. An empty array means loading finished without choices.
     */
    setCategoryOptions(state, { payload: { sessionKey, options } }) {
      state.sessions[sessionKey] = structuredClone(options);
    },
  },
  selectors: {
    /**
     * Returns the loaded options for one dialog.
     *
     * @param {CalendarEventCategorySliceState} state - This slice's state.
     * @param {string} sessionKey - The fixed dialog key.
     * @returns {?CalendarEventCategoryOption[]} The options, including an empty
     *   array after an empty load, or null when the entry is absent.
     */
    selectCategoryOptions: (state, sessionKey) =>
      state.sessions[sessionKey] ?? null,
  },
});

const injectedSlice = calendarEventCategorySlice.injectInto(rootReducer);
export const { selectCategoryOptions } = injectedSlice.selectors;
export const { clearCategoryOptions, setCategoryOptions } =
  calendarEventCategorySlice.actions;

/**
 * Returns a function that updates category names in the current draft.
 * Pass the function to `dispatch` to apply the change.
 * Ignores the request during Save, without a draft or loaded options, or when
 * the selection already matches. Names can be absent from the options.
 *
 * @param {object} selection - The requested change.
 * @param {string} selection.sessionKey - The dialog session key.
 * @param {string} selection.categoryName - The category to add or remove.
 * @param {boolean} selection.selected - Whether to select the category.
 * @returns {function(function(object): void, function(): object): void}
 *   A function that updates only the draft's category section when permitted.
 */
export function changeCategory({ sessionKey, categoryName, selected }) {
  return (dispatch, getState) => {
    const state = getState();
    const draft = selectCalendarEventDraftState(state, sessionKey)?.value;
    const session = selectCalendarEventCreateEditSession(state, sessionKey);
    const categories = draft?.categories ?? [];

    if (
      !draft ||
      !selectCategoryOptions(state, sessionKey) ||
      session?.operation.status == "pending" ||
      categories.includes(categoryName) == selected
    ) {
      return;
    }

    // Restoring the original names clears the category section's changed state
    // without clearing changes to other fields.
    dispatch(
      updateSection({
        sessionKey,
        section: "categories",
        patch: {
          categories: selected
            ? [...categories, categoryName]
            : categories.filter(category => category != categoryName),
        },
      })
    );
  };
}
