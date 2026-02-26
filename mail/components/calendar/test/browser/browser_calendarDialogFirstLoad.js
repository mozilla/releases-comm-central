/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let dialog;
let calendarEvent;
let calendar;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialog.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialog.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  // This test misbehaves if started immediately.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  browser = tab.browser;
  cal.view.colorTracker.registerWindow(browser.contentWindow);

  // Setting the color to the rgb value of #ffbbff so we don't have to do the
  // conversion for the computed color later.
  calendar = createCalendar({
    color: "rgb(255, 187, 255)",
    name: "TB CAL TEST",
  });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function test_dialogRemindersShowOnFirstLoad() {
  const hourReminder = createAlarmFromDuration("-PT1H");
  const alarms = [hourReminder];
  const oneReminder = await createEvent({
    name: "One Alarm",
    calendar,
    offset: 7,
    alarms,
  });

  // Load the event for display in overview, so microtask order matches.
  await calendar.getItem(oneReminder.id);

  dialog = browser.contentWindow.document.createElement("dialog", {
    is: "calendar-dialog",
  });
  browser.contentWindow.document
    .querySelector("#test-container")
    .appendChild(dialog);
  dialog.setCalendarEvent(oneReminder);
  dialog.show();

  const remindersRow = dialog.querySelector("calendar-dialog-reminders-row");
  const reminderLabel = remindersRow.querySelector("#reminderCount");
  const reminderList = remindersRow.querySelector("#reminderList");

  await BrowserTestUtils.waitForMutationCondition(
    reminderList,
    {
      childList: true,
      subtree: true,
    },
    () =>
      reminderList.childNodes.length == 1 &&
      reminderList.childNodes[0].textContent == hourReminder.toString()
  );

  // Allow the clear to happen after we set the reminders.
  Services.tm.spinEventLoopUntilEmpty();

  const fluentData = document.l10n.getAttributes(reminderLabel);

  Assert.equal(
    fluentData.id,
    "calendar-dialog-reminder-count",
    "Reminder count label should be set"
  );

  Assert.equal(
    fluentData.args.count,
    1,
    "Reminder count label should have the right count"
  );
});
