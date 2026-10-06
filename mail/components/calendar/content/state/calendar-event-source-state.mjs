/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createAsyncThunk,
  createSlice,
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";

import {
  CalendarEventSourceError,
  loadCalendarEventSource,
} from "../calendar-event-source-loader.mjs";

/**
 * A controlled error stored for a dialog route.
 *
 * @typedef {object} CalendarEventSourceErrorData
 * @property {string} code - The error code.
 */

/**
 * Source state for one dialog session.
 *
 * @typedef {object} CalendarEventSourceSession
 * @property {CalendarEventSourceErrorData|null} error - The controlled error.
 * @property {CalendarEventSourceIdentity|null} identity - The route identity.
 * @property {?string} requestId - The current load request ID.
 * @property {?CalendarEventSourceSnapshot} snapshot - The loaded event data.
 * @property {"error"|"loading"|"ready"} status - The load state.
 */

/**
 * The data that starts one source-load request.
 *
 * @typedef {object} CalendarEventSourceLoadRequest
 * @property {CalendarEventSourceIdentity} identity - The event to load.
 * @property {boolean} [retainRawEvent] - True for a legacy consumer.
 * @property {string} sessionKey - The dialog session key.
 */

/**
 * Keep raw events outside Redux.
 *
 * Only a legacy consumer uses this cache. A new consumer uses the serializable
 * snapshot. Each dialog has its own session key, so one dialog cannot replace
 * another dialog's raw event.
 *
 * @type {Map<string, { requestId: string, event: calIEvent }>}
 */
const rawEventCache = new Map();

/**
 * Get the raw event retained for a legacy dialog.
 *
 * @param {string} sessionKey - The dialog session key.
 * @returns {?calIEvent} The retained event, or null.
 */
export function getRetainedCalendarEvent(sessionKey) {
  return rawEventCache.get(sessionKey)?.event ?? null;
}

/**
 * Remove the raw event retained for a dialog.
 *
 * @param {string} sessionKey - The dialog session key.
 */
export function clearRetainedCalendarEvent(sessionKey) {
  rawEventCache.delete(sessionKey);
}

/**
 * Load an event into a serializable snapshot.
 *
 * A legacy consumer can keep the raw platform event only after this request is
 * still current for its session.
 *
 * @param {CalendarEventSourceLoadRequest} request - The source request.
 * @returns {Promise<CalendarEventSourceSnapshot>} The loaded snapshot.
 */
export const loadCalendarEventSnapshot = createAsyncThunk(
  "calendarEventSource/loadSnapshot",
  async (
    /** @type {CalendarEventSourceLoadRequest} */
    { sessionKey, identity, retainRawEvent = false },
    { getState, rejectWithValue, requestId }
  ) => {
    try {
      const source = await loadCalendarEventSource(identity);
      const currentSession = selectCalendarEventSourceSession(
        getState(),
        sessionKey
      );
      if (retainRawEvent && currentSession?.requestId === requestId) {
        rawEventCache.set(sessionKey, { requestId, event: source.event });
      }
      return source.snapshot;
    } catch (error) {
      return rejectWithValue({
        code:
          error instanceof CalendarEventSourceError
            ? error.code
            : "event-load-failed",
      });
    }
  }
);

export const calendarEventSourceSlice = createSlice({
  name: "calendarEventSource",
  initialState: {
    sessions: {},
  },
  reducers: {
    clearSession(state, action) {
      delete state.sessions[action.payload.sessionKey];
    },
    setRouteError(state, action) {
      const { sessionKey, identity, error } = action.payload;
      state.sessions[sessionKey] = {
        error,
        identity,
        requestId: null,
        snapshot: null,
        status: "error",
      };
    },
  },
  selectors: {
    selectCalendarEventSourceSession: (state, sessionKey) =>
      state.sessions[sessionKey] ?? null,
  },
  extraReducers: builder => {
    builder
      .addCase(loadCalendarEventSnapshot.pending, (state, action) => {
        const { sessionKey, identity } = action.meta.arg;
        state.sessions[sessionKey] = {
          error: null,
          identity,
          requestId: action.meta.requestId,
          snapshot: null,
          status: "loading",
        };
      })
      .addCase(loadCalendarEventSnapshot.fulfilled, (state, action) => {
        const { sessionKey } = action.meta.arg;
        const session = state.sessions[sessionKey];
        if (session?.requestId !== action.meta.requestId) {
          return;
        }
        session.error = null;
        session.snapshot = action.payload;
        session.status = "ready";
      })
      .addCase(loadCalendarEventSnapshot.rejected, (state, action) => {
        const { sessionKey } = action.meta.arg;
        const session = state.sessions[sessionKey];
        if (session?.requestId !== action.meta.requestId) {
          return;
        }
        session.error = action.payload ?? { code: "event-load-failed" };
        session.snapshot = null;
        session.status = "error";
      });
  },
});

const injectedCalendarEventSourceSlice =
  calendarEventSourceSlice.injectInto(rootReducer);

export const { clearSession, setRouteError } = calendarEventSourceSlice.actions;
export const { selectCalendarEventSourceSession } =
  injectedCalendarEventSourceSlice.selectors;
