/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test default alarm settings for events and tasks
 */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
var { cancelItemDialog } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

const DEFVALUE = 43;

add_task(async function testDefaultAlarms() {
  let calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");
  calendar.setProperty("calendar-main-default", true);
  registerCleanupFunction(async () => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  let localeUnitString = cal.l10n.getCalString("unitDays");
  let unitString = PluralForm.get(DEFVALUE, localeUnitString).replace("#1", DEFVALUE);
  let alarmString = (...args) => cal.l10n.getString("calendar-alarms", ...args);
  let originStringEvent = alarmString("reminderCustomOriginBeginBeforeEvent");
  let originStringTask = alarmString("reminderCustomOriginBeginBeforeTask");
  let expectedEventReminder = alarmString("reminderCustomTitle", [unitString, originStringEvent]);
  let expectedTaskReminder = alarmString("reminderCustomTitle", [unitString, originStringTask]);

  // Configure the preferences.
  let { prefsWindow, prefsDocument } = await openNewPrefsTab("paneCalendar", "defaultsnoozelength");
  await handlePrefTab(prefsWindow, prefsDocument);

  // Create New Event.
  await CalendarTestUtils.openCalendarTab(window);

  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(window);

  Assert.equal(iframeDocument.querySelector(".item-alarm").value, "custom");
  let reminderDetails = iframeDocument.querySelector(".reminder-single-alarms-label");
  Assert.equal(reminderDetails.value, expectedEventReminder);

  let reminderDialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-event-dialog-reminder.xhtml",
    { callback: handleReminderDialog }
  );
  EventUtils.synthesizeMouseAtCenter(reminderDetails, {}, iframeWindow);
  await reminderDialogPromise;

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  cancelItemDialog(dialogWindow);
  await promptPromise;

  // Create New Task.
  await openTasksTab();
  ({ dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewTask(window));

  Assert.equal(iframeDocument.querySelector(".item-alarm").value, "custom");
  reminderDetails = iframeDocument.querySelector(".reminder-single-alarms-label");
  Assert.equal(reminderDetails.value, expectedTaskReminder);

  reminderDialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-event-dialog-reminder.xhtml",
    { callback: handleReminderDialog }
  );
  EventUtils.synthesizeMouseAtCenter(reminderDetails, {}, iframeWindow);
  await reminderDialogPromise;

  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  cancelItemDialog(dialogWindow);
  await promptPromise;
});

async function handlePrefTab(prefsWindow, prefsDocument) {
  function menuList(id, value) {
    let list = prefsDocument.getElementById(id);
    list.scrollIntoView();
    list.click();
    list.querySelector(`menuitem[value="${value}"]`).click();
  }
  // Turn on alarms for events and tasks.
  menuList("eventdefalarm", "1");
  menuList("tododefalarm", "1");

  // Selects "days" as a unit.
  menuList("tododefalarmunit", "days");
  menuList("eventdefalarmunit", "days");

  function text(id, value) {
    let input = prefsDocument.getElementById(id);
    input.scrollIntoView();
    EventUtils.synthesizeMouse(input, 5, 5, {}, prefsWindow);
    Assert.equal(prefsDocument.activeElement, input);
    EventUtils.synthesizeKey("a", { accelKey: true }, prefsWindow);
    EventUtils.sendString(value, prefsWindow);
  }
  // Sets default alarm length for events to DEFVALUE.
  text("eventdefalarmlen", DEFVALUE.toString());
  text("tododefalarmlen", DEFVALUE.toString());

  Assert.equal(Services.prefs.getIntPref("calendar.alarms.onforevents"), 1);
  Assert.equal(Services.prefs.getIntPref("calendar.alarms.eventalarmlen"), DEFVALUE);
  Assert.equal(Services.prefs.getStringPref("calendar.alarms.eventalarmunit"), "days");
  Assert.equal(Services.prefs.getIntPref("calendar.alarms.onfortodos"), 1);
  Assert.equal(Services.prefs.getIntPref("calendar.alarms.todoalarmlen"), DEFVALUE);
  Assert.equal(Services.prefs.getStringPref("calendar.alarms.todoalarmunit"), "days");
}

async function handleReminderDialog(remindersWindow) {
  await new Promise(remindersWindow.setTimeout);
  let remindersDocument = remindersWindow.document;

  let listbox = remindersDocument.getElementById("reminder-listbox");
  Assert.equal(listbox.selectedCount, 1);
  Assert.equal(listbox.selectedItem.reminder.offset.days, DEFVALUE);

  EventUtils.synthesizeMouseAtCenter(
    remindersDocument.getElementById("reminder-new-button"),
    {},
    remindersWindow
  );
  Assert.equal(listbox.itemCount, 2);
  Assert.equal(listbox.selectedCount, 1);
  Assert.equal(listbox.selectedItem.reminder.offset.days, DEFVALUE);

  function text(id, value) {
    let input = remindersDocument.getElementById(id);
    EventUtils.synthesizeMouse(input, 5, 5, {}, remindersWindow);
    Assert.equal(remindersDocument.activeElement, input);
    EventUtils.synthesizeKey("a", { accelKey: true }, remindersWindow);
    EventUtils.sendString(value, remindersWindow);
  }
  text("reminder-length", "20");
  Assert.equal(listbox.selectedItem.reminder.offset.days, 20);

  EventUtils.synthesizeMouseAtCenter(listbox, {}, remindersWindow);
  EventUtils.synthesizeKey("VK_UP", {}, remindersWindow);
  Assert.equal(listbox.selectedIndex, 0);

  Assert.equal(listbox.selectedItem.reminder.offset.days, DEFVALUE);

  remindersDocument.querySelector("dialog").getButton("accept").click();
}

async function openTasksTab() {
  let tabmail = document.getElementById("tabmail");
  let tasksMode = tabmail.tabModes.tasks;

  if (tasksMode.tabs.length == 1) {
    tabmail.selectedTab = tasksMode.tabs[0];
  } else {
    let tasksTabButton = document.getElementById("tasksButton");
    EventUtils.synthesizeMouseAtCenter(tasksTabButton, { clickCount: 1 });
  }

  is(tasksMode.tabs.length, 1, "tasks tab is open");
  is(tabmail.selectedTab, tasksMode.tabs[0], "tasks tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("calendar.alarms.onforevents");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmlen");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmunit");
  Services.prefs.clearUserPref("calendar.alarms.onfortodos");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmlen");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmunit");
});
