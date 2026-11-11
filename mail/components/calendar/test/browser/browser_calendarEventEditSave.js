/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests edit Save with the production dialog in a separate test document.
 * That document has its own Redux store for unsaved values and Save progress.
 * Its `doTransaction` wrapper normally forwards writes to Thunderbird. Tests
 * can replace the wrapper's write function to pause or fail Save while checking
 * controls, focus, and closing. Accessibility checks inspect the document and
 * the data that Thunderbird exposes to assistive software. These checks do not
 * test a screen reader's spoken output.
 */

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);
const { CalTransactionManager } = ChromeUtils.importESModule(
  "resource:///modules/CalTransactionManager.sys.mjs"
);
let browser;
let redux;
let dialog;
let doc;
let calendar;
let otherCalendar;
let transaction;

add_setup(async function () {
  const initialView = window.gLastShownCalendarView.get();
  const initialDate = new Date(document.getElementById("calMinimonth").value);

  calendar = createCalendar({ type: "memory" });
  otherCalendar = createCalendar({ type: "memory" });
  for (const item of [calendar, otherCalendar]) {
    item.setProperty("calendar-main-in-composite", true);
  }
  const tabmail = document.getElementById("tabmail");
  const hadCalendarTab = tabmail.tabModes.calendar.tabs.length > 0;
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
  transaction = (event, oldEvent, response) =>
    window.doTransaction(
      "modify",
      event,
      event.calendar,
      oldEvent,
      null,
      response
    );
  browser.contentWindow.promptOccurrenceModification = event => [event];

  // The dialog calls doTransaction on its own top-level window. In this test,
  // that window is the fixture document. Forward the call to Thunderbird
  // through transaction so each test can replace the write function.
  browser.contentWindow.doTransaction = (
    action,
    event,
    selected,
    oldEvent,
    listener,
    response
  ) => transaction(event, oldEvent, response);
  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Edit Save states should pass accessibility checks.",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(async () => {
    dialog.close();
    tabmail.closeTab(tab);
    CalendarTestUtils.removeCalendar(calendar);
    CalendarTestUtils.removeCalendar(otherCalendar);

    await CalendarTestUtils.setCalendarView(window, initialView);
    await CalendarTestUtils.goToDate(
      window,
      initialDate.getFullYear(),
      initialDate.getMonth() + 1,
      initialDate.getDate()
    );

    if (!hadCalendarTab) {
      await CalendarTestUtils.closeCalendarTab(window);
    }
  });
});

/**
 * Opens a saved event in the fixture dialog and waits for its displayed text.
 *
 * @param {calIEvent} event - The saved event that supplies the route IDs.
 * @param {?string} [recurrenceId=null] - The start time of one event in a
 *   repeating series, in microseconds as a string. Null selects the whole event.
 * @returns {Promise<void>} Resolves after showing and localizing the dialog.
 */
async function edit(event, recurrenceId = null) {
  dialog.setCalendarEventRoute({
    calendarId: event.calendar.id,
    eventId: event.id,
    recurrenceId,
  });

  Assert.ok(await dialog.show(), "The edit dialog should open.");

  await doc.l10n.translateFragment(dialog);
}

add_task(async function test_storeUpdatesBeforeConnection() {
  const original = await createEvent({ calendar, name: "Before connection" });
  const container = doc.createElement("div");
  const previous = doc.createElement("dialog", {
    is: "calendar-event-create-edit-dialog",
  });
  let replacement = null;

  const cleanupDialogs = () => {
    replacement?.dispose();
    previous.dispose();

    if (replacement?.open) {
      replacement.close();
    }

    if (previous.open) {
      previous.close();
    }

    replacement?.remove();
    previous.remove();
    container.remove();
  };
  registerCleanupFunction(cleanupDialogs);

  previous.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: original.id,
  });
  container.append(previous);
  doc.body.append(container);

  Assert.ok(await previous.show(), "The first edit dialog should open.");

  replacement = doc.createElement("dialog", {
    is: "calendar-event-create-edit-dialog",
  });

  Assert.equal(
    replacement.childElementCount,
    0,
    "The replacement should have no content before connection."
  );

  // The replacement already observes the store. Updating the first dialog
  // recreates a notification before the replacement has its template content.
  previous.updateDraftSection("title", { title: "Unsaved edit" });
  replacement.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: original.id,
  });
  container.replaceChildren(replacement);

  Assert.ok(
    await replacement.show(),
    "The replacement edit dialog should open."
  );

  const body = replacement.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const button = replacement.querySelector(".calendar-event-save");

  Assert.ok(body, "The connected replacement should have a dialog body.");
  Assert.ok(button, "The connected replacement should have a Save button.");
  Assert.equal(
    body.getAttribute("aria-busy"),
    "false",
    "The connected replacement should report that Save is idle."
  );
  Assert.ok(!button.disabled, "The ready replacement should enable Save.");
  Assert.equal(
    replacement.getAttribute("closedby"),
    "closerequest",
    "The idle replacement should allow native dismissal."
  );
  Assert.equal(
    replacement.draft.title,
    "Before connection",
    "The replacement should load the stored event instead of the discarded edit."
  );

  // The harness runs registered cleanup after the file. Remove these dialogs
  // before the next task.
  const closed = BrowserTestUtils.waitForMutationCondition(
    replacement,
    {
      attributes: true,
      attributeFilter: ["open"],
    },
    () => !replacement.open,
    "The replacement dialog should close before the next task."
  );

  replacement.close();
  await closed;
  cleanupDialogs();

  Assert.equal(
    doc.querySelectorAll("dialog[open]").length,
    0,
    "The lifecycle test should leave no dialog open."
  );
});

add_task(async function test_closeButtonDiscardsEditedDraft() {
  const original = await createEvent({ calendar, name: "Before Close" });
  const opener = doc.getElementById("menuCreate");
  for (const activation of ["mouse", "keyboard"]) {
    opener.focus();
    await edit(original);
    dialog.updateDraftSection("title", { title: "Discarded" });
    const button = dialog.querySelector(".close-button");
    const closed = BrowserTestUtils.waitForEvent(dialog, "close");
    if (activation == "mouse") {
      EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
    } else {
      button.focus();
      EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
    }
    await closed;

    Assert.ok(!dialog.open, "Close should dismiss the edited dialog.");
    Assert.equal(dialog.draft, null, "Close should discard the draft.");
    Assert.equal(dialog.mode, null, "Close should clear the edit session.");
    Assert.equal(
      (await calendar.getItem(original.id)).title,
      "Before Close",
      "Close should leave the stored event unchanged."
    );
    Assert.equal(
      doc.activeElement,
      opener,
      "Close should restore opener focus."
    );
  }
});

add_task(async function test_onlySaveButtonInvokesSave() {
  const original = await createEvent({ calendar, name: "Before Clicks" });
  const realSave = dialog.save;
  registerCleanupFunction(() => {
    dialog.save = realSave;
  });
  let calls = 0;
  dialog.save = () => {
    calls++;
    return Promise.resolve({ status: "unavailable" });
  };
  await edit(original);
  dialog.updateDraftSection("title", { title: "After Save" });

  // The empty body has no pointer target. Check its Save routing directly.
  for (const selector of [
    ".calendar-selector",
    ".calendar-event-create-edit-dialog-body",
  ]) {
    const target = dialog.querySelector(selector);
    Assert.ok(target, `${selector} should exist in the dialog.`);
    dialog.handleEvent({ type: "click", target });

    Assert.equal(calls, 0, `${selector} clicks should not invoke Save.`);
  }

  Assert.ok(dialog.open, "Unrelated clicks should leave the dialog open.");
  Assert.equal(
    dialog.draft.title,
    "After Save",
    "Clicks should retain the draft."
  );

  const button = dialog.querySelector(".calendar-event-save");
  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);

  Assert.equal(calls, 1, "A Save button click should invoke Save once.");

  dialog.save = realSave;

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Before Clicks",
    "The simulated Save should leave storage unchanged."
  );

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
  await closed;

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "After Save",
    "The Save button should commit the edited draft."
  );
});

add_task(async function test_invalidActiveFieldsBlockSave() {
  const original = await createEvent({ calendar, name: "Before validation" });
  const realTransaction = transaction;
  registerCleanupFunction(() => {
    transaction = realTransaction;
  });
  let transactions = 0;
  transaction = (...args) => {
    transactions++;
    return realTransaction(...args);
  };
  await edit(original);
  dialog.updateDraftSection("title", { title: "Retained title" });
  const sessionKey = dialog.calendarEventSessionKey;
  const button = dialog.querySelector(".calendar-event-save");
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "setSectionValidity",
    {
      sessionKey,
      section: "title",
      validity: { valid: false },
    }
  );

  Assert.ok(!dialog.canSave, "An invalid title should block Save.");
  Assert.ok(
    button.disabled,
    "An invalid title should disable the Save button."
  );

  // A disabled button ignores click(). Pointer events reach the footer instead.
  button.click();

  Assert.equal(
    (await dialog.save()).status,
    "unavailable",
    "Direct Save should reject an invalid title."
  );
  Assert.equal(transactions, 0, "Invalid Save should not start a transaction.");
  Assert.ok(dialog.open, "Rejected Save should leave the dialog open.");
  Assert.equal(
    dialog.draft.title,
    "Retained title",
    "Rejected Save should retain the edited title."
  );
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Before validation",
    "Rejected Save should leave the stored title unchanged."
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "setSectionValidity",
    {
      sessionKey,
      section: "title",
      validity: { valid: true },
    }
  );

  Assert.ok(dialog.canSave, "A valid title should permit Save.");
  Assert.ok(!button.disabled, "A valid title should enable the Save button.");

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "initializeFields",
    {
      sessionKey,
      defaults: { enabledRows: { location: true }, location: "Retained room" },
    }
  );
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "setSectionValidity",
    {
      sessionKey,
      section: "location",
      validity: { valid: false },
    }
  );
  for (const enabled of [true, false, true]) {
    dialog.updateDraftSection("location", {
      enabledRows: { location: enabled },
      location: "Retained room",
    });

    Assert.equal(
      dialog.canSave,
      !enabled,
      "An invalid row should permit Save only while disabled."
    );
    Assert.equal(
      button.disabled,
      enabled,
      "An invalid active row should disable the Save button."
    );

    if (enabled) {
      Assert.equal(
        (await dialog.save()).status,
        "unavailable",
        "An invalid enabled row should block direct Save."
      );
    }
  }

  Assert.equal(
    transactions,
    0,
    "Rejected row edits should not start transactions."
  );
  Assert.equal(
    dialog.draft.location,
    "Retained room",
    "Row changes should retain the draft value."
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "setSectionValidity",
    {
      sessionKey,
      section: "location",
      validity: { valid: true },
    }
  );

  Assert.ok(
    !button.disabled,
    "Valid active fields should enable Save for retry."
  );

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
  await closed;

  Assert.equal(transactions, 1, "Retry should start one transaction.");
  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Retained title",
    "Retry should save the retained title."
  );

  transaction = realTransaction;
});

add_task(async function test_keyboardSaveClearsStateAndUpdatesCalendar() {
  const original = await createEvent({ calendar, name: "Before Save" });
  const opener = doc.getElementById("menuCreate");
  opener.focus();
  await edit(original);

  Assert.equal(
    dialog.draft.title,
    "Before Save",
    "The draft should contain the stored title."
  );

  dialog.updateDraftSection("title", { title: "After Save" });

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Before Save",
    "The stored title should remain unchanged before Save."
  );

  const button = dialog.querySelector(".calendar-event-save");
  const select = dialog.querySelector(".calendar-selector");
  const moreButton = dialog.querySelector(
    "#calendarEventCreateEditDialogMenuButton"
  );
  const closeButton = dialog.querySelector(".close-button");
  const titleInput = dialog.querySelector(".event-title-input");
  const descriptionRow = dialog.querySelector("#descriptionNavigationRow");

  Assert.ok(titleInput, "The dialog should have a title input.");
  Assert.ok(descriptionRow, "The dialog should have a Description row.");
  Assert.ok(
    descriptionRow.shadowRoot,
    "The Description row should have a shadow root."
  );
  const descriptionButton = descriptionRow.shadowRoot.querySelector("button");

  Assert.ok(
    descriptionButton,
    "The Description row should have an action button."
  );
  Assert.ok(!button.disabled, "The Save button should be enabled.");
  Assert.ok(moreButton, "The More button should exist.");
  Assert.ok(
    BrowserTestUtils.isVisible(moreButton),
    "The More menu button should be visible for an edited event."
  );

  // Follow the actual control order in both directions before activating Save.
  // The header places More before Close.
  select.focus();

  const tabSteps = [
    [{}, moreButton, "Tab should reach More."],
    [{}, closeButton, "Tab should reach Close."],
    [{}, titleInput, "Tab should reach the title."],
    [{}, descriptionRow, "Tab should reach Description."],
    [{}, button, "Tab should reach Save."],
    [
      { shiftKey: true },
      descriptionRow,
      "Shift+Tab should return to Description.",
    ],
    [{ shiftKey: true }, titleInput, "Shift+Tab should return to the title."],
    [{ shiftKey: true }, closeButton, "Shift+Tab should return to Close."],
    [{ shiftKey: true }, moreButton, "Shift+Tab should return to More."],
    [
      { shiftKey: true },
      select,
      "Shift+Tab should return to the calendar selector.",
    ],
    [{}, moreButton, "Tab should reach More again."],
    [{}, closeButton, "Tab should reach Close again."],
    [{}, titleInput, "Tab should reach the title again."],
    [{}, descriptionRow, "Tab should reach Description again."],
    [{}, button, "Tab should reach Save again."],
  ];

  for (const [modifiers, expected, message] of tabSteps) {
    EventUtils.synthesizeKey("KEY_Tab", modifiers, browser.contentWindow);

    Assert.equal(doc.activeElement, expected, message);

    // The document reports the row when its shadow button has focus.
    if (expected === descriptionRow) {
      Assert.equal(
        descriptionRow.shadowRoot.activeElement,
        descriptionButton,
        "Tab should focus the shared Description action."
      );
    }
  }

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;
  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(button)),
    "The Save button should appear in the accessibility tree."
  );

  Assert.equal(
    doc.l10n.getAttributes(button).id,
    "calendar-event-save",
    "The Save button should use the localized name."
  );
  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_PUSHBUTTON,
    "Save should have the push button role."
  );

  const closed = BrowserTestUtils.waitForEvent(dialog, "close");

  Assert.equal(
    doc.activeElement,
    button,
    "Save should have focus before Enter."
  );

  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await closed;

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "After Save",
    "Enter on Save should store the edited title."
  );
  Assert.equal(dialog.draft, null, "Save should clear the draft.");
  Assert.equal(
    doc.activeElement,
    opener,
    "Closing should restore focus to the opener."
  );
  Assert.equal(dialog.mode, null, "Save should clear the edit session.");
  Assert.ok(
    !dialog.hasAttribute("event-id"),
    "Save should clear the event ID."
  );
  Assert.ok(
    !dialog.hasAttribute("calendar-id"),
    "Save should clear the calendar ID."
  );
  Assert.ok(
    !dialog.hasAttribute("recurrence-id"),
    "Save should clear the occurrence ID."
  );

  await CalTransactionManager.getInstance().undo();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Before Save",
    "Undo should restore the original title."
  );

  await CalTransactionManager.getInstance().redo();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "After Save",
    "Redo should restore the edited title."
  );
});

add_task(
  async function test_pendingSaveLocksRouteAndFailureKeepsFocusAndDraft() {
    // Pause a write that will fail. Check route changes, focus, and closing
    // while Save is pending. Then fail the write and check that retry succeeds.
    const eventA = await createEvent({ calendar, name: "A" });
    const eventB = await createEvent({ calendar, name: "B" });
    await edit(eventA);
    dialog.updateDraftSection("title", { title: "A edited" });
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    const realTransaction = transaction;
    let calls = 0;
    transaction = async () => {
      calls++;
      started.resolve();
      await finish.promise;
      throw new Error("Save failed");
    };
    registerCleanupFunction(() => {
      transaction = realTransaction;
      finish.resolve();
    });
    const button = dialog.querySelector(".calendar-event-save");
    button.focus();
    const pending = dialog.save();
    await started.promise;

    Assert.ok(button.disabled, "Save should be disabled while pending.");

    const service = Cc["@mozilla.org/accessibilityService;1"].getService(
      Ci.nsIAccessibilityService
    );
    let accessible;
    await TestUtils.waitForCondition(() => {
      accessible = service.getAccessibleFor(button);
      if (!accessible) {
        return false;
      }
      const current = {};
      accessible.getState(current, {});
      return current.value & Ci.nsIAccessibleStates.STATE_UNAVAILABLE;
    }, "Speech users receive the unavailable Save state");

    Assert.equal(
      doc.activeElement,
      dialog,
      "Disabling Save should retain focus in the dialog."
    );

    const body = dialog.querySelector(
      ".calendar-event-create-edit-dialog-body"
    );

    Assert.equal(
      body.getAttribute("aria-busy"),
      "true",
      "The dialog body should report that Save is busy."
    );
    Assert.equal(
      (await dialog.save()).status,
      "unavailable",
      "A duplicate dialog Save should return unavailable."
    );
    Assert.equal(
      calls,
      1,
      "A duplicate Save should start no second transaction."
    );

    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: eventB.id,
    });
    dialog.setAttribute("event-id", eventB.id);

    Assert.equal(
      dialog.getAttribute("event-id"),
      eventA.id,
      "Pending Save should reject route and attribute switches."
    );

    dialog.close();

    Assert.ok(dialog.open, "Closing should wait for Save to finish.");

    await doc.l10n.translateFragment(dialog);
    finish.resolve();

    Assert.equal(
      (await pending).status,
      "error",
      "The failed transaction should produce an error result."
    );
    Assert.ok(dialog.open, "The dialog should remain open after Save fails.");
    Assert.equal(
      dialog.draft.title,
      "A edited",
      "The failed Save should retain the edited draft title."
    );
    Assert.equal(
      (await calendar.getItem(eventA.id)).title,
      "A",
      "The failed Save should preserve the stored event title."
    );
    Assert.equal(
      body.getAttribute("aria-busy"),
      "false",
      "The dialog body should stop reporting busy after failure."
    );
    Assert.ok(
      !button.disabled,
      "Failure should make Save available for retry."
    );

    const message = dialog.querySelector(".calendar-event-save-status");
    const messageText = dialog.querySelector(
      ".calendar-event-save-status-text"
    );

    Assert.ok(messageText, "The Save status text element should exist.");

    Assert.equal(
      message.getAttribute("role"),
      "status",
      "The message element should have the status role."
    );
    Assert.equal(
      message.getAttribute("aria-live"),
      "polite",
      "The status message should request polite announcements."
    );

    let statusAccessible;
    await TestUtils.waitForCondition(
      () => (statusAccessible = service.getAccessibleFor(message))
    );

    Assert.equal(
      statusAccessible.role,
      Ci.nsIAccessibleRole.ROLE_STATUSBAR,
      "The accessibility tree should expose the message as a status bar."
    );
    Assert.equal(
      statusAccessible.attributes.getStringProperty("live"),
      "polite",
      "Screen readers should receive polite status announcements."
    );

    Assert.equal(
      doc.l10n.getAttributes(messageText).id,
      "calendar-event-save-failed",
      "The status text should use the localized Save failure text."
    );

    await doc.l10n.translateFragment(dialog);

    transaction = realTransaction;
    button.focus();
    const closed = BrowserTestUtils.waitForEvent(dialog, "close");
    EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
    await closed;

    Assert.equal(
      (await calendar.getItem(eventA.id)).title,
      "A edited",
      "A successful retry should store the retained draft title."
    );
  }
);

add_task(async function test_cancelAndMoveNotifications() {
  const original = await createEvent({ calendar, name: "Unchanged" });
  await edit(original);
  dialog.updateDraftSection("title", { title: "Discarded" });
  dialog.close();

  Assert.equal(
    (await calendar.getItem(original.id)).title,
    "Unchanged",
    "Closing without Save should preserve the stored title."
  );

  await edit(original);
  dialog.updateDraftSection("calendar", { calendarId: otherCalendar.id });
  const realTransaction = transaction;
  let responseMode;
  transaction = (event, oldEvent, response) => {
    responseMode = response.responseMode;
    return realTransaction(event, oldEvent, response);
  };
  registerCleanupFunction(() => {
    transaction = realTransaction;
  });

  Assert.equal(
    (await dialog.save()).status,
    "success",
    "Saving the calendar move should succeed."
  );

  transaction = realTransaction;

  Assert.equal(
    responseMode,
    Ci.calIItipItem.AUTO,
    "Save should use the existing notification path."
  );
  Assert.equal(
    await calendar.getItem(original.id),
    null,
    "The completed move should remove the source item."
  );
  Assert.ok(
    await otherCalendar.getItem(original.id),
    "The completed move should create the destination copy."
  );

  await CalTransactionManager.getInstance().undo();

  Assert.ok(
    await calendar.getItem(original.id),
    "Undo should restore the source item."
  );
  Assert.equal(
    await otherCalendar.getItem(original.id),
    null,
    "Undo should remove the destination copy."
  );

  await CalTransactionManager.getInstance().redo();

  Assert.ok(
    await otherCalendar.getItem(original.id),
    "Redo should restore the destination copy."
  );
});

add_task(async function test_occurrenceRouteLoadsBeforeSave() {
  const parent = await createEvent({
    calendar,
    repeats: true,
    name: "Repeating",
  });
  const recurrenceId = parent.startDate.clone();
  recurrenceId.addDuration(cal.createDuration("P1D"));
  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: parent.id,
    recurrenceId: String(recurrenceId.nativeTime),
  });

  Assert.equal(
    (await dialog.save()).status,
    "unavailable",
    "Save should not use the previous draft during loading."
  );
  Assert.ok(
    await dialog.show(),
    "The requested occurrence should open in the dialog."
  );
  Assert.equal(
    dialog.draft.start.nativeTime,
    String(recurrenceId.nativeTime),
    "The draft should contain the requested occurrence date."
  );

  dialog.updateDraftSection("title", { title: "Only this occurrence" });

  Assert.equal(
    (await dialog.save()).status,
    "success",
    "Saving the requested occurrence should succeed."
  );

  const stored = await calendar.getItem(parent.id);

  Assert.equal(
    stored.title,
    "Repeating",
    "Editing one occurrence should preserve the parent title."
  );
  Assert.equal(
    stored.recurrenceInfo.getOccurrenceFor(recurrenceId).title,
    "Only this occurrence",
    "The selected occurrence should contain its edited title."
  );
});

add_task(async function test_saveUpdatesRenderedCalendarView() {
  const date = new Date(todayDate);
  date.setHours(13);
  const original = await createEvent({
    calendar,
    baseDate: date,
    name: "Rendered before",
  });
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(
    window,
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
  const view = document.getElementById("week-view");
  const findEvent = () =>
    Array.from(view.querySelectorAll("calendar-event-box")).find(
      box => box.occurrence?.id == original.id
    );
  await TestUtils.waitForCondition(
    () => findEvent()?.eventNameLabel.textContent.includes("Rendered before"),
    "The original event is rendered in Calendar"
  );
  await window.showCalendarEventCreateEditDialog(original);
  const productDialog = document.getElementById(
    "calendarEventCreateEditDialog"
  );

  Assert.ok(productDialog.open, "The dialog should be open.");

  registerCleanupFunction(() => {
    productDialog.close();
    productDialog.remove();
  });
  productDialog.updateDraftSection("title", { title: "Rendered after" });
  const changed = BrowserTestUtils.waitForMutationCondition(
    view,
    { childList: true, subtree: true, characterData: true },
    () => findEvent()?.eventNameLabel.textContent.includes("Rendered after")
  );

  Assert.equal(
    (await productDialog.save()).status,
    "success",
    "Save in the dialog should succeed."
  );

  await changed;

  Assert.ok(
    findEvent().eventNameLabel.textContent.includes("Rendered after"),
    "Save should update the visible Calendar event."
  );
  Assert.ok(
    !productDialog.open,
    "The dialog should close after Save succeeds."
  );
  Assert.equal(
    productDialog.draft,
    null,
    "The dialog should clear its saved draft."
  );

  await calendar.deleteItem(await calendar.getItem(original.id));
});

add_task(async function test_separateDocumentsSaveAfterCalendarMove() {
  // Each fixture document has a separate Redux store for its draft. The shared
  // system module must still order their saves. After the first Save moves the
  // event, the second document must reload it from the destination calendar.
  const original = await createEvent({ calendar, name: "Shared source" });
  await edit(original);
  dialog.updateDraftSection("title", { title: "Moved event" });
  dialog.updateDraftSection("calendar", { calendarId: otherCalendar.id });
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", {
    duplicate: true,
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  registerCleanupFunction(() => {
    tabmail.closeTab(tab);
  });
  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  const secondWindow = tab.browser.contentWindow;
  const second = secondWindow.document.querySelector(
    '[is="calendar-event-create-edit-dialog"]'
  );

  Assert.notEqual(
    second,
    dialog,
    "The test should use separate dialog documents."
  );

  secondWindow.promptOccurrenceModification = event => [event];
  const realTransaction = transaction;
  second.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: original.id,
  });

  Assert.ok(
    await second.show(),
    "The second document should open its own edit dialog."
  );

  second.updateDraftSection("title", { title: "Older window" });
  second.updateDraftSection("calendar", { calendarId: otherCalendar.id });
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const olderStarted = Promise.withResolvers();
  const finishOlder = Promise.withResolvers();
  let olderFinished = false;
  secondWindow.doTransaction = async (
    action,
    event,
    selected,
    oldEvent,
    listener,
    response
  ) => {
    olderStarted.resolve();
    await finishOlder.promise;
    await realTransaction(event, oldEvent, response);
    olderFinished = true;
  };
  transaction = async (event, oldEvent, response) => {
    started.resolve();
    await finish.promise;
    return realTransaction(event, oldEvent, response);
  };
  registerCleanupFunction(() => {
    transaction = realTransaction;
    finish.resolve();
    finishOlder.resolve();
  });
  const firstSave = dialog.save();

  Assert.equal(
    await Promise.race([
      started.promise.then(() => "started"),
      firstSave.then(result => result.status),
    ]),
    "started",
    "The first Save should reach its transaction."
  );

  const secondSave = second.save();
  finish.resolve();

  Assert.equal(
    (await firstSave).status,
    "success",
    "The first document's calendar move should succeed."
  );

  let newestSave;
  try {
    Assert.equal(
      await Promise.race([
        olderStarted.promise.then(() => "started"),
        secondSave.then(result => result.status),
      ]),
      "started",
      "The older Save should reach its transaction after the move."
    );

    transaction = realTransaction;
    const moved = await otherCalendar.getItem(original.id);

    Assert.equal(
      moved.title,
      "Moved event",
      "The destination should contain the title from the first move."
    );

    const firstTab = tabmail.tabInfo.find(info => info.browser === browser);
    tabmail.switchToTab(firstTab);
    await SimpleTest.promiseFocus(browser);
    await edit(moved);
    dialog.updateDraftSection("title", { title: "Newest window" });
    let newestStarted = false;
    transaction = (event, oldEvent, response) => {
      newestStarted = true;

      Assert.ok(
        olderFinished,
        "The destination editor should wait for the older Save."
      );

      return realTransaction(event, oldEvent, response);
    };
    newestSave = dialog.save();
    await TestUtils.waitForTick();

    Assert.ok(
      !newestStarted,
      "Both calendar IDs should share the pending queue."
    );
  } finally {
    finishOlder.resolve();

    Assert.equal(
      (await secondSave).status,
      "success",
      "The second document's queued Save should succeed."
    );

    if (newestSave) {
      Assert.equal(
        (await newestSave).status,
        "success",
        "The newest Save should succeed after the second document finishes."
      );
    }
    transaction = realTransaction;
  }

  Assert.equal(
    (await otherCalendar.getItem(original.id)).title,
    "Newest window",
    "Separate stores should share the transaction order."
  );
  Assert.ok(
    !second.open,
    "The second document's dialog should close after Save succeeds."
  );
  Assert.equal(
    second.draft,
    null,
    "The second document should clear its saved draft."
  );
  Assert.ok(
    !dialog.open,
    "The first document's dialog should close after its newest Save."
  );
  Assert.equal(
    dialog.draft,
    null,
    "The first document should clear its saved draft."
  );
  Assert.equal(
    await calendar.getItem(original.id),
    null,
    "Queued edits should leave the moved event out of the source calendar."
  );
});

add_task(async function test_pendingStatusHasNoBusyAncestor() {
  // Keep Save pending while inspecting the live status. A busy ancestor would
  // delay its progress announcement until after the operation completes.
  const original = await createEvent({ calendar, name: "Pending status" });
  await edit(original);
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const realTransaction = transaction;
  transaction = async () => {
    started.resolve();
    await finish.promise;
    throw new Error("Save failed");
  };
  const pending = dialog.save();
  try {
    await started.promise;
    await doc.l10n.translateFragment(dialog);
    const message = dialog.querySelector(".calendar-event-save-status");

    Assert.ok(message, "The dialog should have a Save status message.");
    Assert.equal(
      message.closest('[aria-busy="true"]'),
      null,
      "Progress announcements should remain outside the busy fields."
    );

    const service = Cc["@mozilla.org/accessibilityService;1"].getService(
      Ci.nsIAccessibilityService
    );
    let accessible;
    await TestUtils.waitForCondition(
      () => (accessible = service.getAccessibleFor(message))
    );

    Assert.equal(
      accessible.attributes.getStringProperty("live"),
      "polite",
      "The accessibility tree should expose polite status announcements."
    );

    const attributes = [...accessible.attributes.enumerate()].map(property =>
      property.QueryInterface(Ci.nsIPropertyElement)
    );

    Assert.ok(
      !attributes.some(
        property => property.key == "container-busy" && property.value == "true"
      ),
      "Speech users should receive the Saving announcement before Save finishes."
    );
    Assert.equal(
      doc.l10n.getAttributes(
        dialog.querySelector(".calendar-event-save-status-text")
      ).id,
      "calendar-event-saving",
      "The pending status should use the localized Save progress message."
    );
  } finally {
    finish.resolve();
    await pending;
    transaction = realTransaction;
    dialog.close();
  }
});

add_task(async function test_escapeDismissesReadyAndFailedButNotPending() {
  // Exercise native dismissal for a ready edit and after a failed Save.
  // During the pending operation, Escape must leave the same draft open.
  const original = await createEvent({ calendar, name: "Escape" });
  const opener = doc.getElementById("menuCreate");
  const realTransaction = transaction;
  for (const fail of [false, true]) {
    opener.focus();
    await edit(original);
    try {
      dialog.updateDraftSection("title", { title: "Discarded by Escape" });
      if (fail) {
        const started = Promise.withResolvers();
        const finish = Promise.withResolvers();
        transaction = async () => {
          started.resolve();
          await finish.promise;
          throw new Error("Save failed");
        };
        const pending = dialog.save();
        try {
          await started.promise;

          Assert.equal(
            dialog.closedBy,
            "none",
            "Pending Save should disable native close requests."
          );

          const returnValue = dialog.returnValue;
          dialog.requestClose("ignored");

          Assert.ok(
            dialog.open,
            "A native close request should wait for pending Save."
          );
          Assert.equal(
            dialog.returnValue,
            returnValue,
            "Pending Save should preserve the dialog result."
          );

          dialog.focus();
          EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
          await TestUtils.waitForTick();

          Assert.ok(dialog.open, "Escape should keep a pending Save open.");
        } finally {
          finish.resolve();

          Assert.equal(
            (await pending).status,
            "error",
            "The pending transaction should report the simulated failure."
          );

          transaction = realTransaction;
        }
      }

      Assert.equal(
        dialog.closedBy,
        "closerequest",
        "Ready and failed edits should allow native close requests."
      );

      dialog.querySelector(".calendar-event-save").focus();
      EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
      await TestUtils.waitForTick();

      Assert.ok(!dialog.open, "Escape should dismiss ready and failed edits.");
      Assert.equal(
        doc.activeElement,
        opener,
        "Escape should return focus to the opener."
      );
      Assert.equal(dialog.draft, null, "Escape should discard the draft.");
      Assert.equal(
        (await calendar.getItem(original.id)).title,
        "Escape",
        "Escape should preserve the stored event title."
      );
    } finally {
      transaction = realTransaction;
      dialog.close();
    }
  }
});

add_task(async function test_nativeCloseRequestsKeepReturnValues() {
  const original = await createEvent({ calendar, name: "Native close" });
  await edit(original);
  const closed = BrowserTestUtils.waitForEvent(dialog, "close");
  dialog.requestClose("cancel");
  await closed;

  Assert.equal(
    dialog.returnValue,
    "cancel",
    "Native close requests should keep the caller's return value."
  );
  Assert.equal(
    dialog.draft,
    null,
    "Native close requests should clear the draft."
  );

  await edit(original);
  const closedAgain = BrowserTestUtils.waitForEvent(dialog, "close");
  dialog.requestClose();
  await closedAgain;

  Assert.equal(
    dialog.returnValue,
    "cancel",
    "An omitted result should preserve the prior return value."
  );
});
