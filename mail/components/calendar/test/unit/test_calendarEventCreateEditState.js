/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  calendarEventDraftSlice,
  resetForCreate,
  resetFromSource,
  setSectionValidity,
  updateSection,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
);
const {
  calendarEventCreateEditSessionSlice,
  clearCalendarEventCreateEditSession,
  operationFailed,
  operationStarted,
  operationSucceeded,
  startEditSession,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs"
);
const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const {
  selectCanSave,
  selectCurrentDraft,
  selectDirtySections,
  selectIsDirty,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs"
);

const sessionKey = "calendar-event-create-edit-state-test";

function sourceSnapshot() {
  return {
    event: {
      calendarId: "calendar-id",
      end: {
        icalString: "20260824T110000Z",
        isDate: false,
        nativeTime: "1787569200000000",
        timezoneId: "UTC",
      },
      eventId: "event-id",
      recurrenceId: null,
      start: {
        icalString: "20260824T100000Z",
        isDate: false,
        nativeTime: "1787565600000000",
        timezoneId: "UTC",
      },
      title: "Original title",
    },
    identity: {
      calendarId: "calendar-id",
      eventId: "event-id",
      recurrenceId: null,
    },
  };
}

function reduceDraft(state, action) {
  return calendarEventDraftSlice.reducer(state, action);
}

add_task(function test_sessionSliceIsInjectedIntoTheApplicationStore() {
  store.dispatch(startEditSession({ sessionKey }));
  Assert.equal(
    store.getState().calendarEventCreateEditSession.sessions[sessionKey].mode,
    "edit",
    "The session state is available through the app store"
  );
  store.dispatch(clearCalendarEventCreateEditSession({ sessionKey }));
});

add_task(function test_sourceSnapshotStartsAnIsolatedDraft() {
  const snapshot = sourceSnapshot();
  const state = reduceDraft(
    undefined,
    resetFromSource({ sessionKey, snapshot })
  );
  const draft = state.sessions[sessionKey];

  Assert.deepEqual(
    draft.baseline,
    {
      calendarId: "calendar-id",
      end: snapshot.event.end,
      start: snapshot.event.start,
      title: "Original title",
    },
    "The draft copies editable source values"
  );
  Assert.notStrictEqual(
    draft.value,
    snapshot.event,
    "The draft does not keep the source data object"
  );
  Assert.notStrictEqual(
    draft.value.start,
    snapshot.event.start,
    "Nested source values are copied too"
  );

  const changed = reduceDraft(
    state,
    updateSection({
      patch: { title: "Changed title" },
      section: "title",
      sessionKey,
    })
  );
  Assert.equal(
    snapshot.event.title,
    "Original title",
    "The source data is unchanged"
  );
  Assert.equal(
    changed.sessions[sessionKey].baseline.title,
    "Original title",
    "The starting values are unchanged"
  );

  const restored = reduceDraft(
    changed,
    updateSection({
      patch: { title: "Original title" },
      section: "title",
      sessionKey,
    })
  );
  Assert.deepEqual(
    restored.sessions[sessionKey].dirtySections,
    [],
    "Restoring a section to its starting values clears its changed state"
  );
});

add_task(function test_createDraftAcceptsProviderValuesWithoutDefaults() {
  const initialDraft = {
    calendarId: "provider-calendar",
    start: { icalString: "20260824T100000Z" },
  };
  const state = reduceDraft(
    undefined,
    resetForCreate({ initialDraft, sessionKey })
  );

  Assert.deepEqual(
    state.sessions[sessionKey].value,
    initialDraft,
    "The draft keeps values from field defaults"
  );
  Assert.deepEqual(
    state.sessions[sessionKey].dirtySections,
    [],
    "Field default values set the starting values"
  );
  Assert.notStrictEqual(
    state.sessions[sessionKey].value,
    initialDraft,
    "Values are copied before Redux stores them"
  );
});

add_task(function test_dateTimeSectionStaysDirtyUntilBothValuesMatchBaseline() {
  const snapshot = sourceSnapshot();
  const { start, end } = snapshot.event;
  const changedStart = {
    ...start,
    icalString: "20260824T103000Z",
    nativeTime: "1787567400000000",
  };
  const changedEnd = {
    ...end,
    icalString: "20260824T120000Z",
    nativeTime: "1787572800000000",
  };
  let state = reduceDraft(undefined, resetFromSource({ sessionKey, snapshot }));

  for (const [patch, expectedDirtySections, message] of [
    [
      { start: changedStart, end: changedEnd },
      ["dateTime"],
      "The section is dirty when both values differ from the baseline",
    ],
    [
      { start: changedStart, end },
      ["dateTime"],
      "Restoring end leaves the section dirty while start differs",
    ],
    [
      { start, end },
      [],
      "Restoring both values clears the section without Save",
    ],
  ]) {
    state = reduceDraft(
      state,
      updateSection({ patch, section: "dateTime", sessionKey })
    );
    Assert.deepEqual(
      state.sessions[sessionKey].dirtySections,
      expectedDirtySections,
      message
    );
    Assert.deepEqual(
      state.sessions[sessionKey].value.start,
      patch.start,
      "The draft contains the supplied start value"
    );
    Assert.deepEqual(
      state.sessions[sessionKey].value.end,
      patch.end,
      "The draft contains the supplied end value"
    );
    Assert.deepEqual(
      state.sessions[sessionKey].baseline.start,
      start,
      "The start baseline is unchanged"
    );
    Assert.deepEqual(
      state.sessions[sessionKey].baseline.end,
      end,
      "The end baseline is unchanged"
    );
  }
  Assert.deepEqual(
    snapshot,
    sourceSnapshot(),
    "The source snapshot is unchanged"
  );
});

add_task(function test_dirtySectionsAndValidationResetForNewSource() {
  let state = reduceDraft(
    undefined,
    resetFromSource({ sessionKey, snapshot: sourceSnapshot() })
  );
  state = reduceDraft(
    state,
    updateSection({
      patch: {
        start: sourceSnapshot().event.start,
        end: {
          ...sourceSnapshot().event.end,
          icalString: "20260824T120000Z",
          nativeTime: "1787572800000000",
        },
      },
      section: "dateTime",
      sessionKey,
    })
  );
  state = reduceDraft(
    state,
    setSectionValidity({
      section: "dateTime",
      sessionKey,
      validity: { messageId: "calendar-date-invalid", valid: false },
    })
  );

  Assert.deepEqual(
    state.sessions[sessionKey].dirtySections,
    ["dateTime"],
    "A section is changed when one value differs from its starting value"
  );

  state = reduceDraft(
    state,
    resetFromSource({
      sessionKey,
      snapshot: {
        ...sourceSnapshot(),
        event: { ...sourceSnapshot().event, title: "Replacement source" },
      },
    })
  );
  Assert.deepEqual(
    state.sessions[sessionKey].dirtySections,
    [],
    "New source data clears old changed state"
  );
  Assert.deepEqual(
    state.sessions[sessionKey].validation,
    {},
    "New source data clears old validation results"
  );
});

add_task(function test_selectorsReflectDraftAndOperationState() {
  let draftState = reduceDraft(
    undefined,
    resetForCreate({ initialDraft: { title: "Draft" }, sessionKey })
  );
  let sessionState = calendarEventCreateEditSessionSlice.reducer(
    undefined,
    startEditSession({ sessionKey })
  );
  let state = {
    calendarEventCreateEditSession: sessionState,
    calendarEventDraft: draftState,
  };

  Assert.deepEqual(
    selectCurrentDraft(state, sessionKey),
    { title: "Draft" },
    "The function returns the session draft"
  );
  Assert.ok(selectCanSave(state, sessionKey), "A valid idle draft can save");

  draftState = reduceDraft(
    draftState,
    setSectionValidity({
      section: "title",
      sessionKey,
      validity: { valid: false },
    })
  );
  state = { ...state, calendarEventDraft: draftState };
  Assert.ok(
    !selectCanSave(state, sessionKey),
    "An invalid section blocks Save"
  );

  draftState = reduceDraft(
    draftState,
    setSectionValidity({
      section: "title",
      sessionKey,
      validity: { valid: true },
    })
  );
  state = { ...state, calendarEventDraft: draftState };
  Assert.ok(selectCanSave(state, sessionKey), "A valid section allows Save");

  draftState = reduceDraft(
    draftState,
    updateSection({
      patch: { title: "Changed" },
      section: "title",
      sessionKey,
    })
  );
  state = { ...state, calendarEventDraft: draftState };
  Assert.ok(
    selectIsDirty(state, sessionKey),
    "The draft is dirty after a change"
  );
  Assert.deepEqual(
    selectDirtySections(state, sessionKey),
    ["title"],
    "The changed section is selected"
  );

  sessionState = calendarEventCreateEditSessionSlice.reducer(
    sessionState,
    operationStarted({ kind: "save", sessionKey })
  );
  state = { ...state, calendarEventCreateEditSession: sessionState };
  Assert.ok(
    !selectCanSave(state, sessionKey),
    "Save in progress prevents another save"
  );

  sessionState = calendarEventCreateEditSessionSlice.reducer(
    sessionState,
    operationFailed({
      error: { code: "save-failed" },
      kind: "save",
      sessionKey,
    })
  );
  Assert.ok(
    selectCanSave(
      { ...state, calendarEventCreateEditSession: sessionState },
      sessionKey
    ),
    "A failed save leaves the draft ready to retry"
  );

  sessionState = calendarEventCreateEditSessionSlice.reducer(
    sessionState,
    operationStarted({ kind: "save", sessionKey })
  );
  sessionState = calendarEventCreateEditSessionSlice.reducer(
    sessionState,
    operationSucceeded({ kind: "save", sessionKey })
  );
  Assert.equal(
    sessionState.sessions[sessionKey].operation.status,
    "idle",
    "A successful operation clears temporary session state"
  );
});
