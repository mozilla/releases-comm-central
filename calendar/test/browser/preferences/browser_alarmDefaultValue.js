/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test default alarm settings for events and tasks
 */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { PluralForm } = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const DEFVALUE = 43;

add_task(async function testDefaultAlarms() {
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  calendar.name = "Mochitest";
  manager.registerCalendar(calendar);

  registerCleanupFunction(async () => {
    manager.unregisterCalendar(calendar);
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
  let eventDialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return win.document.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml";
  });
  EventUtils.synthesizeKey("i", { accelKey: true });
  let eventDialogWindow = await eventDialogPromise;
  let eventDialogDocument = eventDialogWindow.document;

  let eventDialogIframe = eventDialogDocument.getElementById("calendar-item-panel-iframe");
  let iframeWindow = eventDialogIframe.contentWindow;
  if (eventDialogIframe.contentDocument.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(iframeWindow, "load");
  }
  let iframeDocument = iframeWindow.document;
  await new Promise(r => iframeWindow.setTimeout(r));

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

  eventDialogWindow.close();

  // Create New Task.
  let taskDialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return win.document.documentURI == "chrome://calendar/content/calendar-event-dialog.xhtml";
  });
  EventUtils.synthesizeKey("d", { accelKey: true });
  let taskDialogWindow = await taskDialogPromise;
  let taskDialogDocument = taskDialogWindow.document;

  let taskDialogIframe = taskDialogDocument.getElementById("calendar-item-panel-iframe");
  iframeWindow = taskDialogIframe.contentWindow;
  if (taskDialogIframe.contentDocument.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(iframeWindow, "load");
  }
  iframeDocument = iframeWindow.document;
  await new Promise(r => iframeWindow.setTimeout(r));

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

  taskDialogWindow.close();
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

  remindersDocument
    .querySelector("dialog")
    .getButton("accept")
    .click();
}

registerCleanupFunction(function teardownModule(module) {
  Services.prefs.clearUserPref("calendar.alarms.onforevents");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmlen");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmunit");
  Services.prefs.clearUserPref("calendar.alarms.onfortodos");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmlen");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmunit");
});
