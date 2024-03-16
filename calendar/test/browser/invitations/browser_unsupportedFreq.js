/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for ensuring the application does not hang after processing an
 * unsupported FREQ value.
 */
"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

let calendar;

/**
 * Initialize account, identity and calendar.
 */
add_setup(async function () {
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "receiver",
    "example.com",
    "imap"
  );

  const identity = MailServices.accounts.createIdentity();
  identity.email = "receiver@example.com";
  account.addIdentity(identity);

  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(cal.createDateTime("20220316T191602Z"));

  calendar = CalendarTestUtils.createCalendar("Test");
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Runs the test using the provided FREQ value.
 *
 * @param {string} freq Either "SECONDLY" or "MINUTELY"
 */
async function doFreqTest(freq) {
  const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let srcText = await IOUtils.readUTF8(invite.path);
  const tmpFile = FileTestUtils.getTempFile(`${freq}.eml`);

  srcText = srcText.replace(/RRULE:.*/g, `RRULE:FREQ=${freq}`);
  srcText = srcText.replace(/UID:.*/g, `UID:${freq}`);
  await IOUtils.writeUTF8(tmpFile.path, srcText);

  const win = await openImipMessage(tmpFile);
  await clickMenuAction(
    win,
    "imipAcceptRecurrencesButton",
    "imipAcceptRecurrencesButton_AcceptDontSend"
  );

  // Give the view time to refresh and create any occurrences.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5000));
  await BrowserTestUtils.closeWindow(win);

  const dayBoxItems = document.querySelectorAll("calendar-month-day-box-item");
  Assert.equal(dayBoxItems.length, 1, "only one occurrence displayed");

  const [dayBox] = dayBoxItems;
  const { item } = dayBox;
  Assert.equal(item.title, "Repeat Event");
  Assert.equal(item.startDate.icalString, "20220316T110000Z");

  const summaryDialog = await CalendarTestUtils.viewItem(window, dayBox);
  Assert.equal(
    summaryDialog.document.querySelector(".repeat-details").textContent,
    "Repeat details unknown",
    "repeat details not shown"
  );

  await BrowserTestUtils.closeWindow(summaryDialog);
  await calendar.deleteItem(item.parentItem);
  await TestUtils.waitForCondition(
    () => document.querySelectorAll("calendar-month-day-box-item").length == 0
  );
}

/**
 * Tests accepting an invitation using the FREQ=SECONDLY value does not render
 * the application unusable.
 */
add_task(async function testSecondly() {
  return doFreqTest("SECONDLY");
});

/**
 * Tests accepting an invitation using the FREQ=MINUTELY value does not render
 * the application unusable.
 */
add_task(async function testMinutely() {
  return doFreqTest("MINUTELY");
});
