/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSlice } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";

/**
 * Stores unsaved field values for each dialog. A Redux slice defines one part
 * of the application's state and the actions that change that part.
 *
 * Callers dispatch an action, an object that names a change and carries its
 * data in `payload`. A reducer below applies that action to this slice. Redux
 * Toolkit uses Immer to record assignments and produce the next state. Code
 * outside a reducer must use actions instead of changing stored values.
 *
 * `baseline` holds the starting values; `value` holds the current input.
 * `dirtySections` lists groups of fields whose input differs from the starting
 * values. `validation` holds field check results; updating input does not run
 * those checks. All stored values are plain data that can be copied as JSON.
 * Calendar objects and writes stay outside this slice.
 */

/**
 * Unsaved event values that a user can change in the dialog.
 * Redux stores copies of these values. A "create" draft can omit values until
 * field code adds them. The source session keeps the IDs of the saved event
 * and occurrence, so draft changes do not change the event being edited.
 *
 * @typedef {object} CalendarEventDraft
 * @property {string} [calendarId] - The selected calendar ID.
 * @property {Record<string, boolean>} [enabledRows] - Optional row enabled state.
 * @property {"default"|"busy"|"free"} [availability] - Unsaved availability.
 * @property {string} [title] - The event title.
 * @property {?CalendarEventDateTimeSnapshot} [start] - The start date and time.
 * @property {?CalendarEventDateTimeSnapshot} [end] - The end date and time.
 */

/**
 * A stored field check result. `isCalendarEventDraftValid` ignores a missing
 * result. Create Save calls the supplied validators to get new results.
 *
 * @typedef {object} CalendarEventDraftSectionValidity
 * @property {boolean} valid - True when the section passes its validation.
 * @property {string} [messageId] - The localization ID for a validation message.
 */

/**
 * Editable values and the data that tracks changes in one dialog.
 *
 * @typedef {object} CalendarEventDraftState
 * @property {?CalendarEventDraft} baseline - Starting values used to detect
 *   user changes. Field defaults can add missing values to this copy.
 * @property {?CalendarEventDraft} value - Current editable values.
 * @property {string[]} dirtySections - Sections that differ from starting values.
 * @property {Record<string, CalendarEventDraftSectionValidity>} validation -
 *   Validation results keyed by field section name.
 */

/**
 * Draft state for all dialog sessions.
 *
 * @typedef {object} CalendarEventDraftSliceState
 * @property {Record<string, CalendarEventDraftState>} sessions - Draft state
 *   keyed by the fixed dialog session key.
 */

/**
 * Compares draft values, including nested values, with their starting values.
 * Object property order does not affect the result.
 *
 * @param {*} first - The current value.
 * @param {*} second - The starting value.
 * @returns {boolean} True if the values match. For objects, compares the
 *   properties returned by `Object.keys` and their nested values.
 */
function valuesAreEqual(first, second) {
  if (Object.is(first, second)) {
    return true;
  }
  if (
    !first ||
    !second ||
    typeof first != "object" ||
    typeof second != "object"
  ) {
    return false;
  }

  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  if (
    firstKeys.length != secondKeys.length ||
    firstKeys.some((key, index) => key != secondKeys[index])
  ) {
    return false;
  }
  return firstKeys.every(key => valuesAreEqual(first[key], second[key]));
}

/**
 * Returns a copy of the loaded event values that the dialog can edit.
 * The source session keeps the event and occurrence IDs. The draft has its own
 * calendar ID so a selection can change the destination without changing the
 * identity of the saved event.
 *
 * @param {CalendarEventSourceSnapshot} snapshot - The loaded source data.
 * @returns {CalendarEventDraft} A separate copy of the editable values.
 */
export function cloneDraftFromSourceSnapshot(snapshot) {
  const { calendarId, end, start, title } = snapshot.event;
  return structuredClone({ calendarId, end, start, title });
}

/**
 * Returns draft state for the supplied dialog session key.
 *
 * @param {object} state - The application Redux state.
 * @param {string} sessionKey - The fixed key assigned to the dialog instance.
 * @returns {?CalendarEventDraftState} The draft state, or null if the session
 *   entry is absent.
 */
export function selectCalendarEventDraftState(state, sessionKey) {
  return state.calendarEventDraft?.sessions[sessionKey] ?? null;
}

/**
 * Returns whether a draft exists and its stored results permit saving.
 * Checks only results for enabled sections. Does not run validators or require
 * a result for every field. A disabled row keeps its input and stored error,
 * but that error does not make this check fail.
 *
 * @param {?CalendarEventDraftState} draft - The current draft state.
 * @returns {boolean} True if a draft exists and no enabled section has a
 *   stored error.
 */
export function isCalendarEventDraftValid(draft) {
  return (
    !!draft?.value &&
    Object.entries(draft.validation).every(
      ([section, validity]) =>
        draft.value.enabledRows?.[section] === false || validity.valid
    )
  );
}

/**
 * Sets separate copies of the starting and editable values.
 * Clears changed sections and validation results from the old draft.
 * Initializes title validity from the new title.
 *
 * @param {CalendarEventDraftState} draft - The state being reset.
 * @param {CalendarEventDraft} value - Values for the new starting copy.
 */
function resetDraft(draft, value) {
  const snapshot = structuredClone(value);
  draft.baseline = snapshot;
  draft.dirtySections = [];
  draft.validation = {
    title: { valid: !!value.title?.trim() },
  };
  draft.value = structuredClone(snapshot);
}

/**
 * Stores editable values and tracks user changes for each dialog.
 * The exported actions change the draft, its starting values, or validation.
 * They do not save an event to a calendar.
 */
export const calendarEventDraftSlice = createSlice({
  name: "calendarEventDraft",
  initialState: {
    sessions: {},
  },
  reducers: {
    /**
     * Adds defaults for properties absent from the draft.
     * Copies each added value into both the current and starting values.
     * This keeps defaults separate from user changes and preserves edits made
     * while the defaults were loading. Does nothing if the draft is absent.
     *
     * @param {CalendarEventDraftSliceState} state - This slice's state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog key.
     * @param {CalendarEventDraft} action.payload.defaults - Field values to add.
     */
    initializeFields(state, { payload: { sessionKey, defaults } }) {
      const draft = state.sessions[sessionKey];
      if (!draft?.value) {
        return;
      }

      for (const [key, value] of Object.entries(defaults)) {
        if (key == "enabledRows") {
          // Fields can initialize at different times. Add only missing row
          // defaults so one field does not replace another field's changes.
          draft.value.enabledRows ??= {};
          draft.baseline.enabledRows ??= {};

          for (const [section, enabled] of Object.entries(value)) {
            if (!Object.hasOwn(draft.value.enabledRows, section)) {
              draft.value.enabledRows[section] = enabled;
              draft.baseline.enabledRows[section] = enabled;
            }
          }
        } else if (!Object.hasOwn(draft.value, key)) {
          // Equal, separate copies keep a late default clean in both snapshots.
          draft.value[key] = structuredClone(value);
          draft.baseline[key] = structuredClone(value);
        }
      }
    },
    /**
     * Removes the draft for the supplied session key.
     *
     * @param {CalendarEventDraftSliceState} state - The draft slice state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     */
    clearCalendarEventDraft(state, action) {
      delete state.sessions[action.payload.sessionKey];
    },
    /**
     * Starts a draft with field defaults, or an empty object.
     * The starting and current values match, so no section has user changes.
     *
     * @param {CalendarEventDraftSliceState} state - The draft slice state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {CalendarEventDraft} [action.payload.initialDraft={}] - Field defaults.
     */
    resetForCreate(state, action) {
      const { initialDraft = {}, sessionKey } = action.payload;
      const draft = {
        baseline: null,
        dirtySections: [],
        validation: {},
        value: null,
      };
      resetDraft(draft, initialDraft);
      state.sessions[sessionKey] = draft;
    },
    /**
     * Starts a draft with editable values copied from the loaded event.
     * The starting and current values match, so no section has user changes.
     *
     * @param {CalendarEventDraftSliceState} state - The draft slice state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {CalendarEventSourceSnapshot} action.payload.snapshot - Loaded source data.
     */
    resetFromSource(state, action) {
      const { sessionKey, snapshot } = action.payload;
      const draft = {
        baseline: null,
        dirtySections: [],
        validation: {},
        value: null,
      };
      resetDraft(draft, cloneDraftFromSourceSnapshot(snapshot));
      state.sessions[sessionKey] = draft;
    },
    /**
     * Stores a copied validation result for a field section.
     * Does nothing if the draft is absent.
     *
     * @param {CalendarEventDraftSliceState} state - The draft slice state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.section - The field section name.
     * @param {CalendarEventDraftSectionValidity} action.payload.validity - The
     *   validation result to copy.
     */
    setSectionValidity(state, action) {
      const { section, sessionKey, validity } = action.payload;
      const draft = state.sessions[sessionKey];
      if (!draft) {
        return;
      }
      draft.validation[section] = structuredClone(validity);
    },
    /**
     * Updates a field section and records whether its values changed.
     * A section groups related fields, such as the start and end times.
     * `dirtySections` lists sections that differ from their starting values.
     *
     * The caller must supply every draft property for the section. The section
     * has no user changes when all supplied values match their starting values.
     * This reducer does not check that the patch contains every property.
     * If a changed property is omitted, the section can lose its changed status.
     *
     * @param {CalendarEventDraftSliceState} state - The draft slice state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.section - The field section name.
     * @param {CalendarEventDraft} action.payload.patch - All draft properties
     *   for the section, including unchanged values. An `enabledRows` patch
     *   contains only the flags owned by this section.
     */
    updateSection(state, action) {
      const { patch, section, sessionKey } = action.payload;
      const draft = state.sessions[sessionKey];
      if (
        !draft?.value ||
        !patch ||
        typeof patch != "object" ||
        Array.isArray(patch)
      ) {
        return;
      }

      const copiedPatch = structuredClone(patch);
      if (copiedPatch.enabledRows) {
        // A section owns only its own row flags. Preserve flags belonging to
        // other sections when applying this section's complete patch.
        copiedPatch.enabledRows = {
          ...draft.value.enabledRows,
          ...copiedPatch.enabledRows,
        };
      }

      Object.assign(draft.value, copiedPatch);

      // For enabledRows, compare only flags supplied by this section.
      // A different row's change must not make this section dirty.
      const isDirty = Object.keys(patch).some(key => {
        if (key == "enabledRows") {
          return Object.keys(patch.enabledRows).some(
            row =>
              draft.value.enabledRows[row] !==
              draft.baseline?.enabledRows?.[row]
          );
        }
        return !valuesAreEqual(draft.value[key], draft.baseline?.[key]);
      });

      const dirtySectionIndex = draft.dirtySections.indexOf(section);
      if (isDirty && dirtySectionIndex == -1) {
        draft.dirtySections.push(section);
      } else if (!isDirty && dirtySectionIndex != -1) {
        draft.dirtySections.splice(dirtySectionIndex, 1);
      }
    },
  },
});

calendarEventDraftSlice.injectInto(rootReducer);

export const {
  clearCalendarEventDraft,
  initializeFields,
  resetForCreate,
  resetFromSource,
  setSectionValidity,
  updateSection,
} = calendarEventDraftSlice.actions;
