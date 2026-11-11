/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests Save below the dialog controls. Most cases use the real memory provider
 * and CalModifyTransaction. Recovery cases also use the local storage provider.
 * Replaced methods simulate failures or pause writes at specific points.
 * Captured scheduling calls check arguments, not delivery of meeting messages.
 */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { CalTransactionManager, CalModifyTransaction } =
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
const { loadCalendarEventSource } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-source-loader.mjs"
);
const {
  resetFromSource,
  updateSection,
  initializeFields,
  selectCalendarEventDraftState,
  setSectionValidity,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
);
const {
  startEditSession,
  operationStarted,
  selectCalendarEventCreateEditSession,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs"
);
const { saveCalendarEventEdit } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-edit-save.mjs"
);
const { prepareCalendarEventSave } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-save-fields.mjs"
);

const { CalEvent } = ChromeUtils.importESModule(
  "resource:///modules/CalEvent.sys.mjs"
);
const { CalAttendee } = ChromeUtils.importESModule(
  "resource:///modules/CalAttendee.sys.mjs"
);
const { CalRecurrenceInfo } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceInfo.sys.mjs"
);

let calendar;
let destination;
const manager = CalTransactionManager.getInstance();
const sessionKey = "edit-save-test";
const locationField = {
  keys: ["location"],
  apply(event, values) {
    event.setProperty("LOCATION", values.location);
  },
  remove(event) {
    event.deleteProperty("LOCATION");
  },
};

add_setup(function () {
  do_get_profile();
  updateAppInfo();
  calendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  destination = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  cal.manager.registerCalendar(calendar);
  cal.manager.registerCalendar(destination);
  registerCleanupFunction(() => {
    cal.manager.unregisterCalendar(calendar);
    cal.manager.unregisterCalendar(destination);
  });
});

/**
 * Creates and stores an event with known title, dates, and location.
 *
 * @param {boolean} [repeating=false] - Add five daily occurrences when true.
 * @returns {Promise<calIEvent>} The event returned by the memory provider.
 */
async function createEvent(repeating = false) {
  const event = new CalEvent();
  event.id = cal.getUUID();
  event.title = "Original";
  event.startDate = cal.createDateTime("20261009T100000Z");
  event.endDate = cal.createDateTime("20261009T110000Z");
  event.setProperty("LOCATION", "Old room");
  if (repeating) {
    event.recurrenceInfo = new CalRecurrenceInfo(event);
    event.recurrenceInfo.appendRecurrenceItem(
      cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=5")
    );
  }
  return calendar.addItem(event);
}

/**
 * Loads the source and creates the session and draft that an edit dialog uses.
 * No controls are created; tests change the draft through actions below.
 *
 * @param {calIEvent} event - The saved event that supplies calendar and item IDs.
 * @param {string} [key=sessionKey] - The session used to keep drafts separate.
 * @param {?string} [recurrenceId=null] - The requested occurrence's native time.
 * @returns {Promise<void>} Resolves after loading and resetting the draft.
 */
async function startEdit(event, key = sessionKey, recurrenceId = null) {
  await store.dispatch(
    loadCalendarEventSnapshot({
      sessionKey: key,
      identity: {
        calendarId: event.calendar.id,
        eventId: event.id,
        recurrenceId,
      },
    })
  );
  store.dispatch(startEditSession({ sessionKey: key }));
  const source = selectCalendarEventSourceSession(store.getState(), key);

  Assert.equal(
    source.status,
    "ready",
    "The source should finish loading before the draft starts."
  );

  store.dispatch(
    resetFromSource({ sessionKey: key, snapshot: source.snapshot })
  );
}

/**
 * Updates the title section through the same action used by dialog field code.
 *
 * @param {string} title - The entered title.
 * @param {string} [key=sessionKey] - The dialog session to change.
 */
function changeTitle(title, key = sessionKey) {
  store.dispatch(
    updateSection({ sessionKey: key, section: "title", patch: { title } })
  );
}

/**
 * Sets the draft's destination calendar.
 *
 * @param {calICalendar} target - The selected calendar.
 * @param {string} [key=sessionKey] - The dialog session key.
 */
function changeCalendar(target, key = sessionKey) {
  store.dispatch(
    updateSection({
      sessionKey: key,
      section: "calendar",
      patch: { calendarId: target.id },
    })
  );
}

/**
 * Commits an edit to its selected calendar, including notifications and Undo.
 *
 * @param {calIEvent} event - The edited event.
 * @param {calIEvent} oldEvent - The event before this edit.
 * @param {number} [responseMode=Ci.calIItipItem.NONE] - The scheduling response mode.
 * @returns {Promise<void>} Resolves after the transaction finishes.
 */
function commitEdit(event, oldEvent, responseMode = Ci.calIItipItem.NONE) {
  return manager.commit(
    new CalModifyTransaction(event, event.calendar, oldEvent, { responseMode })
  );
}

/**
 * Pauses a transaction until the test releases it. Cleanup also releases and
 * waits for the transaction if an assertion fails while it is paused.
 *
 * @returns {{started: Promise<void>, release: () => void,
 *   transact: (event: calIEvent, oldEvent: calIEvent) => Promise<void>}}
 *   The start signal, release function, and transaction callback for Save.
 */
function pauseTransaction() {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  let pending;
  registerCleanupFunction(async () => {
    finish.resolve();
    await pending;
  });
  return {
    started: started.promise,
    release: finish.resolve,
    transact(event, oldEvent) {
      started.resolve();
      pending = finish.promise.then(() => commitEdit(event, oldEvent));
      return pending;
    },
  };
}

/**
 * Creates a storage destination and captures scheduling calls for failed moves.
 * Restores provider methods and scheduling at task end or during cleanup.
 *
 * @returns {{storage: calICalendar, sourceProvider: CalMemoryCalendar,
 *   targetProvider: CalStorageCalendar,
 *   sourceDelete: CalMemoryCalendar["deleteItem"],
 *   notifications: Parameters<typeof cal.itip.checkAndSend>[], restore: () => void}}
 *   The calendars, saved provider methods, captured calls, and restore function.
 */
function setupMoveRecovery() {
  const storage = cal.manager.createCalendar(
    "storage",
    Services.io.newURI("moz-storage-calendar://")
  );
  registerCleanupFunction(() => cal.manager.unregisterCalendar(storage));
  cal.manager.registerCalendar(storage);
  const sourceProvider = calendar.wrappedJSObject;
  const targetProvider = storage.wrappedJSObject;
  const sourceDelete = sourceProvider.deleteItem;
  const checkAndSend = cal.itip.checkAndSend;
  const restore = () => {
    sourceProvider.deleteItem = sourceDelete;
    cal.itip.checkAndSend = checkAndSend;
  };
  registerCleanupFunction(restore);
  const notifications = [];
  cal.itip.checkAndSend = (...args) => notifications.push(args);
  return {
    storage,
    sourceProvider,
    targetProvider,
    sourceDelete,
    notifications,
    restore,
  };
}

/**
 * Saves the test session through a real modify transaction.
 * Tests can replace callbacks to choose a series, pause a write, or fail Save.
 *
 * @param {object} [options={}] - Overrides for `saveCalendarEventEdit` inputs.
 * @returns {Promise<{status: string, identity?: CalendarEventSourceIdentity}>}
 *   The result after this Save attempt finishes.
 */
function save(options = {}) {
  return saveCalendarEventEdit({
    store,
    sessionKey,
    chooseOccurrence: event => event,
    transact: commitEdit,
    ...options,
  });
}

/**
 * Saves and checks duplicate-ID errors from the destination calendar.
 * Capture provider notifications so xpcshell does not open a calendar error
 * window. Restore normal error reporting after Save.
 *
 * @param {calICalendar} destinationCalendar - The calendar with an existing copy.
 * @returns {Promise<{status: string, identity?: CalendarEventSourceIdentity}>}
 *   The Save result after checking the provider errors.
 */
async function saveWithDuplicateId(destinationCalendar) {
  const provider = destinationCalendar.wrappedJSObject;
  const notifyError = provider.notifyError;
  const errors = [];
  provider.notifyError = (code, message) => {
    destinationCalendar.setProperty("currentStatus", code);
    errors.push({ code, message });
  };
  let result;
  try {
    result = await save();
  } finally {
    provider.notifyError = notifyError;
  }

  Assert.deepEqual(
    errors.map(error => error.code),
    [Ci.calIErrors.DUPLICATE_ID, Ci.calIErrors.MODIFICATION_FAILED],
    "The preserved copy should reject the retry with the expected storage errors."
  );
  Assert.equal(
    errors[0].message,
    "ID already exists for addItem",
    "The destination should report the duplicate item ID."
  );

  return result;
}

add_task(async function test_editAndMoveUndoRedo() {
  const original = await createEvent();
  await startEdit(original);
  changeTitle("Edited");

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "Typing should leave storage unchanged."
  );
  Assert.equal(
    original.title,
    "Original",
    "Typing should leave the original object unchanged."
  );

  const notifications = [];
  const observer = { onModifyItem: item => notifications.push(item.title) };
  calendar.addObserver(observer);
  registerCleanupFunction(() => calendar.removeObserver(observer));

  Assert.equal(
    (await save()).status,
    "success",
    "Saving the title edit should succeed."
  );
  Assert.equal(
    (await save()).status,
    "unavailable",
    "A completed edit should not start another Save before cleanup."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Edited",
    "Save should store the edited title."
  );
  Assert.deepEqual(
    notifications,
    ["Edited"],
    "The Calendar view should receive the provider update."
  );
  Assert.equal(
    selectCalendarEventCreateEditSession(store.getState(), sessionKey).operation
      .status,
    "success",
    "The session should record Save success."
  );
  Assert.deepEqual(
    JSON.parse(JSON.stringify(store.getState())),
    store.getState(),
    "All state should contain only JSON data."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "Undo should restore the original title."
  );

  await manager.redo();
  const edited = await calendar.getItem(original.id);

  Assert.equal(edited.title, "Edited", "Redo should restore the edited title.");

  await startEdit(edited);
  changeCalendar(destination);

  Assert.equal(
    (await calendar.getItem(original.id)).calendar.id,
    calendar.id,
    "Calendar selection should not move storage."
  );
  Assert.equal(
    (await save()).status,
    "success",
    "Saving the calendar move should succeed."
  );
  Assert.equal(
    await calendar.getItem(original.id),
    null,
    "The move should remove the source item."
  );
  Assert.equal(
    (await destination.getItem(original.id)).title,
    "Edited",
    "The destination should contain the edited title."
  );

  await manager.undo();

  Assert.ok(
    await calendar.getItem(original.id),
    "Undo should restore the source item."
  );
  Assert.equal(
    await destination.getItem(original.id),
    null,
    "Undo should remove the destination copy."
  );

  await manager.redo();

  Assert.equal(
    await calendar.getItem(original.id),
    null,
    "Redo should remove the source item again."
  );
  Assert.ok(
    await destination.getItem(original.id),
    "Redo should restore the destination copy."
  );
});

add_task(async function test_invalidActiveFieldsBlockSave() {
  const original = await createEvent();
  await startEdit(original);
  changeTitle("Retained title");
  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "title",
      validity: { valid: false },
    })
  );
  const draft = selectCalendarEventDraftState(store.getState(), sessionKey);
  const operation = selectCalendarEventCreateEditSession(
    store.getState(),
    sessionKey
  ).operation;
  let prompts = 0;
  let transactions = 0;
  const result = await save({
    chooseOccurrence: event => {
      prompts++;
      return event;
    },
    transact: async () => {
      transactions++;
    },
  });

  Assert.equal(
    result.status,
    "unavailable",
    "An invalid title should block Save."
  );
  Assert.equal(
    prompts,
    0,
    "Rejected Save should not prompt for an occurrence."
  );
  Assert.equal(
    transactions,
    0,
    "Rejected Save should not start a transaction."
  );
  Assert.strictEqual(
    selectCalendarEventDraftState(store.getState(), sessionKey),
    draft,
    "Rejected Save should retain the draft and its validation."
  );
  Assert.strictEqual(
    selectCalendarEventCreateEditSession(store.getState(), sessionKey)
      .operation,
    operation,
    "Rejected Save should leave the operation unchanged."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "Rejected Save should leave the stored title unchanged."
  );

  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "title",
      validity: { valid: true },
    })
  );

  Assert.equal(
    (await save()).status,
    "success",
    "A valid title should permit retry."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Retained title",
    "Retry should save the retained title."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "Undo should restore the title before the successful retry."
  );
});

add_task(async function test_disabledInvalidRowsPermitSave() {
  const original = await createEvent();
  await startEdit(original);
  store.dispatch(
    initializeFields({
      sessionKey,
      defaults: { enabledRows: { location: false }, location: "Retained room" },
    })
  );
  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "location",
      validity: { valid: false },
    })
  );
  const fields = { location: locationField };

  Assert.equal(
    (await save({ fields })).status,
    "success",
    "An invalid disabled row should permit Save."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    null,
    "Save should remove the disabled row's stored value."
  );
  Assert.equal(
    selectCalendarEventDraftState(store.getState(), sessionKey).value.location,
    "Retained room",
    "Save should retain the disabled row's draft value."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    "Old room",
    "Undo should restore the removed location."
  );

  await startEdit(await calendar.getItem(original.id));
  store.dispatch(
    initializeFields({
      sessionKey,
      defaults: { enabledRows: { location: false }, location: "Retained room" },
    })
  );
  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "location",
      validity: { valid: false },
    })
  );
  for (const enabled of [true, false, true]) {
    store.dispatch(
      updateSection({
        sessionKey,
        section: "location",
        patch: {
          enabledRows: { location: enabled },
          location: "Retained room",
        },
      })
    );
  }

  Assert.equal(
    (await save({ fields })).status,
    "unavailable",
    "Re-enabling an invalid row should block Save."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    "Old room",
    "Rejected Save should leave the stored location unchanged."
  );

  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "location",
      validity: { valid: true },
    })
  );

  Assert.equal(
    (await save({ fields })).status,
    "success",
    "A valid enabled row should permit retry."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    "Retained room",
    "Retry should save the enabled row's retained value."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    "Old room",
    "Undo should restore the location before retry."
  );
});

add_task(async function test_failedSaveRejectsDuplicateAndRetainsDisabledRow() {
  // Retain input in a disabled row while its stored property is removed.
  const original = await createEvent();
  await startEdit(original);
  store.dispatch(
    initializeFields({
      sessionKey,
      defaults: { enabledRows: { location: true }, location: "New room" },
    })
  );
  store.dispatch(
    updateSection({
      sessionKey,
      section: "location",
      patch: { enabledRows: { location: false }, location: "New room" },
    })
  );
  const retained = JSON.stringify(
    selectCalendarEventDraftState(store.getState(), sessionKey)
  );
  const fields = { location: locationField };

  Assert.deepEqual(
    prepareCalendarEventSave(
      selectCalendarEventDraftState(store.getState(), sessionKey).value,
      fields
    ),
    { location: { enabled: false, values: {} } },
    "Disabled values should be excluded."
  );

  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  let calls = 0;
  const pending = save({
    fields,
    transact: async event => {
      calls++;

      Assert.equal(
        event.getProperty("LOCATION"),
        null,
        "The old property should be removed from the copy."
      );

      started.resolve();
      await finish.promise;
      throw new Error("Provider failed");
    },
  });
  await started.promise;

  Assert.equal(
    selectCalendarEventCreateEditSession(store.getState(), sessionKey).operation
      .status,
    "pending",
    "The session should report that the first Save is pending."
  );
  Assert.equal(
    (await save()).status,
    "unavailable",
    "A duplicate Save should return unavailable."
  );
  Assert.equal(calls, 1, "A duplicate Save should start no transaction.");

  finish.resolve();

  Assert.equal(
    (await pending).status,
    "error",
    "The failed transaction should return an error result."
  );
  Assert.equal(
    JSON.stringify(selectCalendarEventDraftState(store.getState(), sessionKey)),
    retained,
    "Failure and preparation should retain row state and values."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    "Old room",
    "A failed Save should preserve the stored location."
  );
  Assert.equal(
    (await save({ fields })).status,
    "success",
    "Retrying Save with the field helpers should succeed."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).getProperty("LOCATION"),
    null,
    "Save should remove the disabled location from the stored event."
  );
});

add_task(async function test_staleSuccessAndFailureCannotUpdateReplacement() {
  // Complete the first event's Save after another event replaces its session.
  // Both success and failure must leave the replacement draft unchanged.
  for (const fail of [false, true]) {
    const eventA = await createEvent();
    const eventB = await createEvent();
    await startEdit(eventA);
    changeTitle("A draft");
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    const pending = save({
      transact: async () => {
        started.resolve();
        await finish.promise;
        if (fail) {
          throw new Error("A failed");
        }
      },
    });
    await started.promise;
    await startEdit(eventB);
    changeTitle("B draft");
    const replacement = JSON.stringify(store.getState());
    finish.resolve();

    Assert.equal(
      (await pending).status,
      "stale",
      "Completion after source replacement should return stale."
    );
    Assert.equal(
      JSON.stringify(store.getState()),
      replacement,
      "The old result should not change B's state."
    );
  }
});

add_task(async function test_overlappingEditsKeepNewestValues() {
  // Load two drafts before either Save. Hold the first transaction so the
  // second Save must reload its result instead of using the original item.
  const original = await createEvent();
  await startEdit(original, "first-window");
  await startEdit(original, "second-window");
  changeTitle("Older", "first-window");
  changeTitle("Newest", "second-window");
  const transaction = pauseTransaction();
  const first = save({
    sessionKey: "first-window",
    transact: transaction.transact,
  });
  await transaction.started;
  const second = save({ sessionKey: "second-window" });
  transaction.release();

  Assert.equal(
    (await first).status,
    "success",
    "The first queued title edit should succeed."
  );
  Assert.equal(
    (await second).status,
    "success",
    "The second queued title edit should succeed."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Newest",
    "The saved event should contain the newest title."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Older",
    "The newest edit should load the older result for Undo."
  );
});

add_task(async function test_queuedTitleAndOccurrenceEditsKeepMovedCalendar() {
  for (const repeating of [false, true]) {
    const original = await createEvent(repeating);
    const occurrenceId = repeating
      ? cal.createDateTime("20261011T100000Z")
      : null;
    await startEdit(original, "calendar-move");
    await startEdit(
      original,
      "queued-title",
      occurrenceId ? String(occurrenceId.nativeTime) : null
    );
    changeCalendar(destination, "calendar-move");
    changeTitle("Moved", "calendar-move");
    changeTitle("Queued title", "queued-title");

    const transaction = pauseTransaction();
    const pending = [];
    registerCleanupFunction(async () => {
      transaction.release();
      for (const request of pending) {
        await request;
      }
    });
    const moving = save({
      sessionKey: "calendar-move",
      transact: transaction.transact,
    });
    pending.push(moving);

    Assert.equal(
      await Promise.race([
        transaction.started.then(() => "started"),
        moving.then(result => result.status),
      ]),
      "started",
      "The calendar move should reach its transaction."
    );
    Assert.equal(
      selectCalendarEventDraftState(store.getState(), "queued-title").value
        .calendarId,
      calendar.id,
      "The queued draft should retain its original calendar value."
    );

    const queued = save({ sessionKey: "queued-title" });
    pending.push(queued);
    transaction.release();

    Assert.equal(
      (await moving).status,
      "success",
      "The calendar move should succeed."
    );
    Assert.equal(
      (await queued).status,
      "success",
      "The queued title edit should succeed."
    );
    Assert.equal(
      await calendar.getItem(original.id),
      null,
      "The event should stay out of the source calendar."
    );

    const stored = await destination.getItem(original.id);

    Assert.equal(
      stored.title,
      repeating ? "Moved" : "Queued title",
      "The destination event should contain the expected title."
    );

    if (repeating) {
      Assert.equal(
        stored.recurrenceInfo.getOccurrenceFor(occurrenceId).title,
        "Queued title",
        "The queued occurrence should retain its title in the destination calendar."
      );
    }

    await manager.undo();
    const beforeTitleEdit = await destination.getItem(original.id);

    Assert.equal(
      beforeTitleEdit.title,
      "Moved",
      "Undo should restore the title before the queued edit."
    );

    if (repeating) {
      Assert.equal(
        beforeTitleEdit.recurrenceInfo.getOccurrenceFor(occurrenceId).title,
        "Moved",
        "Undo should restore the occurrence title before the queued edit."
      );
    }

    Assert.equal(
      await calendar.getItem(original.id),
      null,
      "Undo of the title edit should keep the event in the destination calendar."
    );

    await manager.undo();

    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "Undo of the move should restore the source event."
    );
    Assert.equal(
      await destination.getItem(original.id),
      null,
      "Undo of the move should remove the destination event."
    );
  }
});

add_task(async function test_overlappingEditsAfterCalendarMove() {
  const original = await createEvent();
  for (const key of ["moving-window", "older-window"]) {
    await startEdit(original, key);
    changeCalendar(destination, key);
  }
  changeTitle("Moved", "moving-window");
  changeTitle("Older", "older-window");
  const moveStarted = Promise.withResolvers();
  const finishMove = Promise.withResolvers();
  const olderStarted = Promise.withResolvers();
  const finishOlder = Promise.withResolvers();
  let olderFinished = false;
  const moving = save({
    sessionKey: "moving-window",
    transact: async (event, oldEvent) => {
      moveStarted.resolve();
      await finishMove.promise;
      await commitEdit(event, oldEvent);
    },
  });
  await moveStarted.promise;
  const older = save({
    sessionKey: "older-window",
    transact: async (event, oldEvent) => {
      olderStarted.resolve();
      await finishOlder.promise;
      await commitEdit(event, oldEvent);
      olderFinished = true;
    },
  });
  finishMove.resolve();

  Assert.equal(
    (await moving).status,
    "success",
    "The first queued calendar move should succeed."
  );

  await olderStarted.promise;
  const moved = await destination.getItem(original.id);

  Assert.equal(
    moved.title,
    "Moved",
    "The destination should contain the title from the move."
  );

  await startEdit(moved, "newest-window");
  changeTitle("Newest", "newest-window");
  let newestStarted = false;
  const newest = save({
    sessionKey: "newest-window",
    transact: async (event, oldEvent) => {
      newestStarted = true;

      Assert.ok(
        olderFinished,
        "The destination edit should wait for the older Save."
      );

      await commitEdit(event, oldEvent);
    },
  });
  try {
    await TestUtils.waitForTick();

    Assert.ok(
      !newestStarted,
      "Both calendar IDs should share the pending queue."
    );
  } finally {
    finishOlder.resolve();

    Assert.equal(
      (await older).status,
      "success",
      "The older queued edit should succeed after the move."
    );
    Assert.equal(
      (await newest).status,
      "success",
      "The newest queued edit should succeed after the older edit."
    );
  }

  Assert.equal(
    (await destination.getItem(original.id)).title,
    "Newest",
    "The destination should contain the newest queued title."
  );
  Assert.equal(
    await calendar.getItem(original.id),
    null,
    "Later queued edits should leave the source calendar empty."
  );

  await manager.undo();

  Assert.equal(
    (await destination.getItem(original.id)).title,
    "Older",
    "Undo should restore the older title at the destination."
  );

  await manager.undo();

  Assert.equal(
    (await destination.getItem(original.id)).title,
    "Moved",
    "A second Undo should restore the title from the move."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "Undoing the move should restore the original source title."
  );
  Assert.equal(
    await destination.getItem(original.id),
    null,
    "Undoing the move should remove the destination copy."
  );
});

add_task(async function test_calendarCopiesKeepTheirOwnLiveEvents() {
  // Independent calendar copies can share an event ID. Serializing their
  // saves must not redirect one copy's edits to the other calendar.
  const original = await createEvent();
  const copy = original.clone();
  copy.calendar = destination;
  const storedCopy = await destination.addItem(copy);
  await startEdit(original, "source-copy-window");
  await startEdit(storedCopy, "destination-copy-window");
  changeTitle("Source copy", "source-copy-window");
  changeTitle("Destination copy", "destination-copy-window");
  const transaction = pauseTransaction();
  const first = save({
    sessionKey: "source-copy-window",
    transact: transaction.transact,
  });
  await transaction.started;
  const second = save({ sessionKey: "destination-copy-window" });
  transaction.release();

  Assert.equal(
    (await first).status,
    "success",
    "Saving the independent source copy should succeed."
  );
  Assert.equal(
    (await second).status,
    "success",
    "Saving the independent destination copy should succeed."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Source copy",
    "The source calendar should retain its own edited copy."
  );
  Assert.equal(
    (await destination.getItem(original.id)).title,
    "Destination copy",
    "The destination calendar should retain its own edited copy."
  );
});

add_task(async function test_occurrenceScopeAndCancel() {
  const parent = await createEvent(true);
  const recurrenceId = String(
    cal.createDateTime("20261011T100000Z").nativeTime
  );
  await startEdit(parent, sessionKey, recurrenceId);

  Assert.equal(
    selectCalendarEventDraftState(store.getState(), sessionKey).value.start
      .icalString,
    "20261011T100000Z",
    "The draft should start with the requested occurrence date."
  );

  changeTitle("Occurrence");

  Assert.equal(
    (await save({ chooseOccurrence: () => null })).status,
    "cancelled",
    "Cancelling the occurrence prompt should return cancelled."
  );
  Assert.equal(
    (await calendar.getItem(parent.id)).title,
    "Original",
    "Prompt cancellation should preserve the saved series title."
  );
  Assert.equal(
    (await save()).status,
    "success",
    "Saving the selected occurrence should succeed."
  );

  let stored = await calendar.getItem(parent.id);

  Assert.equal(
    stored.title,
    "Original",
    "Editing one occurrence should preserve the series title."
  );
  Assert.equal(
    stored.recurrenceInfo.getOccurrenceFor(
      cal.createDateTime("20261011T100000Z")
    ).title,
    "Occurrence",
    "The selected occurrence should contain its edited title."
  );

  await startEdit(stored, sessionKey, recurrenceId);
  changeTitle("Whole series");

  Assert.equal(
    (await save({ chooseOccurrence: event => event.parentItem })).status,
    "success",
    "Saving the whole series from an occurrence should succeed."
  );

  stored = await calendar.getItem(parent.id);

  Assert.equal(
    stored.title,
    "Whole series",
    "The series should contain the edited title."
  );
  Assert.equal(
    stored.startDate.icalString,
    "20261009T100000Z",
    "Unchanged occurrence dates should not overwrite the series dates."
  );
});

add_task(async function test_movedDateAndFloatingExceptionsLoadAndSave() {
  for (const isDate of [true, false]) {
    const original = await createEvent(true);
    const series = original.clone();
    series.startDate = cal.createDateTime(
      isDate ? "20261009" : "20261009T100000"
    );
    series.endDate = cal.createDateTime(
      isDate ? "20261010" : "20261009T110000"
    );
    const recurrenceId = cal.createDateTime(
      isDate ? "20261011" : "20261011T100000"
    );
    const exception = series.recurrenceInfo
      .getOccurrenceFor(recurrenceId)
      .clone();
    exception.title = "Moved exception";
    exception.startDate = cal.createDateTime(
      isDate ? "20261015" : "20261015T100000"
    );
    exception.endDate = cal.createDateTime(
      isDate ? "20261016" : "20261015T110000"
    );
    series.recurrenceInfo.modifyException(exception, true);
    const stored = await calendar.modifyItem(series, original);
    const identity = {
      calendarId: calendar.id,
      eventId: stored.id,
      recurrenceId: String(recurrenceId.nativeTime),
    };

    const { event, snapshot } = await loadCalendarEventSource(identity);

    Assert.equal(
      event.title,
      "Moved exception",
      "The loader should return the moved exception."
    );
    Assert.equal(
      event.recurrenceId.icalString,
      recurrenceId.icalString,
      "The loader should preserve the original recurrence ID form."
    );
    Assert.equal(
      snapshot.event.start.icalString,
      exception.startDate.icalString,
      "The snapshot should contain the moved start date."
    );
    Assert.equal(
      snapshot.event.start.isDate,
      isDate,
      "The snapshot should preserve the source date type."
    );
    Assert.equal(
      snapshot.event.start.timezoneId,
      exception.startDate.timezone.tzid,
      "The snapshot should preserve the floating timezone."
    );

    const nextId = cal.createDateTime(isDate ? "20261012" : "20261012T100000");
    const { event: nextOccurrence } = await loadCalendarEventSource({
      ...identity,
      recurrenceId: String(nextId.nativeTime),
    });

    Assert.equal(
      nextOccurrence.recurrenceId.icalString,
      nextId.icalString,
      "The loader should find the neighboring occurrence."
    );
    Assert.equal(
      nextOccurrence.title,
      "Original",
      "The neighboring occurrence should retain the series title."
    );

    await startEdit(stored, sessionKey, identity.recurrenceId);
    changeTitle("Edited exception");

    Assert.equal(
      (await save()).status,
      "success",
      "Save should update the moved exception."
    );

    const updated = await calendar.getItem(stored.id);

    Assert.equal(
      updated.title,
      "Original",
      "The series title should stay unchanged."
    );

    const savedException = updated.recurrenceInfo.getExceptionFor(recurrenceId);

    Assert.ok(
      savedException,
      "Save should retain the exception under its original recurrence ID."
    );
    Assert.equal(
      savedException.title,
      "Edited exception",
      "Save should store the exception title."
    );
    Assert.equal(
      savedException.startDate.icalString,
      exception.startDate.icalString,
      "Save should preserve the moved start date."
    );
    Assert.equal(
      savedException.startDate.isDate,
      isDate,
      "Save should preserve the exception date type."
    );
    Assert.ok(
      savedException.startDate.timezone.isFloating,
      "Save should preserve the floating timezone."
    );

    await manager.undo();
    const restored = await calendar.getItem(stored.id);
    const restoredException =
      restored.recurrenceInfo.getExceptionFor(recurrenceId);

    Assert.ok(restoredException, "Undo should retain the moved exception.");
    Assert.equal(
      restoredException.title,
      "Moved exception",
      "Undo should restore the previous exception title."
    );
    Assert.equal(
      restoredException.startDate.icalString,
      exception.startDate.icalString,
      "Undo should preserve the moved start date."
    );

    await Assert.rejects(
      loadCalendarEventSource({ ...identity, recurrenceId: "invalid" }),
      /Invalid recurrence ID/,
      "The loader should reject a malformed recurrence ID."
    );

    const missingId = cal.createDateTime(
      isDate ? "20261101" : "20261101T100000"
    );

    await Assert.rejects(
      loadCalendarEventSource({
        ...identity,
        recurrenceId: String(missingId.nativeTime),
      }),
      /No occurrence found/,
      "The loader should reject an ID outside the recurrence set."
    );
  }
});

add_task(async function test_livePermissionsAndUnavailableSource() {
  const original = await createEvent();
  await startEdit(original);
  changeTitle("Forbidden");
  calendar.readOnly = true;

  Assert.equal(
    (await save()).status,
    "error",
    "Save should fail when the source calendar becomes read-only."
  );

  calendar.readOnly = false;

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "A permission failure should preserve the saved title."
  );

  store.dispatch(startEditSession({ sessionKey: "not-loaded" }));

  Assert.equal(
    (await save({ sessionKey: "not-loaded" })).status,
    "unavailable",
    "Save without a loaded source should return unavailable."
  );

  const invited = original.clone();
  const organizer = new CalAttendee();
  organizer.id = "mailto:someone@example.invalid";
  invited.organizer = organizer;
  const attendee = new CalAttendee();
  attendee.id = "mailto:me@example.invalid";
  invited.addAttendee(attendee);
  calendar.setProperty("organizerId", attendee.id);
  await calendar.modifyItem(invited, original);
  await startEdit(invited);
  changeTitle("Guest cannot replace organizer title");

  Assert.equal(
    (await save()).status,
    "error",
    "Save should reject an invitation edit."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "A rejected invitation edit should preserve the saved title."
  );
});

add_task(async function test_dateChangesAndWholeSeriesShift() {
  const original = await createEvent(true);
  const recurrenceId = String(
    cal.createDateTime("20261011T100000Z").nativeTime
  );
  await startEdit(original, sessionKey, recurrenceId);
  const draft = selectCalendarEventDraftState(
    store.getState(),
    sessionKey
  ).value;
  store.dispatch(
    updateSection({
      sessionKey,
      section: "dateTime",
      patch: {
        start: { ...draft.start, icalString: "20261011T120000Z" },
        end: { ...draft.end, icalString: "20261011T130000Z" },
      },
    })
  );

  Assert.equal(
    (await save({ chooseOccurrence: event => event.parentItem })).status,
    "success",
    "Saving a series date change from an occurrence should succeed."
  );

  let stored = await calendar.getItem(original.id);

  Assert.equal(
    stored.startDate.icalString,
    "20261009T120000Z",
    "The series start should move to 12:00 on its original date."
  );
  Assert.equal(
    stored.endDate.icalString,
    "20261009T130000Z",
    "The series end should move to 13:00 on its original date."
  );

  await startEdit(stored);
  store.dispatch(
    updateSection({
      sessionKey,
      section: "dateTime",
      patch: {
        start: {
          ...draft.start,
          icalString: "20261009T090000",
          timezoneId: "America/New_York",
        },
        end: {
          ...draft.end,
          icalString: "20261009T100000",
          timezoneId: "America/New_York",
        },
      },
    })
  );

  Assert.equal(
    (await save()).status,
    "success",
    "Saving the time zone and date changes should succeed."
  );

  stored = await calendar.getItem(original.id);

  Assert.equal(
    stored.startDate.timezone.tzid,
    "America/New_York",
    "Save should retain the America/New_York time zone."
  );
  Assert.equal(
    stored.startDate.hour,
    9,
    "A timezone edit should preserve the entered local hour."
  );
  Assert.equal(
    stored.endDate.hour,
    10,
    "The saved end time should be 10:00 in the selected time zone."
  );
});

add_task(async function test_itemAndMovePermissionsAreCheckedAtSave() {
  const original = await createEvent();
  await startEdit(original);
  changeTitle("Forbidden edit");
  original.wrappedJSObject.mACLEntry = {
    calendarEntry: { hasAccessControl: true, userIsOwner: false },
    userCanModify: false,
  };

  Assert.equal(
    (await save()).status,
    "error",
    "Save should reject an item the user cannot modify."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Original",
    "A rejected item edit should preserve the saved title."
  );

  original.wrappedJSObject.mACLEntry = null;
  await startEdit(original);
  changeCalendar(destination);
  destination.wrappedJSObject.mACLEntry = {
    QueryInterface: ChromeUtils.generateQI(["calICalendarACLEntry"]),
    hasAccessControl: true,
    userIsOwner: false,
    userCanAddItems: false,
  };

  Assert.equal(
    (await save()).status,
    "error",
    "Save should reject a move without destination addition permission."
  );

  destination.wrappedJSObject.mACLEntry = null;

  Assert.ok(
    await calendar.getItem(original.id),
    "A rejected move should preserve the source item."
  );
  Assert.equal(
    await destination.getItem(original.id),
    null,
    "A rejected move should create no destination copy."
  );

  calendar.wrappedJSObject.mACLEntry = {
    QueryInterface: ChromeUtils.generateQI(["calICalendarACLEntry"]),
    hasAccessControl: true,
    userIsOwner: false,
    userCanDeleteItems: false,
  };

  Assert.equal(
    (await save()).status,
    "error",
    "Save should reject a move without source deletion permission."
  );

  calendar.wrappedJSObject.mACLEntry = null;

  Assert.ok(
    await calendar.getItem(original.id),
    "A rejected destination should leave the source item in place."
  );
});

add_task(
  async function test_transactionsKeepNotificationDataAndResultsSerializable() {
    const original = await createEvent();
    await startEdit(original);
    changeTitle("Notify");
    const notifications = [];
    const checkAndSend = cal.itip.checkAndSend;
    cal.itip.checkAndSend = (...args) => notifications.push(args);
    registerCleanupFunction(() => {
      cal.itip.checkAndSend = checkAndSend;
    });
    const actions = [];
    const result = await save({
      store: {
        getState: () => store.getState(),
        dispatch: action => {
          actions.push(action);
          store.dispatch(action);
        },
      },
      transact: (event, oldEvent) =>
        commitEdit(event, oldEvent, Ci.calIItipItem.AUTO),
    });
    cal.itip.checkAndSend = checkAndSend;

    Assert.equal(
      result.status,
      "success",
      "The transaction used to inspect notifications should succeed."
    );
    Assert.equal(
      notifications.length,
      1,
      "The title edit should send one scheduling notification."
    );
    Assert.equal(
      notifications[0][0],
      Ci.calIOperationListener.MODIFY,
      "The scheduling notification should describe a modification."
    );
    Assert.equal(
      notifications[0][1].title,
      "Notify",
      "The notification should contain the edited event title."
    );
    Assert.equal(
      notifications[0][2].title,
      "Original",
      "The notification should contain the original event title."
    );
    Assert.equal(
      notifications[0][3].responseMode,
      Ci.calIItipItem.AUTO,
      "The notification should retain the automatic response mode."
    );
    Assert.deepEqual(
      JSON.parse(JSON.stringify(result)),
      result,
      "The Save result should survive JSON serialization unchanged."
    );

    for (const action of actions) {
      Assert.deepEqual(
        JSON.parse(JSON.stringify(action)),
        action,
        "Save actions should contain data only."
      );
    }
  }
);

add_task(async function test_failedMoveRetainsDestinationAndDraft() {
  const original = await createEvent();
  await startEdit(original);
  changeTitle("Move draft");
  changeCalendar(destination);
  const sourceCalendar = calendar.wrappedJSObject;
  const deleteItem = sourceCalendar.deleteItem;
  const checkAndSend = cal.itip.checkAndSend;
  const notifications = [];
  const undoStack = [...manager.undoStack];
  const redoStack = [...manager.redoStack];
  sourceCalendar.deleteItem = async () => {
    throw new Error("Source deletion failed");
  };
  cal.itip.checkAndSend = (...args) => notifications.push(args);
  try {
    Assert.equal(
      (await save()).status,
      "error",
      "Source deletion failure should make Save return an error."
    );
    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "The failed move should preserve the original source title."
    );

    const retainedCopy = await destination.getItem(original.id);

    Assert.ok(
      retainedCopy,
      "A failed move should retain its destination copy."
    );
    Assert.equal(
      retainedCopy.title,
      "Move draft",
      "The retained destination copy should contain the entered title."
    );
    Assert.deepEqual(
      notifications,
      [],
      "A failed move should send no invitations or cancellations."
    );
    Assert.deepEqual(
      manager.undoStack,
      undoStack,
      "A failed move should leave Undo unchanged."
    );
    Assert.deepEqual(
      manager.redoStack,
      redoStack,
      "A failed move should leave Redo unchanged."
    );
    Assert.equal(
      selectCalendarEventDraftState(store.getState(), sessionKey).value.title,
      "Move draft",
      "The failed move should retain the entered draft title."
    );

    sourceCalendar.deleteItem = deleteItem;

    Assert.equal(
      (await save()).status,
      "success",
      "The retained draft should save when the move is retried."
    );
    Assert.equal(
      await calendar.getItem(original.id),
      null,
      "A successful retry should remove the source item."
    );
    Assert.equal(
      (await destination.getItem(original.id)).title,
      "Move draft",
      "A successful retry should store the draft title at the destination."
    );
    Assert.deepEqual(
      notifications.map(args => args[0]),
      [Ci.calIOperationListener.ADD, Ci.calIOperationListener.DELETE],
      "A completed move should send add and delete scheduling notifications."
    );

    await manager.undo();

    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "Undo should restore the original source title after the retry."
    );
    Assert.equal(
      await destination.getItem(original.id),
      null,
      "Undo should remove the destination copy after the retry."
    );

    await manager.redo();

    Assert.equal(
      (await destination.getItem(original.id)).title,
      "Move draft",
      "Redo should restore the moved draft at the destination."
    );
  } finally {
    sourceCalendar.deleteItem = deleteItem;
    cal.itip.checkAndSend = checkAndSend;
  }
});

add_task(async function test_staleDraftResultsReleaseOnlyTheirOwnRequest() {
  // Replace the baseline or add defaults while Save is pending. Then compare
  // completion with and without a newer operation that owns the same session.
  for (const replace of [false, true]) {
    for (const fail of [false, true]) {
      for (const newRequest of [false, true]) {
        const original = await createEvent();
        await startEdit(original);
        changeTitle("Pending title");
        const started = Promise.withResolvers();
        const finish = Promise.withResolvers();
        const pending = save({
          transact: async (event, oldEvent) => {
            started.resolve();
            await finish.promise;
            if (fail) {
              throw new Error("Save failed");
            }
            await commitEdit(event, oldEvent);
          },
        });
        await started.promise;
        if (replace) {
          const source = selectCalendarEventSourceSession(
            store.getState(),
            sessionKey
          );
          store.dispatch(
            resetFromSource({ sessionKey, snapshot: source.snapshot })
          );
          changeTitle("Replacement title");
        } else {
          store.dispatch(
            initializeFields({
              sessionKey,
              defaults: {
                enabledRows: { location: false },
                reminder: "retained default",
              },
            })
          );
        }
        const replacement = selectCalendarEventDraftState(
          store.getState(),
          sessionKey
        );
        if (newRequest) {
          store.dispatch(startEditSession({ sessionKey }));
          store.dispatch(
            operationStarted({
              sessionKey,
              kind: "save",
              requestId: "replacement-request",
            })
          );
        }
        const operation = selectCalendarEventCreateEditSession(
          store.getState(),
          sessionKey
        ).operation;
        finish.resolve();

        Assert.equal(
          (await pending).status,
          "stale",
          "Completion after draft replacement should return stale."
        );
        Assert.equal(
          selectCalendarEventDraftState(store.getState(), sessionKey),
          replacement,
          "Stale results should keep the current draft and defaults."
        );

        const currentOperation = selectCalendarEventCreateEditSession(
          store.getState(),
          sessionKey
        ).operation;
        if (newRequest) {
          Assert.equal(
            currentOperation,
            operation,
            "A stale result should not release another request."
          );
        } else {
          Assert.equal(
            currentOperation.status,
            "idle",
            "A stale result should release its own pending operation."
          );
          Assert.equal(
            (await save()).status,
            "success",
            "The current draft should permit Save again."
          );
        }
      }
    }
  }
});

add_task(async function test_queuedOccurrencesFollowWholeSeriesShifts() {
  for (const move of [false, true]) {
    const original = await createEvent(true);
    const recurrenceId = String(
      cal.createDateTime("20261011T100000Z").nativeTime
    );
    const nextRecurrenceId = String(
      cal.createDateTime("20261012T100000Z").nativeTime
    );
    // Only the parent can move to another calendar. Queue occurrence edits
    // after the series edit so they must follow its changed dates and calendar.
    await startEdit(original, "series-shift", move ? null : recurrenceId);
    await startEdit(original, "same-occurrence", recurrenceId);
    await startEdit(original, "next-occurrence", nextRecurrenceId);
    const draft = selectCalendarEventDraftState(
      store.getState(),
      "series-shift"
    ).value;
    store.dispatch(
      updateSection({
        sessionKey: "series-shift",
        section: "dateTime",
        patch: {
          start: {
            ...draft.start,
            icalString: move ? "20261009T120000Z" : "20261011T120000Z",
          },
          end: {
            ...draft.end,
            icalString: move ? "20261009T130000Z" : "20261011T130000Z",
          },
        },
      })
    );
    if (move) {
      for (const key of [
        "series-shift",
        "same-occurrence",
        "next-occurrence",
      ]) {
        changeCalendar(destination, key);
      }
    }
    changeTitle("Newest series title", "same-occurrence");
    changeTitle("Newest occurrence title", "next-occurrence");
    const transaction = pauseTransaction();
    const first = save({
      sessionKey: "series-shift",
      chooseOccurrence: event => event.parentItem,
      transact: transaction.transact,
    });
    await Promise.race([
      transaction.started,
      first.then(result => {
        throw new Error(
          `Series Save ended before its transaction: ${result.status}`
        );
      }),
    ]);
    const second = save({
      sessionKey: "same-occurrence",
      chooseOccurrence: event => event.parentItem,
    });
    const third = save({ sessionKey: "next-occurrence" });
    transaction.release();

    Assert.equal(
      (await first).status,
      "success",
      "The queued series date change should succeed."
    );
    Assert.equal(
      (await second).status,
      "success",
      "The same queued occurrence should follow the series shift."
    );
    Assert.equal(
      (await third).status,
      "success",
      "Other queued occurrences should follow the series shift."
    );

    const stored = await (move ? destination : calendar).getItem(original.id);

    Assert.equal(
      stored.title,
      "Newest series title",
      "The series should retain the newest series title."
    );
    Assert.equal(
      stored.startDate.icalString,
      "20261009T120000Z",
      "The series should retain its shifted start time."
    );

    const occurrence = stored.recurrenceInfo.getOccurrenceFor(
      cal.createDateTime("20261012T120000Z")
    );

    Assert.equal(
      occurrence.title,
      "Newest occurrence title",
      "The shifted occurrence should contain its newest queued title."
    );
    Assert.equal(
      occurrence.startDate.icalString,
      "20261012T120000Z",
      "Unchanged draft dates should not undo the series shift."
    );

    await manager.undo();

    Assert.equal(
      (await (move ? destination : calendar).getItem(original.id)).title,
      "Newest series title",
      "Undoing occurrence edits should preserve the newest series title."
    );

    await manager.undo();

    Assert.equal(
      (await (move ? destination : calendar).getItem(original.id)).title,
      "Original",
      "Undoing the series title edit should restore the original title."
    );

    await manager.undo();

    Assert.equal(
      (await calendar.getItem(original.id)).startDate.icalString,
      "20261009T100000Z",
      "Undoing the date change should restore the original series start."
    );
  }
});

add_task(
  async function test_queuedSeriesEditsKeepLocalTimeAcrossDaylightSaving() {
    for (const kind of ["rule", "exception", "date"]) {
      const original = (await createEvent(true)).clone();
      const timezone = cal.timezoneService.getTimezone("America/New_York");
      const start = cal.createDateTime("20261030T090000");
      start.timezone = timezone;
      const end = cal.createDateTime("20261030T100000");
      end.timezone = timezone;
      original.startDate = start;
      original.endDate = end;
      const occurrenceId = cal.createDateTime(
        kind == "date" ? "20261104T090000" : "20261102T090000"
      );
      occurrenceId.timezone = timezone;
      if (kind == "exception") {
        const exception = original.recurrenceInfo
          .getOccurrenceFor(occurrenceId)
          .clone();
        exception.title = "Exception";
        original.recurrenceInfo.modifyException(exception, true);
      } else if (kind == "date") {
        const date = cal.createRecurrenceDate();
        date.date = occurrenceId;
        original.recurrenceInfo.appendRecurrenceItem(date);
      }
      const stored = await calendar.modifyItem(
        original,
        await calendar.getItem(original.id)
      );
      const recurrenceId = String(occurrenceId.nativeTime);
      await startEdit(stored, "dst-series", recurrenceId);
      await startEdit(stored, "dst-newest", recurrenceId);
      const draft = selectCalendarEventDraftState(
        store.getState(),
        "dst-series"
      ).value;

      Assert.equal(
        stored.startDate.timezone.tzid,
        "America/New_York",
        "The series should use its local timezone."
      );

      store.dispatch(
        updateSection({
          sessionKey: "dst-series",
          section: "dateTime",
          patch: {
            start: {
              ...draft.start,
              icalString:
                kind == "date" ? "20261111T090000" : "20261109T090000",
              timezoneId: "America/New_York",
            },
            end: {
              ...draft.end,
              icalString:
                kind == "date" ? "20261111T100000" : "20261109T100000",
              timezoneId: "America/New_York",
            },
          },
        })
      );
      changeTitle("Newest after daylight saving", "dst-newest");
      const transaction = pauseTransaction();
      const first = save({
        sessionKey: "dst-series",
        chooseOccurrence: event => event.parentItem,
        transact: transaction.transact,
      });
      await transaction.started;
      const second = save({
        sessionKey: "dst-newest",
        chooseOccurrence: event => event.parentItem,
      });
      transaction.release();

      Assert.equal(
        (await first).status,
        "success",
        "The series date change across daylight saving should succeed."
      );

      const result = await second;

      Assert.equal(
        result.status,
        "success",
        `Queued ${kind} routes should follow the stored series across daylight-saving changes.`
      );

      const shiftedId = cal.createDateTime(
        {
          rule: "20261109T090000",
          exception: "20261109T100000",
          date: "20261111T100000",
        }[kind]
      );
      shiftedId.timezone = timezone;

      Assert.equal(
        result.identity.recurrenceId,
        String(shiftedId.nativeTime),
        "The queued edit should return the shifted occurrence ID."
      );

      const saved = await calendar.getItem(original.id);

      Assert.equal(
        saved.title,
        "Newest after daylight saving",
        "The saved series should contain the newest queued title."
      );
      Assert.equal(
        saved.startDate.icalString,
        "20261106T090000",
        "The saved series should start at 09:00 on November 6."
      );
    }
  }
);

add_task(async function test_queuedWeeklyOccurrenceFollowsUpdatedRule() {
  const original = (await createEvent()).clone();
  original.startDate = cal.createDateTime("20261012T100000Z");
  original.endDate = cal.createDateTime("20261012T110000Z");
  original.recurrenceInfo = new CalRecurrenceInfo(original);
  original.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5")
  );
  const stored = await calendar.modifyItem(
    original,
    await calendar.getItem(original.id)
  );
  const occurrenceId = cal.createDateTime("20261019T100000Z");
  await startEdit(stored, "weekly-series");
  await startEdit(stored, "weekly-occurrence", String(occurrenceId.nativeTime));
  const draft = selectCalendarEventDraftState(
    store.getState(),
    "weekly-series"
  ).value;
  store.dispatch(
    updateSection({
      sessionKey: "weekly-series",
      section: "dateTime",
      patch: {
        start: { ...draft.start, icalString: "20261013T100000Z" },
        end: { ...draft.end, icalString: "20261013T110000Z" },
      },
    })
  );
  changeTitle("Newest weekly occurrence", "weekly-occurrence");
  const transaction = pauseTransaction();
  const first = save({
    sessionKey: "weekly-series",
    transact: transaction.transact,
  });
  await transaction.started;
  const second = save({ sessionKey: "weekly-occurrence" });
  transaction.release();

  Assert.equal(
    (await first).status,
    "success",
    "The weekly series date change should succeed."
  );

  const result = await second;

  Assert.equal(
    result.status,
    "success",
    "The queued weekly edit should succeed."
  );
  Assert.equal(
    result.identity.recurrenceId,
    String(occurrenceId.nativeTime),
    "The Monday occurrence should remain Monday after the series starts on Tuesday."
  );

  const saved = await calendar.getItem(original.id);

  Assert.equal(
    saved.startDate.icalString,
    "20261013T100000Z",
    "The weekly series should retain the new Tuesday start."
  );
  Assert.equal(
    saved.recurrenceInfo.getExceptionFor(occurrenceId).title,
    "Newest weekly occurrence",
    "The corresponding Monday occurrence should contain the queued title."
  );
  Assert.equal(
    saved.recurrenceInfo.getNextOccurrence(occurrenceId).recurrenceId
      .icalString,
    "20261026T100000Z",
    "Other Mondays should retain the recurrence rule."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).recurrenceInfo.getOccurrenceFor(
      occurrenceId
    ).title,
    "Original",
    "Undo should restore the occurrence's original values."
  );

  await manager.undo();

  Assert.equal(
    (await calendar.getItem(original.id)).startDate.icalString,
    "20261012T100000Z",
    "Undo should restore the original Monday series start."
  );
});

add_task(async function test_failedMoveRetainsStorageUntilExplicitRemoval() {
  // Storage rejects a duplicate ID until the retained copy is removed.
  // Saving back to the source must leave that copy unchanged.
  const { storage, sourceProvider, sourceDelete, notifications, restore } =
    setupMoveRecovery();
  for (const retry of ["move", "source", "changed-copy", "revised-copy"]) {
    const original = await createEvent(retry == "move");
    await startEdit(original);
    changeTitle("Move draft");
    changeCalendar(storage);
    const independent = original.clone();
    independent.calendar = destination;
    independent.title = "Independent calendar copy";
    await destination.addItem(independent);
    const undoStack = [...manager.undoStack];
    const redoStack = [...manager.redoStack];
    notifications.length = 0;
    sourceProvider.deleteItem = async () => {
      throw new Error("Source deletion failed");
    };

    Assert.equal(
      (await save()).status,
      "error",
      "A move with failed source deletion should return an error."
    );
    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "The failed move should preserve the original source title."
    );
    Assert.equal(
      (await storage.getItem(original.id)).title,
      "Move draft",
      "Failed source deletion should leave the destination copy intact."
    );
    Assert.deepEqual(
      notifications,
      [],
      "The failed move should send no scheduling notifications."
    );
    Assert.deepEqual(
      manager.undoStack,
      undoStack,
      "The failed move should preserve Undo history."
    );
    Assert.deepEqual(
      manager.redoStack,
      redoStack,
      "The failed move should preserve Redo history."
    );

    sourceProvider.deleteItem = sourceDelete;

    if (retry == "move") {
      const retried = await saveWithDuplicateId(storage);

      Assert.equal(
        retried.status,
        "error",
        "Retry should reject the retained destination's duplicate ID."
      );
      Assert.equal(
        (await calendar.getItem(original.id)).title,
        "Original",
        "An unsuccessful retry should preserve the source title."
      );
      Assert.equal(
        (await storage.getItem(original.id)).title,
        "Move draft",
        "An unsuccessful retry should retain the destination copy."
      );
      Assert.deepEqual(
        notifications,
        [],
        "An unsuccessful retry should send no scheduling notifications."
      );
      Assert.deepEqual(
        manager.undoStack,
        undoStack,
        "An unsuccessful retry should preserve Undo history."
      );
    }

    if (retry == "changed-copy" || retry == "revised-copy") {
      const oldCopy = await storage.getItem(original.id);
      const changed = oldCopy.clone();
      if (retry == "changed-copy") {
        changed.title = "Another editor's copy";
      }
      await storage.modifyItem(changed, oldCopy);

      Assert.equal(
        (await saveWithDuplicateId(storage)).status,
        "error",
        "Retrying a move onto a changed copy should report a duplicate ID."
      );
      Assert.equal(
        (await storage.getItem(original.id)).title,
        changed.title,
        "Retry should preserve a copy with changed content or revision."
      );
      Assert.equal(
        (await calendar.getItem(original.id)).title,
        "Original",
        "The rejected retry should preserve the original source title."
      );
      Assert.deepEqual(
        notifications,
        [],
        "The rejected retry should send no scheduling notifications."
      );
      Assert.deepEqual(
        manager.undoStack,
        undoStack,
        "The rejected retry should preserve Undo history."
      );
    }

    if (retry == "source") {
      changeCalendar(calendar);
    } else {
      // Simulate explicitly removing the duplicate before retrying the move.
      const retainedCopy = await storage.getItem(original.id);
      await storage.deleteItem(retainedCopy);
    }

    changeTitle("Recovered draft");

    Assert.equal(
      (await save()).status,
      "success",
      `Retry ${retry} should succeed.`
    );
    Assert.equal(
      (await destination.getItem(original.id)).title,
      "Independent calendar copy",
      "Recovery should leave unrelated calendar copies unchanged."
    );

    if (retry == "source") {
      const retainedCopy = await storage.getItem(original.id);

      Assert.ok(
        retainedCopy,
        "Saving to the source should retain the destination copy."
      );
      Assert.equal(
        retainedCopy.title,
        "Move draft",
        "Saving to the source should preserve the retained destination copy."
      );
      Assert.equal(
        (await calendar.getItem(original.id)).title,
        "Recovered draft",
        "The source calendar should contain the recovered draft title."
      );
      Assert.deepEqual(
        notifications.map(args => args[0]),
        [Ci.calIOperationListener.MODIFY],
        "A recovered source edit should send only a modify notification."
      );
    } else {
      Assert.equal(
        await calendar.getItem(original.id),
        null,
        "A recovered move should remove the source item."
      );
      Assert.equal(
        (await storage.getItem(original.id)).title,
        "Recovered draft",
        "The storage calendar should contain the recovered draft title."
      );
      Assert.deepEqual(
        notifications.map(args => args[0]),
        [Ci.calIOperationListener.ADD, Ci.calIOperationListener.DELETE],
        "A recovered move should send add and delete notifications."
      );
    }
    await manager.undo();

    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "Undo should restore the original source title after recovery."
    );

    const destinationAfterUndo = await storage.getItem(original.id);

    if (retry == "source") {
      Assert.ok(
        destinationAfterUndo,
        "Undo of the source edit should preserve the retained destination."
      );
      Assert.equal(
        destinationAfterUndo.title,
        "Move draft",
        "Undo of the source edit should preserve the destination title."
      );
    } else {
      Assert.equal(
        destinationAfterUndo,
        null,
        "Undo of the retried move should remove its destination copy."
      );
    }

    await manager.redo();

    Assert.equal(
      (await (retry == "source" ? calendar : storage).getItem(original.id))
        .title,
      "Recovered draft",
      "Redo should restore the recovered draft in the selected calendar."
    );

    if (retry == "source") {
      const retainedCopy = await storage.getItem(original.id);

      Assert.ok(retainedCopy, "Redo should preserve the retained destination.");
      Assert.equal(
        retainedCopy.title,
        "Move draft",
        "Redo of the source edit should preserve the destination title."
      );
    }
  }
  restore();
});

add_task(async function test_failedMoveRetainsDestinationAfterLostResponse() {
  const {
    storage,
    sourceProvider,
    targetProvider,
    sourceDelete,
    notifications,
    restore,
  } = setupMoveRecovery();
  const deletions = [];
  const observer = { onDeleteItem: item => deletions.push(item.id) };

  registerCleanupFunction(() => storage.removeObserver(observer));
  storage.addObserver(observer);

  const original = await createEvent(true);
  await startEdit(original);
  changeTitle("Move draft");
  changeCalendar(storage);

  const undoStack = [...manager.undoStack];
  const redoStack = [...manager.redoStack];

  // Delete the source before rejecting to simulate a lost server response.
  // The destination is then the only stored copy.
  sourceProvider.deleteItem = async function (item) {
    await sourceDelete.call(this, item);

    throw new Error("Source deletion response lost");
  };

  const result = await save();
  sourceProvider.deleteItem = sourceDelete;

  Assert.equal(
    result.status,
    "error",
    "Save should report an error when the deletion response is lost."
  );

  const remainingSource = await calendar.getItem(original.id);
  const cached = await storage.getItem(original.id);

  Assert.equal(
    remainingSource,
    null,
    "The source should be deleted before the response fails."
  );
  Assert.ok(cached, "The destination should retain the only stored copy.");
  Assert.equal(
    cached.title,
    "Move draft",
    "The retained destination should contain the entered title."
  );
  Assert.ok(
    cached.recurrenceInfo,
    "The retained destination should contain the recurring series."
  );
  Assert.deepEqual(
    deletions,
    [],
    "The failed move should send no destination deletion notification."
  );
  Assert.deepEqual(
    notifications,
    [],
    "The unconfirmed move should send no scheduling messages."
  );
  Assert.deepEqual(
    manager.undoStack,
    undoStack,
    "The failed move should preserve Undo history."
  );
  Assert.deepEqual(
    manager.redoStack,
    redoStack,
    "The failed move should preserve Redo history."
  );

  // Bypass the item cache to check the stored series as well as the cache.
  targetProvider.mItemModel.itemCache.delete(original.id);
  const stored = await storage.getItem(original.id);

  Assert.ok(stored, "The destination copy should remain in storage.");
  Assert.ok(
    cal.item.compareContent(stored, cached, [], {}),
    "Storage should retain the complete destination copy."
  );
  Assert.equal(
    selectCalendarEventDraftState(store.getState(), sessionKey).value.title,
    "Move draft",
    "The failed move should retain the entered draft title."
  );

  const retried = await save();
  const retained = await storage.getItem(original.id);

  Assert.equal(
    retried.status,
    "error",
    "Retry should report that the original source is no longer available."
  );
  Assert.ok(retained, "Retry should preserve the only stored copy.");
  Assert.ok(
    cal.item.compareContent(retained, stored, [], {}),
    "Retry should preserve the destination content."
  );
  Assert.deepEqual(
    deletions,
    [],
    "Retry should send no destination deletion notification."
  );
  Assert.deepEqual(
    notifications,
    [],
    "Retry without a source should send no scheduling messages."
  );
  Assert.deepEqual(
    manager.undoStack,
    undoStack,
    "Retry without a source should preserve Undo history."
  );
  Assert.deepEqual(
    manager.redoStack,
    redoStack,
    "Retry without a source should preserve Redo history."
  );

  restore();
});

add_task(async function test_failedMovePreservesPendingDestinationEdits() {
  // Save another destination revision while source deletion is pending.
  // Failed moves and later retries must preserve that revision through Undo/Redo.
  const { storage, sourceProvider, sourceDelete, notifications, restore } =
    setupMoveRecovery();
  for (const change of ["content", "revision"]) {
    const original = await createEvent();
    await startEdit(original);
    changeTitle("Move draft");
    changeCalendar(storage);
    const undoStack = [...manager.undoStack];
    const redoStack = [...manager.redoStack];
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    const sourceError = new Error("Source deletion failed");
    sourceProvider.deleteItem = async () => {
      started.resolve();
      await finish.promise;
      throw sourceError;
    };
    notifications.length = 0;
    registerCleanupFunction(async () => {
      finish.resolve();
      await pending;
      sourceProvider.deleteItem = sourceDelete;
    });
    const pending = save();
    await started.promise;
    const copy = await storage.getItem(original.id);
    const changed = copy.clone();
    if (change == "content") {
      changed.title = "Another editor's title";
    }
    const updated = await storage.modifyItem(changed, copy);

    Assert.greater(
      updated.generation,
      copy.generation,
      "The other edit should advance the destination revision."
    );

    finish.resolve();

    Assert.equal(
      (await pending).status,
      "error",
      "The move should report the source deletion failure."
    );

    let stored = await storage.getItem(original.id);

    Assert.ok(
      stored,
      "The failed move should preserve the destination edited while pending."
    );
    Assert.ok(
      cal.item.compareContent(stored, updated, [], {}),
      "The failed move should preserve all content and revision properties."
    );

    // Reload from storage so the cache cannot hide a lost destination edit.
    storage.wrappedJSObject.mItemModel.itemCache.delete(original.id);
    stored = await storage.getItem(original.id);

    Assert.ok(
      stored,
      "The independently edited copy should remain in storage."
    );
    Assert.ok(
      cal.item.compareContent(stored, updated, [], {}),
      "Storage should retain the independent edit's content and revision."
    );
    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "The failed move should preserve the original source title."
    );
    Assert.deepEqual(
      notifications,
      [],
      "The failed move should send no scheduling notifications."
    );
    Assert.deepEqual(
      manager.undoStack,
      undoStack,
      "The failed move should preserve Undo history."
    );
    Assert.deepEqual(
      manager.redoStack,
      redoStack,
      "The failed move should preserve Redo history."
    );
    Assert.equal(
      selectCalendarEventDraftState(store.getState(), sessionKey).value.title,
      "Move draft",
      "The failed move should retain the draft title."
    );

    sourceProvider.deleteItem = sourceDelete;

    Assert.equal(
      (await saveWithDuplicateId(storage)).status,
      "error",
      "Retry should not overwrite another editor's destination copy."
    );

    stored = await storage.getItem(original.id);

    Assert.ok(
      cal.item.compareContent(stored, updated, [], {}),
      "The rejected retry should preserve the edited destination content."
    );
    Assert.deepEqual(
      notifications,
      [],
      "The rejected retry should send no scheduling notifications."
    );
    Assert.deepEqual(
      manager.undoStack,
      undoStack,
      "The rejected retry should preserve Undo history."
    );

    changeCalendar(calendar);

    Assert.equal(
      (await save()).status,
      "success",
      "Saving the retained draft to the source calendar should succeed."
    );
    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Move draft",
      "The source calendar should contain the retained draft title."
    );
    Assert.ok(
      cal.item.compareContent(
        await storage.getItem(original.id),
        updated,
        [],
        {}
      ),
      "Changing the retained draft's calendar should preserve the other edit."
    );
    Assert.deepEqual(
      notifications.map(args => args[0]),
      [Ci.calIOperationListener.MODIFY],
      "Saving to the source should send only a modify notification."
    );

    await manager.undo();

    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Original",
      "Undo should restore the original source title."
    );
    Assert.ok(
      cal.item.compareContent(
        await storage.getItem(original.id),
        updated,
        [],
        {}
      ),
      "Undo should preserve the independently edited destination copy."
    );

    await manager.redo();

    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Move draft",
      "Redo should restore the retained draft title in the source calendar."
    );
    Assert.ok(
      cal.item.compareContent(
        await storage.getItem(original.id),
        updated,
        [],
        {}
      ),
      "Redo should preserve the independently edited destination copy."
    );
  }
  restore();
});
