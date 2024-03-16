/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for processing cancellations to recurring invitations via the imip-bar.
 */
"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

let identity;
let calendar;
let transport;

/**
 * Initialize account, identity and calendar.
 */
add_setup(async function () {
  requestLongerTimeout(5);
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "receiver",
    "example.com",
    "imap"
  );
  identity = MailServices.accounts.createIdentity();
  identity.email = "receiver@example.com";
  account.addIdentity(identity);

  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(cal.createDateTime("20220316T191602Z"));

  calendar = CalendarTestUtils.createCalendar("Test");
  transport = new EmailTransport(account, identity);

  const getImipTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => transport;

  const deleteMgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
    Ci.calIDeletedItems
  ).wrappedJSObject;
  const markDeleted = deleteMgr.markDeleted;
  deleteMgr.markDeleted = () => {};

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
    cal.itip.getImipTransport = getImipTransport;
    deleteMgr.markDeleted = markDeleted;
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Tests accepting a cancellation to an already accepted recurring event.
 */
add_task(async function testCancelAcceptedRecurring() {
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipAcceptRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    calendar,
    event,
    transport,
    isRecurring: true,
  });
});

/**
 * Tests accepting a cancellation to an already tentatively accepted event.
 */
add_task(async function testCancelTentativeRecurring() {
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipTentativeRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    calendar,
    event,
    transport,
    identity,
    isRecurring: true,
  });
});

/**
 * Tests accepting a cancellation to an already declined recurring event.
 */
add_task(async function testCancelDeclinedRecurring() {
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipDeclineRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    calendar,
    event,
    transport,
    identity,
    isRecurring: true,
  });
});

/**
 * Tests accepting a cancellation to a single occurrence of an already accepted
 * recurring event.
 */
add_task(async function testCancelAcceptedOccurrence() {
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipAcceptRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    calendar,
    event,
    transport,
    isRecurring: true,
    recurrenceId: "20220317T110000Z",
  });
  await calendar.deleteItem(event.parentItem);
});

/**
 * Tests accepting a cancellation to a single occurrence of an already tentatively
 * accepted event.
 */
add_task(async function testCancelTentativeOccurrence() {
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipTentativeRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    calendar,
    event,
    transport,
    identity,
    isRecurring: true,
    recurrenceId: "20220317T110000Z",
  });
  await calendar.deleteItem(event.parentItem);
});

/**
 * Tests accepting a cancellation to a single occurrence of an already declined
 * recurring event.
 */
add_task(async function testCancelDeclinedOccurrence() {
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipDeclineRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    calendar,
    event,
    transport,
    identity,
    isRecurring: true,
    recurrenceId: "20220317T110000Z",
  });
  await calendar.deleteItem(event.parentItem);
});

/**
 * Tests the handling of a cancellation when the event was not processed
 * previously.
 */
add_task(async function testUnprocessedCancel() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/cancel-repeat-event.eml"));
  const win = await openImipMessage(invite);
  for (const button of [...win.document.querySelectorAll("#imip-view-toolbar > toolbarbutton")]) {
    Assert.ok(button.hidden, `${button.id} is hidden`);
  }
  await BrowserTestUtils.closeWindow(win);
});
