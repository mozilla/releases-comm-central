/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for processing cancellations via the imip-bar.
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
 * Tests accepting a cancellation to an already accepted event.
 */
add_task(async function testCancelAccepted() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipAcceptButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipTentativeButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipDeclineButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  let invite = new FileUtils.File(getTestFilePath("data/cancel-single-event.eml"));
  let win = await openImipMessage(invite);

  // There should be no buttons present because there is no action to take.
  // Note: the imip-bar message "This message contains an event that has already been processed" is
  // misleading.
  for (let button of [...win.document.querySelectorAll("#imip-view-toolbar > toolbarbutton")]) {
    Assert.ok(button.hidden, `${button.id} is hidden`);
  }
  await BrowserTestUtils.closeWindow(win);
});
