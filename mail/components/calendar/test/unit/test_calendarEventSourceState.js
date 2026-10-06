/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  calendarEventSourceSlice,
  clearSession,
  loadCalendarEventSnapshot,
  selectCalendarEventSourceSession,
  setRouteError,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendar-event-source-state.mjs"
);
const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);

const sessionKey = "calendar-event-source-state-test";
const identity = {
  calendarId: "calendar-id",
  eventId: "event-id",
  recurrenceId: null,
};

function reduceSource(state, action) {
  return calendarEventSourceSlice.reducer(state, action);
}

function sourceSnapshot() {
  return {
    event: {
      calendarId: identity.calendarId,
      eventId: identity.eventId,
      start: {
        icalString: "20260916T100000Z",
        isDate: false,
        nativeTime: "1799556000000000",
        timezoneId: "UTC",
      },
    },
    identity,
  };
}

add_task(function test_source_session_is_selected_from_the_injected_slice() {
  const error = { code: "incomplete-identity" };
  store.dispatch(setRouteError({ error, identity, sessionKey }));

  const session = selectCalendarEventSourceSession(
    store.getState(),
    sessionKey
  );
  Assert.strictEqual(
    calendarEventSourceSlice.selectors.selectCalendarEventSourceSession(
      store.getState(),
      sessionKey
    ),
    session,
    "The source slice provides the exported selector"
  );
  Assert.deepEqual(
    session,
    {
      error,
      identity,
      requestId: null,
      snapshot: null,
      status: "error",
    },
    "The source-session selector returns the controlled error"
  );

  store.dispatch(clearSession({ sessionKey }));
  Assert.equal(
    selectCalendarEventSourceSession(store.getState(), sessionKey),
    null,
    "Clearing the session removes its selected state"
  );
});

add_task(function test_stale_source_result_does_not_replace_current_session() {
  const request = { identity, sessionKey };
  const firstRequestId = "first-request";
  const secondRequestId = "second-request";
  const snapshot = sourceSnapshot();

  let state = reduceSource(
    undefined,
    loadCalendarEventSnapshot.pending(firstRequestId, request)
  );
  state = reduceSource(
    state,
    loadCalendarEventSnapshot.pending(secondRequestId, request)
  );
  state = reduceSource(
    state,
    loadCalendarEventSnapshot.fulfilled(snapshot, firstRequestId, request)
  );

  Assert.equal(
    selectCalendarEventSourceSession({ calendarEventSource: state }, sessionKey)
      .requestId,
    secondRequestId,
    "The current request remains selected after an old result"
  );
  Assert.equal(
    selectCalendarEventSourceSession({ calendarEventSource: state }, sessionKey)
      .status,
    "loading",
    "An old result cannot finish the current request"
  );

  state = reduceSource(
    state,
    loadCalendarEventSnapshot.fulfilled(snapshot, secondRequestId, request)
  );
  const session = selectCalendarEventSourceSession(
    { calendarEventSource: state },
    sessionKey
  );

  Assert.equal(session.status, "ready", "The current request becomes ready");
  Assert.equal(
    session.snapshot.event.start.nativeTime,
    "1799556000000000",
    "The snapshot keeps its exact native time string"
  );

  state = reduceSource(
    state,
    loadCalendarEventSnapshot.rejected(
      new Error("old request failed"),
      firstRequestId,
      request,
      { code: "event-load-failed" }
    )
  );
  Assert.equal(
    selectCalendarEventSourceSession({ calendarEventSource: state }, sessionKey)
      .status,
    "ready",
    "An old error cannot replace the current snapshot"
  );
});
