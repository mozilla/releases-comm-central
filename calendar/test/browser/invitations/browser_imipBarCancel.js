/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for processing cancellations via the imip-bar.
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
 * Tests accepting a cancellation to an already accepted event.
 */
add_task(async function testCancelAccepted() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipAcceptButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    transport,
    calendar,
    event,
  });
});

/**
 * Tests accepting a cancellation to tentatively accepted event.
 */
add_task(async function testCancelTentative() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipTentativeButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    transport,
    calendar,
    event,
  });
});

/**
 * Tests accepting a cancellation to an already declined event.
 */
add_task(async function testCancelDeclined() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipDeclineButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await BrowserTestUtils.closeWindow(win);
  await doCancelTest({
    transport,
    calendar,
    event,
  });
});

/**
 * Tests the handling of a cancellation when the event was not processed
 * previously.
 */
add_task(async function testUnprocessedCancel() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/cancel-single-event.eml"));
  const win = await openImipMessage(invite);

  // There should be no buttons present because there is no action to take.
  // Note: the imip-bar message "This message contains an event that has already been processed" is
  // misleading.
  for (const button of [...win.document.querySelectorAll("#imip-view-toolbar > toolbarbutton")]) {
    Assert.ok(button.hidden, `${button.id} is hidden`);
  }
  await BrowserTestUtils.closeWindow(win);
});
