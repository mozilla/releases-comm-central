/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// These xpcshell tests send actions to the app's Redux store.
// Calendar display data is sufficient here; no provider or dialog is needed.

const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const {
  changeCalendar,
  clearCalendarOptions,
  clearCalendarSelection,
  selectCalendarChoices,
  selectCalendarSelection,
  setCalendarOptions,
  setCalendarSelection,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs"
);
const {
  clearCalendarEventDraft,
  initializeFields,
  resetForCreate,
  updateSection,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
);
const {
  createCalendarControlSelector,
  selectCalendarColorId,
  selectCalendarControlViewModel,
  selectCalendarDisabled,
  selectCalendarOptions,
  selectCalendarViewModel,
  selectCurrentDraft,
  selectDirtySections,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs"
);

const sessionKey = "calendar-selection-test";
const first = { id: "first", name: "First" };
const second = { id: "second", name: "Second" };
const otherSessionKey = `${sessionKey}-other`;

add_setup(function () {
  registerCleanupFunction(() => {
    for (const key of [sessionKey, otherSessionKey]) {
      store.dispatch(clearCalendarSelection({ sessionKey: key }));
      store.dispatch(clearCalendarOptions({ sessionKey: key }));
      store.dispatch(clearCalendarEventDraft({ sessionKey: key }));
    }
  });
});

add_task(function test_noSelectionIsDisabled() {
  const viewModel = selectCalendarViewModel(store.getState(), sessionKey);

  Assert.equal(
    viewModel.calendar,
    null,
    "The calendar view should have no selection before state exists"
  );
  Assert.equal(
    selectCalendarColorId(store.getState(), sessionKey),
    null,
    "The swatch should have no calendar ID before selection state exists"
  );
  Assert.ok(
    viewModel.disabled,
    "The selector should be disabled before selection state exists"
  );
});

/**
 * Sets source data and, when supplied, available choices for a test dialog.
 *
 * @param {object} selection - The source data and optional calendar choices.
 * @param {CalendarEventCalendarData[]} [selection.calendars] - The allowed choices.
 */
function setSelection({ calendars, ...selection }) {
  if (calendars) {
    store.dispatch(
      setCalendarOptions({ sessionKey: selection.sessionKey, calendars })
    );
  }

  store.dispatch(setCalendarSelection(selection));
}

/**
 * Starts a create draft and stores two allowed choices for its route.
 *
 * @param {number} generation - The route number captured by the control.
 * @param {boolean} [canChange=true] - Whether this route permits selection.
 */
function startSelection(generation, canChange = true) {
  store.dispatch(
    resetForCreate({ sessionKey, initialDraft: { calendarId: first.id } })
  );
  setSelection({
    sessionKey,
    generation,
    canChange,
    calendars: [first, second],
    calendar: first,
  });
}

add_task(function test_selectionOnlyChangesCurrentDraftCalendar() {
  startSelection(1);
  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title: "Unsaved" } })
  );

  store.dispatch(
    changeCalendar({ sessionKey, generation: 1, calendarId: second.id })
  );

  Assert.deepEqual(
    selectCurrentDraft(store.getState(), sessionKey),
    { calendarId: second.id, title: "Unsaved" },
    "The draft should contain the new calendar and the unsaved title"
  );
  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    ["title", "calendar"],
    "The title and calendar sections should both be dirty"
  );
  Assert.equal(
    store.getState().calendarEventDraft.sessions[sessionKey].baseline
      .calendarId,
    first.id,
    "Calendar selection should preserve the baseline calendar"
  );

  const viewModel = selectCalendarViewModel(store.getState(), sessionKey);
  Assert.deepEqual(
    viewModel.calendar,
    second,
    "The calendar view model should contain the selected calendar data"
  );
  Assert.ok(
    !viewModel.disabled,
    "The selector should remain enabled after a calendar change"
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "title",
      patch: { title: "Another title" },
    })
  );

  // The selector reuses its result when only an unrelated field changes.
  // Store observation uses this identity check to avoid rendering the control.
  Assert.strictEqual(
    selectCalendarViewModel(store.getState(), sessionKey),
    viewModel,
    "Unrelated field changes should not rerender the calendar"
  );

  store.dispatch(
    changeCalendar({ sessionKey, generation: 1, calendarId: first.id })
  );

  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    ["title"],
    "Selecting the baseline calendar should leave only the title dirty"
  );
});

add_task(function test_staleAndUnavailableSelectionsAreIgnored() {
  // Capture a choice from route 1, then dispatch it after route 2 replaces it.
  // The returned function must read state when dispatched, not when created.
  const oldSelection = changeCalendar({
    sessionKey,
    generation: 1,
    calendarId: second.id,
  });

  startSelection(2);
  store.dispatch(oldSelection);

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "An old operation should not change the draft calendar"
  );

  store.dispatch(
    changeCalendar({ sessionKey, generation: 2, calendarId: "hidden" })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "An unavailable destination should not change the draft calendar"
  );

  startSelection(3, false);
  store.dispatch(
    changeCalendar({ sessionKey, generation: 3, calendarId: second.id })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "An operation without change permission should keep its draft calendar"
  );
  Assert.ok(
    selectCalendarViewModel(store.getState(), sessionKey).disabled,
    "The selector should be disabled when changes are denied"
  );

  store.dispatch(clearCalendarSelection({ sessionKey }));
  store.dispatch(
    changeCalendar({ sessionKey, generation: 3, calendarId: second.id })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "A selection after state is cleared should not change the draft calendar"
  );
});

add_task(function test_fieldDefaultsPreserveOtherChanges() {
  // Recreate a title edit made before the calendar default becomes available.
  store.dispatch(
    resetForCreate({ sessionKey, initialDraft: { title: "Original" } })
  );
  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title: "Unsaved" } })
  );

  store.dispatch(
    initializeFields({ sessionKey, defaults: { calendarId: first.id } })
  );

  Assert.deepEqual(
    selectCurrentDraft(store.getState(), sessionKey),
    { calendarId: first.id, title: "Unsaved" },
    "Field defaults should add the calendar and preserve the edited title"
  );
  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    ["title"],
    "Adding field defaults should leave only the title dirty"
  );
  Assert.equal(
    store.getState().calendarEventDraft.sessions[sessionKey].baseline.title,
    "Original",
    "Field defaults should preserve the baseline title"
  );

  store.dispatch(
    initializeFields({ sessionKey, defaults: { calendarId: second.id } })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "Defaults should not replace an existing field value"
  );

  store.dispatch(clearCalendarEventDraft({ sessionKey }));
  store.dispatch(
    initializeFields({ sessionKey, defaults: { calendarId: second.id } })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey),
    null,
    "Field defaults should not recreate a removed draft"
  );
});

add_task(function test_unavailableCalendarRemainsDisplayable() {
  startSelection(4);

  // Keep the initial calendar as display data but offer only another calendar
  // as a destination. This matches editing an event from a hidden calendar.
  setSelection({
    sessionKey,
    generation: 4,
    canChange: true,
    calendars: [second],
    calendar: first,
  });

  let viewModel = selectCalendarViewModel(store.getState(), sessionKey);

  Assert.deepEqual(
    viewModel.calendar,
    first,
    "An unavailable source should retain its display data"
  );
  Assert.ok(
    !viewModel.disabled,
    "An available destination should permit a change from an unavailable source"
  );

  setSelection({
    sessionKey,
    generation: 4,
    canChange: true,
    calendars: [],
    calendar: first,
  });
  viewModel = selectCalendarViewModel(store.getState(), sessionKey);

  Assert.deepEqual(
    viewModel.calendar,
    first,
    "Empty choices should preserve the initial calendar display data"
  );
  Assert.equal(
    selectCalendarColorId(store.getState(), sessionKey),
    first.id,
    "The swatch should retain the unavailable initial calendar ID"
  );
  Assert.ok(
    viewModel.disabled,
    "Empty choices should disable selection even when permission is granted"
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "calendar",
      patch: { calendarId: "missing" },
    })
  );

  Assert.equal(
    selectCalendarViewModel(store.getState(), sessionKey).calendar,
    null,
    "An unknown calendar ID should have no display data"
  );
});

add_task(function test_selectionCopiesData() {
  startSelection(5);
  const selection = {
    sessionKey,
    generation: 5,
    canChange: true,
    calendars: [{ ...first }, { ...second }],
    calendar: { ...first },
  };
  setSelection(selection);

  // Change the caller's objects after dispatch to check that the reducer copied
  // both the initial calendar and the list of destination calendars.
  selection.calendar.name = "Changed source";
  selection.calendars[0].name = "Changed choice";
  selection.calendars.push({ id: "extra", name: "Extra" });

  const saved = selectCalendarSelection(store.getState(), sessionKey);

  Assert.deepEqual(
    saved.calendar,
    first,
    "Stored source data should not change with the action payload"
  );
  Assert.deepEqual(
    saved.calendars,
    [first, second],
    "Stored choices should not change with the action payload"
  );

  store.dispatch(
    changeCalendar({ sessionKey, generation: 5, calendarId: second.id })
  );
  const { calendarEventCalendar, calendarEventDraft } = store.getState();
  const state = { calendarEventCalendar, calendarEventDraft };

  Assert.deepEqual(
    JSON.parse(JSON.stringify(state)),
    state,
    "Selection and draft state should contain only JSON-compatible data"
  );
});

add_task(function test_sessionsRemainIsolated() {
  startSelection(6);

  // Two dialogs can have the same route number. Their fixed session keys keep
  // their drafts and choices separate in the shared store.
  store.dispatch(
    resetForCreate({
      sessionKey: otherSessionKey,
      initialDraft: { calendarId: first.id, title: "Other draft" },
    })
  );
  setSelection({
    sessionKey: otherSessionKey,
    generation: 6,
    canChange: true,
    calendars: [first, second],
    calendar: first,
  });

  store.dispatch(
    changeCalendar({ sessionKey, generation: 6, calendarId: second.id })
  );

  Assert.deepEqual(
    selectCurrentDraft(store.getState(), otherSessionKey),
    { calendarId: first.id, title: "Other draft" },
    "A calendar change should leave another session's draft unchanged"
  );

  store.dispatch(clearCalendarSelection({ sessionKey }));
  store.dispatch(clearCalendarEventDraft({ sessionKey }));

  Assert.equal(
    selectCalendarSelection(store.getState(), sessionKey),
    null,
    "Clearing a session should remove its calendar selection"
  );
  Assert.deepEqual(
    selectCalendarViewModel(store.getState(), otherSessionKey).calendar,
    first,
    "Clearing a session should preserve another session's calendar selection"
  );
  Assert.deepEqual(
    selectCurrentDraft(store.getState(), otherSessionKey),
    { calendarId: first.id, title: "Other draft" },
    "Clearing a session should preserve another session's draft"
  );
});

add_task(function test_calendarSelectorsTrackRelevantChanges() {
  startSelection(7);
  const control = selectCalendarControlViewModel(store.getState(), sessionKey);
  const options = selectCalendarOptions(store.getState(), sessionKey);

  store.dispatch(
    changeCalendar({ sessionKey, generation: 7, calendarId: second.id })
  );

  const selected = selectCalendarControlViewModel(store.getState(), sessionKey);

  Assert.notStrictEqual(
    selected,
    control,
    "A selection change should update the control value"
  );
  Assert.strictEqual(
    selected.options,
    options,
    "A selection change should keep unchanged options"
  );
  Assert.equal(
    selected.value,
    second.id,
    "The control should select the chosen calendar"
  );
  Assert.equal(
    selectCalendarColorId(store.getState(), sessionKey),
    second.id,
    "The swatch selector should follow the selected calendar ID"
  );

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title: "Edited" } })
  );

  Assert.strictEqual(
    selectCalendarControlViewModel(store.getState(), sessionKey),
    selected,
    "A title change should keep the calendar control result"
  );

  const selection = selectCalendarSelection(store.getState(), sessionKey);

  setSelection({
    ...selection,
    sessionKey,
    calendars: [first, { ...second }],
  });

  Assert.strictEqual(
    selectCalendarControlViewModel(store.getState(), sessionKey),
    selected,
    "Equivalent calendar data should keep the control result"
  );
  Assert.equal(
    selectCalendarColorId(store.getState(), sessionKey),
    second.id,
    "Equivalent calendar data should keep the swatch calendar ID"
  );

  setSelection({
    ...selectCalendarSelection(store.getState(), sessionKey),
    sessionKey,
    canChange: false,
  });

  Assert.strictEqual(
    selectCalendarControlViewModel(store.getState(), sessionKey),
    selected,
    "A permission change should keep unchanged control values"
  );
  Assert.ok(
    selectCalendarDisabled(store.getState(), sessionKey),
    "A denied selection should disable the control"
  );

  setSelection({
    ...selectCalendarSelection(store.getState(), sessionKey),
    sessionKey,
    generation: 8,
  });

  const replacement = selectCalendarControlViewModel(
    store.getState(),
    sessionKey
  );

  Assert.notStrictEqual(
    replacement,
    selected,
    "A new request should update the control result"
  );
  Assert.equal(
    replacement.generation,
    8,
    "The control should identify the replacement request"
  );
  Assert.strictEqual(
    replacement.options,
    options,
    "A new request should reuse unchanged option data"
  );
});

add_task(function test_calendarOptionsIncludeUnavailableSelection() {
  startSelection(9);
  setSelection({
    sessionKey,
    generation: 9,
    canChange: true,
    calendars: [second],
    calendar: first,
  });

  Assert.deepEqual(
    selectCalendarOptions(store.getState(), sessionKey),
    [
      { value: first.id, label: first.name, disabled: true },
      { value: second.id, label: second.name, disabled: false },
    ],
    "The options should display an unavailable selected calendar without offering it"
  );

  store.dispatch(
    changeCalendar({ sessionKey, generation: 9, calendarId: second.id })
  );

  Assert.deepEqual(
    selectCalendarOptions(store.getState(), sessionKey),
    [{ value: second.id, label: second.name, disabled: false }],
    "Choosing an available calendar should remove the unavailable initial option"
  );
});

add_task(function test_controlCachesRemainSeparate() {
  startSelection(10);
  store.dispatch(
    resetForCreate({
      sessionKey: otherSessionKey,
      initialDraft: { calendarId: first.id },
    })
  );
  setSelection({
    sessionKey: otherSessionKey,
    generation: 10,
    canChange: true,
    calendars: [second],
    calendar: first,
  });

  const selectFirstDialog = createCalendarControlSelector();
  const selectSecondDialog = createCalendarControlSelector();
  const firstControl = selectFirstDialog(store.getState(), sessionKey);
  const secondControl = selectSecondDialog(store.getState(), otherSessionKey);

  setSelection({
    sessionKey,
    generation: 10,
    canChange: true,
    calendars: [{ ...first }, second],
    calendar: first,
  });

  const updated = selectFirstDialog(store.getState(), sessionKey);

  Assert.strictEqual(
    updated.options,
    firstControl.options,
    "Equivalent choices should keep options after another dialog is selected"
  );
  Assert.strictEqual(
    updated,
    firstControl,
    "Equivalent choices should keep the first dialog's control result"
  );
  Assert.strictEqual(
    selectSecondDialog(store.getState(), otherSessionKey),
    secondControl,
    "The first dialog's update should keep the other dialog's control result"
  );
});

add_task(function test_currentSelectionChecksState() {
  startSelection(0);
  store.dispatch(changeCalendar({ sessionKey, calendarId: second.id }));

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    second.id,
    "A choice without a request number should update the current draft"
  );

  store.dispatch(changeCalendar({ sessionKey, calendarId: "missing" }));

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    second.id,
    "An unavailable choice should not change the current draft"
  );

  store.dispatch(
    changeCalendar({ sessionKey, generation: 0, calendarId: first.id })
  );

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "A matching request number of zero should permit a change"
  );

  const oldChoice = changeCalendar({
    sessionKey,
    generation: 0,
    calendarId: second.id,
  });

  startSelection(1);
  store.dispatch(oldChoice);

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "An old request number of zero should not change a replacement draft"
  );

  startSelection(2, false);
  store.dispatch(changeCalendar({ sessionKey, calendarId: second.id }));

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "A choice without a request number should still require change permission"
  );

  store.dispatch(clearCalendarSelection({ sessionKey }));
  store.dispatch(changeCalendar({ sessionKey, calendarId: second.id }));

  Assert.equal(
    selectCurrentDraft(store.getState(), sessionKey).calendarId,
    first.id,
    "A choice made before choices load should leave the current draft unchanged"
  );
});

add_task(function test_choicesOutliveTheCurrentRoute() {
  startSelection(30);
  const choices = selectCalendarChoices(store.getState(), sessionKey);

  store.dispatch(clearCalendarSelection({ sessionKey }));

  Assert.strictEqual(
    selectCalendarChoices(store.getState(), sessionKey),
    choices,
    "Clearing a route should keep its dialog's available choices"
  );
  Assert.equal(
    selectCalendarSelection(store.getState(), sessionKey),
    null,
    "Clearing a route should remove its source data"
  );

  store.dispatch(
    setCalendarSelection({
      sessionKey,
      generation: 31,
      calendar: first,
      canChange: true,
    })
  );

  const selection = selectCalendarSelection(store.getState(), sessionKey);

  Assert.strictEqual(
    selection.calendars,
    choices,
    "A new route should reuse the cached choices"
  );
  Assert.strictEqual(
    selectCalendarSelection(store.getState(), sessionKey),
    selection,
    "Reading unchanged source data and choices should reuse the combined result"
  );

  store.dispatch(clearCalendarOptions({ sessionKey }));

  Assert.deepEqual(
    selectCalendarChoices(store.getState(), sessionKey),
    [],
    "Disconnect cleanup should remove the dialog's cached choices"
  );
});

add_task(function test_removedSelectionKeepsItsDisplayData() {
  startSelection(32);
  store.dispatch(changeCalendar({ sessionKey, calendarId: second.id }));
  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title: "Unsaved" } })
  );

  const draft = selectCurrentDraft(store.getState(), sessionKey);
  const dirty = selectDirtySections(store.getState(), sessionKey);
  const source = selectCalendarSelection(store.getState(), sessionKey).calendar;

  // Refresh twice so retained display data must survive later calendar changes.
  for (const calendars of [[first], []]) {
    store.dispatch(
      setCalendarOptions({ sessionKey, calendars, calendarId: second.id })
    );

    Assert.strictEqual(
      selectCurrentDraft(store.getState(), sessionKey),
      draft,
      "Refreshing choices should preserve the unsaved draft"
    );
    Assert.strictEqual(
      selectDirtySections(store.getState(), sessionKey),
      dirty,
      "Refreshing choices should preserve the changed sections"
    );
    Assert.strictEqual(
      selectCalendarSelection(store.getState(), sessionKey).calendar,
      source,
      "Refreshing choices should preserve the route's initial calendar data"
    );
    Assert.equal(
      selectCalendarSelection(store.getState(), sessionKey).generation,
      32,
      "Refreshing choices should preserve the route number"
    );
    Assert.deepEqual(
      selectCalendarOptions(store.getState(), sessionKey)[0],
      { value: second.id, label: second.name, disabled: true },
      "A removed selected calendar should remain visible as a disabled option"
    );
  }

  store.dispatch(clearCalendarSelection({ sessionKey }));
  store.dispatch(
    setCalendarSelection({
      sessionKey,
      generation: 33,
      calendar: first,
      canChange: false,
    })
  );

  Assert.equal(
    selectCalendarViewModel(store.getState(), sessionKey).calendar,
    null,
    "A new route should not reuse display data retained by the old route"
  );

  store.dispatch(
    setCalendarOptions({ sessionKey, calendars: [first, second] })
  );

  Assert.ok(
    selectCalendarDisabled(store.getState(), sessionKey),
    "Refreshing choices should not grant source permission to a new route"
  );
});
