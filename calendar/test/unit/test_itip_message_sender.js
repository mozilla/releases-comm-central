/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { CalAttendee } = ChromeUtils.import("resource:///modules/CalAttendee.jsm");
var { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");
var { CalItipMessageSender } = ChromeUtils.import("resource:///modules/CalItipMessageSender.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

const identityEmail = "user@example.com";
const eventOrganizerEmail = "eventorganizer@example.com";

/**
 * Creates a calendar event mimicking an event to which we have received an
 * invitation.
 *
 * @param {string} organizerEmail - The email address of the event organizer.
 * @param {string} attendeeEmail - The email address of an attendee who has
 *   accepted the invitation.
 * @returns {calIItemBase} - The new calendar event.
 */
function createIncomingEvent(organizerEmail, attendeeEmail) {
  const organizerId = cal.email.prependMailTo(organizerEmail);
  const attendeeId = cal.email.prependMailTo(attendeeEmail);

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
      ORGANIZER;CN=${organizerEmail}:${organizerId}
      ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
        RSVP=TRUE;CN=other@example.com;:mailto:other@example.com
      ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
        RSVP=TRUE;CN=${attendeeEmail};:${attendeeId}
      X-MOZ-RECEIVED-SEQUENCE:0
      X-MOZ-RECEIVED-DTSTAMP:20210501T000000Z
      X-MOZ-GENERATION:0
      END:VEVENT
    `;

  return new CalEvent(icalString);
}

let calendar;

/**
 * Ensure the calendar manager is available, initialize the calendar and
 * identity we use for testing.
 */
add_setup(async function () {
  do_get_profile();

  await new Promise(resolve => do_load_calmgr(resolve));
  calendar = CalendarTestUtils.createCalendar("Test", "memory");

  const identity = MailServices.accounts.createIdentity();
  identity.email = identityEmail;

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );
  account.addIdentity(identity);

  registerCleanupFunction(() => {
    MailServices.accounts.removeIncomingServer(account.incomingServer, false);
    MailServices.accounts.removeAccount(account);
  });

  calendar.setProperty("imip.identity.key", identity.key);
  calendar.setProperty("organizerId", cal.email.prependMailTo(identityEmail));
});

add_task(async function testAddAttendeesToOwnEvent() {
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
      X-MOZ-SEND-INVITATIONS:TRUE
      END:VEVENT
    `;

  const item = new CalEvent(icalString);
  const savedItem = await calendar.addItem(item);

  // Modify the event to include an attendee not in the original, as well as the
  // organizer. As of the writing of this test, this is the expected behavior
  // for adding an attendee to an event which previously had none.
  const newAttendeeEmail = "foo@example.com";
  const newAttendee = new CalAttendee();
  newAttendee.id = newAttendeeEmail;

  const organizer = new CalAttendee();
  organizer.isOrganizer = true;
  organizer.id = identityEmail;

  const organizerAsAttendee = new CalAttendee();
  organizerAsAttendee.id = identityEmail;

  const targetItem = savedItem.clone();
  targetItem.addAttendee(newAttendee);
  targetItem.addAttendee(organizer);
  targetItem.addAttendee(organizerAsAttendee);
  const modifiedItem = await calendar.modifyItem(targetItem, savedItem);

  // Test that a sender with an original item and for which the current user is
  // both an attendee and the organizer will generate a REQUEST, but not send a
  // message to the organizer.
  const sender = new CalItipMessageSender(savedItem, null);

  const result = sender.buildOutgoingMessages(Ci.calIOperationListener.MODIFY, modifiedItem);
  Assert.equal(result, 1, "return value should indicate there are pending messages");
  Assert.equal(sender.pendingMessageCount, 1, "there should be one pending message");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REQUEST", "message method should be 'REQUEST'");
  Assert.equal(msg.recipients.length, 1, "message should have one recipient");

  const [recipient] = msg.recipients;
  Assert.equal(
    recipient.id,
    cal.email.prependMailTo(newAttendeeEmail),
    "recipient should be the non-organizer attendee"
  );

  await calendar.deleteItem(modifiedItem);

  // Now also cancel the event. No mail should be sent to self.
  const targetItem2 = modifiedItem.clone();

  targetItem2.setProperty("STATUS", "CANCELLED");
  targetItem2.setProperty("SEQUENCE", "2");
  const modifiedItem2 = await calendar.addItem(targetItem2);
  const sender2 = new CalItipMessageSender(modifiedItem2, null);

  const result2 = sender2.buildOutgoingMessages(Ci.calIOperationListener.MODIFY, modifiedItem2);
  Assert.equal(result2, 1, "return value should indicate there are pending messages");
  Assert.equal(sender2.pendingMessageCount, 1, "there should be one pending message");

  const [msg2] = sender2.pendingMessages;
  Assert.equal(msg2.method, "CANCEL", "deletion message method should be 'CANCEL'");
  Assert.equal(msg2.recipients.length, 1, "deletion message should have one recipient");

  const [recipient2] = msg2.recipients;
  Assert.equal(
    recipient2.id,
    cal.email.prependMailTo(newAttendeeEmail),
    "for deletion message, recipient should be the non-organizer attendee"
  );
});

add_task(async function testAddAdditionalAttendee() {
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
      ORGANIZER;CN=${identityEmail}:${cal.email.prependMailTo(identityEmail)}
      ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
        RSVP=TRUE;CN=other@example.com;:mailto:other@example.com
      ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
        RSVP=TRUE;CN=${identityEmail};:${cal.email.prependMailTo(identityEmail)}
      X-MOZ-SEND-INVITATIONS:TRUE
      END:VEVENT
    `;

  const item = new CalEvent(icalString);
  const savedItem = await calendar.addItem(item);

  // Modify the event to include an attendee not in the original.
  const newAttendeeEmail = "bar@example.com";
  const newAttendee = new CalAttendee();
  newAttendee.id = newAttendeeEmail;

  const organizer = new CalAttendee();
  organizer.isOrganizer = true;
  organizer.id = identityEmail;

  const organizerAsAttendee = new CalAttendee();
  organizerAsAttendee.id = identityEmail;

  const targetItem = savedItem.clone();
  targetItem.addAttendee(newAttendee);
  const modifiedItem = await calendar.modifyItem(targetItem, savedItem);

  // Test that adding an attendee won't cause messages to be sent to the
  // existing attendees.
  const sender = new CalItipMessageSender(savedItem, null);

  const result = sender.buildOutgoingMessages(Ci.calIOperationListener.MODIFY, modifiedItem);
  Assert.equal(result, 1, "return value should indicate there are pending messages");
  Assert.equal(sender.pendingMessageCount, 1, "there should be one pending message");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REQUEST", "message method should be 'REQUEST'");
  Assert.equal(msg.recipients.length, 1, "message should have one recipient");

  const [recipient] = msg.recipients;
  Assert.equal(
    recipient.id,
    cal.email.prependMailTo(newAttendeeEmail),
    "recipient should be the new attendee"
  );

  await calendar.deleteItem(modifiedItem);
});

add_task(async function testInvitationReceived() {
  const item = createIncomingEvent(eventOrganizerEmail, identityEmail);
  const savedItem = await calendar.addItem(item);

  const attendeeId = cal.email.prependMailTo(identityEmail);

  // Test that a sender with no original item and for which the current user is
  // an attendee but not the organizer (representing a new incoming invitation)
  // generates a single pending REPLY message on ADD.
  const currentUserAsAttendee = savedItem.getAttendeeById(attendeeId);
  const sender = new CalItipMessageSender(null, currentUserAsAttendee);

  const result = sender.buildOutgoingMessages(Ci.calIOperationListener.ADD, savedItem);
  Assert.equal(result, 1, "return value should indicate there are pending messages");
  Assert.equal(sender.pendingMessageCount, 1, "there should be one pending message");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REPLY", "message method should be 'REPLY'");
  Assert.equal(msg.recipients.length, 1, "message should have one recipient");

  const [recipient] = msg.recipients;
  Assert.equal(
    recipient.id,
    cal.email.prependMailTo(eventOrganizerEmail),
    "recipient should be the event organizer"
  );

  const attendeeList = msg.item.getAttendees();
  Assert.equal(attendeeList.length, 1, "there should be one attendee listed in the message");

  const [attendee] = attendeeList;
  Assert.equal(attendee.id, attendeeId, "listed attendee should be the current user");
  Assert.equal(
    attendee.participationStatus,
    "ACCEPTED",
    "current user's participation status should be 'ACCEPTED'"
  );

  await calendar.deleteItem(savedItem);
});

add_task(async function testParticipationStatusUpdated() {
  const item = createIncomingEvent(eventOrganizerEmail, identityEmail);
  const savedItem = await calendar.addItem(item);

  const attendeeId = cal.email.prependMailTo(identityEmail);

  // Modify the event to update the user's participation status.
  const targetItem = savedItem.clone();
  const currentUserAsAttendee = targetItem.getAttendeeById(attendeeId);
  currentUserAsAttendee.participationStatus = "TENTATIVE";
  const modifiedItem = await calendar.modifyItem(targetItem, savedItem);

  // Test that a sender for which the current user is an attendee but not the
  // organizer will generate a pending REPLY message on MODIFY.
  const sender = new CalItipMessageSender(savedItem, currentUserAsAttendee);
  const result = sender.buildOutgoingMessages(Ci.calIOperationListener.MODIFY, modifiedItem);

  Assert.equal(result, 1, "return value should indicate there are pending messages");
  Assert.equal(sender.pendingMessageCount, 1, "there should be one pending message");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REPLY", "message method should be 'REPLY'");
  Assert.equal(msg.recipients.length, 1, "message should have one recipient");

  const [recipient] = msg.recipients;
  Assert.equal(
    recipient.id,
    cal.email.prependMailTo(eventOrganizerEmail),
    "recipient should be the event organizer"
  );

  const attendeeList = msg.item.getAttendees();
  Assert.equal(attendeeList.length, 1, "there should be one attendee listed in the message");

  const [attendee] = attendeeList;
  Assert.equal(attendee.id, attendeeId, "listed attendee should be the current user");
  Assert.equal(
    attendee.participationStatus,
    "TENTATIVE",
    "current user's participation status should be 'TENTATIVE'"
  );

  await calendar.deleteItem(modifiedItem);
});

add_task(async function testEventDeleted() {
  const item = createIncomingEvent(eventOrganizerEmail, identityEmail);
  const savedItem = await calendar.addItem(item);

  const attendeeId = cal.email.prependMailTo(identityEmail);

  await calendar.deleteItem(savedItem);
  const currentUserAsAttendee = savedItem.getAttendeeById(attendeeId);

  // Test that a sender with no original item and for which the current user is
  // an attendee but not the organizer (representing the user deleting an event
  // from their calendar) generates a single REPLY message to the organizer on
  // DELETE.
  const sender = new CalItipMessageSender(null, currentUserAsAttendee);
  const result = sender.buildOutgoingMessages(Ci.calIOperationListener.DELETE, savedItem);

  Assert.equal(result, 1, "return value should indicate there are pending messages");
  Assert.equal(sender.pendingMessageCount, 1, "there should be one pending message");

  const [msg] = sender.pendingMessages;
  Assert.equal(msg.method, "REPLY", "message method should be 'REPLY'");
  Assert.equal(msg.recipients.length, 1, "message should have one recipient");

  const [recipient] = msg.recipients;
  Assert.equal(
    recipient.id,
    cal.email.prependMailTo(eventOrganizerEmail),
    "recipient should be the event organizer"
  );

  const attendeeList = msg.item.getAttendees();
  Assert.equal(attendeeList.length, 1, "there should be one attendee listed in the message");

  const [attendee] = attendeeList;
  Assert.equal(attendee.id, attendeeId, "listed attendee should be the current user");
  Assert.equal(
    attendee.participationStatus,
    "DECLINED",
    "current user's participation status should be 'DECLINED'"
  );
});
