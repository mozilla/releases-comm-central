/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

function run_test() {
    // Test the graceful handling of attendee ids for bug 1199942
    createAttendee_test();
    serializeEvent_test();
}

function createAttendee_test() {
    let data = [{input: "mailto:user1@example.net", expected: "mailto:user1@example.net"},
                {input: "MAILTO:user2@example.net", expected: "mailto:user2@example.net"},
                {input: "user3@example.net", expected: "mailto:user3@example.net"},
                {input: "urn:uuid:user4", expected: "urn:uuid:user4"}];
    let event = cal.createEvent();
    for (let test of data) {
        let attendee = cal.createAttendee();
        attendee.id = test.input;
        event.addAttendee(attendee);
        let readAttendee = event.getAttendeeById(cal.prependMailTo(test.input));
        equal(readAttendee.id, test.expected);
    }
}

function serializeEvent_test() {
    let ics= "BEGIN:VCALENDAR\n" +
             "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN\n" +
             "VERSION:2.0\n" +
             "BEGIN:VEVENT\n" +
             "CREATED:20150801T213509Z\n" +
             "LAST-MODIFIED:20150830T164104Z\n" +
             "DTSTAMP:20150830T164104Z\n" +
             "UID:a84c74d1-cfc6-4ddf-9d60-9e4afd8238cf\n" +
             "SUMMARY:New Event\n" +
             "ORGANIZER;RSVP=TRUE;CN=Tester1;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:user1@example.net\n" +
             "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:MAILTO:user2@example.net\n" +
             "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:user3@example.net\n" +
             "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:user4@example.net\n" +
             "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:urn:uuid:user5\n" +
             "DTSTART:20150729T103000Z\n" +
             "DTEND:20150729T113000Z\n" +
             "TRANSP:OPAQUE\n" +
             "END:VEVENT\n" +
             "END:VCALENDAR\n";

    let expectedIds = ["mailto:user2@example.net",
                       "mailto:user3@example.net",
                       "mailto:user4@example.net",
                       "urn:uuid:user5"];
    let event = createEventFromIcalString(ics);
    let attendees = event.getAttendees({});

    // check whether all attendees get returned with expected id
    for (let attendee of attendees) {
        ok(expectedIds.includes(attendee.id));
    }

    // serialize the event again and check whether the attendees still are in shape
    let serializer = Components.classes["@mozilla.org/calendar/ics-serializer;1"]
                               .createInstance(Components.interfaces.calIIcsSerializer);
    serializer.addItems([event], [event].length);
    let serialized = ics_unfoldline(serializer.serializeToString());
    for (let id of expectedIds) {
        ok(serialized.search(id) != -1);
    }
}
