/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

ChromeUtils.defineESModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalItipEmailTransport: "resource:///modules/CalItipEmailTransport.sys.mjs",
});

// tests for calItipUtils.jsm

do_get_profile();

/*
 * Helper function to get an ics for testing sequence and stamp comparison
 *
 * @param {String} aAttendee - A serialized ATTENDEE property
 * @param {String} aSequence - A serialized SEQUENCE property
 * @param {String} aDtStamp - A serialized DTSTAMP property
 * @param {String} aXMozReceivedSequence - A serialized X-MOZ-RECEIVED-SEQUENCE property
 * @param {String} aXMozReceivedDtStamp - A serialized X-MOZ-RECEIVED-STAMP property
 */
function getSeqStampTestIcs(aProperties) {
  // we make sure to have a dtstamp property to get a valid ics
  let dtStamp = "20150909T181048Z";
  let additionalProperties = "";
  aProperties.forEach(aProp => {
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
      "e@example.net" +
      additionalProperties,
    "DTSTART;TZID=Europe/Berlin:20150909T210000",
    "DTEND;TZID=Europe/Berlin:20150909T220000",
    "TRANSP:OPAQUE",
    "LOCATION:Room 1",
    "DESCRIPTION:Let us get together",
    "URL:http://www.example.com",
    "ATTACH:http://www.example.com",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function getSeqStampTestItems(aTest) {
  const items = [];
  for (const input of aTest.input) {
    if (input.item) {
      // in this case, we need to return an event
      const attendee = "";
      if ("attendee" in input.item && input.item.attendee != {}) {
        const att = new CalAttendee();
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
      const testItem = new CalEvent();
      testItem.icalString = getSeqStampTestIcs([
        attendee,
        sequence,
        dtStamp,
        xMozReceivedSeq,
        xMozReceivedStamp,
        xMsAptSeq,
      ]);
      items.push(testItem);
    } else {
      // in this case, we need to return an attendee
      const att = new CalAttendee();
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

add_task(function test_getMessageSender() {
  const data = [
    {
      input: null,
      expected: null,
    },
    {
      input: {},
      expected: null,
    },
    {
      input: { author: "Sender 1 <sender1@example.net>" },
      expected: "sender1@example.net",
    },
  ];
  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    equal(cal.itip.getMessageSender(test.input), test.expected, "(test #" + i + ")");
  }
});

add_task(function test_getSequence() {
  // assigning an empty string results in not having the property in the ics here
  const data = [
    {
      input: [{ item: { sequence: "", xMozReceivedSeq: "" } }],
      expected: 0,
    },
    {
      input: [{ item: { sequence: "0", xMozReceivedSeq: "" } }],
      expected: 0,
    },
    {
      input: [{ item: { sequence: "", xMozReceivedSeq: "0" } }],
      expected: 0,
    },
    {
      input: [{ item: { sequence: "1", xMozReceivedSeq: "" } }],
      expected: 1,
    },
    {
      input: [{ item: { sequence: "", xMozReceivedSeq: "1" } }],
      expected: 1,
    },
    {
      input: [{ attendee: { receivedSeq: "" } }],
      expected: 0,
    },
    {
      input: [{ attendee: { receivedSeq: "0" } }],
      expected: 0,
    },
    {
      input: [{ attendee: { receivedSeq: "1" } }],
      expected: 1,
    },
  ];
  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    const testItems = getSeqStampTestItems(test);
    equal(cal.itip.getSequence(testItems[0], testItems[1]), test.expected, "(test #" + i + ")");
  }
});

add_task(function test_getStamp() {
  // assigning an empty string results in not having the property in the ics here. However, there
  // must be always an dtStamp for item - if it's missing it will be set by the test code to make
  // sure we get a valid ics
  const data = [
    {
      // !dtStamp && !xMozReceivedStamp => test default value
      input: [{ item: { dtStamp: "", xMozReceivedStamp: "" } }],
      expected: "20150909T181048Z",
    },
    {
      // dtStamp && !xMozReceivedStamp => dtStamp
      input: [{ item: { dtStamp: "20150910T181048Z", xMozReceivedStamp: "" } }],
      expected: "20150910T181048Z",
    },
    {
      // dtStamp && xMozReceivedStamp => xMozReceivedStamp
      input: [{ item: { dtStamp: "20150909T181048Z", xMozReceivedStamp: "20150910T181048Z" } }],
      expected: "20150910T181048Z",
    },
    {
      input: [{ attendee: { receivedStamp: "" } }],
      expected: null,
    },
    {
      input: [{ attendee: { receivedStamp: "20150910T181048Z" } }],
      expected: "20150910T181048Z",
    },
  ];
  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    let result = cal.itip.getStamp(getSeqStampTestItems(test)[0]);
    if (result) {
      result = result.icalString;
    }
    equal(result, test.expected, "(test #" + i + ")");
  }
});

add_task(function test_compareSequence() {
  // it is sufficient to test here with sequence for items - full test coverage for
  // x-moz-received-sequence is already provided by test_compareSequence
  const data = [
    {
      // item1.seq == item2.seq
      input: [{ item: { sequence: "2" } }, { item: { sequence: "2" } }],
      expected: 0,
    },
    {
      // item1.seq > item2.seq
      input: [{ item: { sequence: "3" } }, { item: { sequence: "2" } }],
      expected: 1,
    },
    {
      // item1.seq < item2.seq
      input: [{ item: { sequence: "2" } }, { item: { sequence: "3" } }],
      expected: -1,
    },
    {
      // attendee1.seq == attendee2.seq
      input: [{ attendee: { receivedSeq: "2" } }, { attendee: { receivedSeq: "2" } }],
      expected: 0,
    },
    {
      // attendee1.seq > attendee2.seq
      input: [{ attendee: { receivedSeq: "3" } }, { attendee: { receivedSeq: "2" } }],
      expected: 1,
    },
    {
      // attendee1.seq < attendee2.seq
      input: [{ attendee: { receivedSeq: "2" } }, { attendee: { receivedSeq: "3" } }],
      expected: -1,
    },
    {
      // item.seq == attendee.seq
      input: [{ item: { sequence: "2" } }, { attendee: { receivedSeq: "2" } }],
      expected: 0,
    },
    {
      // item.seq > attendee.seq
      input: [{ item: { sequence: "3" } }, { attendee: { receivedSeq: "2" } }],
      expected: 1,
    },
    {
      // item.seq < attendee.seq
      input: [{ item: { sequence: "2" } }, { attendee: { receivedSeq: "3" } }],
      expected: -1,
    },
  ];
  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    const testItems = getSeqStampTestItems(test);
    equal(cal.itip.compareSequence(testItems[0], testItems[1]), test.expected, "(test #" + i + ")");
  }
});

add_task(function test_compareStamp() {
  // it is sufficient to test here with dtstamp for items - full test coverage for
  // x-moz-received-stamp is already provided by test_compareStamp
  const data = [
    {
      // item1.stamp == item2.stamp
      input: [{ item: { dtStamp: "20150910T181048Z" } }, { item: { dtStamp: "20150910T181048Z" } }],
      expected: 0,
    },
    {
      // item1.stamp > item2.stamp
      input: [{ item: { dtStamp: "20150911T181048Z" } }, { item: { dtStamp: "20150910T181048Z" } }],
      expected: 1,
    },
    {
      // item1.stamp < item2.stamp
      input: [{ item: { dtStamp: "20150910T181048Z" } }, { item: { dtStamp: "20150911T181048Z" } }],
      expected: -1,
    },
    {
      // attendee1.stamp == attendee2.stamp
      input: [
        { attendee: { receivedStamp: "20150910T181048Z" } },
        { attendee: { receivedStamp: "20150910T181048Z" } },
      ],
      expected: 0,
    },
    {
      // attendee1.stamp > attendee2.stamp
      input: [
        { attendee: { receivedStamp: "20150911T181048Z" } },
        { attendee: { receivedStamp: "20150910T181048Z" } },
      ],
      expected: 1,
    },
    {
      // attendee1.stamp < attendee2.stamp
      input: [
        { attendee: { receivedStamp: "20150910T181048Z" } },
        { attendee: { receivedStamp: "20150911T181048Z" } },
      ],
      expected: -1,
    },
    {
      // item.stamp == attendee.stamp
      input: [
        { item: { dtStamp: "20150910T181048Z" } },
        { attendee: { receivedStamp: "20150910T181048Z" } },
      ],
      expected: 0,
    },
    {
      // item.stamp > attendee.stamp
      input: [
        { item: { dtStamp: "20150911T181048Z" } },
        { attendee: { receivedStamp: "20150910T181048Z" } },
      ],
      expected: 1,
    },
    {
      // item.stamp < attendee.stamp
      input: [
        { item: { dtStamp: "20150910T181048Z" } },
        { attendee: { receivedStamp: "20150911T181048Z" } },
      ],
      expected: -1,
    },
  ];
  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    const testItems = getSeqStampTestItems(test);
    equal(cal.itip.compareStamp(testItems[0], testItems[1]), test.expected, "(test #" + i + ")");
  }
});

add_task(function test_compare() {
  // it is sufficient to test here with items only - full test coverage for attendees or
  // item/attendee is already provided by test_compareSequence and test_compareStamp
  const data = [
    {
      // item1.seq == item2.seq && item1.stamp == item2.stamp
      input: [
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
      ],
      expected: 0,
    },
    {
      // item1.seq == item2.seq && item1.stamp > item2.stamp
      input: [
        { item: { sequence: "2", dtStamp: "20150911T181048Z" } },
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
      ],
      expected: 1,
    },
    {
      // item1.seq == item2.seq && item1.stamp < item2.stamp
      input: [
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
        { item: { sequence: "2", dtStamp: "20150911T181048Z" } },
      ],
      expected: -1,
    },
    {
      // item1.seq > item2.seq && item1.stamp == item2.stamp
      input: [
        { item: { sequence: "3", dtStamp: "20150910T181048Z" } },
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
      ],
      expected: 1,
    },
    {
      // item1.seq > item2.seq && item1.stamp > item2.stamp
      input: [
        { item: { sequence: "3", dtStamp: "20150911T181048Z" } },
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
      ],
      expected: 1,
    },
    {
      // item1.seq > item2.seq && item1.stamp < item2.stamp
      input: [
        { item: { sequence: "3", dtStamp: "20150910T181048Z" } },
        { item: { sequence: "2", dtStamp: "20150911T181048Z" } },
      ],
      expected: 1,
    },
    {
      // item1.seq < item2.seq && item1.stamp == item2.stamp
      input: [
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
        { item: { sequence: "3", dtStamp: "20150910T181048Z" } },
      ],
      expected: -1,
    },
    {
      // item1.seq < item2.seq && item1.stamp > item2.stamp
      input: [
        { item: { sequence: "2", dtStamp: "20150911T181048Z" } },
        { item: { sequence: "3", dtStamp: "20150910T181048Z" } },
      ],
      expected: -1,
    },
    {
      // item1.seq < item2.seq && item1.stamp < item2.stamp
      input: [
        { item: { sequence: "2", dtStamp: "20150910T181048Z" } },
        { item: { sequence: "3", dtStamp: "20150911T181048Z" } },
      ],
      expected: -1,
    },
  ];
  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    const testItems = getSeqStampTestItems(test);
    equal(cal.itip.compare(testItems[0], testItems[1]), test.expected, "(test #" + i + ")");
  }
});

add_task(function test_getAttendeesBySender() {
  const data = [
    {
      input: {
        attendees: [
          { id: "mailto:user1@example.net", sentBy: null },
          { id: "mailto:user2@example.net", sentBy: null },
        ],
        sender: "user1@example.net",
      },
      expected: ["mailto:user1@example.net"],
    },
    {
      input: {
        attendees: [
          { id: "mailto:user1@example.net", sentBy: null },
          { id: "mailto:user2@example.net", sentBy: null },
        ],
        sender: "user3@example.net",
      },
      expected: [],
    },
    {
      input: {
        attendees: [
          { id: "mailto:user1@example.net", sentBy: "mailto:user3@example.net" },
          { id: "mailto:user2@example.net", sentBy: null },
        ],
        sender: "user3@example.net",
      },
      expected: ["mailto:user1@example.net"],
    },
    {
      input: {
        attendees: [
          { id: "mailto:user1@example.net", sentBy: null },
          { id: "mailto:user2@example.net", sentBy: "mailto:user1@example.net" },
        ],
        sender: "user1@example.net",
      },
      expected: ["mailto:user1@example.net", "mailto:user2@example.net"],
    },
    {
      input: { attendees: [], sender: "user1@example.net" },
      expected: [],
    },
    {
      input: {
        attendees: [
          { id: "mailto:user1@example.net", sentBy: null },
          { id: "mailto:user2@example.net", sentBy: null },
        ],
        sender: "",
      },
      expected: [],
    },
    {
      input: {
        attendees: [
          { id: "mailto:user1@example.net", sentBy: null },
          { id: "mailto:user2@example.net", sentBy: null },
        ],
        sender: null,
      },
      expected: [],
    },
  ];

  for (let i = 1; i <= data.length; i++) {
    const test = data[i - 1];
    const attendees = [];
    for (const att of test.input.attendees) {
      const attendee = new CalAttendee();
      attendee.id = att.id;
      if (att.sentBy) {
        attendee.setProperty("SENT-BY", att.sentBy);
      }
      attendees.push(attendee);
    }
    const detected = [];
    cal.itip.getAttendeesBySender(attendees, test.input.sender).forEach(att => {
      detected.push(att.id);
    });
    ok(
      detected.every(aId => test.expected.includes(aId)),
      "(test #" + i + " ok1)"
    );
    ok(
      test.expected.every(aId => detected.includes(aId)),
      "(test #" + i + " ok2)"
    );
  }
});

add_task(function test_resolveDelegation() {
  const data = [
    {
      input: {
        attendee:
          'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";CN="Attendee 1":mailto:at' +
          "tendee1@example.net",
        attendees: [
          'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";CN="Attendee 1":mailto:at' +
            "tendee1@example.net",
          'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net";CN="Attendee 2":mailto:atte' +
            "ndee2@example.net",
        ],
      },
      expected: {
        delegatees: "",
        delegators: "Attendee 2 <attendee2@example.net>",
      },
    },
    {
      input: {
        attendee:
          'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net":mailto:attendee1@example.net',
        attendees: [
          'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net":mailto:attendee1@example.net',
          'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net":mailto:attendee2@example.net',
        ],
      },
      expected: {
        delegatees: "",
        delegators: "attendee2@example.net",
      },
    },
    {
      input: {
        attendee:
          'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net";CN="Attendee 1":mailto:atte' +
          "ndee1@example.net",
        attendees: [
          'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net";CN="Attendee 1":mailto:atte' +
            "ndee1@example.net",
          'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net";CN="Attendee 2":mailto:at' +
            "tendee2@example.net",
        ],
      },
      expected: {
        delegatees: "Attendee 2 <attendee2@example.net>",
        delegators: "",
      },
    },
    {
      input: {
        attendee:
          'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net":mailto:attendee1@example.net',
        attendees: [
          'ATTENDEE;DELEGATED-TO="mailto:attendee2@example.net":mailto:attendee1@example.net',
          'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net":mailto:attendee2@example.net',
        ],
      },
      expected: {
        delegatees: "attendee2@example.net",
        delegators: "",
      },
    },
    {
      input: {
        attendee: "ATTENDEE:mailto:attendee1@example.net",
        attendees: [
          "ATTENDEE:mailto:attendee1@example.net",
          "ATTENDEE:mailto:attendee2@example.net",
        ],
      },
      expected: {
        delegatees: "",
        delegators: "",
      },
    },
    {
      input: {
        attendee:
          'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";DELEGATED-TO="mailto:atte' +
          'ndee3@example.net":mailto:attendee1@example.net',
        attendees: [
          'ATTENDEE;DELEGATED-FROM="mailto:attendee2@example.net";DELEGATED-TO="mailto:atte' +
            'ndee3@example.net":mailto:attendee1@example.net',
          'ATTENDEE;DELEGATED-TO="mailto:attendee1@example.net":mailto:attendee2@example.net',
          'ATTENDEE;DELEGATED-FROM="mailto:attendee1@example.net":mailto:attendee3@example.net',
        ],
      },
      expected: {
        delegatees: "attendee3@example.net",
        delegators: "attendee2@example.net",
      },
    },
  ];
  let i = 0;
  for (const test of data) {
    i++;
    const attendees = [];
    for (const att of test.input.attendees) {
      const attendee = new CalAttendee();
      attendee.icalString = att;
      attendees.push(attendee);
    }
    const attendee = new CalAttendee();
    attendee.icalString = test.input.attendee;
    const result = cal.itip.resolveDelegation(attendee, attendees);
    equal(result.delegatees, test.expected.delegatees, "(test #" + i + " - delegatees)");
    equal(result.delegators, test.expected.delegators, "(test #" + i + " - delegators)");
  }
});

/**
 * Tests the various ways to use the getInvitedAttendee function.
 */
add_task(async function test_getInvitedAttendee() {
  class MockCalendar {
    supportsScheduling = true;

    constructor(invitedAttendee) {
      this.invitedAttendee = invitedAttendee;
    }

    getSchedulingSupport() {
      return this;
    }

    getInvitedAttendee() {
      return this.invitedAttendee;
    }
  }

  const invitedAttendee = new CalAttendee();
  invitedAttendee.id = "mailto:invited@example.com";

  const calendar = new MockCalendar(invitedAttendee);
  const event = new CalEvent(CalendarTestUtils.dedent`
        BEGIN:VEVENT
        CREATED:20210105T000000Z
        DTSTAMP:20210501T000000Z
        UID:c1a6cfe7-7fbb-4bfb-a00d-861e07c649a5
        SUMMARY:Test Invitation
        DTSTART:20210105T000000Z
        DTEND:20210105T100000Z
        STATUS:CONFIRMED
        SUMMARY:Test Event
        ORGANIZER;CN=events@example.com:mailto:events@example.com
        ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;
          RSVP=TRUE;CN=invited@example.com;:mailto:invited@example.com
        END:VEVENT
      `);

  // No calendar configured or provided.
  Assert.ok(
    !cal.itip.getInvitedAttendee(event),
    "returns falsy when item has no calendar and none provided"
  );

  // No calendar configured but one provided.
  Assert.ok(
    cal.itip.getInvitedAttendee(event, calendar) == invitedAttendee,
    "returns the result from the provided calendar when item has none configured"
  );

  // Calendar configured, none provided.
  event.calendar = calendar;
  Assert.ok(
    cal.itip.getInvitedAttendee(event) == invitedAttendee,
    "returns the result of the item's calendar when calendar not provided"
  );

  // Calendar configured, one provided.
  Assert.ok(
    !cal.itip.getInvitedAttendee(event, new MockCalendar()),
    "returns the result of the provided calendar even if item's calendar is configured"
  );

  // Calendar does not implement nsISchedulingSupport.
  calendar.supportsScheduling = false;
  Assert.ok(
    !cal.itip.getInvitedAttendee(event),
    "returns falsy if the calendar does not indicate nsISchedulingSupport"
  );

  // X-MOZ-INVITED-ATTENDEE set on event.
  event.setProperty("X-MOZ-INVITED-ATTENDEE", "mailto:invited@example.com");

  const attendee = cal.itip.getInvitedAttendee(event);
  Assert.ok(
    attendee && attendee.id == "mailto:invited@example.com",
    "returns the attendee matching X-MOZ-INVITED-ATTENDEE if set"
  );

  // X-MOZ-INVITED-ATTENDEE set to non-existent attendee
  event.setProperty("X-MOZ-INVITED-ATTENDEE", "mailto:nobody@example.com");
  Assert.ok(
    !cal.itip.getInvitedAttendee(event),
    "returns falsy for non-existent X-MOZ-INVITED-ATTENDEE"
  );
});

/**
 * Tests the getImipTransport function returns the correct calIItipTransport.
 */
add_task(function test_getImipTransport() {
  const event = new CalEvent(CalendarTestUtils.dedent`
        BEGIN:VEVENT
        CREATED:20210105T000000Z
        DTSTAMP:20210501T000000Z
        UID:c1a6cfe7-7fbb-4bfb-a00d-861e07c649a5
        SUMMARY:Test Invitation
        DTSTART:20210105T000000Z
        DTEND:20210105T100000Z
        STATUS:CONFIRMED
        SUMMARY:Test Event
        END:VEVENT
      `);

  // Without X-MOZ-INVITED-ATTENDEE property.
  const account1 = MailServices.accounts.createAccount();
  const identity1 = MailServices.accounts.createIdentity();
  identity1.email = "id1@example.com";
  account1.addIdentity(identity1);

  const calendarTransport = new CalItipEmailTransport(account1, identity1);
  event.calendar = {
    getProperty(key) {
      switch (key) {
        case "itip.transport":
          return calendarTransport;
        case "imip.idenity":
          return identity1;
        default:
          return null;
      }
    },
  };

  Assert.ok(
    cal.itip.getImipTransport(event) == calendarTransport,
    "returns the calendar's transport when no X-MOZ-INVITED-ATTENDEE property"
  );

  // With X-MOZ-INVITED-ATTENDEE property.
  const account2 = MailServices.accounts.createAccount();
  const identity2 = MailServices.accounts.createIdentity();
  identity2.email = "id2@example.com";
  account2.addIdentity(identity2);
  account2.incomingServer = MailServices.accounts.createIncomingServer(
    "id2",
    "example.com",
    "imap"
  );

  event.setProperty("X-MOZ-INVITED-ATTENDEE", "mailto:id2@example.com");

  const customTransport = cal.itip.getImipTransport(event);
  Assert.ok(customTransport);

  Assert.ok(
    customTransport.mDefaultAccount == account2,
    "returns a transport using an account for the X-MOZ-INVITED-ATTENDEE identity when set"
  );

  Assert.ok(
    customTransport.mDefaultIdentity == identity2,
    "returns a transport using the identity of the X-MOZ-INVITED-ATTENDEE property when set"
  );
});
