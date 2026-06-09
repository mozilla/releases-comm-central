/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving event invitations via the imip-bar.
 */
"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalItipDefaultEmailTransport } = ChromeUtils.importESModule(
  "resource:///modules/CalItipEmailTransport.sys.mjs"
);
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
 * Tests accepting an invitation and sending a response.
 */
add_task(async function testAcceptWithResponse() {
  transport.reset();
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipAcceptButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipTentativeButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipDeclineButton");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickMenuAction(win, "imipAcceptButton", "imipAcceptButton_AcceptDontSend");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickMenuAction(win, "imipTentativeButton", "imipTentativeButton_TentativeDontSend");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickMenuAction(win, "imipDeclineButton", "imipDeclineButton_DeclineDontSend");

  const event = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
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

/**
 * Tests that the accept/decline buttons are still shown when the event is
 * already present in the calendar with a newer DTSTAMP (but the same SEQUENCE)
 * and the user's own participation status is still NEEDS-ACTION. This is the
 * state reached after another attendee replies and the server re-stamps the
 * stored event: the invitation must not be treated as "already processed"
 * (bug 1760272).
 */
add_task(async function testButtonsShownAfterOtherAttendeeReplied() {
  transport.reset();

  // Same UID and SEQUENCE as data/single-event.eml, but a newer DTSTAMP and our
  // own PARTSTAT still NEEDS-ACTION, as if another attendee (Other) had just
  // accepted and the server had re-written the stored copy.
  const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
  parser.parseString(
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      "BEGIN:VEVENT",
      "UID:02e79b96",
      "SEQUENCE:0",
      "DTSTAMP:20220317T191602Z",
      "DTSTART:20220316T110000Z",
      "DTEND:20220316T113000Z",
      "SUMMARY:Single Event",
      "LOCATION:Somewhere",
      "STATUS:CONFIRMED",
      "ORGANIZER;CN=Sender:mailto:sender@example.com",
      "ATTENDEE;CN=Sender;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:sender@example.com",
      "ATTENDEE;CN=Receiver;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:receiver@example.com",
      "ATTENDEE;CN=Other;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:other@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")
  );
  const [storedEvent] = parser.getItems();
  const addedEvent = await calendar.addItem(storedEvent);

  let modifiedEvent;
  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  try {
    const aboutMessage = win.document.getElementById("messageBrowser").contentWindow;

    const acceptButton = aboutMessage.document.getElementById("imipAcceptButton");
    await TestUtils.waitForCondition(
      () => !acceptButton.hidden,
      "accept button is shown even though the stored event has a newer DTSTAMP"
    );

    const declineButton = aboutMessage.document.getElementById("imipDeclineButton");
    Assert.ok(!declineButton.hidden, "imipDeclineButton is shown");

    // Accepting must act on the stored copy, not the (older) email: the user's
    // own status becomes ACCEPTED while the other attendee's already-synced
    // ACCEPTED status is preserved rather than reverted to the email's
    // NEEDS-ACTION.
    await clickAction(win, "imipAcceptButton");

    // Wait for the acceptance to be written back to the stored event.
    await TestUtils.waitForCondition(async () => {
      const item = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
      return item.lastModifiedTime;
    }, "the stored event has been modified");

    modifiedEvent = (await CalendarTestUtils.monthView.waitForItemAt(window, 3, 4, 1)).item;
    Assert.equal(
      modifiedEvent.getAttendeeById("mailto:receiver@example.com").participationStatus,
      "ACCEPTED",
      "the user's own status is now ACCEPTED"
    );
    Assert.equal(
      modifiedEvent.getAttendeeById("mailto:other@example.com").participationStatus,
      "ACCEPTED",
      "other attendee's synced ACCEPTED status is preserved (not taken from the email)"
    );
  } finally {
    await calendar.deleteItem(modifiedEvent ?? addedEvent);
    await BrowserTestUtils.closeWindow(win);
  }
});
