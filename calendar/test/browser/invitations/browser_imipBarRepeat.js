/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving recurring event invitations via the imip-bar.
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
 * Tests accepting an invitation to a recurring event and sending a response.
 */
add_task(async function testAcceptRecurringWithResponse() {
  transport.reset();
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipAcceptRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipTentativeRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickAction(win, "imipDeclineRecurrencesButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;

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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickMenuAction(
    win,
    "imipAcceptRecurrencesButton",
    "imipAcceptRecurrencesButton_AcceptDontSend"
  );

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickMenuAction(
    win,
    "imipTentativeRecurrencesButton",
    "imipTentativeRecurrencesButton_TentativeDontSend"
  );

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/repeat-event.eml")));
  await clickMenuAction(
    win,
    "imipDeclineRecurrencesButton",
    "imipDeclineRecurrencesButton_DeclineDontSend"
  );

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
