/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSlice } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";

/**
 * Event values that a user can change. Redux stores copied data, not calendar
 * objects. A "create" draft can omit values until field code adds them. Event
 * and occurrence IDs stay in the source session.
 *
 * @typedef {object} CalendarEventDraft
 * @property {string} [calendarId] - The selected calendar ID.
 * @property {string} [title] - The event title.
 * @property {?CalendarEventDateTimeSnapshot} [start] - The start date and time.
 * @property {?CalendarEventDateTimeSnapshot} [end] - The end date and time.
 */

/**
 * A validation result from field code. A missing result does not block Save.
 *
 * @typedef {object} CalendarEventDraftSectionValidity
 * @property {boolean} valid - True when the section passes its validation.
 * @property {string} [messageId] - The localization ID for a validation message.
 */

/**
 * Editable values and the data that tracks changes in one dialog.
 *
 * @typedef {object} CalendarEventDraftState
 * @property {?CalendarEventDraft} baseline - Starting values from the last reset.
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
 * Compare copied draft values without keeping references to source data.
 *
 * @param {*} first
 * @param {*} second
 * @returns {boolean}
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
 * Copy editable values from a loaded source. Route identity stays with the
 * dialog loader, so the draft does not include event or recurrence IDs.
 *
 * @param {CalendarEventSourceSnapshot} snapshot
 * @returns {CalendarEventDraft}
 */
export function cloneDraftFromSourceSnapshot(snapshot) {
  const { calendarId, end, start, title } = snapshot.event;
  return structuredClone({ calendarId, end, start, title });
}

/**
 * Get draft state for the supplied dialog session key.
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
 * Set separate copies of the starting and editable values. Clear change and
 * validation data from the old draft.
 *
 * @param {CalendarEventDraftState} draft - The state being reset.
 * @param {CalendarEventDraft} value - Values for the new starting copy.
 */
function resetDraft(draft, value) {
  const snapshot = structuredClone(value);
  draft.baseline = snapshot;
  draft.dirtySections = [];
  draft.validation = {};
  draft.value = structuredClone(snapshot);
}

/**
 * Store editable values for each dialog. This part of the Redux store also
 * defines the actions that update them. These actions do not save an event.
 */
export const calendarEventDraftSlice = createSlice({
  name: "calendarEventDraft",
  initialState: {
    sessions: {},
  },
  reducers: {
    /**
     * Remove the draft for the supplied session key.
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
     * Start a clean draft from field defaults, or an empty object.
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
     * Start a clean draft from copied loaded event data.
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
     * Store a copied validation result for a field section.
     * Do nothing if the draft is absent.
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
     * Update a section and compare values with their starting values.
     * The caller must supply every draft property for the section. The section
     * is clean when all supplied values match their starting values.
     * This reducer does not check that the patch contains every property.
     * An omitted changed property can cause a section to be marked clean.
     *
     * @param {CalendarEventDraftSliceState} state - The draft slice state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.section - The field section name.
     * @param {CalendarEventDraft} action.payload.patch - All draft properties
     *   for the section, including unchanged values.
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

      Object.assign(draft.value, structuredClone(patch));
      const isDirty = Object.keys(patch).some(
        key => !valuesAreEqual(draft.value[key], draft.baseline?.[key])
      );
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
  resetForCreate,
  resetFromSource,
  setSectionValidity,
  updateSection,
} = calendarEventDraftSlice.actions;
