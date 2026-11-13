/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests saving categories without a dialog. Uses the production draft store
 * and a calendar stored in memory. Real Calendar transactions cover create,
 * edit, Undo, and Redo. Some tests pause or fail the write callback to check
 * retries and results that arrive after the draft has been replaced.
 */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalEvent } = ChromeUtils.importESModule(
  "resource:///modules/CalEvent.sys.mjs"
);
const { CalRecurrenceInfo } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceInfo.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { CalTransactionManager, CalAddTransaction, CalModifyTransaction } =
  ChromeUtils.importESModule(
    "resource:///modules/CalTransactionManager.sys.mjs"
  );
const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const { loadCalendarEventSnapshot, selectCalendarEventSourceSession } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/state/calendar-event-source-state.mjs"
  );
const {
  resetForCreate,
  resetFromSource,
  updateSection,
  selectCalendarEventDraftState,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
);
const { startCreateSession, startEditSession } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs"
);
const { calendarEventCategorySaveField, prepareCalendarEventSave } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/calendar-event-save-fields.mjs"
  );
const { saveCalendarEventCreate } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-create-save.mjs"
);
const { saveCalendarEventEdit } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-edit-save.mjs"
);

const sessionKey = "category-save-test";
const manager = CalTransactionManager.getInstance();
const fields = {
  categories: calendarEventCategorySaveField,
  // Create Save needs date objects even though this test has no date controls.
  dateTime: {
    keys: ["start", "end"],
    apply(event, values) {
      for (const [key, property] of [
        ["start", "startDate"],
        ["end", "endDate"],
      ]) {
        const value = values[key];
        const date = cal.createDateTime(value.icalString);
        date.timezone = cal.timezoneService.getTimezone(value.timezoneId);
        date.isDate = value.isDate;
        event[property] = date;
      }
    },
  },
};
let calendar;

add_setup(function () {
  do_get_profile();
  updateAppInfo();
  calendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  registerCleanupFunction(() => cal.manager.unregisterCalendar(calendar));
  cal.manager.registerCalendar(calendar);
});

/**
 * Stores an event with categories in the test's memory calendar.
 *
 * @param {string[]} categories - The category names to store on the event.
 * @param {boolean} [isRecurring=false] - Add two daily occurrences when true.
 * @returns {Promise<calIEvent>} Resolves to the stored event.
 */
async function createEvent(categories, isRecurring = false) {
  const event = new CalEvent();
  event.id = cal.getUUID();
  event.title = "Category event";
  event.startDate = cal.createDateTime("20261021T100000Z");
  event.endDate = cal.createDateTime("20261021T110000Z");
  event.setCategories(categories);

  if (isRecurring) {
    event.recurrenceInfo = new CalRecurrenceInfo(event);
    event.recurrenceInfo.appendRecurrenceItem(
      cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=2")
    );
  }

  return calendar.addItem(event);
}

/**
 * Starts a new draft or loads a saved event into a draft.
 * Reuses `sessionKey` so a test can replace the draft while Save is pending.
 *
 * @param {?calIEvent} event - The saved event or occurrence to edit, or null for
 *   create mode.
 * @returns {Promise<void>} Resolves after the draft and mode are set in the store.
 */
async function start(event) {
  if (!event) {
    store.dispatch(startCreateSession({ sessionKey }));
    store.dispatch(
      resetForCreate({
        sessionKey,
        initialDraft: {
          calendarId: calendar.id,
          categories: [],
          start: {
            icalString: "20261021T100000Z",
            timezoneId: "UTC",
            isDate: false,
          },
          end: {
            icalString: "20261021T110000Z",
            timezoneId: "UTC",
            isDate: false,
          },
        },
      })
    );

    return;
  }

  await store.dispatch(
    loadCalendarEventSnapshot({
      sessionKey,
      identity: {
        calendarId: calendar.id,
        eventId: event.id,
        recurrenceId: event.recurrenceId
          ? String(event.recurrenceId.nativeTime)
          : null,
      },
    })
  );
  const source = selectCalendarEventSourceSession(store.getState(), sessionKey);

  Assert.equal(
    source.status,
    "ready",
    "The edit source should finish loading."
  );

  store.dispatch(startEditSession({ sessionKey }));
  store.dispatch(resetFromSource({ sessionKey, snapshot: source.snapshot }));
}

/**
 * Sets the draft's category names and whether Save includes them.
 * A disabled row keeps its names in the draft.
 *
 * @param {string[]} categories - The selected names, in selection order.
 * @param {boolean} [enabled=true] - Whether Save includes the selected names.
 */
function selectCategories(categories, enabled = true) {
  store.dispatch(
    updateSection({
      sessionKey,
      section: "categories",
      patch: { categories, enabledRows: { categories: enabled } },
    })
  );
}

/**
 * Returns the draft state for this test's session.
 *
 * @returns {?CalendarEventDraftState} The draft state, or null before it exists.
 */
function draftState() {
  return selectCalendarEventDraftState(store.getState(), sessionKey);
}

/**
 * Checks that Save kept the input, starting values, and changed section names.
 * Leaves validation results out: create Save can update them without changing
 * the user's input.
 *
 * @param {CalendarEventDraftState} expected - A copy of the draft before Save.
 */
function assertRetainedDraft(expected) {
  const actual = draftState();

  Assert.deepEqual(
    actual.value,
    expected.value,
    "Save should retain draft values and row state."
  );
  Assert.deepEqual(
    actual.baseline,
    expected.baseline,
    "Save should retain the draft baseline."
  );
  Assert.deepEqual(
    actual.dirtySections,
    expected.dirtySections,
    "Save should retain changed draft sections."
  );
}

/**
 * Saves the draft with a Calendar transaction that supports Undo and Redo
 * without sending invitations. Tests can replace `transact` to pause or fail
 * the write.
 *
 * @param {boolean} editing - True to modify an event, false to create an event.
 * @param {object} [options={}] - Replacements for the default Save arguments.
 * @param {(event: calIEvent) => calIEvent|null} [options.chooseOccurrence]
 *   - In edit mode, selects the occurrence or series to save. Null cancels Save.
 * @param {(event: calIEvent, original?: calIEvent) => Promise<void>}
 *   [options.transact] - The replacement write callback. Edit Save also passes
 *   the original event. Save waits for this callback's promise to settle.
 * @returns {Promise<{status: string, identity?: CalendarEventSourceIdentity}>}
 *   Resolves with the Save result after the write finishes or Save stops early.
 */
function save(editing, options = {}) {
  const common = { store, sessionKey, fields };

  if (editing) {
    return saveCalendarEventEdit({
      ...common,
      chooseOccurrence: event => event,
      transact: (event, original) =>
        manager.commit(
          new CalModifyTransaction(event, event.calendar, original, {
            responseMode: Ci.calIItipItem.NONE,
          })
        ),
      ...options,
    });
  }

  return saveCalendarEventCreate({
    ...common,
    transact: event =>
      manager.commit(
        new CalAddTransaction(event, event.calendar, null, {
          responseMode: Ci.calIItipItem.NONE,
        })
      ),
    ...options,
  });
}

add_task(async function test_saveLatestSelectionAndUndoRedo() {
  for (const isEditMode of [false, true]) {
    for (const isCategoryRowEnabled of [true, false]) {
      // Keep a saved event in create mode too. A new draft must not change
      // categories on an unrelated saved event.
      const originalEvent = await createEvent(["Original"]);
      await start(isEditMode ? originalEvent : null);
      const names = ["Work", "Unknown category", "Comma, category"];
      selectCategories(["Superseded"]);
      selectCategories(names, isCategoryRowEnabled);
      const draftBeforeSave = structuredClone(draftState());
      const eventIdsBeforeSave = new Set(
        (
          await calendar.getItemsAsArray(
            Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
            0,
            null,
            null
          )
        ).map(event => event.id)
      );

      Assert.deepEqual(
        (await calendar.getItem(originalEvent.id)).getCategories(),
        ["Original"],
        "Changing the draft should leave saved categories unchanged."
      );
      Assert.equal(
        (await save(isEditMode)).status,
        "success",
        "Save should succeed."
      );

      const eventsAfterSave = await calendar.getItemsAsArray(
        Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
        0,
        null,
        null
      );
      const savedEvent = isEditMode
        ? await calendar.getItem(originalEvent.id)
        : eventsAfterSave.find(event => !eventIdsBeforeSave.has(event.id));
      const expected = isCategoryRowEnabled ? names : [];

      Assert.ok(savedEvent, "The transaction should store an event.");
      Assert.deepEqual(
        savedEvent.getCategories(),
        expected,
        "Save should use the latest enabled category selection."
      );
      assertRetainedDraft(draftBeforeSave);

      await manager.undo();

      Assert.deepEqual(
        (await calendar.getItem(originalEvent.id)).getCategories(),
        ["Original"],
        "Undo should restore the original saved categories."
      );

      await manager.redo();

      Assert.deepEqual(
        (await calendar.getItem(savedEvent.id)).getCategories(),
        expected,
        "Redo should restore the category Save result."
      );
    }
  }
});

add_task(async function test_emptySelectionClearsCategories() {
  const originalEvent = await createEvent(["Original"]);
  await start(originalEvent);
  selectCategories([]);

  Assert.equal(
    (await save(true)).status,
    "success",
    "An empty selection should save successfully."
  );
  Assert.deepEqual(
    (await calendar.getItem(originalEvent.id)).getCategories(),
    [],
    "Removing the final category should clear saved categories."
  );
});

add_task(async function test_titleEditPreservesNewerCategories() {
  const originalEvent = await createEvent(["Work"]);
  await start(originalEvent);

  // Simulate another editor saving categories while this draft is open.
  const updatedEvent = originalEvent.clone();
  updatedEvent.setCategories(["Personal"]);
  await calendar.modifyItem(updatedEvent, originalEvent);

  const title = "Updated event title";

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title } })
  );

  const result = await save(true);
  const savedEvent = await calendar.getItem(originalEvent.id);

  Assert.equal(result.status, "success", "The title edit should save.");
  Assert.equal(savedEvent.title, title, "Save should update the event title.");
  Assert.deepEqual(
    savedEvent.getCategories(),
    ["Personal"],
    "The title edit should preserve categories saved by the other editor."
  );
});

add_task(async function test_seriesTitleEditPreservesSeriesCategories() {
  const originalSeries = await createEvent(["Work"], true);
  const seriesWithException = originalSeries.clone();
  const occurrenceDate = cal.createDateTime("20261022T100000Z");
  const exception = seriesWithException.recurrenceInfo
    .getOccurrenceFor(occurrenceDate)
    .clone();
  exception.setCategories(["Personal"]);
  seriesWithException.recurrenceInfo.modifyException(exception, true);
  await calendar.modifyItem(seriesWithException, originalSeries);
  await start(exception);

  Assert.deepEqual(
    draftState().value.categories,
    ["Personal"],
    "The draft should start with the exception's categories."
  );

  const title = "Updated series title";

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title } })
  );

  const result = await save(true, {
    chooseOccurrence: event => event.parentItem,
  });

  const savedSeries = await calendar.getItem(originalSeries.id);

  Assert.equal(result.status, "success", "The series title edit should save.");
  Assert.equal(
    savedSeries.title,
    title,
    "Save should update the series title."
  );
  Assert.deepEqual(
    savedSeries.getCategories(),
    ["Work"],
    "The title edit should preserve the series categories."
  );
});

add_task(async function test_disablingCategoriesClearsSelection() {
  const originalEvent = await createEvent(["Work"]);
  await start(originalEvent);
  selectCategories(["Work"], false);

  const result = await save(true);
  const savedEvent = await calendar.getItem(originalEvent.id);

  Assert.equal(result.status, "success", "Disabling categories should save.");
  Assert.deepEqual(
    savedEvent.getCategories(),
    [],
    "Disabling the row should clear saved categories even if the names match."
  );
});

add_task(async function test_preparationCopiesPlainNames() {
  await start(null);
  const names = ["Work", "Unknown category"];
  selectCategories(names);
  // Changing the action's input must not change the array stored in Redux.
  names.push("Outside mutation");
  const draftBeforePreparation = structuredClone(draftState());
  const prepared = prepareCalendarEventSave(draftState().value, fields);

  Assert.deepEqual(
    prepared.categories.values.categories,
    ["Work", "Unknown category"],
    "The draft should copy category names from the action."
  );
  // Field conversion receives another copy, so it cannot change the draft.
  prepared.categories.values.categories.push("Conversion mutation");
  Assert.deepEqual(
    draftState(),
    draftBeforePreparation,
    "Preparation should copy names without changing the draft."
  );
  Assert.deepEqual(
    JSON.parse(JSON.stringify(store.getState())),
    store.getState(),
    "Redux should contain only JSON-compatible data."
  );
  Assert.deepEqual(
    structuredClone(store.getState()),
    store.getState(),
    "Redux should contain no conversion callbacks or live platform objects."
  );
});

add_task(async function test_failedAndDuplicateSaveRetainsSelectionForRetry() {
  for (const editing of [false, true]) {
    const originalEvent = await createEvent(["Original"]);
    await start(editing ? originalEvent : null);
    selectCategories(["Retry selection"]);
    const draftBeforeSave = structuredClone(draftState());
    // Hold the first write open while the test tries to save again.
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    let calls = 0;
    let pending = null;

    registerCleanupFunction(async () => {
      // Release the callback even if an assertion fails while Save is pending.
      finish.resolve();
      await pending;
    });

    pending = save(editing, {
      transact: async event => {
        calls++;
        Assert.deepEqual(
          event.getCategories(),
          ["Retry selection"],
          "The transaction should receive copied categories."
        );
        started.resolve();
        await finish.promise;
        throw new Error("Provider failed");
      },
    });
    await started.promise;

    Assert.equal(
      (await save(editing)).status,
      "unavailable",
      "A pending Save should reject duplicate work."
    );
    Assert.equal(calls, 1, "A duplicate Save should start no transaction.");
    finish.resolve();

    Assert.equal(
      (await pending).status,
      "error",
      "A failed transaction should report an error."
    );
    assertRetainedDraft(draftBeforeSave);
    Assert.deepEqual(
      (await calendar.getItem(originalEvent.id)).getCategories(),
      ["Original"],
      "Failure should preserve saved categories."
    );
    Assert.equal(
      (await save(editing)).status,
      "success",
      "The retained selection should allow retry."
    );
  }
});

add_task(async function test_lateResultsCannotChangeReplacementEvent() {
  for (const isEditMode of [false, true]) {
    for (const fail of [false, true]) {
      const originalEvent = await createEvent(["Original"]);
      const replacementEvent = await createEvent(["Replacement"]);
      await start(isEditMode ? originalEvent : null);
      selectCategories(["First request"]);
      // Pause the first write so the test can load another event before the
      // first request reports success or failure.
      const started = Promise.withResolvers();
      const finish = Promise.withResolvers();
      let pending = null;

      registerCleanupFunction(async () => {
        finish.resolve();
        await pending;
      });

      pending = save(isEditMode, {
        transact: async (event, oldEvent) => {
          started.resolve();
          await finish.promise;

          if (fail) {
            throw new Error("Late failure");
          }

          const transaction = isEditMode
            ? new CalModifyTransaction(event, event.calendar, oldEvent, {
                responseMode: Ci.calIItipItem.NONE,
              })
            : new CalAddTransaction(event, event.calendar, null, {
                responseMode: Ci.calIItipItem.NONE,
              });
          await manager.commit(transaction);
        },
      });
      await started.promise;
      // Reuse the session key but replace its source event and draft.
      await start(replacementEvent);
      selectCategories(["Replacement draft"]);
      const stateBeforeLateResult = structuredClone(store.getState());
      // Let the first write finish after the replacement draft is loaded.
      // Its result must leave the replacement event and draft unchanged.
      finish.resolve();

      Assert.equal(
        (await pending).status,
        "stale",
        "A late result should belong only to its original session."
      );
      Assert.deepEqual(
        store.getState(),
        stateBeforeLateResult,
        "Late success or failure should leave replacement state unchanged."
      );
      Assert.deepEqual(
        (await calendar.getItem(replacementEvent.id)).getCategories(),
        ["Replacement"],
        "Late work should never save categories into another event."
      );
    }
  }
});
