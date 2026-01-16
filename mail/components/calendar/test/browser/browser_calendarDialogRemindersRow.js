/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let row;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogRemindersRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  row = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-reminders-row"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_setNoReminders() {
  row.setReminders([]);
  const reminderLabel = row.querySelector("#reminderCount");
  const fluentData = document.l10n.getAttributes(reminderLabel);

  Assert.equal(
    fluentData.id,
    "calendar-dialog-reminder-count",
    "Reminder count label should be set"
  );

  Assert.equal(
    fluentData.args.count,
    0,
    "Reminder count label should have the right count"
  );

  const remindersList = row.querySelector("#reminderList");
  Assert.equal(
    remindersList.childNodes.length,
    0,
    "There should be no reminder elements"
  );
});

add_task(async function test_setMultipleReminders() {
  const dayReminder = createAlarmFromDuration("-P1D");
  const sixDayReminder = createAlarmFromDuration("-P6D");
  const alarms = [sixDayReminder, dayReminder];

  row.setReminders(alarms);

  const reminderLabel = row.querySelector("#reminderCount");
  const fluentData = document.l10n.getAttributes(reminderLabel);

  Assert.equal(
    fluentData.id,
    "calendar-dialog-reminder-count",
    "Reminder count label should be set"
  );

  Assert.equal(
    fluentData.args.count,
    2,
    "Reminder count label should have the right count"
  );

  const remindersList = row.querySelector("#reminderList");
  Assert.equal(
    remindersList.childNodes.length,
    2,
    "There should be reminder elements created"
  );

  const firstReminder = remindersList.childNodes[0];
  Assert.ok(
    firstReminder.classList.contains("actionable-item"),
    "Reminder container element should have the right class"
  );

  Assert.equal(
    firstReminder.textContent,
    sixDayReminder.toString(),
    "First reminder should be unordered"
  );

  // Reminder should have delete button with delete image inside.
  Assert.ok(
    firstReminder.querySelector("button").classList.contains("delete-button"),
    "Reminder should have a delete button"
  );

  Assert.equal(
    firstReminder.querySelector("button").type,
    "button",
    "Reminder button should have the button type"
  );

  const deleteImage = firstReminder.querySelector("button img");
  Assert.ok(
    deleteImage.classList.contains("icon-delete"),
    "Delete button image should be correct"
  );
  const imgFluentData = document.l10n.getAttributes(deleteImage);
  Assert.equal(
    imgFluentData.id,
    "calendar-dialog-delete-reminder-button",
    "Delete image should have correct fluent ID"
  );
});
