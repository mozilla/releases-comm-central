/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for processing cancellations to recurring invitations via the imip-bar.
 */
"use strict";

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

let identity;
let calendar;
let transport;

/**
 * Initialize account, identity and calendar.
 */
add_setup(async function () {
  requestLongerTimeout(5);
  let account = MailServices.accounts.createAccount();
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

  let getImipTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => transport;

  let deleteMgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
    Ci.calIDeletedItems
  ).wrappedJSObject;
  let markDeleted = deleteMgr.markDeleted;
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
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipAcceptRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipTentativeRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipDeclineRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipAcceptRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipTentativeRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipDeclineRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let invite = new FileUtils.File(getTestFilePath("data/cancel-repeat-event.eml"));
  let win = await openImipMessage(invite);
  for (let button of [...win.document.querySelectorAll("#imip-view-toolbar > toolbarbutton")]) {
    Assert.ok(button.hidden, `${button.id} is hidden`);
  }
  await BrowserTestUtils.closeWindow(win);
});
