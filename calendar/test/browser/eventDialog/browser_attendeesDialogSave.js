/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAttendeesWindow, closeAttendeesWindow */

const { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");

add_task(async function testAttendeeProperties() {
  const calendar = CalendarTestUtils.createCalendar();
  calendar.setProperty("organizerId", "mailto:foo@example.com");

  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      ORGANIZER;CN="Foo Fooson":mailto:foo@example.com
      ATTENDEE;CN="Foo Fooson";PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:fo
       o@example.com
      ATTENDEE;CN="Bar Barington";PARTSTAT=TENTATIVE;ROLE=CHAIR:mailto:bar@exam
       ple.com
      ATTENDEE;CN="Baz Luhrmann";PARTSTAT=NEEDS-ACTION;ROLE=OPT-PARTICIPANT;RSV
       P=TRUE:mailto:baz@example.com
      END:VEVENT
    `)
  );

  // Remember event details so we can refetch it after editing.
  const eventId = event.id;
  const eventModified = event.lastModifiedTime;

  // Sanity check.
  const attendees = event.getAttendees();
  Assert.equal(attendees.length, 3, "there should be three attendees of the event");

  const fooFooson = attendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(fooFooson, "an attendee should have the address foo@example.com");
  Assert.equal(fooFooson.commonName, "Foo Fooson", "attendee name should match");
  Assert.equal(fooFooson.participationStatus, "ACCEPTED", "attendee should have accepted invite");
  Assert.equal(fooFooson.role, "REQ-PARTICIPANT", "attendee should be required");

  const barBarrington = attendees.find(attendee => attendee.id == "mailto:bar@example.com");
  Assert.ok(barBarrington, "an attendee should have the address bar@example.com");
  Assert.equal(barBarrington.commonName, "Bar Barington", "attendee name should match");
  Assert.equal(barBarrington.participationStatus, "TENTATIVE", "attendee should be tentative");
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

  // Open an event for editing.
  await CalendarTestUtils.setCalendarView(window, "day");
  CalendarTestUtils.goToDate(window, 2023, 2, 18);
  const { dialogWindow: eventWindow } = await CalendarTestUtils.dayView.editEventAt(window, 1);
  const attendeesWindow = await openAttendeesWindow(eventWindow);

  // Get the row for an attendee we wish to edit.
  const attendeeList = attendeesWindow.document.getElementById("attendee-list");
  let attendeeInput;
  for (const child of attendeeList.children) {
    const input = child.querySelector("input");
    if (input && input.value.includes("bar@example.com")) {
      attendeeInput = input;
      break;
    }
  }
  Assert.ok(attendeeInput, "there should an input containing the provided email");

  // Replace text in the row to change attendee name.
  attendeeInput.focus();
  attendeeInput.value = "Bar Barrington <bar@example.com>";
  EventUtils.synthesizeKey("VK_RETURN", {}, attendeesWindow);

  // Save and close the event.
  await closeAttendeesWindow(attendeesWindow);
  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  // Verify that attendee properties have not been overwritten or lost.
  const editedEvent = await calendar.getItem(eventId);
  const editedAttendees = editedEvent.getAttendees();
  Assert.equal(
    editedAttendees.length,
    3,
    "there should be three attendees of the event after editing"
  );

  const editedFooFooson = editedAttendees.find(attendee => attendee.id == "mailto:foo@example.com");
  Assert.ok(editedFooFooson, "an attendee should have the address foo@example.com");
  Assert.equal(editedFooFooson.commonName, "Foo Fooson", "attendee name should match");
  Assert.equal(editedFooFooson.participationStatus, "ACCEPTED", "attendee should have accepted");
  Assert.equal(editedFooFooson.role, "REQ-PARTICIPANT", "attendee should be required");

  const editedBarBarrington = editedAttendees.find(
    attendee => attendee.id == "mailto:bar@example.com"
  );
  Assert.ok(editedBarBarrington, "an attendee should have the address bar@example.com");
  Assert.equal(editedBarBarrington.commonName, "Bar Barrington", "attendee name should match");
  Assert.equal(
    editedBarBarrington.participationStatus,
    "TENTATIVE",
    "attendee should be tentative"
  );
  Assert.equal(editedBarBarrington.role, "CHAIR", "attendee should be the meeting chair");

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
