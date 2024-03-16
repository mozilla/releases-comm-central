/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving an invitation exception but the original event was not
 * processed first.
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
 * Tests accepting a minor exception and sending a response.
 */
add_task(async function testMinorAcceptWithResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  await clickAction(win, "imipAcceptButton");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "ACCEPTED",
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting a minor exception and sending a response.
 */
add_task(async function testMinorTentativeWithResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  await clickAction(win, "imipTentativeButton");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "TENTATIVE",
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining a minor exception and sending a response.
 */
add_task(async function testMinorDeclineWithResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  await clickAction(win, "imipDeclineButton");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "DECLINED",
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests accepting a minor exception without sending a response.
 */
add_task(async function testMinorAcceptWithoutResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  await clickMenuAction(win, "imipAcceptButton", "imipAcceptButton_AcceptDontSend");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "ACCEPTED",
    noReply: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting a minor exception without sending a response.
 */
add_task(async function testMinorTentativeWithoutResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  await clickMenuAction(win, "imipTentativeButton", "imipTentativeButton_TentativeDontSend");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "TENTATIVE",
    noReply: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining a minor exception without sending a response.
 */
add_task(async function testMinorDeclineWithoutResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-minor.eml"))
  );
  await clickMenuAction(win, "imipDeclineButton", "imipDeclineButton_DeclineDontSend");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "DECLINED",
    noReply: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests accepting a major exception and sending a response.
 */
add_task(async function testMajorAcceptWithResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  await clickAction(win, "imipAcceptButton");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "ACCEPTED",
    isMajor: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting a major exception and sending a response.
 */
add_task(async function testMajorTentativeWithResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  await clickAction(win, "imipTentativeButton");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "TENTATIVE",
    isMajor: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining a major exception and sending a response.
 */
add_task(async function testMajorDeclineWithResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  await clickAction(win, "imipDeclineButton");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "DECLINED",
    isMajor: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests accepting a major exception without sending a response.
 */
add_task(async function testMajorAcceptWithoutResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  await clickMenuAction(win, "imipAcceptButton", "imipAcceptButton_AcceptDontSend");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "ACCEPTED",
    noReply: true,
    isMajor: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting a major exception without sending a response.
 */
add_task(async function testMajorTentativeWithoutResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  await clickMenuAction(win, "imipTentativeButton", "imipTentativeButton_TentativeDontSend");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "TENTATIVE",
    noReply: true,
    isMajor: true,
  });
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining a major exception without sending a response.
 */
add_task(async function testMajorDeclineWithoutResponse() {
  transport.reset();
  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/exception-major.eml"))
  );
  await clickMenuAction(win, "imipDeclineButton", "imipDeclineButton_DeclineDontSend");
  await doExceptionOnlyTest({
    calendar,
    transport,
    identity,
    partStat: "DECLINED",
    noReply: true,
    isMajor: true,
  });
  await BrowserTestUtils.closeWindow(win);
});
