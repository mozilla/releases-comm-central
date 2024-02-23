/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for processing cancellations to recurring event exceptions.
 */

"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

let identity;
let calendar;
let transport;

/**
 * Initialize account, identity and calendar.
 */
add_setup(async function () {
  requestLongerTimeout(3);
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
 * Tests cancelling an exception works.
 */
add_task(async function testCancelException() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    await doCancelExceptionTest({
      calendar,
      transport,
      identity,
      partStat,
      recurrenceId: "20220317T110000Z",
      isRecurring: true,
    });
  }
});

/**
 * Tests cancelling an event with only an exception processed works.
 */
add_task(async function testCancelExceptionOnly() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    const win = await openImipMessage(
      new FileUtils.File(getTestFilePath("data/exception-major.eml"))
    );
    await clickAction(win, actionIds.single.button[partStat]);

    const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 5, 1)).item;
    await BrowserTestUtils.closeWindow(win);
    await doCancelTest({
      calendar,
      event,
      transport,
      identity,
    });
  }
});

/**
 * Tests processing a cancellation for a recurring event works when only an
 * exception was processed previously.
 */
add_task(async function testCancelSeriesWithExceptionOnly() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    const win = await openImipMessage(
      new FileUtils.File(getTestFilePath("data/exception-major.eml"))
    );
    await clickMenuAction(
      win,
      actionIds.single.button[partStat],
      actionIds.single.noReply[partStat]
    );

    const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 5, 1)).item;
    await BrowserTestUtils.closeWindow(win);

    const cancel = new FileUtils.File(getTestFilePath("data/cancel-repeat-event.eml"));
    const cancelWin = await openImipMessage(cancel);
    const aboutMessage = cancelWin.document.getElementById("messageBrowser").contentWindow;

    const deleteButton = aboutMessage.document.getElementById("imipDeleteButton");
    Assert.ok(!deleteButton.hidden, `#${deleteButton.id} button shown`);
    EventUtils.synthesizeMouseAtCenter(deleteButton, {}, aboutMessage);
    await BrowserTestUtils.closeWindow(cancelWin);
    await CalendarTestUtils.monthView.waitForNoItemAt(window, 3, 5, 1);
    Assert.ok(!(await calendar.getItem(event.id)), "event was deleted");

    Assert.equal(
      transport.sentItems.length,
      0,
      "itip subsystem did not attempt to send a response"
    );
    Assert.equal(transport.sentMsgs.length, 0, "no call was made into the mail subsystem");
  }
});
