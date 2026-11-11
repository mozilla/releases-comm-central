/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests create Save with the production dialog in a separate test document.
 * That document has its own Redux store for unsaved values and Save progress.
 * Its `doTransaction` wrapper normally forwards writes to Thunderbird. Tests
 * can replace the wrapper's write function to pause or fail Save.
 * Test fields below supply input and errors for keyboard and focus checks.
 * Accessibility checks inspect the document; they do not test spoken output.
 * The xpcshell tests check field conversion and state changes without a dialog.
 */

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let redux;
let dialog;
let doc;
let calendar;
let otherCalendar;
let transaction;
let titleInput;
let titleError;
let locationInput;
let locationToggle;
let fields;

add_setup(async function () {
  calendar = createCalendar({ type: "memory" });
  otherCalendar = createCalendar({ type: "memory" });

  for (const item of [calendar, otherCalendar]) {
    item.setProperty("calendar-main-in-composite", true);
  }

  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );

  await SimpleTest.promiseFocus(browser);

  redux = browser.contentWindow.ReduxTestUtils;
  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');

  transaction = (action, event, response) =>
    window.doTransaction(action, event, event.calendar, null, null, response);
  browser.contentWindow.doTransaction = (
    action,
    event,
    selected,
    original,
    listener,
    response
  ) => transaction(action, event, response);

  // Use test controls and validators to check Save independently of the field
  // implementations. Cover failures, retry, and omission of disabled fields.
  // The controls also show errors for keyboard and accessibility checks.
  titleInput = doc.createElement("input");
  titleInput.id = "testTitle";
  titleInput.setAttribute("aria-label", "Title");
  titleInput.setAttribute("aria-describedby", "testTitleError");

  titleError = doc.createElement("span");
  titleError.id = "testTitleError";
  titleError.setAttribute("aria-live", "polite");

  dialog.querySelector(".event-title").append(titleInput, titleError);

  locationToggle = doc.createElement("input");
  locationToggle.id = "testLocationToggle";
  locationToggle.type = "checkbox";

  const locationToggleLabel = doc.createElement("label");

  locationToggleLabel.htmlFor = locationToggle.id;
  locationToggleLabel.textContent = "Include location";

  locationInput = doc.createElement("input");
  locationInput.setAttribute("aria-label", "Location");

  dialog
    .querySelector(".calendar-event-create-edit-dialog-rows")
    .append(locationToggle, locationToggleLabel, locationInput);

  locationToggle.addEventListener("change", () => {
    dialog.updateDraftSection("location", {
      enabledRows: { location: locationToggle.checked },
      location: locationInput.value,
    });
  });

  titleInput.addEventListener("input", () =>
    dialog.updateDraftSection("title", { title: titleInput.value })
  );

  fields = {
    title: {
      keys: ["title"],
      validate(values) {
        const valid = !!values.title;

        titleError.textContent = valid ? "" : "Required";
        titleInput.setCustomValidity(valid ? "" : "Required");
        titleInput.setAttribute("aria-invalid", valid ? "false" : "true");

        return { valid };
      },
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
      }),
      apply(event, values) {
        for (const [key, property] of [
          ["start", "startDate"],
          ["end", "endDate"],
        ]) {
          const date = cal.createDateTime(values[key].icalString);

          date.timezone = cal.timezoneService.getTimezone(
            values[key].timezoneId
          );
          date.isDate = values[key].isDate;
          event[property] = date;
        }
      },
    },
    location: {
      keys: ["location"],
      apply: (event, values) => event.setProperty("LOCATION", values.location),
      remove: event => event.deleteProperty("LOCATION"),
    },
  };

  dialog.saveFields = fields;

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Create Save states should pass accessibility checks.",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    dialog.close();
    tabmail.closeTab(tab);
    CalendarTestUtils.removeCalendar(calendar);
    CalendarTestUtils.removeCalendar(otherCalendar);
  });
});

/**
 * Opens a create session and resets its draft and test controls.
 * Uses a one-hour event starting at 13:00 today unless `patch` replaces values.
 *
 * @param {CalendarEventDraft} [patch={}] - Values that replace the test defaults.
 * @returns {Promise<void>} Resolves after opening the dialog and translating its text.
 */
async function create(patch = {}) {
  dialog.setCalendarEventRoute();

  Assert.ok(await dialog.show(), "The create dialog should open.");

  const start = cal.dtz.now();

  start.hour = 13;
  start.minute = start.second = 0;

  const end = start.clone();

  end.addDuration(cal.createDuration("PT1H"));

  const snapshot = date => ({
    icalString: date.icalString,
    timezoneId: date.timezone.tzid,
    isDate: date.isDate,
  });

  dialog.resetCreateDraft({
    calendarId: calendar.id,
    title: "New event",
    start: snapshot(start),
    end: snapshot(end),
    enabledRows: { location: true },
    location: "Retained room",
    ...patch,
  });

  titleInput.value = dialog.draft.title;
  titleInput.setCustomValidity("");
  titleInput.setAttribute("aria-invalid", "false");
  titleError.textContent = "";
  locationInput.value = dialog.draft.location;
  locationToggle.checked = true;

  await doc.l10n.translateFragment(dialog);
}

/**
 * Saves the current field helpers and write function for later restoration.
 * Registers cleanup too, so a failed test does not leave its replacements set.
 *
 * @returns {() => void} A function that restores the captured values.
 *   Harness cleanup also closes the dialog.
 */
function preserveSaveHandlers() {
  const originalFields = dialog.saveFields;
  const realTransaction = transaction;

  const restore = () => {
    dialog.saveFields = originalFields;
    transaction = realTransaction;
  };

  registerCleanupFunction(() => {
    restore();
    dialog.close();
  });

  return restore;
}

add_task(async function test_saveWithoutFixedFieldHelpers() {
  const restoreSaveHandlers = preserveSaveHandlers();

  dialog.saveFields = {};

  let calls = 0;

  transaction = () => {
    calls++;
  };

  await create();

  const button = dialog.querySelector(".calendar-event-save");

  Assert.ok(button, "The dialog should contain the Save button.");
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "Save should remain visible without fixed helpers."
  );
  Assert.ok(!button.disabled, "Save should be enabled without fixed helpers.");

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");

  button.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await closed;

  Assert.equal(calls, 1, "Keyboard Save should start one transaction.");
  Assert.equal(dialog.draft, null, "Successful Save should clear the draft.");

  restoreSaveHandlers();
});

add_task(async function test_partialFieldValidationIgnoresAbsentErrors() {
  const restoreSaveHandlers = preserveSaveHandlers();

  dialog.saveFields = {
    location: {
      ...fields.location,
      validate: values => ({ valid: !!values.location }),
    },
  };
  transaction = () => {};

  await create();

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "setSectionValidity",
    {
      sessionKey: dialog.calendarEventSessionKey,
      section: "title",
      validity: { valid: false },
    }
  );

  const button = dialog.querySelector(".calendar-event-save");

  Assert.ok(button, "The dialog should contain the Save button.");
  Assert.ok(
    !button.disabled,
    "An absent field's error should not disable create Save."
  );

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");

  button.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await closed;

  Assert.ok(
    !dialog.open,
    "Keyboard Save should close the partial-field dialog."
  );

  restoreSaveHandlers();
});

add_task(async function test_partialInvalidFieldCanBeDisabled() {
  const restoreSaveHandlers = preserveSaveHandlers();

  dialog.saveFields = {
    location: {
      ...fields.location,
      validate: values => ({ valid: !!values.location }),
    },
  };
  transaction = () => {};

  await create({ location: "" });
  await dialog.save();

  Assert.ok(dialog.open, "Invalid Save should keep the dialog open.");

  locationToggle.focus();
  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);

  Assert.ok(
    !dialog.draft.enabledRows.location,
    "Space should disable the optional row."
  );
  Assert.equal(
    locationInput.value,
    "",
    "Disabling the row should retain the input value."
  );

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");
  const button = dialog.querySelector(".calendar-event-save");

  Assert.ok(button, "The dialog should contain the Save button.");
  Assert.ok(
    !button.disabled,
    "Disabling the invalid row should keep Save enabled."
  );

  button.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await closed;

  Assert.ok(
    !dialog.open,
    "Retry should close the dialog after the row is disabled."
  );

  restoreSaveHandlers();
});

add_task(async function test_keyboardSaveSelectedCalendarAndClose() {
  const opener = doc.getElementById("menuCreate");

  opener.focus();
  await create();

  const select = dialog.querySelector(".calendar-selector");

  select.value = otherCalendar.id;

  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    otherCalendar.id,
    "The draft should use the selected calendar."
  );

  const button = dialog.querySelector(".calendar-event-save");
  const availability = dialog.querySelector(".availability-selector");

  Assert.ok(button, "The dialog should contain the Save button.");
  Assert.ok(!button.disabled, "The Save button should be enabled.");
  Assert.ok(availability, "The footer should contain Availability.");

  locationInput.focus();
  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);
  Assert.equal(
    doc.activeElement,
    availability,
    "Tab should move focus from the last field to Availability."
  );

  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);
  Assert.equal(doc.activeElement, button, "Tab should move focus to Save.");

  EventUtils.synthesizeKey(
    "KEY_Tab",
    { shiftKey: true },
    browser.contentWindow
  );

  Assert.equal(
    doc.activeElement,
    availability,
    "Shift+Tab should return focus from Save to Availability."
  );

  EventUtils.synthesizeKey(
    "KEY_Tab",
    { shiftKey: true },
    browser.contentWindow
  );

  Assert.equal(
    doc.activeElement,
    locationInput,
    "Shift+Tab should return focus to the last field."
  );

  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);
  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;

  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(button)),
    "The Save button should appear in the accessibility tree."
  );

  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_PUSHBUTTON,
    "Save should have the push button role."
  );
  Assert.equal(
    doc.l10n.getAttributes(button).id,
    "calendar-event-save",
    "The Save button should use the localized name."
  );

  const added = [];
  const observer = {
    onAddItem: event => added.push(event),
    onDeleteItem() {},
  };

  otherCalendar.addObserver(observer);

  try {
    const closed = BrowserTestUtils.waitForEvent(dialog, "close");

    EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
    await closed;

    Assert.equal(
      added.length,
      1,
      "Keyboard Save should add one event to the selected calendar."
    );
    Assert.equal(dialog.draft, null, "Successful Save should clear the draft.");
    Assert.equal(
      dialog.mode,
      null,
      "Successful Save should clear the create session."
    );

    for (const attribute of ["calendar-id", "event-id", "recurrence-id"]) {
      Assert.ok(
        !dialog.hasAttribute(attribute),
        `Success should clear ${attribute}.`
      );
    }

    Assert.equal(
      doc.activeElement,
      opener,
      "Closing should restore focus to the opener."
    );
  } finally {
    otherCalendar.removeObserver(observer);
  }
});

add_task(async function test_titleErrorAndCorrection() {
  const restoreSaveHandlers = preserveSaveHandlers();

  transaction = () => {};

  await create({ title: "" });

  await dialog.save();

  Assert.ok(dialog.open, "An invalid title should keep the dialog open.");
  Assert.equal(
    titleError.textContent,
    "Required",
    "An empty title should display the required field error."
  );
  Assert.equal(
    titleInput.getAttribute("aria-invalid"),
    "true",
    "The title input should report an invalid value."
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;

  await TestUtils.waitForCondition(() => {
    accessible = service.getAccessibleFor(titleInput);

    return accessible?.description == "Required";
  });

  Assert.equal(
    accessible.name,
    "Title",
    "Screen readers should receive the Title name."
  );
  Assert.equal(
    accessible.description,
    "Required",
    "Screen readers should receive the field error."
  );

  titleInput.focus();
  EventUtils.sendString("Corrected title", browser.contentWindow);

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");

  await dialog.save();
  await closed;

  Assert.equal(
    titleError.textContent,
    "",
    "Correcting the title should clear its error message."
  );
  Assert.equal(
    titleInput.getAttribute("aria-invalid"),
    "false",
    "The corrected title input should clear its invalid state."
  );

  restoreSaveHandlers();
});

add_task(async function test_unwritableCalendarErrorAndRetry() {
  const readOnly = calendar.readOnly;

  registerCleanupFunction(() => {
    calendar.readOnly = readOnly;
    dialog.close();
  });

  await create();

  // Make the selected calendar read-only after the dialog opens. Save must
  // check the live calendar again.
  calendar.readOnly = true;

  await dialog.save();

  Assert.ok(dialog.open, "Invalid Save should keep the dialog open.");

  const select = dialog.querySelector(".calendar-selector");
  const message = dialog.querySelector(".calendar-event-save-status-text");

  Assert.ok(select, "The dialog should contain the calendar selector.");
  Assert.ok(message, "The dialog should contain the Save status text.");

  await doc.l10n.translateFragment(dialog);

  Assert.equal(
    doc.l10n.getAttributes(message).id,
    "calendar-event-calendar-unavailable",
    "The status should identify the calendar error message."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(message),
    "The calendar error should be visible."
  );
  Assert.deepEqual(
    select.ariaDescribedByElements,
    [message],
    "The calendar error should describe the selector."
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );

  Assert.equal(
    select.getAttribute("aria-invalid"),
    "true",
    "The calendar selector should report an invalid value."
  );

  await TestUtils.waitForCondition(() => {
    const selected = service.getAccessibleFor(select);

    if (!selected) {
      return false;
    }

    const state = {};

    selected.getState(state, {});

    return state.value & Ci.nsIAccessibleStates.STATE_INVALID;
  }, "Screen readers should receive the invalid calendar state.");

  calendar.readOnly = readOnly;

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");
  await dialog.save();
  await closed;

  await doc.l10n.translateFragment(dialog);

  Assert.equal(
    doc.l10n.getAttributes(message).id,
    "calendar-event-save-idle",
    "Successful retry should clear the calendar error message."
  );

  const clearedSelect = dialog.querySelector(".calendar-selector");

  Assert.ok(clearedSelect, "The dialog should retain the calendar selector.");
  Assert.deepEqual(
    clearedSelect.ariaDescribedByElements,
    [],
    "Successful retry should clear the selector's error description."
  );
});

add_task(async function test_rowTogglePendingFailureAndKeyboardRetry() {
  await create();

  for (const enabled of [false, true, false]) {
    locationToggle.focus();
    EventUtils.synthesizeKey(" ", {}, browser.contentWindow);

    Assert.equal(
      locationToggle.checked,
      enabled,
      "Space should change the location checkbox state."
    );
    Assert.equal(
      dialog.draft.enabledRows.location,
      enabled,
      "The draft should reflect the location checkbox state."
    );
    Assert.equal(
      locationInput.value,
      "Retained room",
      "Changing the row state should retain the location input value."
    );
  }

  const realTransaction = transaction;
  const finish = Promise.withResolvers();

  transaction = async () => {
    await finish.promise;
    throw new Error("Provider failed");
  };

  registerCleanupFunction(() => {
    transaction = realTransaction;
    finish.resolve();
  });

  const button = dialog.querySelector(".calendar-event-save");

  button.focus();

  const pending = dialog.save();

  Assert.ok(
    button.disabled,
    "The Save button should be disabled while Save is pending."
  );
  Assert.equal(
    doc.activeElement,
    dialog,
    "Disabling Save should move focus to the dialog."
  );

  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");

  Assert.equal(
    body.getAttribute("aria-busy"),
    "true",
    "The dialog body should report that Save is pending."
  );

  await doc.l10n.translateFragment(dialog);

  finish.resolve();
  await pending;

  Assert.ok(dialog.open, "A failed Save should keep the dialog open.");
  Assert.equal(
    locationInput.value,
    "Retained room",
    "A failed Save should retain the location input value."
  );
  Assert.ok(
    !locationToggle.checked,
    "A failed Save should keep the location row disabled."
  );
  Assert.equal(
    body.getAttribute("aria-busy"),
    "false",
    "The dialog body should clear its busy state after failure."
  );
  Assert.ok(
    !button.disabled,
    "A failed Save should enable the Save button for retry."
  );

  const message = dialog.querySelector(".calendar-event-save-status");
  const messageText = dialog.querySelector(".calendar-event-save-status-text");

  Assert.ok(messageText, "The Save status should contain localized text.");

  await doc.l10n.translateFragment(dialog);

  Assert.equal(
    doc.l10n.getAttributes(messageText).id,
    "calendar-event-save-failed",
    "The status should use the Save failure message."
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;

  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(message))
  );

  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_STATUSBAR,
    "The Save status should have the status bar role."
  );
  Assert.equal(
    accessible.attributes.getStringProperty("live"),
    "polite",
    "Screen readers should receive polite status announcements."
  );

  transaction = realTransaction;

  const added = [];
  const observer = {
    onAddItem: event => added.push(event),
    onDeleteItem() {},
  };

  calendar.addObserver(observer);

  try {
    button.focus();
    const closed = BrowserTestUtils.waitForEvent(dialog, "close");

    EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
    await closed;

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
      dialog.draft,
      null,
      "Successful retry should clear the draft."
    );
  } finally {
    calendar.removeObserver(observer);
  }
});

add_task(async function test_staleCreateResultsKeepReplacementDialog() {
  for (const mode of ["create", "edit"]) {
    await create();

    const realTransaction = transaction;

    // Pause the old write while a replacement session opens. Copy the new
    // draft before finishing the old write so the test can detect changes
    // caused by the old result.
    const finish = Promise.withResolvers();

    transaction = async () => {
      await finish.promise;
    };

    const pending = dialog.save();

    try {
      if (mode == "create") {
        await create({ title: "Replacement draft" });
      } else {
        const event = await createEvent({
          calendar,
          name: "Edit replacement",
        });

        dialog.setCalendarEventRoute({
          calendarId: calendar.id,
          eventId: event.id,
        });

        Assert.ok(
          await dialog.show(),
          "The replacement edit dialog should open."
        );
      }

      const replacement = JSON.stringify(dialog.draft);

      finish.resolve();

      Assert.equal(
        (await pending).status,
        "stale",
        "Save should report a replaced session as stale."
      );
      Assert.ok(
        dialog.open,
        "An old Save result should keep the replacement dialog open."
      );
      Assert.equal(
        dialog.mode,
        mode,
        "An old Save result should preserve the replacement mode."
      );
      Assert.equal(
        JSON.stringify(dialog.draft),
        replacement,
        "An old Save result should preserve the replacement draft."
      );

      dialog.close();
    } finally {
      finish.resolve();
      await pending;
      transaction = realTransaction;
    }
  }
});

add_task(async function test_draftResetBeforeSuccessfulSaveCloses() {
  const restoreSaveHandlers = preserveSaveHandlers();

  transaction = () => {};

  await create();

  const sessionKey = dialog.calendarEventSessionKey;
  const replacement = { ...dialog.draft, title: "Replacement after success" };
  let savedRequestId;

  // The dialog's store listener schedules closing after success. This listener
  // resets the draft before that callback runs. Keep the request ID unchanged
  // to check that the callback also detects the replaced baseline object.
  const unsubscribe = redux.subscribe(() => {
    const session =
      redux.getState().calendarEventCreateEditSession.sessions[sessionKey];

    if (session?.operation.status != "success" || savedRequestId) {
      return;
    }

    savedRequestId = session.operation.requestId;
    dialog.resetCreateDraft(replacement);
  });

  registerCleanupFunction(() => {
    unsubscribe();
    dialog.close();
  });

  const result = await dialog.save();

  Assert.equal(result.status, "success", "The original Save should succeed.");
  Assert.ok(
    savedRequestId,
    "The test should reset the draft after Save succeeds."
  );
  Assert.ok(
    dialog.open,
    "The scheduled close should keep the replacement dialog open."
  );

  const session =
    redux.getState().calendarEventCreateEditSession.sessions[sessionKey];

  Assert.ok(session, "The replacement dialog should retain its session.");
  Assert.equal(
    session.operation.requestId,
    savedRequestId,
    "The draft reset should keep the successful request ID."
  );
  Assert.deepEqual(
    dialog.draft,
    replacement,
    "The scheduled close should preserve the replacement draft."
  );

  unsubscribe();
  dialog.close();
  restoreSaveHandlers();
});

add_task(async function test_productionSaveAddsRenderedCalendarEvent() {
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(
    window,
    todayDate.getFullYear(),
    todayDate.getMonth() + 1,
    todayDate.getDate()
  );

  await window.showCalendarEventCreateEditDialog();

  const productDialog = document.getElementById(
    "calendarEventCreateEditDialog"
  );

  registerCleanupFunction(() => {
    productDialog.close();
    productDialog.remove();
  });

  Assert.ok(productDialog.open, "The production create dialog should open.");

  productDialog.saveFields = {
    title: { ...fields.title, validate: values => ({ valid: !!values.title }) },
    dateTime: fields.dateTime,
  };

  const start = cal.dtz.now();

  start.hour = 13;
  start.minute = start.second = 0;

  const end = start.clone();

  end.addDuration(cal.createDuration("PT1H"));

  const snapshot = date => ({
    icalString: date.icalString,
    timezoneId: date.timezone.tzid,
    isDate: date.isDate,
  });

  productDialog.resetCreateDraft({
    calendarId: calendar.id,
    title: "Created in Calendar",
    start: snapshot(start),
    end: snapshot(end),
  });

  const view = document.getElementById("week-view");
  const findEvent = () =>
    Array.from(view.querySelectorAll("calendar-event-box")).find(
      box => box.occurrence?.title == "Created in Calendar"
    );

  const rendered = BrowserTestUtils.waitForMutationCondition(
    view,
    { childList: true, subtree: true },
    () => !!findEvent()
  );

  Assert.equal(
    (await productDialog.save()).status,
    "success",
    "The production dialog should save the new event."
  );

  await rendered;

  Assert.ok(
    findEvent().eventNameLabel.textContent.includes("Created in Calendar"),
    "Calendar should display the new event title."
  );
  Assert.ok(
    !productDialog.open,
    "Successful Save should close the production dialog."
  );
  Assert.equal(
    productDialog.draft,
    null,
    "Successful Save should clear the production draft."
  );

  const saved = findEvent().occurrence;

  await calendar.deleteItem(saved);
});
