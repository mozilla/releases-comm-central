/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests create Save without opening a dialog. Uses the production Redux store
 * and calendars that keep events in memory. The field helpers below supply
 * input checks and convert plain draft values to Calendar event properties.
 * Unless a test replaces `transact`, Save uses a real Calendar add transaction
 * with Undo and Redo. Browser tests check controls, keyboard input, and focus.
 */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);

const { CalTransactionManager, CalAddTransaction } = ChromeUtils.importESModule(
  "resource:///modules/CalTransactionManager.sys.mjs"
);

const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);

const {
  resetForCreate,
  resetFromSource,
  updateSection,
  initializeFields,
  setSectionValidity,
  selectCalendarEventDraftState,
  clearCalendarEventDraft,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
);

const {
  startCreateSession,
  startEditSession,
  selectCalendarEventCreateEditSession,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs"
);

const { selectCanSave } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs"
);

const { saveCalendarEventCreate } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-create-save.mjs"
);

const { prepareCalendarEventSave } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-save-fields.mjs"
);

let calendar;
let otherCalendar;
const sessionKey = "create-save-test";
const manager = CalTransactionManager.getInstance();

const fields = {
  title: {
    keys: ["title"],
    validate: values => ({
      valid: !!values.title,
      messageId: "test-title-required",
    }),
    apply: (event, values) => {
      event.title = values.title;
    },
  },
  dateTime: {
    keys: ["start", "end"],
    validate: values => ({
      valid:
        !!values.start &&
        !!values.end &&
        values.start.icalString < values.end.icalString,
      messageId: "test-date-invalid",
    }),
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
  location: {
    keys: ["location"],
    validate: values => ({ valid: !!values.location }),
    apply: (event, values) => event.setProperty("LOCATION", values.location),
    remove: event => event.deleteProperty("LOCATION"),
  },
};

add_setup(function () {
  do_get_profile();
  updateAppInfo();

  calendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );

  otherCalendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );

  cal.manager.registerCalendar(calendar);
  cal.manager.registerCalendar(otherCalendar);

  registerCleanupFunction(() => {
    cal.manager.unregisterCalendar(calendar);
    cal.manager.unregisterCalendar(otherCalendar);
  });
});

/**
 * Returns the current draft state for this test session.
 *
 * @returns {?CalendarEventDraftState} The draft state, or null if absent.
 */
function getDraftState() {
  return selectCalendarEventDraftState(store.getState(), sessionKey);
}

/**
 * Returns the current create/edit session for this test session.
 *
 * @returns {?CalendarEventCreateEditSession} The session, or null if absent.
 */
function getSessionState() {
  return selectCalendarEventCreateEditSession(store.getState(), sessionKey);
}

/**
 * Starts a create session with a separate copy of the test field values.
 * Resets Save progress, changed sections, and stored validation results.
 *
 * @param {CalendarEventDraft} [patch={}] - Values that replace the test defaults.
 */
function startCreate(patch = {}) {
  store.dispatch(startCreateSession({ sessionKey }));

  store.dispatch(
    resetForCreate({
      sessionKey,
      initialDraft: {
        calendarId: calendar.id,
        title: "Created event",
        start: {
          icalString: "20261010T100000Z",
          timezoneId: "UTC",
          isDate: false,
        },
        end: {
          icalString: "20261010T110000Z",
          timezoneId: "UTC",
          isDate: false,
        },
        enabledRows: { location: true },
        location: "Room",
        ...patch,
      },
    })
  );
}

/**
 * Saves the test draft through a Calendar add transaction without invitations.
 * A test can replace the write function to pause Save, count writes, or fail.
 *
 * @param {object} [options={}] - Replacements for the default Save arguments.
 * @param {object} [options.store] - A store wrapper for observing state updates.
 * @param {string} [options.sessionKey] - The dialog key to save.
 * @param {Record<string, CalendarEventSaveField>} [options.fields]
 *   - Field helpers to use instead of the test helpers above.
 * @param {(event: calIEvent) => (Promise<void>|void)} [options.transact]
 *   - The replacement write function. Save waits for a returned promise.
 * @returns {Promise<{status: string}>} Resolves with the Save result after the
 *   supplied write finishes, or after validation or a replacement stops Save.
 */
function save(options = {}) {
  return saveCalendarEventCreate({
    store,
    sessionKey,
    fields,
    transact: event =>
      manager.commit(
        new CalAddTransaction(event, event.calendar, null, {
          responseMode: Ci.calIItipItem.NONE,
        })
      ),
    ...options,
  });
}

add_task(async function test_createSelectedCalendarAndUndoRedo() {
  for (const isDate of [false, true]) {
    startCreate({
      calendarId: otherCalendar.id,
      ...(isDate
        ? {
            start: { icalString: "20261010", timezoneId: "floating", isDate },
            end: { icalString: "20261012", timezoneId: "floating", isDate },
          }
        : {}),
    });

    const added = [];
    const observer = {
      onAddItem: event => added.push(event),
      onDeleteItem() {},
    };

    otherCalendar.addObserver(observer);

    const actions = [];
    const observedStore = {
      getState: store.getState,
      dispatch(action) {
        actions.push(action);

        return store.dispatch(action);
      },
    };

    try {
      const result = await save({ store: observedStore });

      Assert.equal(
        result.status,
        "success",
        "Save should create the event successfully."
      );
      Assert.equal(
        added.length,
        1,
        "Calendar observers should receive one new event."
      );

      const event = added[0];

      Assert.equal(
        event.title,
        "Created event",
        "Save should store the event title."
      );
      Assert.equal(
        event.calendar.id,
        otherCalendar.id,
        "Save should use the selected calendar."
      );
      Assert.equal(
        event.getProperty("LOCATION"),
        "Room",
        "Save should store the enabled location value."
      );
      Assert.equal(
        event.startDate.isDate,
        isDate,
        "The start date should match the requested isDate value."
      );
      Assert.equal(
        event.endDate.isDate,
        isDate,
        "The end date should match the requested isDate value."
      );
      Assert.equal(
        await calendar.getItem(event.id),
        null,
        "Save should leave the original calendar without the new event."
      );

      const duplicate = await save();

      Assert.equal(
        duplicate.status,
        "unavailable",
        "Save should reject a duplicate request after success."
      );

      const session = getSessionState();

      Assert.equal(
        session.operation.status,
        "success",
        "The session should retain the successful Save result."
      );
      Assert.deepEqual(
        JSON.parse(JSON.stringify(store.getState())),
        store.getState(),
        "State should contain only JSON data."
      );
      Assert.deepEqual(
        JSON.parse(JSON.stringify(actions)),
        actions,
        "Actions should contain only JSON data."
      );

      await manager.undo();

      Assert.equal(
        await otherCalendar.getItem(event.id),
        null,
        "Undo should remove the new event from the selected calendar."
      );

      await manager.redo();

      const restoredEvent = await otherCalendar.getItem(event.id);

      Assert.equal(
        restoredEvent.title,
        "Created event",
        "Redo should restore the event title."
      );
    } finally {
      otherCalendar.removeObserver(observer);
    }
  }
});

add_task(async function test_validationRetainsDraftAndStartsNoTransaction() {
  for (const [section, patch] of [
    ["title", { title: "" }],
    ["dateTime", { end: null }],
    ["calendar", { calendarId: "missing" }],
  ]) {
    startCreate(patch);

    const retained = structuredClone(getDraftState().value);
    let calls = 0;

    const result = await save({
      transact: () => {
        calls++;
      },
    });

    Assert.equal(
      result.status,
      "invalid",
      "An invalid field or calendar should block Save."
    );
    Assert.equal(calls, 0, "Validation failure should prevent transactions.");

    const draft = getDraftState();

    Assert.deepEqual(
      draft.value,
      retained,
      "Validation failure should retain the draft values."
    );
    Assert.equal(
      draft.validation[section].valid,
      false,
      "Validation should mark the affected section invalid."
    );
    Assert.ok(
      !selectCanSave(store.getState(), sessionKey),
      "The validity selector should report the stored section error."
    );
  }

  for (const property of [
    "readOnly",
    "disabled",
    "capabilities.events.supported",
  ]) {
    startCreate();

    const value = property != "capabilities.events.supported";

    calendar.setProperty(property, value);

    try {
      const result = await save({
        transact: () =>
          Assert.ok(
            false,
            "Save should not start a transaction for an invalid calendar."
          ),
      });

      Assert.equal(
        result.status,
        "invalid",
        "A calendar that cannot accept events should block Save."
      );
    } finally {
      calendar.deleteProperty(property);
    }
  }

  startCreate();
  store.dispatch(startEditSession({ sessionKey }));

  const result = await save();

  Assert.equal(
    result.status,
    "unavailable",
    "Create Save should reject an edit draft."
  );
});

add_task(async function test_registeredFieldsWithoutValidators() {
  for (const registeredFields of [
    {},
    { title: { ...fields.title, validate: undefined } },
    { dateTime: { ...fields.dateTime, validate: undefined } },
    { location: { ...fields.location, validate: undefined } },
  ]) {
    startCreate();

    const retained = structuredClone(getDraftState().value);

    for (const section of ["title", "dateTime", "location", "absent"]) {
      store.dispatch(
        setSectionValidity({
          sessionKey,
          section,
          validity: { valid: false },
        })
      );
    }

    let calls = 0;

    const result = await save({
      fields: registeredFields,
      transact() {
        calls++;
      },
    });

    Assert.equal(
      result.status,
      "success",
      "Available fields should permit Save."
    );
    Assert.equal(
      calls,
      1,
      "Save should start one transaction without validators."
    );
    Assert.deepEqual(
      getDraftState().value,
      retained,
      "Save should retain values for fields without validators."
    );
  }
});

add_task(async function test_partialFieldValidationAndRetry() {
  startCreate();

  const retained = structuredClone(getDraftState().value);

  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "title",
      validity: { valid: false },
    })
  );

  let valid = false;
  let validations = 0;
  let calls = 0;
  let savedEvent;

  const options = {
    fields: {
      location: {
        ...fields.location,
        validate(values) {
          validations++;

          Assert.equal(
            values.location,
            "Room",
            "Validation should receive field values."
          );

          return { valid };
        },
      },
    },
    transact(event) {
      calls++;
      savedEvent = event;
    },
  };

  const invalid = await save(options);

  Assert.equal(
    invalid.status,
    "invalid",
    "An invalid present field should block Save."
  );
  Assert.equal(calls, 0, "Invalid fields should prevent transactions.");
  Assert.equal(validations, 1, "Save should call the present validator.");
  Assert.deepEqual(
    getDraftState().value,
    retained,
    "Validation failure should retain the draft."
  );

  valid = true;

  const retry = await save(options);

  Assert.equal(
    retry.status,
    "success",
    "A valid present field should permit retry."
  );
  Assert.equal(calls, 1, "Retry should start one transaction.");
  Assert.equal(
    validations,
    2,
    "Retry should validate the present field again."
  );
  Assert.equal(
    savedEvent.getProperty("LOCATION"),
    "Room",
    "Save should apply the present field."
  );

  startCreate({ enabledRows: { location: false } });
  valid = false;

  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "location",
      validity: { valid: false },
    })
  );

  const disabled = await save(options);

  Assert.equal(
    disabled.status,
    "success",
    "A disabled invalid field should permit Save."
  );
  Assert.equal(
    validations,
    2,
    "Save should skip the disabled field's validator."
  );
  Assert.equal(
    calls,
    2,
    "The disabled row should permit one more transaction."
  );
  Assert.equal(
    savedEvent.getProperty("LOCATION"),
    null,
    "Save should omit disabled field values."
  );
  Assert.equal(
    getDraftState().value.location,
    "Room",
    "Save should retain the disabled field's draft value."
  );
});

add_task(async function test_calendarChecksWithoutRegisteredFields() {
  const readOnly = calendar.readOnly;

  registerCleanupFunction(() => {
    calendar.readOnly = readOnly;
  });

  calendar.readOnly = true;
  let calls = 0;

  for (const calendarId of ["missing", calendar.id]) {
    startCreate({ calendarId });

    const result = await save({
      fields: {},
      transact() {
        calls++;
      },
    });

    Assert.equal(
      result.status,
      "invalid",
      "Calendar checks should run without field helpers."
    );
    Assert.equal(
      calls,
      0,
      "An unavailable calendar should prevent transactions."
    );
  }

  calendar.readOnly = readOnly;
});

add_task(async function test_duplicateFailureAndDisabledRowRetry() {
  startCreate();

  store.dispatch(
    updateSection({
      sessionKey,
      section: "location",
      patch: {
        enabledRows: { location: false },
        location: "Retained room",
      },
    })
  );

  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "location",
      validity: { valid: false },
    })
  );

  Assert.ok(
    selectCanSave(store.getState(), sessionKey),
    "The validity selector should ignore a disabled row's stored error."
  );

  const retained = structuredClone(getDraftState());
  const prepared = prepareCalendarEventSave(retained.value, fields);

  Assert.deepEqual(
    prepared.location,
    { enabled: false, values: {} },
    "Preparing a disabled location should omit its values."
  );
  Assert.deepEqual(
    getDraftState(),
    retained,
    "Preparing should preserve the draft and row state."
  );

  const finish = Promise.withResolvers();
  let calls = 0;

  const pending = save({
    transact: async event => {
      calls++;

      Assert.equal(
        event.getProperty("LOCATION"),
        null,
        "The transaction should receive no disabled location value."
      );

      await finish.promise;
      throw new Error("Provider failed");
    },
  });

  const session = getSessionState();

  Assert.equal(
    session.operation.status,
    "pending",
    "The session should remain pending until the transaction finishes."
  );

  const duplicate = await save();

  Assert.equal(
    duplicate.status,
    "unavailable",
    "Save should reject a duplicate request while pending."
  );
  Assert.equal(
    calls,
    1,
    "A duplicate Save should not start another transaction."
  );

  finish.resolve();
  const result = await pending;

  Assert.equal(
    result.status,
    "error",
    "Save should report the transaction failure."
  );

  const afterFailure = getDraftState();

  Assert.deepEqual(
    afterFailure.value,
    retained.value,
    "A failed Save should retain the draft values."
  );
  Assert.deepEqual(
    afterFailure.baseline,
    retained.baseline,
    "A failed Save should retain the draft baseline."
  );
  Assert.deepEqual(
    afterFailure.dirtySections,
    retained.dirtySections,
    "A failed Save should retain the changed sections."
  );

  const added = [];
  const observer = {
    onAddItem: event => added.push(event),
    onDeleteItem() {},
  };

  calendar.addObserver(observer);

  try {
    const retry = await save();

    Assert.equal(retry.status, "success", "Save should permit retry.");
    Assert.equal(
      added.length,
      1,
      "Retry should add one event to the calendar."
    );
    Assert.equal(
      added[0].getProperty("LOCATION"),
      null,
      "Retry should omit the disabled location value."
    );
    Assert.equal(
      afterFailure.value.location,
      "Retained room",
      "A failed Save should retain the disabled location value."
    );
  } finally {
    calendar.removeObserver(observer);
  }
});

add_task(async function test_staleResultsKeepReplacementDraftAndSession() {
  for (const [fail, mode] of [
    [false, "create"],
    [false, "edit"],
    [false, "reset"],
    [true, "create"],
    [true, "edit"],
    [true, "reset"],
  ]) {
    startCreate();

    const finish = Promise.withResolvers();

    const pending = save({
      transact: async () => {
        await finish.promise;

        if (fail) {
          throw new Error("Old save failed");
        }
      },
    });

    if (mode == "create") {
      startCreate({ title: "Replacement" });
    } else if (mode == "edit") {
      store.dispatch(startEditSession({ sessionKey }));

      store.dispatch(
        resetFromSource({
          sessionKey,
          snapshot: { event: { title: "Edit replacement" } },
        })
      );
    } else {
      // Replace only the unsaved values. Keep the pending request ID to check
      // that Save also detects a replacement through the baseline object.
      // The old Save must then clear its own pending status.
      store.dispatch(
        resetForCreate({
          sessionKey,
          initialDraft: { title: "Reset replacement" },
        })
      );
    }

    const draft = structuredClone(getDraftState());
    const session = getSessionState();

    finish.resolve();
    const result = await pending;

    Assert.equal(
      result.status,
      "stale",
      "Save should report a replaced session or draft as stale."
    );
    Assert.deepEqual(
      getDraftState(),
      draft,
      "An old Save result should preserve the replacement draft."
    );

    if (mode == "reset") {
      const currentSession = getSessionState();

      Assert.equal(
        currentSession.operation.status,
        "idle",
        "Save should release the operation after a draft reset."
      );
    } else {
      Assert.deepEqual(
        getSessionState(),
        session,
        "An old Save result should preserve the replacement session."
      );
    }
  }
});

add_task(async function test_rowStateDefaultsChangesAndReset() {
  startCreate();

  store.dispatch(
    initializeFields({
      sessionKey,
      defaults: { enabledRows: { reminders: false }, reminders: [] },
    })
  );

  for (const enabled of [false, true]) {
    store.dispatch(
      updateSection({
        sessionKey,
        section: "location",
        patch: { location: "Room", enabledRows: { location: enabled } },
      })
    );

    const draft = getDraftState();

    Assert.equal(
      draft.value.location,
      "Room",
      "Changing the row state should retain the location value."
    );
    Assert.deepEqual(
      draft.value.enabledRows,
      {
        location: enabled,
        reminders: false,
      },
      "The draft should contain the current row states."
    );
    Assert.deepEqual(
      draft.baseline.enabledRows,
      {
        location: true,
        reminders: false,
      },
      "Changing the row state should preserve the baseline row states."
    );
    Assert.deepEqual(
      draft.dirtySections,
      enabled ? [] : ["location"],
      "The changed sections should reflect the location row state."
    );
  }

  store.dispatch(clearCalendarEventDraft({ sessionKey }));

  Assert.equal(
    getDraftState(),
    null,
    "Clearing the draft should remove its state."
  );

  startCreate();

  const draft = getDraftState();

  Assert.deepEqual(
    draft.value.enabledRows,
    { location: true },
    "A new draft should restore the initial row flags."
  );
});

add_task(async function test_pendingSuccessCreatesOnlyOneEvent() {
  startCreate();

  const finish = Promise.withResolvers();
  let calls = 0;
  let savedId;

  const pending = save({
    transact: async event => {
      calls++;

      await finish.promise;

      const transaction = new CalAddTransaction(event, calendar, null, {
        responseMode: Ci.calIItipItem.NONE,
      });

      await manager.commit(transaction);
      savedId = transaction.item.id;
    },
  });

  const duplicate = await save();

  Assert.equal(
    duplicate.status,
    "unavailable",
    "Save should reject a duplicate request while pending."
  );
  Assert.equal(calls, 1, "A pending Save should start only one transaction.");

  finish.resolve();
  const result = await pending;

  Assert.deepEqual(
    result,
    { status: "success" },
    "The pending Save should return a success result."
  );
  Assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    result,
    "The Save result should contain only JSON data."
  );

  const savedEvent = await calendar.getItem(savedId);

  Assert.equal(
    savedEvent.title,
    "Created event",
    "Save should store the event title."
  );

  const duplicateAfterSuccess = await save();

  Assert.equal(
    duplicateAfterSuccess.status,
    "unavailable",
    "Save should reject a duplicate request after success."
  );
  Assert.equal(
    calls,
    1,
    "A duplicate Save after success should not start another transaction."
  );
});

add_task(async function test_replacementDuringValidationStartsNoTransaction() {
  for (const stage of ["pending", "validation"]) {
    startCreate();

    let replaced = false;

    // Dispatch can notify listeners before returning. Replace the session
    // after either the pending status or the first validation result is stored.
    // Later results from the old Save must not change the replacement draft.
    const observedStore = {
      getState: store.getState,
      dispatch(action) {
        store.dispatch(action);

        if (
          !replaced &&
          action.type.endsWith(
            stage == "pending" ? "/operationStarted" : "/setSectionValidity"
          )
        ) {
          replaced = true;
          startCreate({ title: "Replacement during validation" });
        }
      },
    };

    let calls = 0;

    const result = await save({
      store: observedStore,
      transact: () => {
        calls++;
      },
    });

    Assert.equal(
      result.status,
      "stale",
      "Replacing the draft during validation should make Save stale."
    );
    Assert.equal(
      calls,
      0,
      "Replacing the draft during validation should prevent transactions."
    );

    const draft = getDraftState();

    Assert.equal(
      draft.value.title,
      "Replacement during validation",
      "The replacement draft should retain its title."
    );
    Assert.deepEqual(
      draft.validation,
      { title: { valid: true } },
      "Old checks should preserve the replacement draft's initial title validity."
    );

    const session = getSessionState();

    Assert.equal(
      session.operation.status,
      "idle",
      "The replacement session should remain idle."
    );
  }
});

add_task(async function test_fieldCallbacksCannotChangeReplacementDraft() {
  for (const method of ["validate", "apply"]) {
    startCreate();

    let replacementDraft;
    let replacementSession;
    let calls = 0;

    const result = await save({
      fields: {
        ...fields,
        title: {
          ...fields.title,
          [method]() {
            startCreate({ title: `Replacement during ${method}` });
            replacementDraft = structuredClone(getDraftState());
            replacementSession = getSessionState();

            return { valid: true };
          },
        },
      },
      transact() {
        calls++;
      },
    });

    Assert.equal(
      result.status,
      "stale",
      `Replacement during ${method} should make Save stale.`
    );
    Assert.equal(
      calls,
      0,
      `Replacement during ${method} should prevent transactions.`
    );
    Assert.deepEqual(
      getDraftState(),
      replacementDraft,
      `The ${method} result should preserve the replacement draft state.`
    );
    Assert.deepEqual(
      getSessionState(),
      replacementSession,
      `The ${method} result should preserve the replacement session.`
    );
  }
});

add_task(async function test_validatorFailureRetainsDraftAndPermitsRetry() {
  startCreate();

  store.dispatch(
    updateSection({
      sessionKey,
      section: "location",
      patch: { enabledRows: { location: false }, location: "Changed room" },
    })
  );

  const retained = structuredClone(getDraftState());
  let calls = 0;

  const result = await save({
    fields: {
      ...fields,
      title: {
        ...fields.title,
        validate() {
          throw new Error("Validation failed");
        },
      },
    },
    transact() {
      calls++;
    },
  });

  Assert.equal(
    result.status,
    "error",
    "A validator failure should return an error result."
  );
  Assert.equal(calls, 0, "A validator failure should prevent transactions.");
  Assert.deepEqual(
    getDraftState(),
    retained,
    "A validator failure should retain values, row state, and changed sections."
  );

  const retry = await save();

  Assert.equal(
    retry.status,
    "success",
    "A validator failure should permit retry."
  );
});

add_task(async function test_calendarAccessAndConversionFailureRetainDraft() {
  startCreate();

  calendar.wrappedJSObject.mACLEntry = {
    QueryInterface: ChromeUtils.generateQI(["calICalendarACLEntry"]),
    hasAccessControl: true,
    userIsOwner: false,
    userCanAddItems: false,
  };

  try {
    const result = await save({
      transact: () =>
        Assert.ok(false, "Access checks should prevent transactions."),
    });

    Assert.equal(
      result.status,
      "invalid",
      "Calendar access restrictions should block Save."
    );
  } finally {
    calendar.wrappedJSObject.mACLEntry = null;
  }

  startCreate();

  const draft = structuredClone(getDraftState().value);
  let calls = 0;

  const result = await save({
    fields: {
      ...fields,
      location: {
        ...fields.location,
        apply: () => {
          throw new Error("Conversion failed");
        },
      },
    },
    transact() {
      calls++;
    },
  });

  Assert.equal(
    result.status,
    "error",
    "A field conversion failure should return an error result."
  );
  Assert.equal(calls, 0, "A conversion failure should prevent transactions.");
  Assert.deepEqual(
    getDraftState().value,
    draft,
    "A field conversion failure should retain the draft values."
  );

  const retry = await save();

  Assert.equal(
    retry.status,
    "success",
    "Conversion failures should permit retry."
  );
});

add_task(async function test_calendarFieldValidationIsNotOverwritten() {
  startCreate();

  let calls = 0;

  const result = await save({
    fields: {
      ...fields,
      calendar: {
        keys: ["calendarId"],
        validate: () => ({
          valid: false,
          messageId: "test-calendar-invalid",
        }),
        apply: () =>
          Assert.ok(false, "An invalid calendar should not be applied."),
      },
    },
    transact: () => {
      calls++;
    },
  });

  Assert.equal(
    result.status,
    "invalid",
    "A calendar field validation error should block Save."
  );
  Assert.equal(
    calls,
    0,
    "A calendar field validation error should prevent transactions."
  );

  const draft = getDraftState();

  Assert.deepEqual(
    draft.validation.calendar,
    {
      valid: false,
      messageId: "test-calendar-invalid",
    },
    "Save should retain the calendar field validation error."
  );
});
