/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests saving categories with the dialog's keyboard controls. Writes use
 * Calendar transactions and a calendar stored in memory. The failure test
 * pauses a write, reports an error, then retries through a real transaction.
 *
 * Checks focus, accessible names and roles, and runs the axe accessibility
 * checker.
 */

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let doc;
let dialog;
let calendar;
let transaction;
/**
 * The pending Save from the test document. Cleanup waits for Save before
 * closing the tab that owns the store and controls.
 *
 * @type {Promise<{status: string}>|null}
 */
let pendingSave = null;
/**
 * Resumes the paused write so it can report the simulated calendar failure.
 *
 * @type {(() => void)|null}
 */
let releasePendingSave = null;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  let tab = null;

  await SpecialPowers.pushPrefEnv({
    set: [["calendar.categories.names", "Work,Personal,Team"]],
  });

  calendar = createCalendar({ type: "memory" });
  calendar.setProperty("calendar-main-in-composite", true);
  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');

  Assert.ok(dialog, "The fixture should contain the create/edit dialog.");

  dialog.style.inlineSize = "600px";
  dialog.style.blockSize = "480px";
  cal.view.getCompositeCalendar(browser.contentWindow).defaultCalendar =
    calendar;
  browser.contentWindow.promptOccurrenceModification = event => [event];
  // Tests can replace transaction to pause or fail a write from the dialog.
  transaction = (...args) => window.doTransaction(...args);
  browser.contentWindow.doTransaction = (...args) => transaction(...args);

  // The fixture has no title or date controls. Supply their Save helpers and
  // keep the production category helper.
  Object.assign(dialog.saveFields, {
    title: {
      keys: ["title"],
      apply: (event, values) => {
        event.title = values.title;
      },
    },
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
  });

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Category Save states should pass accessibility checks.",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(async () => {
    releasePendingSave?.();
    await pendingSave;

    dialog?.close();

    if (tab) {
      tabmail.closeTab(tab);
    }

    if (calendar) {
      CalendarTestUtils.removeCalendar(calendar);
    }
  });
});

/**
 * Opens the dialog for a saved event or a new event with test values.
 * Focuses the opener so closing the dialog can restore focus to that button.
 *
 * @param {?calIEvent} [event=null] - The event to edit, or null to create one.
 * @returns {Promise<void>} Resolves after the dialog opens and its text is
 *   translated.
 */
async function show(event = null) {
  dialog.setCalendarEventRoute(
    event ? { calendarId: calendar.id, eventId: event.id } : {}
  );
  const opener = doc.getElementById("menuCreate");

  Assert.ok(opener, "The fixture should contain the dialog opener.");

  opener.focus();

  Assert.ok(await dialog.show(), "The category Save dialog should open.");

  if (!event) {
    dialog.resetCreateDraft({
      calendarId: calendar.id,
      categories: [],
      title: "Created with categories",
      start: {
        icalString: "20261021T100000Z",
        timezoneId: "UTC",
        isDate: false,
      },
      end: { icalString: "20261021T110000Z", timezoneId: "UTC", isDate: false },
    });
  }

  await doc.l10n.translateFragment(dialog);
}

/**
 * Selects a category with Space, waits for its chip, then closes the popup
 * with Escape. The chip is the label shown for a selected category.
 *
 * @param {string} name - An available category name that is not yet selected.
 * @returns {Promise<void>} Resolves after the chip appears and the category
 *   choices close.
 */
async function chooseCategory(name) {
  const add = dialog.querySelector(".calendar-event-add-category");

  Assert.ok(add, "The category row should contain its Add button.");

  add.click();
  const choice = [
    ...dialog.querySelectorAll(".calendar-event-category-choices input"),
  ].find(input => input.dataset.category == name);

  Assert.ok(choice, "The category popup should contain the requested choice.");

  const selected = BrowserTestUtils.waitForMutationCondition(
    dialog,
    { childList: true, subtree: true },
    () =>
      [...dialog.querySelectorAll(".calendar-event-category-label")].some(
        label => label.textContent == name
      )
  );

  choice.focus();
  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
  await selected;

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
}

/**
 * Activates Save with Enter and checks that focus returns to the opener.
 *
 * @returns {Promise<void>} Resolves after successful Save closes the dialog
 *   and the focus and draft checks pass.
 */
async function keyboardSave() {
  const button = dialog.querySelector(".calendar-event-save");
  const closed = BrowserTestUtils.waitForEvent(dialog, "close");

  Assert.ok(button, "The dialog should contain the Save button.");
  Assert.ok(!button.disabled, "The Save button should be available.");

  button.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await closed;

  Assert.equal(
    doc.activeElement,
    doc.getElementById("menuCreate"),
    "Successful Save should restore opener focus."
  );
  Assert.equal(
    dialog.draft,
    null,
    "Successful Save should clear the category draft."
  );
}

add_task(async function test_keyboardSaveCreatesAndEditsCategories() {
  await show();
  await chooseCategory("Work");
  await chooseCategory("Team");
  await keyboardSave();
  const [original] = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
    0,
    null,
    null
  );

  Assert.ok(
    original,
    "Create Save should store the new event in the calendar."
  );
  Assert.deepEqual(
    original.getCategories(),
    ["Work", "Team"],
    "Create Save should persist the selected categories."
  );

  await show(original);
  await chooseCategory("Personal");

  Assert.deepEqual(
    (await calendar.getItem(original.id)).getCategories(),
    ["Work", "Team"],
    "Category controls should change only the draft before Save."
  );

  await keyboardSave();

  Assert.deepEqual(
    (await calendar.getItem(original.id)).getCategories(),
    ["Work", "Team", "Personal"],
    "Edit Save should persist the latest category draft."
  );
});

add_task(async function test_cancelAndCloseDiscardCategories() {
  const original = await createEvent({
    calendar,
    categories: ["Work"],
    name: "Unchanged",
  });

  for (const action of ["cancel-save", "close", "escape"]) {
    await show(original);
    await chooseCategory("Personal");

    if (action == "cancel-save") {
      const prompt = browser.contentWindow.promptOccurrenceModification;
      registerCleanupFunction(() => {
        if (browser.contentWindow) {
          browser.contentWindow.promptOccurrenceModification = prompt;
        }
      });
      // Cancel the choice between one occurrence and the whole series.
      browser.contentWindow.promptOccurrenceModification = () => [null];

      Assert.equal(
        (await dialog.save()).status,
        "cancelled",
        "Cancelling the occurrence prompt should cancel Save."
      );
      Assert.deepEqual(
        dialog.draft.categories,
        ["Work", "Personal"],
        "Cancelled Save should retain the category draft."
      );

      browser.contentWindow.promptOccurrenceModification = prompt;
    }

    const closed = BrowserTestUtils.waitForEvent(dialog, "close");

    if (action == "escape") {
      EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
    } else {
      const close = dialog.querySelector(".close-button");

      Assert.ok(close, "The dialog should contain the Close button.");

      close.focus();
      EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
    }

    await closed;

    Assert.deepEqual(
      (await calendar.getItem(original.id)).getCategories(),
      ["Work"],
      "Cancel or close should preserve saved categories."
    );
    Assert.equal(
      dialog.draft,
      null,
      "Closing should discard the unsaved category draft."
    );
  }
});

add_task(async function test_pendingFailureAndKeyboardRetry() {
  const original = await createEvent({
    calendar,
    categories: ["Work"],
    name: "Retry categories",
  });
  const other = await createEvent({
    calendar,
    categories: ["Team"],
    name: "Other event",
  });
  await show(original);
  await chooseCategory("Personal");
  // Pause the write so the test can try another Save, a route change, and
  // closing the dialog before the write fails.
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const realTransaction = transaction;
  let calls = 0;
  releasePendingSave = finish.resolve;

  registerCleanupFunction(() => {
    transaction = realTransaction;
  });

  transaction = async () => {
    calls++;
    started.resolve();
    await finish.promise;
    throw new Error("Provider failed");
  };

  const button = dialog.querySelector(".calendar-event-save");

  Assert.ok(button, "The dialog should contain the Save button.");

  button.focus();
  const pending = dialog.save();
  pendingSave = pending;
  await started.promise;

  Assert.ok(button.disabled, "Pending Save should disable the Save button.");
  Assert.equal(
    doc.activeElement,
    dialog,
    "Pending Save should move focus to the dialog."
  );
  Assert.equal(
    (await dialog.save()).status,
    "unavailable",
    "Pending Save should reject a duplicate request."
  );
  Assert.equal(calls, 1, "A duplicate request should start no transaction.");

  dialog.setCalendarEventRoute({ calendarId: calendar.id, eventId: other.id });
  dialog.close();

  Assert.ok(dialog.open, "Pending Save should prevent closing the dialog.");
  Assert.equal(
    dialog.getAttribute("event-id"),
    original.id,
    "Pending Save should retain its original event route."
  );

  await doc.l10n.translateFragment(dialog);
  finish.resolve();

  Assert.equal(
    (await pending).status,
    "error",
    "A provider failure should report an error."
  );
  Assert.deepEqual(
    dialog.draft.categories,
    ["Work", "Personal"],
    "Failure should retain selected categories for retry."
  );
  Assert.deepEqual(
    (await calendar.getItem(original.id)).getCategories(),
    ["Work"],
    "Failed Save should preserve saved categories."
  );
  Assert.deepEqual(
    (await calendar.getItem(other.id)).getCategories(),
    ["Team"],
    "Pending work should leave other events unchanged."
  );

  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const status = dialog.querySelector(".calendar-event-save-status");
  const text = dialog.querySelector(".calendar-event-save-status-text");

  Assert.ok(body, "The dialog should contain its busy-state container.");
  Assert.ok(status, "The dialog should contain the Save status region.");
  Assert.ok(text, "The Save status should contain localized text.");

  Assert.equal(
    body.getAttribute("aria-busy"),
    "false",
    "Failure should clear the busy state."
  );
  Assert.equal(
    status.getAttribute("role"),
    "status",
    "Save feedback should use status semantics."
  );
  Assert.equal(
    status.getAttribute("aria-live"),
    "polite",
    "Save feedback should request polite screen-reader announcements."
  );
  Assert.equal(
    doc.l10n.getAttributes(text).id,
    "calendar-event-save-failed",
    "Failure should expose the localized retry message."
  );

  // Check the Save localization and native button role.
  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;

  Assert.equal(
    doc.l10n.getAttributes(button).id,
    "calendar-event-save",
    "The Save button should use the localized name."
  );

  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(button)),
    "The Save button should appear in the accessibility tree."
  );

  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_PUSHBUTTON,
    "Save should expose the push button role."
  );

  await doc.l10n.translateFragment(dialog);
  transaction = realTransaction;
  await keyboardSave();

  Assert.deepEqual(
    (await calendar.getItem(original.id)).getCategories(),
    ["Work", "Personal"],
    "Keyboard retry should persist the retained category selection."
  );
});
