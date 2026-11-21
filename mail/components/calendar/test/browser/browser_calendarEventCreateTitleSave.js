/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let doc;
let dialog;
let calendar;
let input;
let titleError;
const addedEvents = [];

add_setup(async function () {
  calendar = createCalendar({ type: "memory" });
  calendar.setProperty("calendar-main-in-composite", true);

  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  input = dialog.querySelector(".event-title-input");
  titleError = dialog.querySelector(".event-title-required");

  Assert.ok(input, "The dialog should contain the real title input.");
  Assert.ok(titleError, "The dialog should contain the title error message.");

  browser.contentWindow.doTransaction = (...args) =>
    window.doTransaction(...args);

  // Supply date conversion so the test can save an event with the real title
  // helper. Leave title validation and conversion to the dialog.
  dialog.saveFields = {
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

  const observer = {
    onAddItem: event => addedEvents.push(event),
    onDeleteItem() {},
  };

  calendar.addObserver(observer);

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Title Save states should pass accessibility checks.",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    dialog.close();
    calendar.removeObserver(observer);
    tabmail.closeTab(tab);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Opens a create draft with dates and the requested starting title.
 *
 * @param {string} [title=""] - The initial draft title.
 * @returns {Promise<void>} Resolves after the draft opens, resets, and its text
 *   is translated.
 */
async function openDraft(title = "") {
  dialog.setCalendarEventRoute();

  const opened = await dialog.show();

  Assert.ok(opened, "The create dialog should open.");

  resetCalendarEventCreateDraft(dialog, calendar, { title });

  await doc.l10n.translateFragment(dialog);
}

/**
 * Checks that the real title control displays the expected error.
 *
 * @param {string} messageId - The expected error's localization identifier.
 */
function assertTitleError(messageId) {
  Assert.ok(dialog.open, "A title error should keep the dialog open.");
  Assert.equal(
    input.ariaInvalid,
    "true",
    "The title input should report the invalid value."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(titleError),
    "The title error should be visible."
  );
  Assert.equal(
    doc.l10n.getAttributes(titleError).id,
    messageId,
    `The title error should use ${messageId}.`
  );
}

add_task(async function test_enteredTitleIsSaved() {
  await openDraft();

  const title = "  Title entered in the real input  ";
  const previousCount = addedEvents.length;

  input.focus();
  EventUtils.sendString(title, browser.contentWindow);

  const result = await dialog.save();

  Assert.equal(result.status, "success", "The entered title should save.");
  Assert.equal(
    addedEvents.length,
    previousCount + 1,
    "Save should create one event."
  );

  const saved = await calendar.getItem(addedEvents.at(-1).id);

  Assert.equal(
    saved.title,
    title,
    "The saved event should retain the exact title."
  );
  Assert.ok(!dialog.open, "Successful Save should close the dialog.");
});

add_task(async function test_requiredTitleAndRetry() {
  await openDraft();

  const previousCount = addedEvents.length;

  for (const title of ["", "   "]) {
    input.focus();
    EventUtils.sendString(title, browser.contentWindow);

    const draft = dialog.draft;
    const result = await dialog.save();

    Assert.equal(result.status, "invalid", "An empty title should block Save.");
    Assert.equal(
      addedEvents.length,
      previousCount,
      "An empty title should not create an event."
    );
    Assert.deepEqual(
      dialog.draft,
      draft,
      "A title error should retain the draft."
    );
    assertTitleError("calendar-event-title-required");

    // If Save closed the dialog, stop before typing can reach another control.
    if (!dialog.open) {
      return;
    }
  }

  input.focus();
  input.select();
  EventUtils.sendString("Corrected title", browser.contentWindow);

  Assert.ok(
    BrowserTestUtils.isHidden(titleError),
    "Correcting the title should hide the error."
  );
  Assert.equal(
    input.ariaInvalid,
    null,
    "Correcting the title should clear its invalid state."
  );

  const result = await dialog.save();

  Assert.equal(
    result.status,
    "success",
    "The corrected title should save on retry."
  );
  Assert.equal(
    addedEvents.length,
    previousCount + 1,
    "Retry should create one event."
  );
  Assert.equal(
    addedEvents.at(-1).title,
    "Corrected title",
    "Retry should save the corrected title."
  );
});

add_task(async function test_titleLengthLimit() {
  await openDraft();

  input.focus();
  EventUtils.sendString("a".repeat(200), browser.contentWindow);

  Assert.equal(
    input.value.length,
    180,
    "Typing should stop at 180 characters."
  );

  const title = input.value;
  const result = await dialog.save();

  Assert.equal(result.status, "success", "A 180-character title should save.");
  Assert.equal(
    addedEvents.at(-1).title,
    title,
    "Save should retain all 180 title characters."
  );
});

add_task(async function test_loadedAndEditedLongTitle() {
  const title = "a".repeat(200);

  await openDraft(title);

  Assert.ok(
    !input.validity.tooLong,
    "An unchanged loaded title should pass the native length check."
  );

  const saved = await dialog.save();

  Assert.equal(
    saved.status,
    "success",
    "An unchanged loaded long title should save."
  );
  Assert.equal(
    addedEvents.at(-1).title,
    title,
    "Save should preserve an unchanged loaded long title."
  );

  await openDraft(title);

  const previousCount = addedEvents.length;

  input.focus();
  input.setSelectionRange(title.length, title.length);
  EventUtils.synthesizeKey("KEY_Backspace", {}, browser.contentWindow);

  Assert.equal(
    input.value,
    title.slice(0, -1),
    "Backspace should remove the last character from the loaded title."
  );
  Assert.ok(
    input.validity.tooLong,
    "Editing a title over 180 characters should fail the native length check."
  );

  const draft = dialog.draft;
  const result = await dialog.save();

  Assert.equal(
    result.status,
    "invalid",
    "An edited long title should block Save."
  );
  Assert.equal(
    addedEvents.length,
    previousCount,
    "An edited long title should not create an event."
  );
  Assert.deepEqual(
    dialog.draft,
    draft,
    "A length error should retain the draft."
  );
  assertTitleError("calendar-event-title-too-long");

  dialog.close();
});
