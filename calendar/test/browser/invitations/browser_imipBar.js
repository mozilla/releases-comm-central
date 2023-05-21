/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving event invitations via the imip-bar.
 */
"use strict";

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalItipDefaultEmailTransport } = ChromeUtils.import(
  "resource:///modules/CalItipEmailTransport.jsm"
);
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
 * Tests accepting an invitation and sending a response.
 */
add_task(async function testAcceptWithResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipAcceptButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      partStat: "ACCEPTED",
    },
    event
  );

  await calendar.deleteItem(event);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting an invitation and sending a response.
 */
add_task(async function testTentativeWithResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipTentativeButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      partStat: "TENTATIVE",
    },
    event
  );

  await calendar.deleteItem(event);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining an invitation and sending a response.
 */
add_task(async function testDeclineWithResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipDeclineButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      partStat: "DECLINED",
    },
    event
  );

  await calendar.deleteItem(event);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests accepting an invitation without sending a response.
 */
add_task(async function testAcceptWithoutResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickMenuAction(win, "imipAcceptButton", "imipAcceptButton_AcceptDontSend");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      partStat: "ACCEPTED",
      noReply: true,
    },
    event
  );
  await calendar.deleteItem(event);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting an invitation without sending a response.
 */
add_task(async function testTentativeWithoutResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickMenuAction(win, "imipTentativeButton", "imipTentativeButton_TentativeDontSend");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      partStat: "TENTATIVE",
      noReply: true,
    },
    event
  );

  await calendar.deleteItem(event);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining an invitation without sending a response.
 */
add_task(async function testDeclineWithoutResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickMenuAction(win, "imipDeclineButton", "imipDeclineButton_DeclineDontSend");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      partStat: "DECLINED",
      noReply: true,
    },
    event
  );

  await calendar.deleteItem(event);
  await BrowserTestUtils.closeWindow(win);
});
