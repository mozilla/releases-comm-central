/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving recurring event invitations via the imip-bar.
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
 * Tests accepting an invitation to a recurring event and sending a response.
 */
add_task(async function testAcceptRecurringWithResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipAcceptRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      isRecurring: true,
      partStat: "ACCEPTED",
    },
    event
  );

  await calendar.deleteItem(event.parentItem);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting an invitation to a recurring event and sending a
 * response.
 */
add_task(async function testTentativeRecurringWithResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipTentativeRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      isRecurring: true,
      partStat: "TENTATIVE",
    },
    event
  );

  await calendar.deleteItem(event.parentItem);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining an invitation to a recurring event and sending a response.
 */
add_task(async function testDeclineRecurringWithResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipDeclineRecurrencesButton");

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;

  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      isRecurring: true,
      partStat: "DECLINED",
    },
    event
  );

  await calendar.deleteItem(event.parentItem);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests accepting an invitation to a recurring event without sending a response.
 */
add_task(async function testAcceptRecurringWithoutResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickMenuAction(
    win,
    "imipAcceptRecurrencesButton",
    "imipAcceptRecurrencesButton_AcceptDontSend"
  );

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      isRecurring: true,
      partStat: "ACCEPTED",
      noReply: true,
    },
    event
  );

  await calendar.deleteItem(event.parentItem);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests tentatively accepting an invitation to a recurring event without sending
 * a response.
 */
add_task(async function testTentativeRecurringWithoutResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickMenuAction(
    win,
    "imipTentativeRecurrencesButton",
    "imipTentativeRecurrencesButton_TentativeDontSend"
  );

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      isRecurring: true,
      partStat: "TENTATIVE",
      noReply: true,
    },
    event
  );

  await calendar.deleteItem(event.parentItem);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Tests declining an invitation to a recurring event without sending a response.
 */
add_task(async function testDeclineRecurrencesWithoutResponse() {
  transport.reset();
  let win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickMenuAction(
    win,
    "imipDeclineRecurrencesButton",
    "imipDeclineRecurrencesButton_DeclineDontSend"
  );

  let event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
  await doImipBarActionTest(
    {
      calendar,
      transport,
      identity,
      isRecurring: true,
      partStat: "DECLINED",
      noReply: true,
    },
    event
  );

  await calendar.deleteItem(event.parentItem);
  await BrowserTestUtils.closeWindow(win);
});
