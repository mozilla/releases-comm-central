/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests draft and operation data without dialog controls or calendar writes.
 * Most cases call a slice reducer directly to inspect one state change.
 * Store cases check that dispatched actions reach the installed slices.
 */

const {
  calendarEventDraftSlice,
  clearCalendarEventDraft,
  resetForCreate,
  resetFromSource,
  initializeFields,
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
  operationReleased,
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
  selectCategories,
  selectCategoryViewModel,
  selectCurrentDraft,
  selectDirtySections,
  selectIsDirty,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs"
);

const {
  changeCategory,
  clearCategoryOptions,
  selectCategoryOptions,
  setCategoryOptions,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCategorySlice.mjs"
);

const sessionKey = "calendar-event-create-edit-state-test";
// Separate keys model two dialogs sharing the document's Redux store.
const categorySessionKey = `${sessionKey}-categories`;
const otherCategorySessionKey = `${categorySessionKey}-other`;

add_setup(function () {
  registerCleanupFunction(() => {
    for (const key of [categorySessionKey, otherCategorySessionKey]) {
      store.dispatch(clearCategoryOptions({ sessionKey: key }));
      store.dispatch(clearCalendarEventDraft({ sessionKey: key }));
      store.dispatch(clearCalendarEventCreateEditSession({ sessionKey: key }));
    }
  });
});

/**
 * Returns the source fields used by draft reducers. This fixture omits calendar
 * display data because these tests do not load or show a calendar.
 *
 * @returns {{event: CalendarEventSourceEventSnapshot,
 *   identity: CalendarEventSourceIdentity}} The copied source data for the draft.
 */
function sourceSnapshot() {
  return {
    event: {
      calendarId: "calendar-id",
      categories: [],
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
      categories: [],
      end: snapshot.event.end,
      start: snapshot.event.start,
      title: "Original title",
    },
    "The draft should copy editable source values"
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
    { title: { valid: true } },
    "New source data replaces old validation results with title validity"
  );
});

add_task(function test_disabledRowsDoNotBlockSave() {
  for (const enabled of [undefined, true, false]) {
    const initialDraft = { location: "Retained room", title: "Draft" };

    if (enabled !== undefined) {
      initialDraft.enabledRows = { location: enabled };
    }

    // Missing and true flags keep the row active. Only an explicit false flag
    // permits Save while this row retains an invalid value.
    let draftState = reduceDraft(
      undefined,
      resetForCreate({ initialDraft, sessionKey })
    );
    draftState = reduceDraft(
      draftState,
      setSectionValidity({
        section: "location",
        sessionKey,
        validity: { valid: false },
      })
    );
    const state = { calendarEventDraft: draftState };

    Assert.equal(
      selectCanSave(state, sessionKey),
      enabled === false,
      "An invalid section should permit Save only when its row is disabled."
    );

    draftState = reduceDraft(
      draftState,
      setSectionValidity({
        section: "title",
        sessionKey,
        validity: { valid: false },
      })
    );

    Assert.ok(
      !selectCanSave({ calendarEventDraft: draftState }, sessionKey),
      "An invalid active title should block Save regardless of another row."
    );

    for (const section of ["title", "location"]) {
      draftState = reduceDraft(
        draftState,
        setSectionValidity({ section, sessionKey, validity: { valid: true } })
      );
    }

    Assert.ok(
      selectCanSave({ calendarEventDraft: draftState }, sessionKey),
      "Valid sections should permit Save with any row state."
    );
  }
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

add_task(function test_rowDefaultsAndDirtyStateStaySeparate() {
  let state = reduceDraft(
    undefined,
    resetFromSource({ sessionKey, snapshot: sourceSnapshot() })
  );

  // Initialize two independent rows, then change only the location row.
  state = reduceDraft(
    state,
    initializeFields({
      sessionKey,
      defaults: {
        enabledRows: { location: true },
        location: "Room",
      },
    })
  );
  state = reduceDraft(
    state,
    initializeFields({
      sessionKey,
      defaults: {
        enabledRows: { reminders: true },
        reminders: ["-PT10M"],
      },
    })
  );
  state = reduceDraft(
    state,
    updateSection({
      sessionKey,
      section: "location",
      patch: {
        enabledRows: { location: false },
        location: "Room",
      },
    })
  );
  state = reduceDraft(
    state,
    updateSection({
      sessionKey,
      section: "reminders",
      patch: {
        enabledRows: { reminders: true },
        reminders: ["-PT10M"],
      },
    })
  );
  let draft = state.sessions[sessionKey];

  Assert.deepEqual(
    draft.value.enabledRows,
    {
      location: false,
      reminders: true,
    },
    "Updating one row should retain the other row's enabled state."
  );
  Assert.deepEqual(
    draft.baseline.enabledRows,
    {
      location: true,
      reminders: true,
    },
    "Row defaults should remain in the unchanged baseline."
  );
  Assert.deepEqual(
    draft.dirtySections,
    ["location"],
    "One row should not make another section dirty."
  );

  state = reduceDraft(
    state,
    updateSection({
      sessionKey,
      section: "location",
      patch: {
        enabledRows: { location: true },
        location: "Room",
      },
    })
  );
  draft = state.sessions[sessionKey];

  Assert.deepEqual(
    draft.dirtySections,
    [],
    "Restoring enabled state should clear its change."
  );
});

add_task(function test_categoryDraftIsIsolatedAndNarrowlyObserved() {
  const snapshot = sourceSnapshot();

  snapshot.event.categories = ["Work", "Not in preferences"];
  store.dispatch(resetFromSource({ sessionKey, snapshot }));

  const baseline =
    store.getState().calendarEventDraft.sessions[sessionKey].baseline;
  // Keep the array reference to check that unrelated edits reuse it.
  const selected = selectCategories(store.getState(), sessionKey);

  Assert.deepEqual(
    selected,
    snapshot.event.categories,
    "The draft should include selected names absent from preferences"
  );

  Assert.notStrictEqual(
    selected,
    snapshot.event.categories,
    "The draft should copy the source category array"
  );

  Assert.notStrictEqual(
    selected,
    baseline.categories,
    "The draft and baseline should own separate category arrays"
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "title",
      patch: { title: "Unsaved title" },
    })
  );

  Assert.strictEqual(
    selectCategories(store.getState(), sessionKey),
    selected,
    "Unrelated draft changes should preserve the category selector result"
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "categories",
      patch: { categories: ["Work"] },
    })
  );

  Assert.deepEqual(
    snapshot.event.categories,
    ["Work", "Not in preferences"],
    "Removing a draft category should preserve the source snapshot"
  );

  Assert.deepEqual(
    baseline.categories,
    snapshot.event.categories,
    "Removing a draft category should preserve the baseline"
  );

  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    ["title", "categories"],
    "Category changes should mark only the category section beside existing changes"
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "categories",
      patch: { categories: [...selected] },
    })
  );

  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    ["title"],
    "Restoring selected categories should clear only the category dirty state"
  );
});

add_task(function test_categoryOrderDoesNotCountAsChange() {
  const baseline = ["Work", "Personal"];

  for (const [categories, changed] of [
    [["Personal", "Work"], false],
    [["Work"], true],
    [["Work", "Personal", "Team"], true],
    [["Work", "Team"], true],
    [["Work", "Work"], true],
    [["Work", "Personal", "Work"], true],
    [["work", "Personal"], true],
    [[], true],
  ]) {
    let state = reduceDraft(
      undefined,
      resetForCreate({
        sessionKey,
        initialDraft: { categories: baseline, title: "Original title" },
      })
    );

    state = reduceDraft(
      state,
      updateSection({
        sessionKey,
        section: "title",
        patch: { title: "Changed title" },
      })
    );
    state = reduceDraft(
      state,
      updateSection({
        sessionKey,
        section: "categories",
        patch: { categories },
      })
    );

    const draft = state.sessions[sessionKey];

    Assert.deepEqual(
      draft.dirtySections,
      changed ? ["title", "categories"] : ["title"],
      changed
        ? "Changing selected names should mark categories beside the existing title change"
        : "Reordering categories should preserve only the existing title change"
    );
    Assert.deepEqual(
      draft.value.categories,
      categories,
      "Checking category changes should preserve the current selection order"
    );
    Assert.deepEqual(
      draft.baseline.categories,
      baseline,
      "Checking category changes should preserve the baseline order"
    );
  }
});

add_task(function test_equalCategoryValuesReuseSelectorResult() {
  store.dispatch(
    resetForCreate({ sessionKey, initialDraft: { categories: ["Work"] } })
  );

  const selected = selectCategories(store.getState(), sessionKey);

  // A new array with the same names must still reuse the previous result.
  store.dispatch(
    updateSection({
      sessionKey,
      section: "categories",
      patch: { categories: ["Work"] },
    })
  );

  Assert.strictEqual(
    selectCategories(store.getState(), sessionKey),
    selected,
    "Equal category values should reuse the selector result after a copied patch"
  );
});

add_task(function test_categoryOptionsAreIsolatedBySession() {
  const options = [{ name: "Work", color: "#000080", textColor: "white" }];

  store.dispatch(
    setCategoryOptions({ sessionKey: categorySessionKey, options })
  );
  options[0].name = "Changed outside Redux";

  Assert.deepEqual(
    selectCategoryOptions(store.getState(), categorySessionKey),
    [{ name: "Work", color: "#000080", textColor: "white" }],
    "Stored options should be separate from the loader result"
  );
  Assert.equal(
    selectCategoryOptions(store.getState(), otherCategorySessionKey),
    null,
    "Another session should have no category options"
  );

  store.dispatch(
    setCategoryOptions({ sessionKey: otherCategorySessionKey, options: [] })
  );
  store.dispatch(clearCategoryOptions({ sessionKey: categorySessionKey }));

  Assert.equal(
    selectCategoryOptions(store.getState(), categorySessionKey),
    null,
    "Clearing a session should remove its category options"
  );
  Assert.deepEqual(
    selectCategoryOptions(store.getState(), otherCategorySessionKey),
    [],
    "Clearing one session should preserve another session's options"
  );
});

add_task(function test_categoryOptionsUpdateAnEmptySelection() {
  const key = categorySessionKey;

  store.dispatch(
    resetForCreate({ sessionKey: key, initialDraft: { categories: [] } })
  );

  const loading = selectCategoryViewModel(store.getState(), key);

  Assert.ok(
    loading.disabled,
    "Categories should be disabled before options load"
  );

  store.dispatch(
    setCategoryOptions({
      sessionKey: key,
      options: [{ name: "Work", color: "", textColor: "" }],
    })
  );

  const loaded = selectCategoryViewModel(store.getState(), key);

  Assert.strictEqual(
    loaded.categories,
    loading.categories,
    "Loading options should preserve the empty selection result"
  );
  Assert.notStrictEqual(
    loaded,
    loading,
    "New options should update the row even when its selection stays empty"
  );
  Assert.ok(!loaded.disabled, "Loaded options should permit category changes");

  store.dispatch(
    updateSection({
      sessionKey: key,
      section: "title",
      patch: { title: "Unsaved" },
    })
  );

  Assert.strictEqual(
    selectCategoryViewModel(store.getState(), key),
    loaded,
    "An unrelated draft change should preserve the category view model"
  );
});

add_task(function test_categoryChangesCheckCurrentDraftAndSave() {
  const key = categorySessionKey;

  store.dispatch(startEditSession({ sessionKey: key }));
  store.dispatch(
    resetForCreate({
      sessionKey: key,
      initialDraft: { categories: ["Work"], title: "Unsaved title" },
    })
  );
  store.dispatch(setCategoryOptions({ sessionKey: key, options: [] }));
  store.dispatch(
    changeCategory({ sessionKey: key, categoryName: "Unknown", selected: true })
  );

  Assert.deepEqual(
    selectCurrentDraft(store.getState(), key),
    { categories: ["Work", "Unknown"], title: "Unsaved title" },
    "A category change should preserve other draft fields and unknown names"
  );
  Assert.deepEqual(
    selectDirtySections(store.getState(), key),
    ["categories"],
    "A category change should mark only the category section dirty"
  );

  const operation = {
    sessionKey: key,
    kind: "save",
    requestId: "category-save",
  };

  store.dispatch(operationStarted(operation));
  store.dispatch(
    changeCategory({ sessionKey: key, categoryName: "Work", selected: false })
  );

  Assert.deepEqual(
    selectCurrentDraft(store.getState(), key).categories,
    ["Work", "Unknown"],
    "Pending Save should prevent category changes"
  );
  Assert.ok(
    selectCategoryViewModel(store.getState(), key).disabled,
    "Pending Save should disable category changes in the view model"
  );

  store.dispatch(operationReleased(operation));
  store.dispatch(
    changeCategory({
      sessionKey: key,
      categoryName: "Unknown",
      selected: false,
    })
  );

  Assert.deepEqual(
    selectDirtySections(store.getState(), key),
    [],
    "Restoring baseline categories should clear the category dirty state"
  );

  store.dispatch(clearCategoryOptions({ sessionKey: key }));
  store.dispatch(
    changeCategory({ sessionKey: key, categoryName: "Team", selected: true })
  );

  Assert.deepEqual(
    selectCurrentDraft(store.getState(), key).categories,
    ["Work"],
    "A route without options should reject category changes"
  );

  store.dispatch(setCategoryOptions({ sessionKey: key, options: [] }));
  store.dispatch(clearCalendarEventDraft({ sessionKey: key }));
  store.dispatch(
    changeCategory({ sessionKey: key, categoryName: "Team", selected: true })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), key),
    null,
    "A category action should not recreate a cleared draft"
  );
});
