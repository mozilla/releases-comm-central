/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving minor and major updates to recurring event invitations
 * via the imip-bar.
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
 * Tests a minor update to an already accepted event.
 */
add_task(async function testMinorUpdateToAccepted() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipAcceptRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorUpdateTest({
    transport,
    calendar,
    isRecurring: true,
    partStat: "ACCEPTED",
  });
});

/**
 * Tests a minor update to an already tentatively accepted event.
 */
add_task(async function testMinorUpdateToTentative() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipTentativeRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorUpdateTest({
    transport,
    calendar,
    isRecurring: true,
    partStat: "TENTATIVE",
  });
});

/**
 * Tests a minor update to an already declined event.
 */
add_task(async function testMinorUpdateToDeclined() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipDeclineRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorUpdateTest({ transport, calendar, isRecurring: true, invite, partStat: "DECLINED" });
});

/**
 * Tests a major update to an already accepted event.
 */
add_task(async function testMajorUpdateToAcceptedWithResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickAction(win, "imipAcceptRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      identity,
      calendar,
      isRecurring: true,
      partStat,
    });
  }
});

/**
 * Tests a major update to an already tentatively accepted event.
 */
add_task(async function testMajorUpdateToTentativeWithResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickAction(win, "imipTentativeRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      identity,
      calendar,
      isRecurring: true,
      partStat,
    });
  }
});

/**
 * Tests a major update to an already declined event.
 */
add_task(async function testMajorUpdateToDeclinedWithResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickAction(win, "imipDeclineRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      identity,
      calendar,
      isRecurring: true,
      partStat,
    });
  }
});

/**
 * Tests a major update to an already accepted event without replying to the
 * update.
 */
add_task(async function testMajorUpdateToAcceptedWithoutResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipAcceptRecurrencesButton",
      "imipAcceptRecurrencesButton_AcceptDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update to an already tentatively accepted event without replying
 * to the update.
 */
add_task(async function testMajorUpdateToTentativeWithoutResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipTentativeRecurrencesButton",
      "imipTentativeRecurrencesButton_TentativeDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update to an already declined event.
 */
add_task(async function testMajorUpdateToDeclinedWithoutResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipDeclineRecurrencesButton",
      "imipDeclineRecurrencesButton_DeclineDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});
