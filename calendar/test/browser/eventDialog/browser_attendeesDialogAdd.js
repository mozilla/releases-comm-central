/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAttendeesWindow, closeAttendeesWindow, findAndEditMatchingRow */

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "day");
  CalendarTestUtils.goToDate(window, 2023, 2, 18);
});

add_task(async function testAddAttendeeToEventWithNone() {
  const calendar = CalendarTestUtils.createCalendar();
  calendar.setProperty("organizerId", "mailto:foo@example.com");
  calendar.setProperty("organizerCN", "Foo Fooson");

  // Create an event which currently has no attendees or organizer.
  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      END:VEVENT
    `)
  );

  // Remember event details so we can refetch it after editing.
  const eventId = event.id;
  const eventModified = event.lastModifiedTime;

  // Sanity check.
  Assert.equal(event.organizer, null, "event should not have an organizer");
  Assert.equal(event.getAttendees().length, 0, "event should not have any attendees");

  // Open our event for editing.
  const { dialogWindow: eventWindow } = await CalendarTestUtils.dayView.editEventAt(window, 1);
  const attendeesWindow = await openAttendeesWindow(eventWindow);

  // Set text in the empty row to create a new attendee.
  findAndEditMatchingRow(
    attendeesWindow,
    "bar@example.com",
    "there should an empty input",
    value => value === ""
  );

  // Save and close the event.
  await closeAttendeesWindow(attendeesWindow);
  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  const editedEvent = await calendar.getItem(eventId);

  // Verify that the organizer was set on the event.
  const organizer = editedEvent.organizer;
  Assert.ok(organizer, "there should be an organizer for the event after editing");
  Assert.equal(
    organizer.id,
    "mailto:foo@example.com",
    "organizer ID should match calendar property"
  );
  Assert.equal(organizer.commonName, "Foo Fooson", "organizer name should match calendar property");

  const attendees = editedEvent.getAttendees();
  Assert.equal(attendees.length, 2, "there should be two attendees of the event after editing");

  // Verify that the organizer was added as an attendee.
  const fooFooson = attendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(fooFooson, "the organizer should have been added as an attendee");
  Assert.equal(fooFooson.commonName, "Foo Fooson", "attendee name should match organizer's");
  Assert.equal(
    fooFooson.participationStatus,
    "ACCEPTED",
    "organizer attendee should have automatically accepted"
  );
  Assert.equal(fooFooson.role, "REQ-PARTICIPANT", "organizer attendee should be required");

  // Verify that the attendee we added to the list is represented on the event.
  const barBarrington = attendees.find(attendee => attendee.id == "mailto:bar@example.com");
  Assert.ok(barBarrington, "an attendee should have the address bar@example.com");
  Assert.equal(barBarrington.commonName, null, "new attendee name should not be set");
  Assert.equal(
    barBarrington.participationStatus,
    "NEEDS-ACTION",
    "new attendee should have default participation status"
  );
  Assert.equal(barBarrington.role, "REQ-PARTICIPANT", "new attendee should have default role");

  CalendarTestUtils.removeCalendar(calendar);
});

add_task(async function testAddAttendeeToEventWithoutOrganizerAsAttendee() {
  const calendar = CalendarTestUtils.createCalendar();
  calendar.setProperty("organizerId", "mailto:foo@example.com");
  calendar.setProperty("organizerCN", "Foo Fooson");

  // Create an event which has an organizer and attendees, but no attendee
  // matching the organizer.
  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      ORGANIZER;CN="Foo Fooson":mailto:foo@example.com
      ATTENDEE;CN="Bar Barrington";PARTSTAT=DECLINED;ROLE=CHAIR:mailto:bar@examp
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
  const organizer = event.organizer;
  Assert.ok(organizer, "the organizer should be set");
  Assert.equal(organizer.id, "mailto:foo@example.com", "organizer ID should match");
  Assert.equal(organizer.commonName, "Foo Fooson", "organizer name should match");

  const attendees = event.getAttendees();
  Assert.equal(attendees.length, 2, "there should be two attendees of the event");

  const fooFooson = attendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(!fooFooson, "there should be no attendee matching the organizer");

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

  // Verify that we don't display an attendee for the organizer if there is no
  // attendee on the event for them.
  const attendeeList = attendeesWindow.document.getElementById("attendee-list");
  const attendeeInput = Array.from(attendeeList.children)
    .map(child => child.querySelector("input"))
    .find(input => {
      return input ? input.value.includes("foo@example.com") : false;
    });
  Assert.ok(!attendeeInput, "there should be no row in the dialog for the organizer");

  // Set text in the empty row to create a new attendee.
  findAndEditMatchingRow(
    attendeesWindow,
    "Jim James <jim@example.com>",
    "there should an empty input",
    value => value === ""
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
    3,
    "there should be three attendees of the event after editing"
  );

  // Verify that no attendee matching the organizer was added.
  const editedFooFooson = editedAttendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(!editedFooFooson, "there should still be no attendee matching the organizer");

  // Verify that a new attendee was added.
  const jimJames = editedAttendees.find(attendee => attendee.id == "mailto:jim@example.com");
  Assert.ok(jimJames, "an attendee should have the address jim@example.com");
  Assert.equal(jimJames.commonName, "Jim James", "new attendee name should be set");
  Assert.equal(
    jimJames.participationStatus,
    "NEEDS-ACTION",
    "new attendee should have default participation status"
  );
  Assert.equal(jimJames.role, "REQ-PARTICIPANT", "new attendee should have default role");

  // Verify that the original first attendee's properties remain untouched.
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

  // Verify that the original second attendee's properties remain untouched.
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
