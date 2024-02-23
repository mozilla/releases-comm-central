/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAttendeesWindow, closeAttendeesWindow, findAndEditMatchingRow */

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "day");
  CalendarTestUtils.goToDate(window, 2023, 2, 18);
});

add_task(async function testRemoveOrganizerAttendee() {
  const calendar = CalendarTestUtils.createCalendar();
  calendar.setProperty("organizerId", "mailto:jim@example.com");
  calendar.setProperty("organizerCN", "Jim James");

  // Create an event with several attendees, including one matching the current
  // organizer.
  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      ORGANIZER;CN="Foo Fooson":mailto:foo@example.com
      ATTENDEE;CN="Foo Fooson";PARTSTAT=TENTATIVE;ROLE=REQ-PARTICIPANT:mailto:f
       oo@example.com
      ATTENDEE;CN="Bar Barrington";PARTSTAT=DECLINED;ROLE=CHAIR:mailto:bar@exam
       ple.com
      ATTENDEE;CN="Baz Luhrmann";PARTSTAT=NEEDS-ACTION;ROLE=OPT-PARTICIPANT;RSV
       P=TRUE:mailto:baz@example.com
      END:VEVENT
    `)
  );

  // Remember event details so we can refetch it after editing.
  const eventId = event.id;
  const eventModified = event.lastModifiedTime;

  // Sanity check. Note that order of attendees is not significant and thus not
  // guaranteed.
  const organizer = event.organizer;
  Assert.ok(organizer, "the organizer should be set");
  Assert.equal(organizer.id, "mailto:foo@example.com", "organizer ID should match");
  Assert.equal(organizer.commonName, "Foo Fooson", "organizer name should match");

  const attendees = event.getAttendees();
  Assert.equal(attendees.length, 3, "there should be three attendees of the event");

  const fooFooson = attendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(fooFooson, "an attendee should match the organizer");
  Assert.equal(fooFooson.commonName, "Foo Fooson", "attendee name should match");
  Assert.equal(fooFooson.participationStatus, "TENTATIVE", "attendee should be marked tentative");
  Assert.equal(fooFooson.role, "REQ-PARTICIPANT", "attendee should be required");

  const barBarrington = attendees.find(attendee => attendee.id == "mailto:bar@example.com");
  Assert.ok(barBarrington, "an attendee should have the address bar@example.com");
  Assert.equal(barBarrington.commonName, "Bar Barrington", "attendee name should match");
  Assert.equal(barBarrington.participationStatus, "DECLINED", "attendee should have declined");
  Assert.equal(barBarrington.role, "CHAIR", "attendee should be the meeting chair");

  const bazLuhrmann = attendees.find(attendee => attendee.id == "mailto:baz@example.com");
  Assert.ok(bazLuhrmann, "an attendee should have the address baz@example.com");
  Assert.equal(bazLuhrmann.commonName, "Baz Luhrmann", "attendee name should match");
  Assert.equal(
    bazLuhrmann.participationStatus,
    "NEEDS-ACTION",
    "attendee should not have responded yet"
  );
  Assert.equal(bazLuhrmann.role, "OPT-PARTICIPANT", "attendee should be optional");
  Assert.equal(bazLuhrmann.rsvp, "TRUE", "attendee should be expected to RSVP");

  // Open our event for editing.
  const { dialogWindow: eventWindow } = await CalendarTestUtils.dayView.editEventAt(window, 1);
  const attendeesWindow = await openAttendeesWindow(eventWindow);

  // Empty the row matching the organizer's attendee.
  findAndEditMatchingRow(
    attendeesWindow,
    "",
    "there should an input for attendee matching the organizer",
    value => value.includes("foo@example.com")
  );

  // Save and close the event.
  await closeAttendeesWindow(attendeesWindow);
  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  const editedEvent = await calendar.getItem(eventId);

  // Verify that the organizer hasn't changed.
  const editedOrganizer = editedEvent.organizer;
  Assert.ok(editedOrganizer, "the organizer should still be set on the event after editing");
  Assert.equal(
    editedOrganizer.id,
    "mailto:foo@example.com",
    "organizer ID should not have changed"
  );
  Assert.equal(editedOrganizer.commonName, "Foo Fooson", "organizer name should not have changed");

  const editedAttendees = editedEvent.getAttendees();
  Assert.equal(
    editedAttendees.length,
    2,
    "there should be two attendees of the event after editing"
  );

  // Verify that the attendee matching the organizer was removed.
  const editedFooFooson = editedAttendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(!editedFooFooson, "there should be no attendee matching the organizer after editing");

  // Verify that the second attendee's properties remain untouched.
  const editedBarBarrington = editedAttendees.find(
    attendee => attendee.id == "mailto:bar@example.com"
  );
  Assert.ok(editedBarBarrington, "an attendee should have the address bar@example.com");
  Assert.equal(editedBarBarrington.commonName, "Bar Barrington", "attendee name should match");
  Assert.equal(
    editedBarBarrington.participationStatus,
    "DECLINED",
    "attendee should have declined"
  );
  Assert.equal(editedBarBarrington.role, "CHAIR", "attendee should be the meeting chair");

  // Verify that the final attendee's properties remain untouched.
  const editedBazLuhrmann = editedAttendees.find(
    attendee => attendee.id == "mailto:baz@example.com"
  );
  Assert.ok(editedBazLuhrmann, "an attendee should have the address baz@example.com");
  Assert.equal(editedBazLuhrmann.commonName, "Baz Luhrmann", "attendee name should match");
  Assert.equal(
    editedBazLuhrmann.participationStatus,
    "NEEDS-ACTION",
    "attendee should not have responded yet"
  );
  Assert.equal(editedBazLuhrmann.role, "OPT-PARTICIPANT", "attendee should be optional");
  Assert.equal(editedBazLuhrmann.rsvp, "TRUE", "attendee should be expected to RSVP");

  CalendarTestUtils.removeCalendar(calendar);
});
