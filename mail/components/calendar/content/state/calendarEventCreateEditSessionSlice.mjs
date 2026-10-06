/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSlice } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";

/**
 * This state records the operation kind, status, and error. Separate code
 * performs the operation.
 *
 * @typedef {object} CalendarEventCreateEditOperation
 * @property {?string} kind - The work name, or null when idle.
 * @property {"idle"|"pending"|"error"} status - The work status.
 * @property {?object} error - Error data from the code that did the work.
 */

/**
 * "create" or "edit" mode and work state for one dialog.
 *
 * @typedef {object} CalendarEventCreateEditSession
 * @property {"create"|"edit"} mode - Whether this session creates or edits an event.
 * @property {CalendarEventCreateEditOperation} operation - The work state.
 */

/**
 * Mode and operation state for all dialog sessions.
 *
 * @typedef {object} CalendarEventCreateEditSessionSliceState
 * @property {Record<string, CalendarEventCreateEditSession>} sessions - Session
 *   state keyed by the fixed dialog session key.
 */

/**
 * Create an operation state with "idle" status, no error, and no operation kind.
 *
 * @returns {CalendarEventCreateEditOperation}
 */
function createOperation() {
  return {
    error: null,
    kind: null,
    status: "idle",
  };
}

/**
 * Get the mode and work state for one dialog, or null if absent.
 *
 * @param {object} state
 * @param {string} sessionKey
 * @returns {?CalendarEventCreateEditSession}
 */
export function selectCalendarEventCreateEditSession(state, sessionKey) {
  return state.calendarEventCreateEditSession?.sessions[sessionKey] ?? null;
}

/**
 * Store mode and work state by dialog session key. Draft values are in
 * calendarEventDraftSlice (./calendarEventDraftSlice.mjs).
 * These actions do not change calendar events.
 */
export const calendarEventCreateEditSessionSlice = createSlice({
  name: "calendarEventCreateEditSession",
  initialState: {
    sessions: {},
  },
  reducers: {
    /**
     * Remove the create/edit session for the supplied key.
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     */
    clearCalendarEventCreateEditSession(state, action) {
      delete state.sessions[action.payload.sessionKey];
    },
    /**
     * Record an error for sessionKey only when the stored operation kind
     * matches the supplied kind and the operation status is "pending".
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     * @param {object} action.payload.error - Serializable error data.
     */
    operationFailed(state, action) {
      const { error, kind, sessionKey } = action.payload;
      const session = state.sessions[sessionKey];
      if (
        session?.operation.kind != kind ||
        session.operation.status != "pending"
      ) {
        return;
      }
      session.operation = {
        error,
        kind,
        status: "error",
      };
    },
    /**
     * Set operation status to "pending" unless the session is absent or its
     * operation status is already "pending".
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     */
    operationStarted(state, action) {
      const { kind, sessionKey } = action.payload;
      const session = state.sessions[sessionKey];
      if (!session || session.operation.status == "pending") {
        return;
      }
      session.operation = {
        error: null,
        kind,
        status: "pending",
      };
    },
    /**
     * Reset the operation for sessionKey to "idle" only when the stored kind
     * matches the supplied kind and the operation status is "pending".
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     */
    operationSucceeded(state, action) {
      const { kind, sessionKey } = action.payload;
      const session = state.sessions[sessionKey];
      if (
        session?.operation.kind != kind ||
        session.operation.status != "pending"
      ) {
        return;
      }
      session.operation = createOperation();
    },
    /**
     * Create or replace the session with "create" mode and "idle" operation state.
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     */
    startCreateSession(state, action) {
      const { sessionKey } = action.payload;
      state.sessions[sessionKey] = {
        mode: "create",
        operation: createOperation(),
      };
    },
    /**
     * Create or replace the session with "edit" mode and "idle" operation state.
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     */
    startEditSession(state, action) {
      const { sessionKey } = action.payload;
      state.sessions[sessionKey] = {
        mode: "edit",
        operation: createOperation(),
      };
    },
  },
});

calendarEventCreateEditSessionSlice.injectInto(rootReducer);

export const {
  clearCalendarEventCreateEditSession,
  operationFailed,
  operationStarted,
  operationSucceeded,
  startCreateSession,
  startEditSession,
} = calendarEventCreateEditSessionSlice.actions;
