/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSlice } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";

/**
 * Records dialog mode and operation progress in a Redux slice, one part of
 * the application state. This slice stores data; the Save function does the
 * calendar work. Draft field values live in calendarEventDraftSlice.mjs.
 *
 * Callers dispatch actions to request changes. Each action has a `payload`
 * object with its inputs. The matching reducer below updates this slice.
 * `sessionKey` selects one dialog. `requestId` selects one Save attempt in that
 * dialog, so a late result cannot complete or release a replacement request.
 */

/**
 * This state records the operation kind, status, and error. Separate code
 * performs the operation.
 *
 * @typedef {object} CalendarEventCreateEditOperation
 * @property {?string} kind - The work name, or null when idle.
 * @property {"idle"|"pending"|"error"|"success"} status - No operation, work
 *   in progress, failed work, or completed work awaiting dialog cleanup.
 * @property {?string} [requestId] - The Save request that owns this operation.
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
 * Returns an operation with "idle" status, no error, and no operation kind.
 *
 * @returns {CalendarEventCreateEditOperation} The initial operation state.
 */
function createOperation() {
  return {
    error: null,
    kind: null,
    status: "idle",
  };
}

/**
 * Returns the mode and operation for one dialog, or null if absent.
 *
 * @param {object} state - The application state.
 * @param {string} sessionKey - The fixed key for the dialog.
 * @returns {?CalendarEventCreateEditSession} The session, or null if absent.
 */
export function selectCalendarEventCreateEditSession(state, sessionKey) {
  return state.calendarEventCreateEditSession?.sessions[sessionKey] ?? null;
}

/**
 * Stores mode and operation progress by dialog session key. Draft values are in
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
     * Removes the create/edit session for the supplied key.
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
     * Records an error only for the matching pending operation and request.
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     * @param {string} [action.payload.requestId] - The Save request ID.
     * @param {object} action.payload.error - Serializable error data.
     */
    operationFailed(state, action) {
      const { error, kind, sessionKey, requestId } = action.payload;
      const session = state.sessions[sessionKey];

      // A provider result can arrive after a replacement request starts.
      // Only the request that owns the pending operation can record its error.
      if (
        session?.operation.kind != kind ||
        session.operation.status != "pending" ||
        session.operation.requestId !== requestId
      ) {
        return;
      }

      session.operation = {
        error,
        ...(requestId ? { requestId } : {}),
        kind,
        status: "error",
      };
    },
    /**
     * Resets a replaced request only when it still owns the pending operation.
     * Keeps draft data and replacement operations unchanged.
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     * @param {string} action.payload.requestId - The stale request ID.
     */
    operationReleased(state, action) {
      const { kind, sessionKey, requestId } = action.payload;
      const session = state.sessions[sessionKey];

      // Releasing an old request must not unlock a newer pending Save.
      if (
        session?.operation.kind == kind &&
        session.operation.status == "pending" &&
        session.operation.requestId === requestId
      ) {
        session.operation = createOperation();
      }
    },
    /**
     * Sets operation status to "pending" unless the session is absent or its
     * operation status is already "pending".
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     * @param {string} [action.payload.requestId] - The Save request ID.
     */
    operationStarted(state, action) {
      const { kind, sessionKey, requestId } = action.payload;
      const session = state.sessions[sessionKey];
      if (!session || session.operation.status == "pending") {
        return;
      }

      session.operation = {
        error: null,
        ...(requestId ? { requestId } : {}),
        kind,
        status: "pending",
      };
    },
    /**
     * Records success for the matching request. Without a request ID, resets
     * the operation to "idle". Ignores a different kind, request, or status.
     *
     * @param {CalendarEventCreateEditSessionSliceState} state - The session slice
     *   state.
     * @param {object} action - The Redux action.
     * @param {object} action.payload - The action data.
     * @param {string} action.payload.sessionKey - The fixed dialog session key.
     * @param {string} action.payload.kind - The operation kind.
     * @param {string} [action.payload.requestId] - The Save request ID.
     */
    operationSucceeded(state, action) {
      const { kind, sessionKey, requestId } = action.payload;
      const session = state.sessions[sessionKey];

      if (
        session?.operation.kind != kind ||
        session.operation.status != "pending" ||
        session.operation.requestId !== requestId
      ) {
        return;
      }

      // Keep the successful Save request ID until the dialog observer closes
      // that request's session. Older operations without IDs return to idle.
      session.operation = requestId
        ? { error: null, kind, requestId, status: "success" }
        : createOperation();
    },
    /**
     * Creates or replaces the session in "create" mode with no operation.
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
     * Creates or replaces the session in "edit" mode with no operation.
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
  operationReleased,
  operationStarted,
  operationSucceeded,
  startCreateSession,
  startEditSession,
} = calendarEventCreateEditSessionSlice.actions;
