/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calItipUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/mailTestUtils.js");

// tests for calItipUtils.jsm

function run_test() {
    getMessageSender_test();
    getSequence_test();
    getStamp_test();
    compareSequence_test();
    compareStamp_test();
    compare_test();
}

/*
 * Helper function to get an ics for testing sequence and stamp comparison
 *
 * @param {String} aAttendee              A serialized ATTENDEE property
 * @param {String} aSequence              A serialized SEQUENCE property
 * @param {String} aDtStamp               A serialized DTSTAMP property
 * @param {String} aXMozReceivedSequence  A serialized X-MOZ-RECEIVED-SEQUENCE property
 * @param {String} aXMozReceivedDtStamp   A serialized X-MOZ-RECEIVED-STAMP property
 */
function getSeqStampTestIcs(aProperties) {
    // we make sure to have a dtstamp property to get a valid ics
    let dtStamp = "20150909T181048Z";
    let additionalProperties = "";
    aProperties.forEach((aProp) => {
        if (aProp.startsWith("DTSTAMP:")) {
            dtStamp = aProp;
        } else {
            additionalProperties += "\r\n" + aProp;
        }
    });

    return [
        "BEGIN:VCALENDAR",
        "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN",
        "VERSION:2.0",
        "METHOD:REQUEST",
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Berlin",
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "TZNAME:CEST",
        "DTSTART:19700329T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0100",
        "TZNAME:CET",
        "DTSTART:19701025T030000",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "CREATED:20150909T180909Z",
        "LAST-MODIFIED:20150909T181048Z",
        dtStamp,
        "UID:cb189fdc-ed47-4db6-a8d7-31a08802249d",
        "SUMMARY:Test Event",
        "ORGANIZER;RSVP=TRUE;CN=Organizer;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:organizer@example.net",
        "ATTENDEE;RSVP=TRUE;CN=Attendee;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:attende" +
        "e@example.net" + additionalProperties,
        "DTSTART;TZID=Europe/Berlin:20150909T210000",
        "DTEND;TZID=Europe/Berlin:20150909T220000",
        "TRANSP:OPAQUE",
        "LOCATION:Room 1",
        "DESCRIPTION:Let us get together",
        "URL:http://www.example.com",
        "ATTACH:http://www.example.com",
        "END:VEVENT",
        "END:VCALENDAR"].join("\r\n");
}

function getSeqStampTestItems(aTest) {
    let items = [];
    for (let input of aTest.input) {
        if (input.item) {
            // in this case, we need to return an event
            let attendee = "";
            if ("attendee" in input.item && input.item.attendee != {}) {
                let att = cal.createAttendee();
                att.id = input.item.attendee.id || "mailto:otherattendee@example.net";
                if ("receivedSeq" in input.item.attendee && input.item.attendee.receivedSeq.length) {
                    att.setProperty("RECEIVED-SEQUENCE", input.item.attendee.receivedSeq);
                }
                if ("receivedStamp" in input.item.attendee && input.item.attendee.receivedStamp.length) {
                    att.setProperty("RECEIVED-DTSTAMP", input.item.attendee.receivedStamp);
                }
            }
            let sequence = "";
            if ("sequence" in input.item && input.item.sequence.length) {
                sequence = "SEQUENCE:" + input.item.sequence;
            }
            let dtStamp = "DTSTAMP:20150909T181048Z";
            if ("dtStamp" in input.item && input.item.dtStamp) {
                dtStamp = "DTSTAMP:" + input.item.dtStamp;
            }
            let xMozReceivedSeq = "";
            if ("xMozReceivedSeq" in input.item && input.item.xMozReceivedSeq.length) {
                xMozReceivedSeq = "X-MOZ-RECEIVED-SEQUENCE:" + input.item.xMozReceivedSeq;
            }
            let xMozReceivedStamp = "";
            if ("xMozReceivedStamp" in input.item && input.item.xMozReceivedStamp.length) {
                xMozReceivedStamp = "X-MOZ-RECEIVED-DTSTAMP:" + input.item.xMozReceivedStamp;
            }
            let xMsAptSeq = "";
            if ("xMsAptSeq" in input.item && input.item.xMsAptSeq.length) {
                xMsAptSeq = "X-MICROSOFT-CDO-APPT-SEQUENCE:" + input.item.xMsAptSeq;
            }
            let testItem = cal.createEvent();
            testItem.icalString = getSeqStampTestIcs([attendee, sequence, dtStamp, xMozReceivedSeq,
                                                      xMozReceivedStamp, xMsAptSeq]);
            items.push(testItem);
        } else {
            // in this case, we need to return an attendee
            let att = cal.createAttendee();
            att.id = input.attendee.id || "mailto:otherattendee@example.net";
            if (input.attendee.receivedSeq && input.attendee.receivedSeq.length) {
                att.setProperty("RECEIVED-SEQUENCE", input.attendee.receivedSeq);
            }
            if (input.attendee.receivedStamp && input.attendee.receivedStamp.length) {
                att.setProperty("RECEIVED-DTSTAMP", input.attendee.receivedStamp);
            }
            items.push(att);
        }
    }
    return items;
}

function getMessageSender_test() {
    let data = [{
        input: null,
        expected: null
    }, {
        input: { },
        expected: null
    }, {
        input: { author: "Sender 1 <sender1@example.net>" },
        expected: "sender1@example.net"
    }];
    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        equal(cal.itip.getMessageSender(test.input), test.expected, "(test #" + i + ")");
    }
}

function getSequence_test() {
    // assigning an empty string results in not having the property in the ics here
    let data = [{
        input: [{ item: { sequence: "", xMozReceivedSeq: "" } }],
        expected: 0
    }, {
        input: [{ item: { sequence: "0", xMozReceivedSeq: "" } }],
        expected: 0
    }, {
        input: [{ item: { sequence: "", xMozReceivedSeq: "0" } }],
        expected: 0
    }, {
        input: [{ item: { sequence: "1", xMozReceivedSeq: "" } }],
        expected: 1
    }, {
        input: [{ item: { sequence: "", xMozReceivedSeq: "1" } }],
        expected: 1
    }, {
        input: [{ attendee: { receivedSeq: "" } }],
        expected: 0
    }, {
        input: [{ attendee: { receivedSeq: "0" } }],
        expected: 0
    }, {
        input: [{ attendee: { receivedSeq: "1" } }],
        expected: 1
    }];
    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        testItems = getSeqStampTestItems(test);
        equal(cal.itip.getSequence(testItems[0], testItems[1]), test.expected, "(test #" + i + ")");
    }
}

function getStamp_test() {
    // assigning an empty string results in not having the property in the ics here. However, there
    // must be always an dtStamp for item - if it's missing it will be set by the test code to make
    // sure we get a valid ics
    let data = [{
        // !dtStamp && !xMozReceivedStamp => test default value
        input: [{ item: { dtStamp: "", xMozReceivedStamp: "" } }],
        expected: "20150909T181048Z"
    }, {
        // dtStamp && !xMozReceivedStamp => dtStamp
        input: [{ item: { dtStamp: "20150910T181048Z", xMozReceivedStamp: "" } }],
        expected: "20150910T181048Z"
    }, {
         // dtStamp && xMozReceivedStamp => xMozReceivedStamp
        input: [{ item: { dtStamp: "20150909T181048Z", xMozReceivedStamp: "20150910T181048Z" } }],
        expected: "20150910T181048Z"
    }, {
        input: [{ attendee: { receivedStamp: "" } }],
        expected: null
    }, {
        input: [{ attendee: { receivedStamp: "20150910T181048Z" } }],
        expected: "20150910T181048Z"
    }];
    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        let result = cal.itip.getStamp(getSeqStampTestItems(test)[0]);
        if (result) {
            result = result.icalString;
        }
        equal(result, test.expected, "(test #" + i + ")");
    }
}

function compareSequence_test() {
    // it is sufficient to test here with sequence for items - full test coverage for
    // x-moz-received-sequence is already provided by compareSequence_test
    let data = [{
        // item1.seq == item2.seq
        input: [{ item: { sequence: "2" } },
                { item: { sequence: "2" } }],
        expected: 0
    }, {
        // item1.seq > item2.seq
        input: [{ item: { sequence: "3" } },
                { item: { sequence: "2" } }],
        expected: 1
    }, {
        // item1.seq < item2.seq
        input: [{ item: { sequence: "2" } },
                { item: { sequence: "3" } }],
        expected: -1
    }, {
        // attendee1.seq == attendee2.seq
        input: [{ attendee: { receivedSeq: "2" } },
                { attendee: { receivedSeq: "2" } }],
        expected: 0
    }, {
        // attendee1.seq > attendee2.seq
        input: [{ attendee: { receivedSeq: "3" } },
                { attendee: { receivedSeq: "2" } }],
        expected: 1
    }, {
        // attendee1.seq < attendee2.seq
        input: [{ attendee: { receivedSeq: "2" } },
                { attendee: { receivedSeq: "3" } }],
        expected: -1
    }, {
        // item.seq == attendee.seq
        input: [{ item: { sequence: "2" } },
                { attendee: { receivedSeq: "2" } }],
        expected: 0
    }, {
        // item.seq > attendee.seq
        input: [{ item: { sequence: "3" } },
                { attendee: { receivedSeq: "2" } }],
        expected: 1
    }, {
        // item.seq < attendee.seq
        input: [{ item: { sequence: "2" } },
                { attendee: { receivedSeq: "3" } }],
        expected: -1
    }];
    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        testItems = getSeqStampTestItems(test);
        equal(cal.itip.compareSequence(testItems[0], testItems[1]),
              test.expected,
              "(test #" + i + ")"
        );
    }
}

function compareStamp_test() {
    // it is sufficient to test here with dtstamp for items - full test coverage for
    // x-moz-received-stamp is already provided by compareStamp_test
    let data = [{
        // item1.stamp == item2.stamp
        input: [{ item: { dtStamp: "20150910T181048Z" } },
                { item: { dtStamp: "20150910T181048Z" } }],
        expected: 0
    }, {
        // item1.stamp > item2.stamp
        input: [{ item: { dtStamp: "20150911T181048Z" } },
                { item: { dtStamp: "20150910T181048Z" } }],
        expected: 1
    }, {
        // item1.stamp < item2.stamp
        input: [{ item: { dtStamp: "20150910T181048Z" } },
                { item: { dtStamp: "20150911T181048Z" } }],
        expected: -1
    }, {
        // attendee1.stamp == attendee2.stamp
        input: [{ attendee: { receivedStamp: "20150910T181048Z" } },
                { attendee: { receivedStamp: "20150910T181048Z" } }],
        expected: 0
    }, {
        // attendee1.stamp > attendee2.stamp
        input: [{ attendee: { receivedStamp: "20150911T181048Z" } },
                { attendee: { receivedStamp: "20150910T181048Z" } }],
        expected: 1
    }, {
        // attendee1.stamp < attendee2.stamp
        input: [{ attendee: { receivedStamp: "20150910T181048Z" } },
                { attendee: { receivedStamp: "20150911T181048Z" } }],
        expected: -1
    }, {
        // item.stamp == attendee.stamp
        input: [{ item: { dtStamp: "20150910T181048Z" } },
                { attendee: { receivedStamp: "20150910T181048Z" } }],
        expected: 0
    }, {
        // item.stamp > attendee.stamp
        input: [{ item: { dtStamp: "20150911T181048Z" } },
                { attendee: { receivedStamp: "20150910T181048Z" } }],
        expected: 1
    }, {
        // item.stamp < attendee.stamp
        input: [{ item: { dtStamp: "20150910T181048Z" } },
                { attendee: { receivedStamp: "20150911T181048Z" } }],
        expected: -1
    }];
    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        testItems = getSeqStampTestItems(test);
        equal(cal.itip.compareStamp(testItems[0], testItems[1]),
              test.expected,
              "(test #" + i + ")"
        );
    }
}

function compare_test() {
    // it is sufficient to test here with items only - full test coverage for attendees or
    // item/attendee is already provided by compareSequence_test and compareStamp_test
    let data = [{
        // item1.seq == item2.seq && item1.stamp == item2.stamp
        input: [{ item: { sequence: "2", dtStamp: "20150910T181048Z" } },
                { item: { sequence: "2", dtStamp: "20150910T181048Z" } }],
        expected: 0
    }, {
        // item1.seq == item2.seq && item1.stamp > item2.stamp
        input: [{ item: { sequence: "2", dtStamp: "20150911T181048Z" } },
                { item: { sequence: "2", dtStamp: "20150910T181048Z" } }],
        expected: 1
    }, {
        // item1.seq == item2.seq && item1.stamp < item2.stamp
        input: [{ item: { sequence: "2", dtStamp: "20150910T181048Z" } },
                { item: { sequence: "2", dtStamp: "20150911T181048Z" } }],
        expected: -1
    }, {
        // item1.seq > item2.seq && item1.stamp == item2.stamp
        input: [{ item: { sequence: "3", dtStamp: "20150910T181048Z" } },
                { item: { sequence: "2", dtStamp: "20150910T181048Z" } }],
        expected: 1
    }, {
        // item1.seq > item2.seq && item1.stamp > item2.stamp
        input: [{ item: { sequence: "3", dtStamp: "20150911T181048Z" } },
                { item: { sequence: "2", dtStamp: "20150910T181048Z" } }],
        expected: 1
    }, {
        // item1.seq > item2.seq && item1.stamp < item2.stamp
        input: [{ item: { sequence: "3", dtStamp: "20150910T181048Z" } },
                { item: { sequence: "2", dtStamp: "20150911T181048Z" } }],
        expected: 1
    }, {
        // item1.seq < item2.seq && item1.stamp == item2.stamp
        input: [{ item: { sequence: "2", dtStamp: "20150910T181048Z" } },
                { item: { sequence: "3", dtStamp: "20150910T181048Z" } }],
        expected: -1
    }, {
        // item1.seq < item2.seq && item1.stamp > item2.stamp
        input: [{ item: { sequence: "2", dtStamp: "20150911T181048Z" } },
                { item: { sequence: "3", dtStamp: "20150910T181048Z" } }],
        expected: -1
    }, {
        // item1.seq < item2.seq && item1.stamp < item2.stamp
        input: [{ item: { sequence: "2", dtStamp: "20150910T181048Z" } },
                { item: { sequence: "3", dtStamp: "20150911T181048Z" } }],
        expected: -1
    }];
    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        testItems = getSeqStampTestItems(test);
        equal(cal.itip.compare(testItems[0], testItems[1]),
              test.expected,
              "(test #" + i + ")"
        );
    }
}
