/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let createReminderForm;

add_setup(async () => {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogCreateReminderForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialogCreateReminderForm.xhtml")
  );
  tab.browser.focus();
  createReminderForm = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-create-reminder-form"
  );
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(function test_toggleFormVisibility() {
  const addButton = createReminderForm.querySelector(".add-reminder-button");
  const form = createReminderForm.querySelector("form");
  const deleteButton = form.querySelector(".delete-button");

  Assert.ok(BrowserTestUtils.isHidden(form), "Form should initially be hidden");
  Assert.ok(
    BrowserTestUtils.isVisible(addButton),
    "Add button should initially be visible"
  );

  EventUtils.synthesizeMouseAtCenter(
    addButton,
    {},
    createReminderForm.documentGlobal
  );

  Assert.ok(
    BrowserTestUtils.isVisible(form),
    "Should show form after clicking add"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(addButton),
    "Should hide add button after clicking it"
  );

  EventUtils.synthesizeMouseAtCenter(
    deleteButton,
    {},
    createReminderForm.documentGlobal
  );

  Assert.ok(
    BrowserTestUtils.isHidden(form),
    "Form should be hidden after delete button click"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(addButton),
    "Add button should be visible again"
  );
});

add_task(function test_defaultFromPreferences() {
  const defaultOffset = cal.alarms.getDefaultOffset("event");
  const select = createReminderForm.querySelector("form select");
  Assert.ok(defaultOffset.isNegative, "Default offset should be negative");
  const offsetInMinutes = Math.floor(-defaultOffset.inSeconds / 60);

  Assert.equal(
    select.value,
    offsetInMinutes,
    "Should select the default reminder offset"
  );
});

add_task(async function test_addingNewReminder() {
  const addButton = createReminderForm.querySelector(".add-reminder-button");
  const select = createReminderForm.querySelector("form select");
  const submit = createReminderForm.querySelector("form .pill-button");

  EventUtils.synthesizeMouseAtCenter(
    addButton,
    {},
    createReminderForm.documentGlobal
  );

  select.value = "720";

  const onNewReminder = BrowserTestUtils.waitForEvent(
    createReminderForm,
    "new-reminder"
  );
  EventUtils.synthesizeMouseAtCenter(
    submit,
    {},
    createReminderForm.documentGlobal
  );

  const newReminderEvent = await onNewReminder;

  Assert.ok(
    BrowserTestUtils.isHidden(createReminderForm.querySelector("form")),
    "Should hide form after submit"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(addButton),
    "Should show add button again after submission"
  );

  Assert.deepEqual(
    newReminderEvent.detail,
    { minutesBefore: 720 },
    "Should pass selected reminder offset in event"
  );
});

add_task(function test_focus() {
  const addButton = createReminderForm.querySelector(".add-reminder-button");
  const select = createReminderForm.querySelector("form select");
  const submit = createReminderForm.querySelector("form .pill-button");
  const deleteButton = createReminderForm.querySelector(".delete-button");

  EventUtils.synthesizeMouseAtCenter(
    addButton,
    {},
    createReminderForm.documentGlobal
  );

  Assert.equal(
    createReminderForm.ownerDocument.activeElement,
    select,
    "Select should be focused after being shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    submit,
    {},
    createReminderForm.documentGlobal
  );

  Assert.equal(
    createReminderForm.ownerDocument.activeElement,
    addButton,
    "Add button should be focused after submit"
  );

  EventUtils.synthesizeMouseAtCenter(
    addButton,
    {},
    createReminderForm.documentGlobal
  );

  Assert.equal(
    createReminderForm.ownerDocument.activeElement,
    select,
    "Select should be focused again when shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    deleteButton,
    {},
    createReminderForm.documentGlobal
  );

  Assert.equal(
    createReminderForm.ownerDocument.activeElement,
    addButton,
    "Add button should be focused after canceling form"
  );
});
