/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAttendeesWindow, closeAttendeesWindow, findAndEditMatchingRow */

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "day");
  CalendarTestUtils.goToDate(window, 2023, 2, 18);
});

add_task(async function testUpdateAttendee() {
  const calendar = CalendarTestUtils.createCalendar();
  calendar.setProperty("organizerId", "mailto:foo@example.com");

  // Create an event with several attendees, all of which should have some
  // non-default properties which aren't covered in the attendees dialog to
  // ensure that we aren't throwing properties away when we close the dialog.
  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      ORGANIZER;CN="Foo Fooson":mailto:foo@example.com
      ATTENDEE;CN="Foo Fooson";PARTSTAT=TENTATIVE;ROLE=REQ-PARTICIPANT:mailto:f
       oo@example.com
      ATTENDEE;CN="Bar Barington";PARTSTAT=DECLINED;ROLE=CHAIR:mailto:bar@examp
       le.com
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
  const attendees = event.getAttendees();
  Assert.equal(attendees.length, 3, "there should be three attendees of the event");

  const fooFooson = attendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(fooFooson, "an attendee should have the address foo@example.com");
  Assert.equal(fooFooson.commonName, "Foo Fooson", "attendee name should match");
  Assert.equal(fooFooson.participationStatus, "TENTATIVE", "attendee should be marked tentative");
  Assert.equal(fooFooson.role, "REQ-PARTICIPANT", "attendee should be required");

  const barBarrington = attendees.find(attendee => attendee.id == "mailto:bar@example.com");
  Assert.ok(barBarrington, "an attendee should have the address bar@example.com");
  Assert.equal(barBarrington.commonName, "Bar Barington", "attendee name should match");
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

  // Edit the second attendee to correct their name.
  findAndEditMatchingRow(
    attendeesWindow,
    "Bar Barrington <bar@example.com>",
    "there should an input containing the provided email",
    value => value.includes("bar@example.com")
  );

  // Save and close the event.
  await closeAttendeesWindow(attendeesWindow);
  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  const editedEvent = await calendar.getItem(eventId);
  const editedAttendees = editedEvent.getAttendees();
  Assert.equal(
    editedAttendees.length,
    3,
    "there should be three attendees of the event after editing"
  );

  // Verify that the first attendee's properties have not been overwritten or
  // lost.
  const editedFooFooson = editedAttendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(editedFooFooson, "an attendee should have the address foo@example.com");
  Assert.equal(editedFooFooson.commonName, "Foo Fooson", "attendee name should match");
  Assert.equal(
    editedFooFooson.participationStatus,
    "TENTATIVE",
    "attendee should be marked tentative"
  );
  Assert.equal(editedFooFooson.role, "REQ-PARTICIPANT", "attendee should be required");

  // Verify that the second attendee's name has been changed and all other
  // fields remain untouched.
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
