/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var { MailStringUtils } = ChromeUtils.import("resource:///modules/MailStringUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.jsm",
});

function run_test() {
  do_calendar_startup(run_next_test);
}

// tests for calInvitationUtils.jsm

// Make sure that the Europe/Berlin timezone and long datetime format is set.
Services.prefs.setIntPref("calendar.date.format", 0);
Services.prefs.setStringPref("calendar.timezone.local", "Europe/Berlin");

/**
 * typedef {Object} FullIcsValue
 *
 * @property {Object<string, string>} params - Parameters for the ics property,
 *   mapping from the parameter name to its value. Each name should be in camel
 *   case. For example, to set "PARTSTAT=ACCEPTED" on the "attendee" property,
 *   use `{ partstat: "ACCEPTED" }`.
 * @property {string} value - The property value.
 */

/**
 * An accepted property value.
 * typedef {(FullIcsValue|string)} IcsValue
 */

/**
 * Get a ics string for an event.
 *
 * @param {Object<string, (IcsValue | IcsValue[])>} [eventProperties] - Object
 *   used to set the event properties, mapping from the ics property name to its
 *   value. The property name should be in camel case, so "propertyName" should
 *   be used for the "PROPERTY-NAME" property. The value can either be a single
 *   IcsValue, or a IcsValue array if you want more than one such property
 *   in the event (e.g. to set several "attendee" properties). If you give an
 *   empty value for the property, then the property will be excluded.
 *   For the "attendee" and "organizer" properties, "mailto:" will be prefixed
 *   to the value (unless it is empty).
 *   For the "dtstart" and "dtend" properties, the "TZID=Europe/Berlin"
 *   parameter will be set by default.
 *   Some properties will have default values set if they are not specified in
 *   the object. Note that to avoid a property with a default value, you must
 *   pass an empty value for the property.
 *
 * @returns {string} - The ics string.
 */
function getIcs(eventProperties) {
  // we use an unfolded ics blueprint here to make replacing of properties easier
  let item = ["BEGIN:VCALENDAR", "PRODID:-//Google Inc//Google Calendar V1.0//EN", "VERSION:2.0"];

  const eventPropertyNames = eventProperties ? Object.keys(eventProperties) : [];

  // Convert camel case object property name to upper case with dashes.
  const convertPropertyName = n => n.replace(/[A-Z]/, match => `-${match}`).toUpperCase();

  const propertyToString = (name, value) => {
    let propertyString = convertPropertyName(name);
    let setTzid = false;
    if (typeof value == "object") {
      for (const paramName in value.params) {
        if (paramName == "tzid") {
          setTzid = true;
        }
        propertyString += `;${convertPropertyName(paramName)}=${value.params[paramName]}`;
      }
      value = value.value;
    }
    if (!setTzid && (name == "dtstart" || name == "dtend")) {
      propertyString += ";TZID=Europe/Berlin";
    }
    if (name == "organizer" || name == "attendee") {
      value = `mailto:${value}`;
    }
    return `${propertyString}:${value}`;
  };

  const appendProperty = (name, value) => {
    if (!value) {
      // leave out.
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(val => item.push(propertyToString(name, val)));
    } else {
      item.push(propertyToString(name, value));
    }
  };

  const appendPropertyWithDefault = (name, defaultValue) => {
    let value = defaultValue;
    const index = eventPropertyNames.findIndex(n => n == name);
    if (index >= 0) {
      value = eventProperties[name];
      // Remove the name to show that we have already handled it.
      eventPropertyNames.splice(index, 1);
    }
    appendProperty(name, value);
  };

  appendPropertyWithDefault("method", "METHOD:REQUEST");

  item = item.concat([
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
  ]);

  for (const [name, defaultValue] of [
    ["created", "20150909T180909Z"],
    ["lastModified", "20150909T181048Z"],
    ["dtstamp", "20150909T181048Z"],
    ["uid", "cb189fdc-ed47-4db6-a8d7-31a08802249d"],
    ["summary", "Test Event"],
    [
      "organizer",
      {
        params: { rsvp: "TRUE", cn: "Organizer", partstat: "ACCEPTED", role: "CHAIR" },
        value: "organizer@example.net",
      },
    ],
    [
      "attendee",
      {
        params: { rsvp: "TRUE", cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
        value: "attendee@example.net",
      },
    ],
    ["dtstart", "20150909T210000"],
    ["dtend", "20150909T220000"],
    ["sequence", "1"],
    ["transp", "OPAQUE"],
    ["location", "Room 1"],
    ["description", "Let us get together"],
    ["url", "http://www.example.com"],
    ["attach", "http://www.example.com"],
  ]) {
    appendPropertyWithDefault(name, defaultValue);
  }

  // Add other properties with no default.
  for (const name of eventPropertyNames) {
    appendProperty(name, eventProperties[name]);
  }

  item.push("END:VEVENT");
  item.push("END:VCALENDAR");

  return item.join("\r\n");
}

function getEvent(eventProperties) {
  const item = getIcs(eventProperties);
  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(item);
  const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
  parser.parseString(item);
  return { event: parser.getItems()[0], itipItem };
}

add_task(async function getItipHeader_test() {
  const data = [
    {
      name: "Organizer sends invite",
      input: {
        method: "REQUEST",
        attendee: "",
      },
      expected: "Organizer has invited you to Test Event",
    },
    {
      name: "Organizer cancels event",
      input: {
        method: "CANCEL",
        attendee: "",
      },
      expected: "Organizer has canceled this event: Test Event",
    },
    {
      name: "Organizer declines counter proposal",
      input: {
        method: "DECLINECOUNTER",
        attendee: {
          params: { rsvp: "TRUE", cn: "Attendee1", partstat: "ACCEPTED", role: "REQ-PARTICIPANT" },
          value: "attendee1@example.net",
        },
      },
      expected: 'Organizer has declined your counterproposal for "Test Event".',
    },
    {
      name: "Attendee makes counter proposal",
      input: {
        method: "COUNTER",
        attendee: {
          params: { rsvp: "TRUE", cn: "Attendee1", partstat: "DECLINED", role: "REQ-PARTICIPANT" },
          value: "attendee1@example.net",
        },
      },
      expected: 'Attendee1 <attendee1@example.net> has made a counterproposal for "Test Event":',
    },
    {
      name: "Attendee replies with acceptance",
      input: {
        method: "REPLY",
        attendee: {
          params: { rsvp: "TRUE", cn: "Attendee1", partstat: "ACCEPTED", role: "REQ-PARTICIPANT" },
          value: "attendee1@example.net",
        },
      },
      expected: "Attendee1 <attendee1@example.net> has accepted your event invitation.",
    },
    {
      name: "Attendee replies with tentative acceptance",
      input: {
        method: "REPLY",
        attendee: {
          params: { rsvp: "TRUE", cn: "Attendee1", partstat: "TENTATIVE", role: "REQ-PARTICIPANT" },
          value: "attendee1@example.net",
        },
      },
      expected: "Attendee1 <attendee1@example.net> has accepted your event invitation.",
    },
    {
      name: "Attendee replies with declined",
      input: {
        method: "REPLY",
        attendee: {
          params: { rsvp: "TRUE", cn: "Attendee1", partstat: "DECLINED", role: "REQ-PARTICIPANT" },
          value: "attendee1@example.net",
        },
      },
      expected: "Attendee1 <attendee1@example.net> has declined your event invitation.",
    },
    {
      name: "Attendee1 accepts and Attendee2 declines",
      input: {
        method: "REPLY",
        attendee: [
          {
            params: {
              rsvp: "TRUE",
              cn: "Attendee1",
              partstat: "ACCEPTED",
              role: "REQ-PARTICIPANT",
            },
            value: "attendee1@example.net",
          },
          {
            params: {
              rsvp: "TRUE",
              cn: "Attendee2",
              partstat: "DECLINED",
              role: "REQ-PARTICIPANT",
            },
            value: "attendee2@example.net",
          },
        ],
      },
      expected: "Attendee1 <attendee1@example.net> has accepted your event invitation.",
    },
    {
      name: "Unsupported method",
      input: {
        method: "UNSUPPORTED",
        attendee: "",
      },
      expected: "Event Invitation",
    },
    {
      name: "No method",
      input: {
        method: "",
        attendee: "",
      },
      expected: "Event Invitation",
    },
  ];
  for (const test of data) {
    const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
    const item = getIcs(test.input);
    itipItem.init(item);
    if (test.input.attendee) {
      const sender = new CalAttendee();
      sender.icalString = item.match(/^ATTENDEE.*$/m)[0];
      itipItem.sender = sender.id;
    }
    equal(cal.invitation.getItipHeader(itipItem), test.expected, `(test ${test.name})`);
  }
});

function assertHiddenRow(node, hidden, testName) {
  const row = node.closest("tr");
  ok(row, `Row above ${node.id} should exist (test ${testName})`);
  if (hidden) {
    equal(
      node.textContent,
      "",
      `Node ${node.id} should be empty below a hidden row (test ${testName})`
    );
    ok(row.hidden, `Row above ${node.id} should be hidden (test ${testName})`);
  } else {
    ok(!row.hidden, `Row above ${node.id} should not be hidden (test ${testName})`);
  }
}

add_task(async function createInvitationOverlay_test() {
  const data = [
    {
      name: "No description",
      input: { description: "" },
      expected: { node: "imipHtml-description-content", hidden: true },
    },
    {
      name: "Description with https link",
      input: { description: "Go to https://www.example.net if you can." },
      expected: {
        node: "imipHtml-description-content",
        content:
          'Go to <a class="moz-txt-link-freetext" href="https://www.example.net">' +
          "https://www.example.net</a> if you can.",
      },
    },
    {
      name: "Description plain link",
      input: { description: "Go to www.example.net if you can." },
      expected: {
        node: "imipHtml-description-content",
        content:
          'Go to <a class="moz-txt-link-abbreviated" href="http://www.example.net">' +
          "www.example.net</a> if you can.",
      },
    },
    {
      name: "Description with +/-",
      input: { description: "Let's see if +/- still can be displayed." },
      expected: {
        node: "imipHtml-description-content",
        content: "Let's see if +/- still can be displayed.",
      },
    },
    {
      name: "Description with mailto",
      input: { description: "Or write to mailto:faq@example.net instead." },
      expected: {
        node: "imipHtml-description-content",
        content:
          'Or write to <a class="moz-txt-link-freetext" ' +
          'href="mailto:faq@example.net">mailto:faq@example.net</a> instead.',
      },
    },
    {
      name: "Description with email",
      input: { description: "Or write to faq@example.net instead." },
      expected: {
        node: "imipHtml-description-content",
        content:
          'Or write to <a class="moz-txt-link-abbreviated" ' +
          'href="mailto:faq@example.net">faq@example.net</a> instead.',
      },
    },
    {
      name: "Description with emoticon",
      input: { description: "It's up to you ;-)" },
      expected: {
        node: "imipHtml-description-content",
        content: "It's up to you ;-)",
      },
    },
    {
      name: "Removed script injection from description",
      input: {
        description:
          'Let\'s see how evil we can be: <script language="JavaScript">' +
          'document.getElementById("imipHtml-description-content")' +
          '.write("Script embedded!")</script>',
      },
      expected: {
        node: "imipHtml-description-content",
        content: "Let's see how evil we can be: ",
      },
    },
    {
      name: "Removed img src injection from description",
      input: {
        description:
          'Or we can try: <img src="document.getElementById("imipHtml-' +
          'description-descr").innerText" >',
      },
      expected: {
        node: "imipHtml-description-content",
        content: "Or we can try: ",
      },
    },
    {
      name: "Description with special characters",
      input: {
        description:
          'Check <a href="http://example.com">example.com</a>&nbsp;&nbsp;&mdash; only 3 &euro;',
      },
      expected: {
        node: "imipHtml-description-content",
        content: 'Check <a href="http://example.com">example.com</a>&nbsp;&nbsp;— only 3 €',
      },
    },
    {
      name: "URL",
      input: { url: "http://www.example.org/event.ics" },
      expected: {
        node: "imipHtml-url-content",
        content:
          '<a class="moz-txt-link-freetext" href="http://www.example.org/event.ics">' +
          "http://www.example.org/event.ics</a>",
      },
    },
    {
      name: "URL attachment",
      input: { attach: "http://www.example.org" },
      expected: {
        node: "imipHtml-attachments-content",
        content:
          '<a class="moz-txt-link-freetext" href="http://www.example.org/">' +
          "http://www.example.org/</a>",
      },
    },
    {
      name: "Non-URL attachment is ignored",
      input: {
        attach: {
          params: { fmttype: "text/plain", encoding: "BASE64", value: "BINARY" },
          value: "VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZy4",
        },
      },
      expected: { node: "imipHtml-attachments-content", hidden: true },
    },
    {
      name: "Several attachments",
      input: {
        attach: [
          "http://www.example.org/first/",
          "http://www.example.org/second",
          "file:///N:/folder/third.file",
        ],
      },
      expected: {
        node: "imipHtml-attachments-content",
        content:
          '<a class="moz-txt-link-freetext" href="http://www.example.org/first/">' +
          "http://www.example.org/first/</a><br>" +
          '<a class="moz-txt-link-freetext" href="http://www.example.org/second">' +
          "http://www.example.org/second</a><br>" +
          '<a class="moz-txt-link-freetext">file:///N:/folder/third.file</a>',
      },
    },
    {
      name: "Attendees",
      input: {
        attendee: [
          {
            params: {
              rsvp: "TRUE",
              partstat: "NEEDS-ACTION",
              role: "OPT-PARTICIPANT",
              cutype: "INDIVIDUAL",
              cn: '"Attendee 1"',
            },
            value: "attendee1@example.net",
          },
          {
            params: {
              rsvp: "TRUE",
              partstat: "ACCEPTED",
              role: "NON-PARTICIPANT",
              cutype: "GROUP",
            },
            value: "attendee2@example.net",
          },
          {
            params: {
              rsvp: "TRUE",
              partstat: "TENTATIVE",
              role: "REQ-PARTICIPANT",
              cutype: "RESOURCE",
            },
            value: "attendee3@example.net",
          },
          {
            params: {
              rsvp: "TRUE",
              partstat: "DECLINED",
              role: "OPT-PARTICIPANT",
              delegatedFrom: '"mailto:attendee5@example.net"',
              cutype: "ROOM",
            },
            value: "attendee4@example.net",
          },
          {
            params: {
              rsvp: "TRUE",
              partstat: "DELEGATED",
              role: "OPT-PARTICIPANT",
              delegatedTo: '"mailto:attendee4@example.net"',
              cutype: "UNKNOWN",
            },
            value: "attendee5@example.net",
          },
          {
            params: { rsvp: "TRUE" },
            value: "attendee6@example.net",
          },
          "attendee7@example.net",
        ],
      },
      expected: {
        node: "imipHtml-attendees-cell",
        attendeesList: [
          {
            name: "Attendee 1 <attendee1@example.net>",
            title:
              "Attendee 1 <attendee1@example.net> is an optional " +
              "participant. Attendee 1 still needs to reply.",
            icon: {
              attendeerole: "OPT-PARTICIPANT",
              usertype: "INDIVIDUAL",
              partstat: "NEEDS-ACTION",
            },
          },
          {
            name: "attendee2@example.net",
            title:
              "attendee2@example.net (group) is a non-participant. " +
              "attendee2@example.net has confirmed attendance.",
            icon: {
              attendeerole: "NON-PARTICIPANT",
              usertype: "GROUP",
              partstat: "ACCEPTED",
            },
          },
          {
            name: "attendee3@example.net",
            title:
              "attendee3@example.net (resource) is a required " +
              "participant. attendee3@example.net has confirmed attendance " +
              "tentatively.",
            icon: {
              attendeerole: "REQ-PARTICIPANT",
              usertype: "RESOURCE",
              partstat: "TENTATIVE",
            },
          },
          {
            name: "attendee4@example.net (delegated from attendee5@example.net)",
            title:
              "attendee4@example.net (room) is an optional participant. " +
              "attendee4@example.net has declined attendance.",
            icon: {
              attendeerole: "OPT-PARTICIPANT",
              usertype: "ROOM",
              partstat: "DECLINED",
            },
          },
          {
            name: "attendee5@example.net",
            title:
              "attendee5@example.net is an optional participant. " +
              "attendee5@example.net has delegated attendance to " +
              "attendee4@example.net.",
            icon: {
              attendeerole: "OPT-PARTICIPANT",
              usertype: "UNKNOWN",
              partstat: "DELEGATED",
            },
          },
          {
            name: "attendee6@example.net",
            title:
              "attendee6@example.net is a required participant. " +
              "attendee6@example.net still needs to reply.",
            icon: {
              attendeerole: "REQ-PARTICIPANT",
              usertype: "INDIVIDUAL",
              partstat: "NEEDS-ACTION",
            },
          },
          {
            name: "attendee7@example.net",
            title:
              "attendee7@example.net is a required participant. " +
              "attendee7@example.net still needs to reply.",
            icon: {
              attendeerole: "REQ-PARTICIPANT",
              usertype: "INDIVIDUAL",
              partstat: "NEEDS-ACTION",
            },
          },
        ],
      },
    },
    {
      name: "Organizer",
      input: {
        organizer: {
          params: {
            partstat: "ACCEPTED",
            role: "CHAIR",
            cutype: "INDIVIDUAL",
            cn: '"The Organizer"',
          },
          value: "organizer@example.net",
        },
      },
      expected: {
        node: "imipHtml-organizer-cell",
        organizer: {
          name: "The Organizer <organizer@example.net>",
          title:
            "The Organizer <organizer@example.net> chairs the event. " +
            "The Organizer has confirmed attendance.",
          icon: {
            attendeerole: "CHAIR",
            usertype: "INDIVIDUAL",
            partstat: "ACCEPTED",
          },
        },
      },
    },
  ];

  function assertAttendee(attendee, name, title, icon, testName) {
    equal(attendee.textContent, name, `Attendee names (test ${testName})`);
    equal(attendee.getAttribute("title"), title, `Title for ${name} (test ${testName})`);
    const attendeeIcon = attendee.querySelector(".itip-icon");
    ok(attendeeIcon, `icon for ${name} should exist (test ${testName})`);
    for (const attr in icon) {
      equal(
        attendeeIcon.getAttribute(attr),
        icon[attr],
        `${attr} for icon for ${name} (test ${testName})`
      );
    }
  }

  for (const test of data) {
    info(`testing ${test.name}`);
    const { event, itipItem } = getEvent(test.input);
    const dom = cal.invitation.createInvitationOverlay(event, itipItem);
    const node = dom.getElementById(test.expected.node);
    ok(node, `Element with id ${test.expected.node} should exist (test ${test.name})`);
    if (test.expected.hidden) {
      assertHiddenRow(node, true, test.name);
      continue;
    }
    assertHiddenRow(node, false, test.name);

    if ("attendeesList" in test.expected) {
      const attendeeNodes = node.querySelectorAll(".attendee-label");
      // Assert same order.
      let i;
      for (i = 0; i < test.expected.attendeesList.length; i++) {
        const { name, title, icon } = test.expected.attendeesList[i];
        Assert.greater(
          attendeeNodes.length,
          i,
          `Enough attendees for expected attendee #${i} ${name} (test ${test.name})`
        );
        assertAttendee(attendeeNodes[i], name, title, icon, test.name);
      }
      equal(attendeeNodes.length, i, `Same number of attendees (test ${test.name})`);
    } else if ("organizer" in test.expected) {
      const { name, title, icon } = test.expected.organizer;
      const organizerNode = node.querySelector(".attendee-label");
      ok(organizerNode, `Organizer node should exist (test ${test.name})`);
      assertAttendee(organizerNode, name, title, icon, test.name);
    } else {
      equal(node.innerHTML, test.expected.content, `innerHTML (test ${test.name})`);
    }
  }
});

add_task(async function updateInvitationOverlay_test() {
  const data = [
    {
      name: "No description before or after",
      input: { previous: { description: "" }, current: { description: "" } },
      expected: { node: "imipHtml-description-content", hidden: true },
    },
    {
      name: "Same description before and after",
      input: {
        previous: { description: "This is the description" },
        current: { description: "This is the description" },
      },
      expected: {
        node: "imipHtml-description-content",
        content: [{ type: "same", text: "This is the description" }],
      },
    },
    {
      name: "Added description",
      input: {
        previous: { description: "" },
        current: { description: "Added this description" },
      },
      expected: {
        node: "imipHtml-description-content",
        content: [{ type: "added", text: "Added this description" }],
      },
    },
    {
      name: "Removed description",
      input: {
        previous: { description: "Removed this description" },
        current: { description: "" },
      },
      expected: {
        node: "imipHtml-description-content",
        content: [{ type: "removed", text: "Removed this description" }],
      },
    },
    {
      name: "Location",
      input: {
        previous: { location: "This place" },
        current: { location: "Another location" },
      },
      expected: {
        node: "imipHtml-location-content",
        content: [
          { type: "added", text: "Another location" },
          { type: "removed", text: "This place" },
        ],
      },
    },
    {
      name: "Summary",
      input: {
        previous: { summary: "My invitation" },
        current: { summary: "My new invitation" },
      },
      expected: {
        node: "imipHtml-summary-content",
        content: [
          { type: "added", text: "My new invitation" },
          { type: "removed", text: "My invitation" },
        ],
      },
    },
    {
      name: "When",
      input: {
        previous: {
          dtstart: "20150909T130000",
          dtend: "20150909T140000",
        },
        current: {
          dtstart: "20150909T140000",
          dtend: "20150909T150000",
        },
      },
      expected: {
        node: "imipHtml-when-content",
        content: [
          // Time format is platform dependent, so we use alternative result
          // sets here.
          // If you get a failure for this test, add your pattern here.
          {
            type: "added",
            text: /^Wednesday, (September 0?9,|0?9 September) 2015 (2:00 PM – 3:00 PM|14:00 – 15:00)$/,
          },
          {
            type: "removed",
            text: /^Wednesday, (September 0?9,|0?9 September) 2015 (1:00 PM – 2:00 PM|13:00 – 14:00)$/,
          },
        ],
      },
    },
    {
      name: "Organizer same",
      input: {
        previous: { organizer: "organizer1@example.net" },
        current: { organizer: "organizer1@example.net" },
      },
      expected: {
        node: "imipHtml-organizer-cell",
        organizer: [{ type: "same", text: "organizer1@example.net" }],
      },
    },
    {
      name: "Organizer modified",
      input: {
        // Modify ROLE from CHAIR to REQ-PARTICIPANT.
        previous: { organizer: { params: { role: "CHAIR" }, value: "organizer1@example.net" } },
        current: {
          organizer: { params: { role: "REQ-PARTICIPANT" }, value: "organizer1@example.net" },
        },
      },
      expected: {
        node: "imipHtml-organizer-cell",
        organizer: [{ type: "modified", text: "organizer1@example.net" }],
      },
    },
    {
      name: "Organizer added",
      input: {
        previous: { organizer: "" },
        current: { organizer: "organizer2@example.net" },
      },
      expected: {
        node: "imipHtml-organizer-cell",
        organizer: [{ type: "added", text: "organizer2@example.net" }],
      },
    },
    {
      name: "Organizer removed",
      input: {
        previous: { organizer: "organizer2@example.net" },
        current: { organizer: "" },
      },
      expected: {
        node: "imipHtml-organizer-cell",
        organizer: [{ type: "removed", text: "organizer2@example.net" }],
      },
    },
    {
      name: "Organizer changed",
      input: {
        previous: { organizer: "organizer1@example.net" },
        current: { organizer: "organizer2@example.net" },
      },
      expected: {
        node: "imipHtml-organizer-cell",
        organizer: [
          { type: "added", text: "organizer2@example.net" },
          { type: "removed", text: "organizer1@example.net" },
        ],
      },
    },
    {
      name: "Attendees: modify one, remove one, add one",
      input: {
        previous: {
          attendee: [
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee1@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee2@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee3@example.net",
            },
          ],
        },
        current: {
          attendee: [
            {
              // Modify PARTSTAT from NEEDS-ACTION.
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "ACCEPTED" },
              value: "attendee2@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee3@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee4@example.net",
            },
          ],
        },
      },
      expected: {
        node: "imipHtml-attendees-cell",
        attendeesList: [
          { type: "removed", text: "attendee1@example.net" },
          { type: "modified", text: "attendee2@example.net" },
          { type: "same", text: "attendee3@example.net" },
          { type: "added", text: "attendee4@example.net" },
        ],
      },
    },
    {
      name: "Attendees: modify one, remove three, add two",
      input: {
        previous: {
          attendee: [
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee-remove1@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "GROUP", partstat: "NEEDS-ACTION" },
              value: "attendee1@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee-remove2@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee-remove3@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee3@example.net",
            },
          ],
        },
        current: {
          attendee: [
            {
              // Modify CUTYPE from GROUP.
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee1@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee-add1@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee-add2@example.net",
            },
            {
              params: { rsvp: "TRUE", cutype: "INDIVIDUAL", partstat: "NEEDS-ACTION" },
              value: "attendee3@example.net",
            },
          ],
        },
      },
      expected: {
        node: "imipHtml-attendees-cell",
        attendeesList: [
          { type: "removed", text: "attendee-remove1@example.net" },
          { type: "modified", text: "attendee1@example.net" },
          // Added shown first, then removed, and in between the common
          // attendees.
          { type: "added", text: "attendee-add1@example.net" },
          { type: "added", text: "attendee-add2@example.net" },
          { type: "removed", text: "attendee-remove2@example.net" },
          { type: "removed", text: "attendee-remove3@example.net" },
          { type: "same", text: "attendee3@example.net" },
        ],
      },
    },
  ];

  function assertElement(node, text, type, testName) {
    const found = node.textContent;
    if (text instanceof RegExp) {
      ok(text.test(found), `Text content "${found}" matches regex (test ${testName})`);
    } else {
      equal(text, found, `Text content matches (test ${testName})`);
    }
    switch (type) {
      case "added":
        equal(node.tagName, "INS", `Text "${text}" is inserted (test ${testName})`);
        ok(node.classList.contains("added"), `Text "${text}" is added (test ${testName})`);
        break;
      case "removed":
        equal(node.tagName, "DEL", `Text "${text}" is deleted (test ${testName})`);
        ok(node.classList.contains("removed"), `Text "${text}" is removed (test ${testName})`);
        break;
      case "modified":
        Assert.notStrictEqual(
          node.tagName,
          "DEL",
          `Text "${text}" is not deleted (test ${testName})`
        );
        Assert.notStrictEqual(
          node.tagName,
          "INS",
          `Text "${text}" is not inserted (test ${testName})`
        );
        ok(node.classList.contains("modified"), `Text "${text}" is modified (test ${testName})`);
        break;
      case "same":
        // NOTE: node may be a Text node.
        Assert.notStrictEqual(
          node.tagName,
          "DEL",
          `Text "${text}" is not deleted (test ${testName})`
        );
        Assert.notStrictEqual(
          node.tagName,
          "INS",
          `Text "${text}" is not inserted (test ${testName})`
        );
        if (node.classList) {
          ok(!node.classList.contains("added"), `Text "${text}" is not added (test ${testName})`);
          ok(
            !node.classList.contains("removed"),
            `Text "${text}" is not removed (test ${testName})`
          );
          ok(
            !node.classList.contains("modified"),
            `Text "${text}" is not modified (test ${testName})`
          );
        }
        break;
      default:
        ok(false, `Unknown type ${type} for text "${text}" (test ${testName})`);
        break;
    }
  }

  for (const test of data) {
    info(`testing ${test.name}`);
    const { event, itipItem } = getEvent(test.input.current);
    const dom = cal.invitation.createInvitationOverlay(event, itipItem);
    const { event: oldEvent } = getEvent(test.input.previous);
    cal.invitation.updateInvitationOverlay(dom, event, itipItem, oldEvent);

    const node = dom.getElementById(test.expected.node);
    ok(node, `Element with id ${test.expected.node} should exist (test ${test.name})`);
    if (test.expected.hidden) {
      assertHiddenRow(node, true, test.name);
      continue;
    }
    assertHiddenRow(node, false, test.name);

    let insertBreaks = false;
    let nodeList;
    let expectList;

    if ("attendeesList" in test.expected) {
      // Insertions, deletions and modifications are all within separate
      // list-items.
      nodeList = node.querySelectorAll(":scope > .attendee-list > .attendee-list-item > *");
      expectList = test.expected.attendeesList;
    } else if ("organizer" in test.expected) {
      nodeList = node.childNodes;
      expectList = test.expected.organizer;
    } else {
      nodeList = node.childNodes;
      expectList = test.expected.content;
      insertBreaks = true;
    }

    // Assert in same order.
    let first = true;
    let nodeIndex = 0;
    for (const { text, type } of expectList) {
      if (first) {
        first = false;
      } else if (insertBreaks) {
        Assert.greater(
          nodeList.length,
          nodeIndex,
          `Enough child nodes for expected break node at index ${nodeIndex} (test ${test.name})`
        );
        equal(
          nodeList[nodeIndex].tagName,
          "BR",
          `Break node at index ${nodeIndex} (test ${test.name})`
        );
        nodeIndex++;
      }

      Assert.greater(
        nodeList.length,
        nodeIndex,
        `Enough child nodes for expected node at index ${nodeIndex} "${text}" (test ${test.name})`
      );
      assertElement(nodeList[nodeIndex], text, type, test.name);
      nodeIndex++;
    }
    equal(nodeList.length, nodeIndex, `Covered all nodes (test ${test.name})`);
  }
});

add_task(async function getHeaderSection_test() {
  const data = [
    {
      // test #1
      input: {
        toList: "recipient@example.net",
        subject: "Invitation: test subject",
        identity: {
          fullName: "Invitation sender",
          email: "sender@example.net",
          replyTo: "no-reply@example.net",
          organization: "Example Net",
          cc: "cc@example.net",
          bcc: "bcc@example.net",
        },
      },
      expected:
        "MIME-version: 1.0\r\n" +
        "Return-path: no-reply@example.net\r\n" +
        "From: Invitation sender <sender@example.net>\r\n" +
        "Organization: Example Net\r\n" +
        "To: recipient@example.net\r\n" +
        "Subject: Invitation: test subject\r\n" +
        "Cc: cc@example.net\r\n" +
        "Bcc: bcc@example.net\r\n",
    },
    {
      // test #2
      input: {
        toList: 'rec1@example.net, Recipient 2 <rec2@example.net>, "Rec, 3" <rec3@example.net>',
        subject: "Invitation: test subject",
        identity: {
          fullName: '"invitation, sender"',
          email: "sender@example.net",
          replyTo: "no-reply@example.net",
          organization: "Example Net",
          cc: 'cc1@example.net, Cc 2 <cc2@example.net>, "Cc, 3" <cc3@example.net>',
          bcc: 'bcc1@example.net, BCc 2 <bcc2@example.net>, "Bcc, 3" <bcc3@example.net>',
        },
      },
      expected:
        "MIME-version: 1.0\r\n" +
        "Return-path: no-reply@example.net\r\n" +
        'From: "invitation, sender" <sender@example.net>\r\n' +
        "Organization: Example Net\r\n" +
        'To: rec1@example.net, Recipient 2 <rec2@example.net>,\r\n "Rec, 3" <rec3@example.net>\r\n' +
        "Subject: Invitation: test subject\r\n" +
        'Cc: cc1@example.net, Cc 2 <cc2@example.net>, "Cc, 3" <cc3@example.net>\r\n' +
        'Bcc: bcc1@example.net, BCc 2 <bcc2@example.net>, "Bcc, 3"\r\n <bcc3@example.net>\r\n',
    },
    {
      // test #3
      input: {
        toList: "recipient@example.net",
        subject: "Invitation: test subject",
        identity: { email: "sender@example.net" },
      },
      expected:
        "MIME-version: 1.0\r\n" +
        "From: sender@example.net\r\n" +
        "To: recipient@example.net\r\n" +
        "Subject: Invitation: test subject\r\n",
    },
    {
      // test #4
      input: {
        toList: "Max Müller <mueller@example.net>",
        subject: "Invitation: Diacritis check (üäé)",
        identity: {
          fullName: "René",
          email: "sender@example.net",
          replyTo: "Max & René <no-reply@example.net>",
          organization: "Max & René",
          cc: "René <cc@example.net>",
          bcc: "René <bcc@example.net>",
        },
      },
      expected:
        "MIME-version: 1.0\r\n" +
        "Return-path: =?UTF-8?B?TWF4ICYgUmVuw6k=?= <no-reply@example.net>\r\n" +
        "From: =?UTF-8?B?UmVuw6k=?= <sender@example.net>\r\n" +
        "Organization: =?UTF-8?B?TWF4ICYgUmVuw6k=?=\r\n" +
        "To: =?UTF-8?Q?Max_M=C3=BCller?= <mueller@example.net>\r\n" +
        "Subject: =?UTF-8?B?SW52aXRhdGlvbjogRGlhY3JpdGlzIGNoZWNrICjDvMOk?=\r\n =?UTF-8?B" +
        "?w6kp?=\r\n" +
        "Cc: =?UTF-8?B?UmVuw6k=?= <cc@example.net>\r\n" +
        "Bcc: =?UTF-8?B?UmVuw6k=?= <bcc@example.net>\r\n",
    },
  ];
  let i = 0;
  for (const test of data) {
    i++;
    info(`Running test #${i}`);
    const identity = MailServices.accounts.createIdentity();
    identity.email = test.input.identity.email || null;
    identity.fullName = test.input.identity.fullName || null;
    identity.replyTo = test.input.identity.replyTo || null;
    identity.organization = test.input.identity.organization || null;
    identity.doCc = test.input.identity.doCc || test.input.identity.cc;
    identity.doCcList = test.input.identity.cc || null;
    identity.doBcc = test.input.identity.doBcc || test.input.identity.bcc;
    identity.doBccList = test.input.identity.bcc || null;

    const composeUtils = Cc["@mozilla.org/messengercompose/computils;1"].createInstance(
      Ci.nsIMsgCompUtils
    );
    const messageId = composeUtils.msgGenerateMessageId(identity, null);

    const header = cal.invitation.getHeaderSection(
      messageId,
      identity,
      test.input.toList,
      test.input.subject
    );
    // we test Date and Message-ID headers separately to avoid false positives
    ok(!!header.match(/Date:.+(?:\n|\r\n|\r)/), "(test #" + i + "): date");
    ok(!!header.match(/Message-ID:.+(?:\n|\r\n|\r)/), "(test #" + i + "): message-id");
    equal(
      header.replace(/Date:.+(?:\n|\r\n|\r)/, "").replace(/Message-ID:.+(?:\n|\r\n|\r)/, ""),
      test.expected.replace(/Date:.+(?:\n|\r\n|\r)/, "").replace(/Message-ID:.+(?:\n|\r\n|\r)/, ""),
      "(test #" + i + "): all headers"
    );
  }
});

add_task(async function convertFromUnicode_test() {
  const data = [
    {
      // test #1
      input: "müller",
      expected: "mÃ¼ller",
    },
    {
      // test #2
      input: "muller",
      expected: "muller",
    },
    {
      // test #3
      input: "müller\nmüller",
      expected: "mÃ¼ller\nmÃ¼ller",
    },
    {
      // test #4
      input: "müller\r\nmüller",
      expected: "mÃ¼ller\r\nmÃ¼ller",
    },
  ];
  let i = 0;
  for (const test of data) {
    i++;
    equal(MailStringUtils.stringToByteString(test.input), test.expected, "(test #" + i + ")");
  }
});

add_task(async function encodeUTF8_test() {
  const data = [
    {
      // test #1
      input: "müller",
      expected: "mÃ¼ller",
    },
    {
      // test #2
      input: "muller",
      expected: "muller",
    },
    {
      // test #3
      input: "müller\nmüller",
      expected: "mÃ¼ller\r\nmÃ¼ller",
    },
    {
      // test #4
      input: "müller\r\nmüller",
      expected: "mÃ¼ller\r\nmÃ¼ller",
    },
    {
      // test #5
      input: "",
      expected: "",
    },
  ];
  let i = 0;
  for (const test of data) {
    i++;
    equal(cal.invitation.encodeUTF8(test.input), test.expected, "(test #" + i + ")");
  }
});

add_task(async function encodeMimeHeader_test() {
  const data = [
    {
      // test #1
      input: {
        header: "Max Müller <m.mueller@example.net>",
        isEmail: true,
      },
      expected: "=?UTF-8?Q?Max_M=C3=BCller?= <m.mueller@example.net>",
    },
    {
      // test #2
      input: {
        header: "Max Mueller <m.mueller@example.net>",
        isEmail: true,
      },
      expected: "Max Mueller <m.mueller@example.net>",
    },
    {
      // test #3
      input: {
        header: "Müller & Müller",
        isEmail: false,
      },
      expected: "=?UTF-8?B?TcO8bGxlciAmIE3DvGxsZXI=?=",
    },
  ];

  let i = 0;
  for (const test of data) {
    i++;
    equal(
      cal.invitation.encodeMimeHeader(test.input.header, test.input.isEmail),
      test.expected,
      "(test #" + i + ")"
    );
  }
});

add_task(async function getRfc5322FormattedDate_test() {
  const data = {
    input: [
      {
        // test #1
        date: null,
        timezone: "America/New_York",
      },
      {
        // test #2
        date: "Sat, 24 Jan 2015 09:24:49 +0100",
        timezone: "America/New_York",
      },
      {
        // test #3
        date: "Sat, 24 Jan 2015 09:24:49 GMT+0100",
        timezone: "America/New_York",
      },
      {
        // test #4
        date: "Sat, 24 Jan 2015 09:24:49 GMT",
        timezone: "America/New_York",
      },
      {
        // test #5
        date: "Sat, 24 Jan 2015 09:24:49",
        timezone: "America/New_York",
      },
      {
        // test #6
        date: "Sat, 24 Jan 2015 09:24:49",
        timezone: null,
      },
      {
        // test #7
        date: "Sat, 24 Jan 2015 09:24:49",
        timezone: "UTC",
      },
      {
        // test #8
        date: "Sat, 24 Jan 2015 09:24:49",
        timezone: "floating",
      },
    ],
    expected: /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/,
  };

  let i = 0;
  const timezone = Services.prefs.getStringPref("calendar.timezone.local", null);
  for (const test of data.input) {
    i++;
    if (test.timezone) {
      Services.prefs.setStringPref("calendar.timezone.local", test.timezone);
    } else {
      Services.prefs.clearUserPref("calendar.timezone.local");
    }
    const date = test.date ? new Date(test.date) : null;
    const re = new RegExp(data.expected);
    ok(re.test(cal.invitation.getRfc5322FormattedDate(date)), "(test #" + i + ")");
  }
  Services.prefs.setStringPref("calendar.timezone.local", timezone);
});

add_task(async function parseCounter_test() {
  // We are disabling this rule for a more consistent display of this data
  /* eslint-disable object-curly-newline */
  const data = [
    {
      name: "Basic test to check all currently supported properties",
      input: {
        proposed: {
          method: "COUNTER",
          dtstart: "20150910T210000",
          dtend: "20150910T220000",
          location: "Room 2",
          summary: "Test Event 2",
          attendee: {
            params: { cn: "Attendee", partstat: "DECLINED", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          dtstamp: "20150909T182048Z",
          comment: "Sorry, I cannot make it that time.",
        },
      },
      expected: {
        // Time format is platform dependent, so we use alternative result sets here.
        // The first two are configurations running for automated tests.
        // If you get a failure for this test, add your pattern here.
        result: { descr: "", type: "OK" },
        differences: {
          summary: {
            proposed: "Test Event 2",
            original: "Test Event",
          },
          location: {
            proposed: "Room 2",
            original: "Room 1",
          },
          dtstart: {
            proposed:
              /^Thursday, (September 10,|10 September) 2015 (9:00 PM|21:00) Europe\/Berlin$/,
            original:
              /^Wednesday, (September 0?9,|0?9 September) 2015 (9:00 PM|21:00) Europe\/Berlin$/,
          },
          dtend: {
            proposed:
              /^Thursday, (September 10,|10 September) 2015 (10:00 PM|22:00) Europe\/Berlin$/,
            original:
              /^Wednesday, (September 0?9,|0?9 September) 2015 (10:00 PM|22:00) Europe\/Berlin$/,
          },
          comment: {
            proposed: "Sorry, I cannot make it that time.",
            original: null,
          },
        },
      },
    },
    {
      name: "Test with an unsupported property has been changed",
      input: {
        proposed: {
          method: "COUNTER",
          attendee: {
            params: { cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          location: "Room 2",
          attach: "http://www.example2.com",
          dtstamp: "20150909T182048Z",
        },
      },
      expected: {
        result: { descr: "", type: "OK" },
        differences: { location: { proposed: "Room 2", original: "Room 1" } },
      },
    },
    {
      name: "Proposed change not based on the latest update of the invitation",
      input: {
        proposed: {
          method: "COUNTER",
          attendee: {
            params: { cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          location: "Room 2",
          dtstamp: "20150909T171048Z",
        },
      },
      expected: {
        result: {
          descr: "This is a counterproposal not based on the latest event update.",
          type: "NOTLATESTUPDATE",
        },
        differences: { location: { proposed: "Room 2", original: "Room 1" } },
      },
    },
    {
      name: "Proposed change based on a meanwhile reschuled invitation",
      input: {
        proposed: {
          method: "COUNTER",
          attendee: {
            params: { cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          location: "Room 2",
          sequence: "0",
          dtstamp: "20150909T182048Z",
        },
      },
      expected: {
        result: {
          descr: "This is a counterproposal to an already rescheduled event.",
          type: "OUTDATED",
        },
        differences: { location: { proposed: "Room 2", original: "Room 1" } },
      },
    },
    {
      name: "Proposed change for an later sequence of the event",
      input: {
        proposed: {
          method: "COUNTER",
          attendee: {
            params: { cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          location: "Room 2",
          sequence: "2",
          dtstamp: "20150909T182048Z",
        },
      },
      expected: {
        result: {
          descr: "Invalid sequence number in counterproposal.",
          type: "ERROR",
        },
        differences: {},
      },
    },
    {
      name: "Proposal to a different event",
      input: {
        proposed: {
          method: "COUNTER",
          uid: "cb189fdc-0000-0000-0000-31a08802249d",
          attendee: {
            params: { cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          location: "Room 2",
          dtstamp: "20150909T182048Z",
        },
      },
      expected: {
        result: {
          descr: "Mismatch of uid or organizer in counterproposal.",
          type: "ERROR",
        },
        differences: {},
      },
    },
    {
      name: "Proposal with a different organizer",
      input: {
        proposed: {
          method: "COUNTER",
          organizer: {
            params: { rsvp: "TRUE", cn: "Organizer", partstat: "ACCEPTED", role: "CHAIR" },
            value: "organizer2@example.net",
          },
          attendee: {
            params: { cn: "Attendee", partstat: "NEEDS-ACTION", role: "REQ-PARTICIPANT" },
            value: "attendee@example.net",
          },
          dtstamp: "20150909T182048Z",
        },
      },
      expected: {
        result: {
          descr: "Mismatch of uid or organizer in counterproposal.",
          type: "ERROR",
        },
        differences: {},
      },
    },
    {
      name: "Counterproposal without any difference",
      input: {
        proposed: { method: "COUNTER" },
      },
      expected: {
        result: {
          descr: "No difference in counterproposal detected.",
          type: "NODIFF",
        },
        differences: {},
      },
    },
  ];
  /* eslint-enable object-curly-newline */

  const getItem = function (aProperties) {
    const item = getIcs(aProperties);
    return createEventFromIcalString(item);
  };

  const formatDt = function (aDateTime) {
    if (!aDateTime) {
      return null;
    }
    const datetime = cal.dtz.formatter.formatDateTime(aDateTime);
    return datetime + " " + aDateTime.timezone.displayName;
  };

  for (const test of data) {
    info(`testing ${test.name}`);
    const existingItem = getItem();
    const proposedItem = getItem(test.input.proposed);
    const parsed = cal.invitation.parseCounter(proposedItem, existingItem);

    equal(parsed.result.type, test.expected.result.type, `(test ${test.name}: result.type)`);
    equal(parsed.result.descr, test.expected.result.descr, `(test ${test.name}: result.descr)`);
    const parsedProps = [];
    const additionalProps = [];
    const missingProps = [];
    parsed.differences.forEach(aDiff => {
      const prop = aDiff.property.toLowerCase();
      if (prop in test.expected.differences) {
        const { proposed, original } = test.expected.differences[prop];
        let foundProposed = aDiff.proposed;
        let foundOriginal = aDiff.original;
        if (["dtstart", "dtend"].includes(prop)) {
          foundProposed = formatDt(foundProposed);
          foundOriginal = formatDt(foundOriginal);
          ok(foundProposed, `(test ${test.name}: have proposed time value for ${prop})`);
          ok(foundOriginal, `(test ${test.name}: have original time value for ${prop})`);
        }

        if (proposed instanceof RegExp) {
          ok(
            proposed.test(foundProposed),
            `(test ${test.name}: proposed "${foundProposed}" for ${prop} matches expected regex)`
          );
        } else {
          equal(
            foundProposed,
            proposed,
            `(test ${test.name}: proposed for ${prop} matches expected)`
          );
        }

        if (original instanceof RegExp) {
          ok(
            original.test(foundOriginal),
            `(test ${test.name}: original "${foundOriginal}" for ${prop} matches expected regex)`
          );
        } else {
          equal(
            foundOriginal,
            original,
            `(test ${test.name}: original for ${prop} matches expected)`
          );
        }

        parsedProps.push(prop);
      } else {
        additionalProps.push(prop);
      }
    });
    for (const prop in test.expected.differences) {
      if (!parsedProps.includes(prop)) {
        missingProps.push(prop);
      }
    }
    Assert.equal(
      additionalProps.length,
      0,
      `(test ${test.name}: should be no additional properties: ${additionalProps})`
    );
    Assert.equal(
      missingProps.length,
      0,
      `(test ${test.name}: should be no missing properties: ${missingProps})`
    );
  }
});
