/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

function run_test() {
    // Test attendee duplicate handling for bug 1204255
    test_newAttendee();
    test_fromICS();
}

function test_newAttendee() {
    let data = [{
        input: [
            { id: "user2@example.net", partstat: "NEEDS-ACTION", cn: "NOT PREFIXED" },
            { id: "mailto:user2@example.net", partstat: "NEEDS-ACTION", cn: "PREFIXED" }
        ],
        expected: { id: "mailto:user2@example.net", partstat: "NEEDS-ACTION", cn: "PREFIXED" }
    }, {
        input: [
            { id: "mailto:user3@example.net", partstat: "NEEDS-ACTION", cn: "PREFIXED" },
            { id: "user3@example.net", partstat: "NEEDS-ACTION", cn: "NOT PREFIXED" }
        ],
        expected: { id: "mailto:user3@example.net", partstat: "NEEDS-ACTION", cn: "NOT PREFIXED" }
    }, {
        input: [
            { id: "mailto:user4@example.net", partstat: "ACCEPTED", cn: "PREFIXED" },
            { id: "user4@example.net", partstat: "TENTATIVE", cn: "NOT PREFIXED" }
        ],
        expected: { id: "mailto:user4@example.net", partstat: "ACCEPTED", cn: "PREFIXED" }
    }, {
        input: [
            { id: "user5@example.net", partstat: "TENTATIVE", cn: "NOT PREFIXED" },
            { id: "mailto:user5@example.net", partstat: "ACCEPTED", cn: "PREFIXED" }
        ],
        expected: { id: "mailto:user5@example.net", partstat: "TENTATIVE", cn: "NOT PREFIXED" }
    }, {
        input: [
            { id: "user6@example.net", partstat: "DECLINED", cn: "NOT PREFIXED" },
            { id: "mailto:user6@example.net", partstat: "TENTATIVE", cn: "PREFIXED" }
        ],
        expected: { id: "mailto:user6@example.net", partstat: "DECLINED", cn: "NOT PREFIXED" }
    }, {
        input: [
            { id: "user7@example.net", partstat: "TENTATIVE", cn: "NOT PREFIXED" },
            { id: "mailto:user7@example.net", partstat: "DECLINED", cn: "PREFIXED" }
        ],
        expected: { id: "mailto:user7@example.net", partstat: "DECLINED", cn: "PREFIXED" }
    }];

    let event = cal.createEvent();
    for (let test of data) {
        for (let input of test.input) {
            let attendee = cal.createAttendee();
            attendee.id = input.id;
            attendee.participationStatus = input.partstat;
            attendee.commonName = input.cn;
            event.addAttendee(attendee);
        }
        let readAttendee = event.getAttendeeById(cal.prependMailTo(test.expected.id));
        equal(readAttendee.id, test.expected.id);
        equal(readAttendee.participationStatus, test.expected.partstat, "partstat matches for " + test.expected.id);
        equal(readAttendee.commonName, test.expected.cn, "cn matches for " + test.expected.id);
    }
}

function test_fromICS() {
    let ics = [
        'BEGIN:VCALENDAR',
        'PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:a84c74d1-cfc6-4ddf-9d60-9e4afd8238cf',
        'SUMMARY:New Event',
        'DTSTART:20150729T103000Z',
        'DTEND:20150729T113000Z',
        'ORGANIZER;RSVP=TRUE;CN=Tester1;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:user1@example.net',

        'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="NOT PREFIXED";ROLE=REQ-PARTICIPANT:user2@example.net',
        'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="PREFIXED";ROLE=REQ-PARTICIPANT:mailto:user2@example.net',

        'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="PREFIXED";ROLE=REQ-PARTICIPANT:mailto:user3@example.net',
        'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="NOT PREFIXED";ROLE=REQ-PARTICIPANT:user3@example.net',

        'ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED;CN="PREFIXED";ROLE=REQ-PARTICIPANT:mailto:user4@example.net',
        'ATTENDEE;RSVP=TRUE;PARTSTAT=TENTATIVE;CN="NOT PREFIXED";ROLE=REQ-PARTICIPANT:user4@example.net',

        'ATTENDEE;RSVP=TRUE;PARTSTAT=TENTATIVE;CN="NOT PREFIXED";ROLE=REQ-PARTICIPANT:user5@example.net',
        'ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED;CN="PREFIXED";ROLE=REQ-PARTICIPANT:mailto:user5@example.net',

        'ATTENDEE;RSVP=TRUE;PARTSTAT=DECLINED;CN="NOT PREFIXED";ROLE=REQ-PARTICIPANT:user6@example.net',
        'ATTENDEE;RSVP=TRUE;PARTSTAT=TENTATIVE;CN="PREFIXED";ROLE=REQ-PARTICIPANT:mailto:user6@example.net',

        'ATTENDEE;RSVP=TRUE;PARTSTAT=TENTATIVE;CN="NOT PREFIXED";ROLE=REQ-PARTICIPANT:user7@example.net',
        'ATTENDEE;RSVP=TRUE;PARTSTAT=DECLINED;CN="PREFIXED";ROLE=REQ-PARTICIPANT:mailto:user7@example.net',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join("\n");

    let expected = [
        { id: "mailto:user2@example.net", partstat: "NEEDS-ACTION", cn: "PREFIXED" },
        { id: "mailto:user3@example.net", partstat: "NEEDS-ACTION", cn: "NOT PREFIXED" },
        { id: "mailto:user4@example.net", partstat: "ACCEPTED", cn: "PREFIXED" },
        { id: "mailto:user5@example.net", partstat: "TENTATIVE", cn: "NOT PREFIXED" },
        { id: "mailto:user6@example.net", partstat: "DECLINED", cn: "NOT PREFIXED" },
        { id: "mailto:user7@example.net", partstat: "DECLINED", cn: "PREFIXED" }
    ];
    let event = createEventFromIcalString(ics);
    let attendees = event.getAttendees({});

    // check whether all attendees get returned as expected
    equal(attendees.length, expected.length);
    let count = 0;
    for (let attendee of attendees) {
        for (let exp of expected) {
            if (attendee.id == exp.id) {
                equal(attendee.participationStatus,  exp.partstat, "partstat matches for " + exp.id);
                equal(attendee.commonName, exp.cn, "cn matches for " + exp.id);
                count++;
            }
        }
    }
    equal(count, expected.length, "all attendees were processed");
}
