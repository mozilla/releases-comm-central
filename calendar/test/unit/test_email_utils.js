/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
});

function run_test() {
  test_prependMailTo();
  test_removeMailTo();
  test_getAttendeeEmail();
  test_createRecipientList();
  test_validateRecipientList();
  test_attendeeMatchesAddresses();
}

function test_prependMailTo() {
  const data = [
    { input: "mailto:first.last@example.net", expected: "mailto:first.last@example.net" },
    { input: "MAILTO:first.last@example.net", expected: "mailto:first.last@example.net" },
    { input: "first.last@example.net", expected: "mailto:first.last@example.net" },
    { input: "first.last.example.net", expected: "first.last.example.net" },
  ];
  for (const [i, test] of Object.entries(data)) {
    equal(cal.email.prependMailTo(test.input), test.expected, "(test #" + i + ")");
  }
}

function test_removeMailTo() {
  const data = [
    { input: "mailto:first.last@example.net", expected: "first.last@example.net" },
    { input: "MAILTO:first.last@example.net", expected: "first.last@example.net" },
    { input: "first.last@example.net", expected: "first.last@example.net" },
    { input: "first.last.example.net", expected: "first.last.example.net" },
  ];
  for (const [i, test] of Object.entries(data)) {
    equal(cal.email.removeMailTo(test.input), test.expected, "(test #" + i + ")");
  }
}

function test_getAttendeeEmail() {
  const data = [
    {
      input: {
        id: "mailto:first.last@example.net",
        cname: "Last, First",
        email: null,
        useCn: true,
      },
      expected: '"Last, First" <first.last@example.net>',
    },
    {
      input: {
        id: "mailto:first.last@example.net",
        cname: "Last; First",
        email: null,
        useCn: true,
      },
      expected: '"Last; First" <first.last@example.net>',
    },
    {
      input: { id: "mailto:first.last@example.net", cname: "First Last", email: null, useCn: true },
      expected: "First Last <first.last@example.net>",
    },
    {
      input: {
        id: "mailto:first.last@example.net",
        cname: "Last, First",
        email: null,
        useCn: false,
      },
      expected: "first.last@example.net",
    },
    {
      input: { id: "mailto:first.last@example.net", cname: null, email: null, useCn: true },
      expected: "first.last@example.net",
    },
    {
      input: {
        id: "urn:uuid:first.last.example.net",
        cname: null,
        email: "first.last@example.net",
        useCn: false,
      },
      expected: "first.last@example.net",
    },
    {
      input: {
        id: "urn:uuid:first.last.example.net",
        cname: null,
        email: "first.last@example.net",
        useCn: true,
      },
      expected: "first.last@example.net",
    },
    {
      input: {
        id: "urn:uuid:first.last.example.net",
        cname: "First Last",
        email: "first.last@example.net",
        useCn: true,
      },
      expected: "First Last <first.last@example.net>",
    },
    {
      input: { id: "urn:uuid:first.last.example.net", cname: null, email: null, useCn: false },
      expected: "",
    },
  ];
  for (const [i, test] of Object.entries(data)) {
    const attendee = new CalAttendee();
    attendee.id = test.input.id;
    if (test.input.cname) {
      attendee.commonName = test.input.cname;
    }
    if (test.input.email) {
      attendee.setProperty("EMAIL", test.input.email);
    }
    equal(
      cal.email.getAttendeeEmail(attendee, test.input.useCn),
      test.expected,
      "(test #" + i + ")"
    );
  }
}

function test_createRecipientList() {
  const data = [
    {
      input: [
        { id: "mailto:first@example.net", cname: null },
        { id: "mailto:second@example.net", cname: null },
        { id: "mailto:third@example.net", cname: null },
      ],
      expected: "first@example.net, second@example.net, third@example.net",
    },
    {
      input: [
        { id: "mailto:first@example.net", cname: "first example" },
        { id: "mailto:second@example.net", cname: "second example" },
        { id: "mailto:third@example.net", cname: "third example" },
      ],
      expected:
        "first example <first@example.net>, second example <second@example.net>, " +
        "third example <third@example.net>",
    },
    {
      input: [
        { id: "mailto:first@example.net", cname: "example, first" },
        { id: "mailto:second@example.net", cname: "example, second" },
        { id: "mailto:third@example.net", cname: "example, third" },
      ],
      expected:
        '"example, first" <first@example.net>, "example, second" <second@example.net>, ' +
        '"example, third" <third@example.net>',
    },
    {
      input: [
        { id: "mailto:first@example.net", cname: null },
        { id: "urn:uuid:second.example.net", cname: null },
        { id: "mailto:third@example.net", cname: null },
      ],
      expected: "first@example.net, third@example.net",
    },
    {
      input: [
        { id: "mailto:first@example.net", cname: "first" },
        { id: "urn:uuid:second.example.net", cname: "second" },
        { id: "mailto:third@example.net", cname: "third" },
      ],
      expected: "first <first@example.net>, third <third@example.net>",
    },
  ];

  let i = 0;
  for (const test of data) {
    i++;
    const attendees = [];
    for (const att of test.input) {
      const attendee = new CalAttendee();
      attendee.id = att.id;
      if (att.cname) {
        attendee.commonName = att.cname;
      }
      attendees.push(attendee);
    }
    equal(cal.email.createRecipientList(attendees), test.expected, "(test #" + i + ")");
  }
}

function test_validateRecipientList() {
  const data = [
    {
      input: "first.last@example.net",
      expected: "first.last@example.net",
    },
    {
      input: "first last <first.last@example.net>",
      expected: "first last <first.last@example.net>",
    },
    {
      input: '"last, first" <first.last@example.net>',
      expected: '"last, first" <first.last@example.net>',
    },
    {
      input: "last, first <first.last@example.net>",
      expected: '"last, first" <first.last@example.net>',
    },
    {
      input: '"last; first" <first.last@example.net>',
      expected: '"last; first" <first.last@example.net>',
    },
    {
      input: "first1.last1@example.net,first2.last2@example.net,first3.last2@example.net",
      expected: "first1.last1@example.net, first2.last2@example.net, first3.last2@example.net",
    },
    {
      input: "first1.last1@example.net, first2.last2@example.net, first3.last2@example.net",
      expected: "first1.last1@example.net, first2.last2@example.net, first3.last2@example.net",
    },
    {
      input:
        'first1.last1@example.net, first2 last2 <first2.last2@example.net>, "last3, first' +
        '3" <first3.last2@example.net>',
      expected:
        'first1.last1@example.net, first2 last2 <first2.last2@example.net>, "last3, fi' +
        'rst3" <first3.last2@example.net>',
    },
    {
      input:
        'first1.last1@example.net, last2; first2 <first2.last2@example.net>, "last3; first' +
        '3" <first3.last2@example.net>',
      expected:
        'first1.last1@example.net, "last2; first2" <first2.last2@example.net>, "last' +
        '3; first3" <first3.last2@example.net>',
    },
    {
      input:
        "first1 last2 <first1.last1@example.net>, last2, first2 <first2.last2@example.net>" +
        ', "last3, first3" <first3.last2@example.net>',
      expected:
        'first1 last2 <first1.last1@example.net>, "last2, first2" <first2.last2@examp' +
        'le.net>, "last3, first3" <first3.last2@example.net>',
    },
  ];

  for (const [i, test] of Object.entries(data)) {
    equal(cal.email.validateRecipientList(test.input), test.expected, "(test #" + i + ")");
  }
}

function test_attendeeMatchesAddresses() {
  let a = new CalAttendee("ATTENDEE:mailto:horst");
  ok(cal.email.attendeeMatchesAddresses(a, ["HORST", "peter"]));
  ok(!cal.email.attendeeMatchesAddresses(a, ["HORSTpeter", "peter"]));
  ok(!cal.email.attendeeMatchesAddresses(a, ["peter"]));

  a = new CalAttendee('ATTENDEE;EMAIL="horst":urn:uuid:horst');
  ok(cal.email.attendeeMatchesAddresses(a, ["HORST", "peter"]));
  ok(!cal.email.attendeeMatchesAddresses(a, ["HORSTpeter", "peter"]));
  ok(!cal.email.attendeeMatchesAddresses(a, ["peter"]));
}
