/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");
var { CalItipMessageSender } = ChromeUtils.import("resource:///modules/CalItipMessageSender.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

const identityEmail = "user@example.com";
const calendarOrganizerId = "mailto:user@example.com";
const eventOrganizerEmail = "eventorganizer@example.com";
const eventOrganizerId = `mailto:${eventOrganizerEmail}`;
const icalString = CalendarTestUtils.dedent`
      BEGIN:VEVENT
      CREATED:20210105T000000Z
      DTSTAMP:20210501T000000Z
      UID:c1a6cfe7-7fbb-4bfb-a00d-861e07c649a5
      SUMMARY:Test Invitation
      DTSTART:20210105T000000Z
      DTEND:20210105T100000Z
      STATUS:CONFIRMED
      SUMMARY:Test Event
      ORGANIZER;CN=${eventOrganizerEmail}:${eventOrganizerId}
      ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
        RSVP=TRUE;CN=other@example.com;:mailto:other@example.com
      ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
        RSVP=TRUE;CN=${identityEmail};:${calendarOrganizerId}
      X-MOZ-RECEIVED-SEQUENCE:0
      X-MOZ-RECEIVED-DTSTAMP:20210501T000000Z
      X-MOZ-GENERATION:0
      END:VEVENT
    `;

let calendar;
let identity;

/**
 * Ensure the calendar manager is available, initialize the calendar and
 * identity we use for testing.
 */
add_setup(async function () {
  await new Promise(resolve => do_load_calmgr(resolve));
  calendar = CalendarTestUtils.createCalendar("Test", "memory");
  identity = MailServices.accounts.createIdentity();
  identity.email = identityEmail;
  calendar.setProperty("imip.identity.key", identity.key);
  calendar.setProperty("organizerId", calendarOrganizerId);
});

/**
 * Test receiving a new invitation queues a "REPLY" message.
 */
add_task(async function testInvitationReceived() {
  const item = new CalEvent(icalString);
  const savedItem = await calendar.addItem(item);
  const invitedAttendee = savedItem.getAttendeeById(calendarOrganizerId);
  const sender = new CalItipMessageSender(null, invitedAttendee);
  const result = sender.detectChanges(Ci.calIOperationListener.ADD, savedItem);
  Assert.equal(result, 1, "result indicates 1 pending message queued");
  Assert.equal(sender.pendingMessageCount, 1, "pendingMessageCount is 1");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REPLY", "message method is 'REPLY'");
  Assert.equal(msg.recipients.length, 1, "message has 1 recipient");

  const [recipient] = msg.recipients;
  Assert.equal(recipient.id, eventOrganizerId, "recipient is the event organizer");

  const attendeeList = msg.item.getAttendees();
  Assert.equal(attendeeList.length, 1, "reply attendees list has 1 attendee");

  const [attendee] = attendeeList;
  Assert.equal(attendee.id, calendarOrganizerId, "invited attendee is on the reply attendees list");
  Assert.equal(
    attendee.participationStatus,
    "ACCEPTED",
    "invited attendee participation status is 'ACCEPTED'"
  );

  await calendar.deleteItem(savedItem);
});

/**
 * Test updating the invited attendee's participation status queues a "REPLY"
 * message.
 */
add_task(async function testParticipationStatusUpdated() {
  const item = new CalEvent(icalString);
  const savedItem = await calendar.addItem(item);

  const targetItem = savedItem.clone();
  const invitedAttendee = targetItem.getAttendeeById(calendarOrganizerId);
  invitedAttendee.participationStatus = "TENTATIVE";

  const modifiedItem = await calendar.modifyItem(targetItem, savedItem);
  const sender = new CalItipMessageSender(savedItem, invitedAttendee);
  const result = sender.detectChanges(Ci.calIOperationListener.MODIFY, modifiedItem);
  Assert.equal(result, 1, "result indicates 1 pending message queued");
  Assert.equal(sender.pendingMessageCount, 1, "pendingMessageCount is 1");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REPLY", "message method is 'REPLY'");
  Assert.equal(msg.recipients.length, 1, "message has 1 recipient");

  const [recipient] = msg.recipients;
  Assert.equal(recipient.id, eventOrganizerId, "recipient is the event organizer");

  const attendeeList = msg.item.getAttendees();
  Assert.equal(attendeeList.length, 1, "reply attendees list has 1 attendee");

  const [attendee] = attendeeList;
  Assert.equal(attendee.id, calendarOrganizerId, "invited attendee is on the reply attendees list");
  Assert.equal(
    attendee.participationStatus,
    "TENTATIVE",
    "invited attendee participation status is 'TENTATIVE'"
  );

  await calendar.deleteItem(modifiedItem);
});

/**
 * Test deleting an event queues a "CANCEL" message.
 */
add_task(async function testEventDeleted() {
  const item = new CalEvent(icalString);
  const savedItem = await calendar.addItem(item);

  await calendar.deleteItem(savedItem);
  const invitedAttendee = savedItem.getAttendeeById(calendarOrganizerId);
  const sender = new CalItipMessageSender(null, invitedAttendee);
  const result = sender.detectChanges(Ci.calIOperationListener.DELETE, savedItem);
  Assert.equal(result, 1, "result indicates 1 pending message queued");
  Assert.equal(sender.pendingMessageCount, 1, "pendingMessageCount is 1");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REPLY", "message method is 'REPLY'");
  Assert.equal(msg.recipients.length, 1, "message has 1 recipient");

  const [recipient] = msg.recipients;
  Assert.equal(recipient.id, eventOrganizerId, "recipient is the event organizer");

  const attendeeList = msg.item.getAttendees();
  Assert.equal(attendeeList.length, 1, "reply attendees list has 1 attendee");

  const [attendee] = attendeeList;
  Assert.equal(attendee.id, calendarOrganizerId, "invited attendee is on the reply attendees list");
  Assert.equal(
    attendee.participationStatus,
    "DECLINED",
    "invited attendee status changed to 'DECLINED'"
  );
});
