/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that replying to an invitation that is already in the calendar hands
 * the scheduling responsibility over to the client when the calendar prefers
 * client-side email scheduling. Without that, the server sends a reply of its
 * own on top of the one Thunderbird sends.
 */
"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

// The UID of the event in data/single-event.eml.
const EVENT_UID = "02e79b96";

let identity;
let calendar;
let transport;

/**
 * Initialize account, identity and a calendar that looks like a CalDAV calendar
 * on a server that does its own scheduling.
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
  Object.defineProperty(calendar.wrappedJSObject, "type", {
    value: "caldav",
    configurable: true,
  });
  calendar.setProperty("capabilities.autoschedule.supported", true);
  calendar.setProperty("forceEmailScheduling", true);
  calendar.setProperty("imip.identity.key", identity.key);

  transport = new EmailTransport(account, identity);

  const getImipTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => transport;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
    cal.itip.getImipTransport = getImipTransport;
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Tests accepting an invitation that the calendar already knows about marks the
 * organizer for client-side scheduling.
 */
add_task(async function testAcceptExistingInvitation() {
  transport.reset();

  await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      UID:${EVENT_UID}
      SEQUENCE:0
      DTSTAMP:20220316T191602Z
      DTSTART:20220316T110000Z
      DTEND:20220316T113000Z
      SUMMARY:Single Event
      ORGANIZER;CN=Sender:mailto:sender@example.com
      ATTENDEE;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:sender@example.com
      ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:receiver@example.com
      END:VEVENT
    `)
  );

  const win = await openImipMessage(new FileUtils.File(getTestFilePath("data/single-event.eml")));
  await clickAction(win, "imipAcceptButton");

  let event;
  await TestUtils.waitForCondition(async () => {
    event = await calendar.getItem(EVENT_UID);
    return event?.getAttendeeById("mailto:receiver@example.com")?.participationStatus == "ACCEPTED";
  }, "waiting for the invitation to be accepted");

  Assert.equal(
    event.organizer.getProperty("SCHEDULE-AGENT"),
    "CLIENT",
    "the organizer should be marked for client-side scheduling"
  );
  Assert.equal(transport.sentItems.length, 1, "client should have sent the reply itself");

  // Don't delete the event, that would mark its UID as deleted and make the
  // other tests using data/single-event.eml prompt before processing it. The
  // calendar is removed on cleanup anyway.
  await BrowserTestUtils.closeWindow(win);
});
