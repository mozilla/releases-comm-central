/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the handling of calendarUserAddresses in calProviderUtils.sys.mjs
 */

var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { CalMemoryCalendar } = ChromeUtils.importESModule(
  "resource:///modules/CalMemoryCalendar.sys.mjs"
);
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

do_get_profile();

add_task(function test_calendarUserAddresses() {
  const event = new CalEvent(CalendarTestUtils.dedent`
        BEGIN:VEVENT
        UID:calendar-user-addresses
        DTSTAMP:20210501T000000Z
        DTSTART:20210105T000000Z
        DTEND:20210105T100000Z
        ORGANIZER:mailto:organizer@example.com
        ATTENDEE:mailto:invited@example.com
        END:VEVENT
      `);

  const calendar = new CalMemoryCalendar();
  const schedulingSupport = calendar.getSchedulingSupport();

  // Attendee matches one of the calendarUserAddresses -> invitation detected and attendee found.
  calendar.calendarUserAddresses = [
    "mailto:nobody1@example.com",
    "mailto:invited@example.com",
    "mailto:nobody2@example.com",
  ];
  event.calendar = calendar;
  Assert.ok(
    schedulingSupport.isInvitation(event),
    "isInvitation returns true when attendee matches calendarUserAddresses"
  );
  Assert.equal(
    schedulingSupport.getInvitedAttendee(event)?.id,
    "mailto:invited@example.com",
    "getInvitedAttendee resolves attendee via calendarUserAddresses"
  );

  // No match in calendarUserAddresses.
  calendar.calendarUserAddresses = ["mailto:different@example.com"];
  Assert.ok(
    !schedulingSupport.isInvitation(event),
    "isInvitation returns false when calendarUserAddresses do not match any attendee"
  );
  Assert.ok(
    !schedulingSupport.getInvitedAttendee(event),
    "getInvitedAttendee returns falsy when calendarUserAddresses do not match any attendee"
  );

  // Empty calendarUserAddresses.
  calendar.calendarUserAddresses = [];
  Assert.ok(
    !schedulingSupport.isInvitation(event),
    "isInvitation returns false when calendarUserAddresses is empty"
  );
  Assert.ok(
    !schedulingSupport.getInvitedAttendee(event),
    "getInvitedAttendee returns falsy when calendarUserAddresses is empty"
  );

  // Organizer is in calendarUserAddresses, so not an invitation.
  const organizerEvent = event.clone();
  organizerEvent.organizer.id = "mailto:organizer@example.com";
  calendar.calendarUserAddresses = [
    "mailto:nobody1@example.com",
    "mailto:organizer@example.com",
    "mailto:nobody2@example.com",
  ];
  organizerEvent.calendar = calendar;
  Assert.ok(
    !schedulingSupport.isInvitation(organizerEvent),
    "isInvitation is false when organizer is one of the calendarUserAddresses"
  );
});
