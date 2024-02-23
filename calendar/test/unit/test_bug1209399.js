/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

function run_test() {
  // Test handling for multiple double quotes leading/trailing to attendee CN for bug 1209399
  test_newAttendee();
  test_fromICS();
}

function test_newAttendee() {
  const data = [
    {
      input: { cname: null, id: "mailto:user1@example.net" },
      expected: { cname: null },
    },
    {
      input: { cname: "Test2", id: "mailto:user2@example.net" },
      expected: { cname: "Test2" },
    },
    {
      input: { cname: '"Test3"', id: "mailto:user3@example.net" },
      expected: { cname: "Test3" },
    },
    {
      input: { cname: '""Test4""', id: "mailto:user4@example.net" },
      expected: { cname: "Test4" },
    },
    {
      input: { cname: '""Test5"', id: "mailto:user5@example.net" },
      expected: { cname: "Test5" },
    },
    {
      input: { cname: '"Test6""', id: "mailto:user6@example.net" },
      expected: { cname: "Test6" },
    },
    {
      input: { cname: "", id: "mailto:user7@example.net" },
      expected: { cname: "" },
    },
    {
      input: { cname: '""', id: "mailto:user8@example.net" },
      expected: { cname: null },
    },
    {
      input: { cname: '""""', id: "mailto:user9@example.net" },
      expected: { cname: null },
    },
  ];

  let i = 0;
  const event = new CalEvent();
  for (const test of data) {
    i++;
    const attendee = new CalAttendee();
    attendee.id = test.input.id;
    attendee.commonName = test.input.cname;

    event.addAttendee(attendee);
    const readAttendee = event.getAttendeeById(test.input.id);
    equal(
      readAttendee.commonName,
      test.expected.cname,
      "Test #" + i + " for commonName matching of " + test.input.id
    );
  }
}

function test_fromICS() {
  const ics = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:a84c74d1-cfc6-4ddf-9d60-9e4afd8238cf",
    "SUMMARY:New Event",
    "DTSTART:20150729T103000Z",
    "DTEND:20150729T113000Z",
    "ORGANIZER;RSVP=TRUE;CN=Tester1;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:user1@example.net",

    "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=Test2;ROLE=REQ-PARTICIPANT:mailto:user2@example.net",
    'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="Test3";ROLE=REQ-PARTICIPANT:mailto:user3@example.net',
    'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=""Test4"";ROLE=REQ-PARTICIPANT:mailto:user4@example.net',
    "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=;ROLE=REQ-PARTICIPANT:mailto:user5@example.net",
    "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:user6@example.net",
    'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="";ROLE=REQ-PARTICIPANT:mailto:user7@example.net',
    'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN="""";ROLE=REQ-PARTICIPANT:mailto:user8@example.net',

    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  const expected = [
    { id: "mailto:user2@example.net", cname: "Test2" },
    { id: "mailto:user3@example.net", cname: "Test3" },
    { id: "mailto:user4@example.net", cname: "" },
    { id: "mailto:user5@example.net", cname: "" },
    { id: "mailto:user6@example.net", cname: null },
    { id: "mailto:user7@example.net", cname: "" },
    { id: "mailto:user8@example.net", cname: "" },
  ];
  const event = createEventFromIcalString(ics);

  equal(event.getAttendees().length, expected.length, "Check test consistency");
  for (const exp of expected) {
    const attendee = event.getAttendeeById(exp.id);
    equal(attendee.commonName, exp.cname, "Test for commonName matching of " + exp.id);
  }
}
