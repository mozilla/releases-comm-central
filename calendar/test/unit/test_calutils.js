/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

// tests for calUtils.jsm

function run_test() {
    getAttendeeEmail_test();
    getAttendeesBySender_test();
    getRecipientList_test();
    prependMailTo_test();
    removeMailTo_test();
    resolveDelegation_test();
    validateRecipientList_test();
}

function getAttendeeEmail_test() {
    let data = [{
        input: { id: "mailto:first.last@example.net", cname: "Last, First", email: null, useCn: true },
        expected: "\"Last, First\" <first.last@example.net>"
    }, {
        input: { id: "mailto:first.last@example.net", cname: "Last; First", email: null, useCn: true },
        expected: "\"Last; First\" <first.last@example.net>"
    }, {
        input: { id: "mailto:first.last@example.net", cname: "First Last", email: null, useCn: true },
        expected: "First Last <first.last@example.net>"
    }, {
        input: { id: "mailto:first.last@example.net", cname: "Last, First", email: null, useCn: false },
        expected: "first.last@example.net"
    }, {
        input: { id: "mailto:first.last@example.net", cname: null, email: null, useCn: true },
        expected: "first.last@example.net"
    }, {
        input: { id: "urn:uuid:first.last.example.net", cname: null, email: "first.last@example.net", useCn: false },
        expected: "first.last@example.net"
    }, {
        input: { id: "urn:uuid:first.last.example.net", cname: null, email: "first.last@example.net", useCn: true },
        expected: "first.last@example.net"
    }, {
        input: { id: "urn:uuid:first.last.example.net", cname: "First Last", email: "first.last@example.net", useCn: true },
        expected: "First Last <first.last@example.net>"
    }, {
        input: { id: "urn:uuid:first.last.example.net", cname: null, email: null, useCn: false },
        expected: ""
    }];
    let i = 0;
    for (let test of data) {
        i++;
        let attendee = cal.createAttendee();
        attendee.id = test.input.id;
        if (test.input.cname) {
            attendee.commonName = test.input.cname;
        }
        if (test.input.email) {
            attendee.setProperty("EMAIL", test.input.email);
        }
        equal(cal.getAttendeeEmail(attendee, test.input.useCn), test.expected, "(test #" + i + ")");
    }
}

function getAttendeesBySender_test() {
    let data = [{
        input: {
            attendees: [{ id: "mailto:user1@example.net", sentBy: null },
                        { id: "mailto:user2@example.net", sentBy: null }],
            sender: "user1@example.net"
        },
        expected: ["mailto:user1@example.net"]
    }, {
        input: {
            attendees: [{ id: "mailto:user1@example.net", sentBy: null },
                        { id: "mailto:user2@example.net", sentBy: null }],
            sender: "user3@example.net"
        },
        expected: []
    }, {
        input: {
            attendees: [{ id: "mailto:user1@example.net", sentBy: "mailto:user3@example.net" },
                        { id: "mailto:user2@example.net", sentBy: null }],
            sender: "user3@example.net"
        },
        expected: ["mailto:user1@example.net"]
    }, {
        input: {
            attendees: [{ id: "mailto:user1@example.net", sentBy: null },
                        { id: "mailto:user2@example.net", sentBy: "mailto:user1@example.net" }],
            sender: "user1@example.net"
        },
        expected: ["mailto:user1@example.net", "mailto:user2@example.net"]
    }, {
        input: { attendees: [], sender: "user1@example.net" },
        expected: []
    }, {
        input: {
            attendees: [{ id: "mailto:user1@example.net", sentBy: null },
                        { id: "mailto:user2@example.net", sentBy: null }],
            sender: ""
        },
        expected: []
    }, {
        input: {
            attendees: [{ id: "mailto:user1@example.net", sentBy: null },
                        { id: "mailto:user2@example.net", sentBy: null }],
            sender: null
        },
        expected: []
    }];

    for (let i = 1; i <= data.length; i++) {
        let test = data[i - 1];
        let attendees = [];
        for (let att of test.input.attendees) {
            let attendee = cal.createAttendee();
            attendee.id = att.id;
            if (att.sentBy) {
                attendee.setProperty("SENT-BY", att.sentBy);
            }
            attendees.push(attendee);
        }
        let detected = [];
        cal.getAttendeesBySender(attendees, test.input.sender).forEach(att => {
            detected.push(att.id);
        });
        ok(detected.every(aId => test.expected.includes(aId)), "(test #" + i + " ok1)");
        ok(test.expected.every(aId => detected.includes(aId)), "(test #" + i + " ok2)");
    }
}

function getRecipientList_test() {
    let data = [{
        input: [{ id: "mailto:first@example.net", cname: null },
                { id: "mailto:second@example.net", cname: null },
                { id: "mailto:third@example.net", cname: null }],
        expected: "first@example.net, second@example.net, third@example.net"
    }, {
        input: [{ id: "mailto:first@example.net", cname: "first example" },
                { id: "mailto:second@example.net", cname: "second example" },
                { id: "mailto:third@example.net", cname: "third example" }],
        expected: "first example <first@example.net>, second example <second@example.net>, " +
                  "third example <third@example.net>"
    }, {
        input: [{ id: "mailto:first@example.net", cname: "example, first" },
                { id: "mailto:second@example.net", cname: "example, second" },
                { id: "mailto:third@example.net", cname: "example, third" }],
        expected: "\"example, first\" <first@example.net>, \"example, second\" <second@example.net>, " +
                  "\"example, third\" <third@example.net>"
    }, {
        input: [{ id: "mailto:first@example.net", cname: null },
                { id: "urn:uuid:second.example.net", cname: null },
                { id: "mailto:third@example.net", cname: null }],
        expected: "first@example.net, third@example.net"
    }, {
        input: [{ id: "mailto:first@example.net", cname: "first" },
                { id: "urn:uuid:second.example.net", cname: "second" },
                { id: "mailto:third@example.net", cname: "third" }],
        expected: "first <first@example.net>, third <third@example.net>"
    }];

    let i = 0;
    for (let test of data) {
        i++;
        let attendees = [];
        for (let att of test.input) {
            let attendee = cal.createAttendee();
            attendee.id = att.id;
            if (att.cname) {
                attendee.commonName = att.cname;
            }
            attendees.push(attendee);
        }
        equal(cal.getRecipientList(attendees), test.expected, "(test #" + i + ")");
    }
}

function prependMailTo_test() {
    let data = [{ input: "mailto:first.last@example.net", expected: "mailto:first.last@example.net" },
                { input: "MAILTO:first.last@example.net", expected: "mailto:first.last@example.net" },
                { input: "first.last@example.net", expected: "mailto:first.last@example.net" },
                { input: "first.last.example.net", expected: "first.last.example.net" }];
    let i = 0;
    for (let test of data) {
        i++;
        equal(cal.prependMailTo(test.input), test.expected, "(test #" + i + ")");
    }
}

function removeMailTo_test() {
    let data = [{ input: "mailto:first.last@example.net", expected: "first.last@example.net" },
                { input: "MAILTO:first.last@example.net", expected: "first.last@example.net" },
                { input: "first.last@example.net", expected: "first.last@example.net" },
                { input: "first.last.example.net", expected: "first.last.example.net" }];
    let i = 0;
    for (let test of data) {
        i++;
        equal(cal.removeMailTo(test.input), test.expected, "(test #" + i + ")");
    }
}

function resolveDelegation_test() {
    let data = [{
        input: {
            attendee:
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";CN="Attendee 1":mailto:at' +
                "tendee1@example.net",
            attendees: [
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";CN="Attendee 1":mailto:at' +
                "tendee1@example.net",
                'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net";CN="Attendee 2":mailto:atte' +
                "ndee2@example.net"
            ]
        },
        expected: {
            delegatees: "",
            delegators: "Attendee 2 <attendee2@example.net>"
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net":mailto:attendee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net":mailto:attendee1@example.net',
                'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net":mailto:attendee2@example.net'
            ]
        },
        expected: {
            delegatees: "",
            delegators: "attendee2@example.net"
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net";CN="Attendee 1":mailto:atte' +
                "ndee1@example.net",
            attendees: [
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net";CN="Attendee 1":mailto:atte' +
                "ndee1@example.net",
                'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net";CN="Attendee 2":mailto:at' +
                "tendee2@example.net"
            ]
        },
        expected: {
            delegatees: "Attendee 2 <attendee2@example.net>",
            delegators: ""
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net":mailto:attendee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net":mailto:attendee1@example.net',
                'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net":mailto:attendee2@example.net'
            ]
        },
        expected: {
            delegatees: "attendee2@example.net",
            delegators: ""
        }
    }, {
        input: {
            attendee:
                "ATTENDEE:mailto:attendee1@example.net",
            attendees: [
                "ATTENDEE:mailto:attendee1@example.net",
                "ATTENDEE:mailto:attendee2@example.net"
            ]
        },
        expected: {
            delegatees: "",
            delegators: ""
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";DELEGATED-TO="mailto:atte' +
                'ndee3@example.net":mailto:attendee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";DELEGATED-TO="mailto:atte' +
                'ndee3@example.net":mailto:attendee1@example.net',
                'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net":mailto:attendee2@example.net',
                'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net":mailto:attendee3@example.net'
            ]
        },
        expected: {
            delegatees: "attendee3@example.net",
            delegators: "attendee2@example.net"
        }
    }];
    let i = 0;
    for (let test of data) {
        i++;
        let attendees = [];
        for (let att of test.input.attendees) {
            let attendee = cal.createAttendee();
            attendee.icalString = att;
            attendees.push(attendee);
        }
        let attendee = cal.createAttendee();
        attendee.icalString = test.input.attendee;
        let result = cal.resolveDelegation(attendee, attendees);
        equal(result.delegatees, test.expected.delegatees, "(test #" + i + " - delegatees)");
        equal(result.delegators, test.expected.delegators, "(test #" + i + " - delegators)");
    }
}

function validateRecipientList_test() {
    let data = [{
        input: "first.last@example.net",
        expected: "first.last@example.net"
    }, {
        input: "first last <first.last@example.net>",
        expected: "first last <first.last@example.net>"
    }, {
        input: "\"last, first\" <first.last@example.net>",
        expected: "\"last, first\" <first.last@example.net>"
    }, {
        input: "last, first <first.last@example.net>",
        expected: "\"last, first\" <first.last@example.net>"
    }, {
        input: "\"last; first\" <first.last@example.net>",
        expected: "\"last; first\" <first.last@example.net>"
    }, {
        input: "first1.last1@example.net,first2.last2@example.net,first3.last2@example.net",
        expected: "first1.last1@example.net, first2.last2@example.net, first3.last2@example.net"
    }, {
        input: "first1.last1@example.net, first2.last2@example.net, first3.last2@example.net",
        expected: "first1.last1@example.net, first2.last2@example.net, first3.last2@example.net"
    }, {
        input: "first1.last1@example.net, first2 last2 <first2.last2@example.net>, \"last3, first" +
               "3\" <first3.last2@example.net>",
        expected: "first1.last1@example.net, first2 last2 <first2.last2@example.net>, \"last3, fi" +
               "rst3\" <first3.last2@example.net>"
    }, {
        input: "first1.last1@example.net, last2; first2 <first2.last2@example.net>, \"last3; first" +
               "3\" <first3.last2@example.net>",
        expected: "first1.last1@example.net, \"last2; first2\" <first2.last2@example.net>, \"last" +
               "3; first3\" <first3.last2@example.net>"
    }, {
        input: "first1 last2 <first1.last1@example.net>, last2, first2 <first2.last2@example.net>" +
               ", \"last3, first3\" <first3.last2@example.net>",
        expected: "first1 last2 <first1.last1@example.net>, \"last2, first2\" <first2.last2@examp" +
                  "le.net>, \"last3, first3\" <first3.last2@example.net>"
    }];
    let i = 0;
    for (let test of data) {
        i++;
        equal(cal.validateRecipientList(test.input), test.expected,
              "(test #" + i + ")");
    }
}
