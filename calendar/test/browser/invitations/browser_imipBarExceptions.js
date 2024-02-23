/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for handling exceptions to recurring event invitations via the imip-bar.
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
 * Tests a minor update exception to an already accepted recurring event.
 */
add_task(async function testMinorUpdateExceptionToAccepted() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipAcceptRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorExceptionTest({
    transport,
    calendar,
    partStat: "ACCEPTED",
  });
});

/**
 * Tests a minor update exception to an already tentatively accepted recurring
 * event.
 */
add_task(async function testMinorUpdateExceptionToTentative() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipTentativeRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorExceptionTest({
    transport,
    calendar,
    partStat: "TENTATIVE",
  });
});

/**
 * Tests a minor update exception to an already declined recurring declined
 * event.
 */
add_task(async function testMinorUpdateExceptionToDeclined() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipDeclineRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorExceptionTest({
    transport,
    calendar,
    partStat: "DECLINED",
  });
});

/**
 * Tests a major update exception to an already accepted event.
 */
add_task(async function testMajorExceptionToAcceptedWithResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipAcceptRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update exception to an already tentatively accepted event.
 */
add_task(async function testMajorExceptionToTentativeWithResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipTentativeRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update exception to an already declined event.
 */
add_task(async function testMajorExceptionToDeclinedWithResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipDeclineRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      isRecurring: true,
      partStat,
    });
  }
});

/**
 * Tests a major update exception to an already accepted event without sending
 * a reply.
 */
add_task(async function testMajorExecptionToAcceptedWithoutResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipAcceptRecurrencesButton",
      "imipAcceptRecurrencesButton_AcceptDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update exception to an already tentatively accepted event
 * without sending a reply.
 */
add_task(async function testMajorUpdateToTentativeWithoutResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipTentativeRecurrencesButton",
      "imipTentativeRecurrencesButton_TentativeDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update exception to a declined event without sending a reply.
 */
add_task(async function testMajorUpdateToDeclinedWithoutResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipDeclineRecurrencesButton",
      "imipDeclineRecurrencesButton_DeclineDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update exception to an event where the participation status
 * is still "NEEDS-ACTION". Here we want to ensure action is only taken on the
 * target exception date and not the other dates.
 */
add_task(async function testMajorUpdateToNeedsAction() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();

    // Extract the event from the .eml file and manually add it to the calendar.
    const invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    const srcText = await IOUtils.readUTF8(invite.path);
    let ics = srcText.match(
      /--00000000000080f3da05db4aef59[\S\s]+--00000000000080f3da05db4aef59/g
    )[0];
    ics = ics.split("--00000000000080f3da05db4aef59").join("");
    ics = ics.replaceAll(/Content-(Type|Transfer-Encoding)?: .*/g, "");

    const event = new CalEvent(ics);

    // This will not be set because we manually added the event.
    event.setProperty("x-moz-received-dtstamp", "20220316T191602Z");

    await calendar.addItem(event);
    await CalendarTestUtils.monthView.waitForItemAt(window, 3, 5, 1).item;
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      isRecurring: true,
      partStat,
    });
  }
});
