/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAttendeesWindow, closeAttendeesWindow, findAndFocusMatchingRow */

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "day");
  CalendarTestUtils.goToDate(window, 2023, 2, 18);
});

add_task(async function testBackingOutWithNoAttendees() {
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

  findAndFocusMatchingRow(attendeesWindow, "there should be a row matching the organizer", value =>
    value.includes(calendar.getProperty("organizerCN"))
  );

  // We changed our mind. Save and close the event.
  await closeAttendeesWindow(attendeesWindow);
  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  // The event is still counted as modified even with no changes. If this
  // changes in the future, we'll just need to wait a reasonable time and fetch
  // the event again.
  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  const editedEvent = await calendar.getItem(eventId);

  // Verify that the organizer was set on the event.
  const organizer = editedEvent.organizer;
  Assert.ok(!organizer, "there should still be no organizer for the event");

  const attendees = editedEvent.getAttendees();
  Assert.equal(attendees.length, 0, "there should still be no attendees of the event");

  CalendarTestUtils.removeCalendar(calendar);
});
