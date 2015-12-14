/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

function run_test() {
    removeMailTo_test();
    prependMailTo_test();
    resolveDelegation_test();
}

// tests for calUtils.jsm

function removeMailTo_test() {
    let data = [{input: "mailto:first.last@example.net", expected: "first.last@example.net"},
                {input: "MAILTO:first.last@example.net", expected: "first.last@example.net"},
                {input: "first.last@example.net", expected: "first.last@example.net"},
                {input: "first.last.example.net", expected: "first.last.example.net"}];
    for (let test of data) {
        equal(cal.removeMailTo(test.input), test.expected)
    }
};

function prependMailTo_test() {
    let data = [{input: "mailto:first.last@example.net", expected: "mailto:first.last@example.net"},
                {input: "MAILTO:first.last@example.net", expected: "mailto:first.last@example.net"},
                {input: "first.last@example.net", expected: "mailto:first.last@example.net"},
                {input: "first.last.example.net", expected: "first.last.example.net"}];
    for (let test of data) {
        equal(cal.prependMailTo(test.input), test.expected)
    }
};

function resolveDelegation_test() {
    let data = [{
        input: {
            attendee:
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";CN="Attendee 1":mailto:at' +
                'tendee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";CN="Attendee 1":mailto:at' +
                'tendee1@example.net',
                'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net";CN="Attendee 2":mailto:atte' +
                'ndee2@example.net'
            ]},
        expected: {
            delegatees: '',
            delegators: 'Attendee 2 <attendee2@example.net>'
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net":mailto:attendee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net":mailto:attendee1@example.net',
                'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net":mailto:attendee2@example.net'
            ]},
        expected: {
            delegatees: '',
            delegators: 'attendee2@example.net'
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net";CN="Attendee 1":mailto:atte' +
                'ndee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net";CN="Attendee 1":mailto:atte' +
                'ndee1@example.net',
                'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net";CN="Attendee 2":mailto:at' +
                'tendee2@example.net'
            ]},
        expected: {
            delegatees: 'Attendee 2 <attendee2@example.net>',
            delegators: ''
        }
    }, {
        input: {
            attendee:
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net":mailto:attendee1@example.net',
            attendees: [
                'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net":mailto:attendee1@example.net',
                'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net":mailto:attendee2@example.net'
            ]},
        expected: {
            delegatees: 'attendee2@example.net',
            delegators: ''
        }
    }, {
        input: {
            attendee:
                'ATTENDEE:mailto:attendee1@example.net',
            attendees: [
                'ATTENDEE:mailto:attendee1@example.net',
                'ATTENDEE:mailto:attendee2@example.net'
            ]},
        expected: {
            delegatees: '',
            delegators: ''
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
            ]},
        expected: {
            delegatees: 'attendee3@example.net',
            delegators: 'attendee2@example.net'
        }
    }];
    let i = 0;
    for (let test of data) {
        i++;
        let attendees = new Array();
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
