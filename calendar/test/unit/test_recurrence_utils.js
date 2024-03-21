/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { countOccurrences } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
);

function run_test() {
  do_calendar_startup(run_next_test);
}

// tests for calRecurrenceUtils.sys.mjs
/* Incomplete - still missing test coverage for:
 * recurrenceRule2String
 * splitRecurrenceRules
 * checkRecurrenceRule
 */

function getIcs(aProperties) {
  let calendar = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN",
    "VERSION:2.0",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  calendar = calendar.concat(aProperties);
  calendar = calendar.concat(["END:VCALENDAR"]);

  return calendar.join("\r\n");
}

add_task(async function countOccurrences_test() {
  const data = [
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98000",
        "SUMMARY:Occurring 3 times until a date",
        "RRULE:FREQ=DAILY;UNTIL=20180922T100000Z",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 3,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98001",
        "SUMMARY:Occurring 3 times until a date with one exception in the middle",
        "RRULE:FREQ=DAILY;UNTIL=20180922T100000Z",
        "EXDATE;TZID=Europe/Berlin:20180921T120000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 2,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98002",
        "SUMMARY:Occurring 3 times until a date with one exception at the end",
        "RRULE:FREQ=DAILY;UNTIL=20180922T100000Z",
        "EXDATE;TZID=Europe/Berlin:20180922T120000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 2,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98003",
        "SUMMARY:Occurring 3 times until a date with one exception at the beginning",
        "RRULE:FREQ=DAILY;UNTIL=20180922T100000Z",
        "EXDATE;TZID=Europe/Berlin:20180920T120000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 2,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98004",
        "SUMMARY:Occurring 3 times until a date with the middle occurrence moved after the end",
        "RRULE:FREQ=DAILY;UNTIL=20180922T100000Z",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98004",
        "SUMMARY:The moved occurrence",
        "RECURRENCE-ID:20180921T100000Z",
        "DTSTART;TZID=Europe/Berlin:20180924T120000",
        "DTEND;TZID=Europe/Berlin:20180924T130000",
        "END:VEVENT",
      ],
      expected: 3,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98005",
        "SUMMARY:Occurring 3 times until a date with the middle occurrence moved before the beginning",
        "RRULE:FREQ=DAILY;UNTIL=20180922T100000Z",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98005",
        "SUMMARY:The moved occurrence",
        "RECURRENCE-ID:20180921T100000Z",
        "DTSTART;TZID=Europe/Berlin:20180918T120000",
        "DTEND;TZID=Europe/Berlin:20180918T130000",
        "END:VEVENT",
      ],
      expected: 3,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98006",
        "SUMMARY:Occurring 1 times until a date",
        "RRULE:FREQ=DAILY;UNTIL=20180920T100000Z",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 1,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98007",
        "SUMMARY:Occurring 1 times until a date with occernce removed",
        "RRULE:FREQ=DAILY;UNTIL=20180920T100000Z",
        "EXDATE;TZID=Europe/Berlin:20180920T120000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 0,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98008",
        "SUMMARY:Occurring for 3 times",
        "RRULE:FREQ=DAILY;COUNT=3",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 3,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98009",
        "SUMMARY:Occurring for 3 times with an exception in the middle",
        "EXDATE;TZID=Europe/Berlin:20180921T120000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 2,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98010",
        "SUMMARY:Occurring for 3 times with an exception at the end",
        "EXDATE;TZID=Europe/Berlin:20180922T120000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 2,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98011",
        "SUMMARY:Occurring for 3 times with an exception at the beginning",
        "EXDATE;TZID=Europe/Berlin:20180920T120000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 2,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98012",
        "SUMMARY:Occurring for 1 time",
        "RRULE:FREQ=DAILY;COUNT=1",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 1,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98013",
        "SUMMARY:Occurring for 0 times",
        "RRULE:FREQ=DAILY;COUNT=1",
        "EXDATE;TZID=Europe/Berlin:20180920T120000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 0,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98014",
        "SUMMARY:Occurring infinitely",
        "RRULE:FREQ=DAILY",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: null,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98015",
        "SUMMARY:Non-occurring item",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: null,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98016",
        "SUMMARY:Occurring for 3 time and 1 rdate",
        "RRULE:FREQ=DAILY;COUNT=3",
        "RDATE;TZID=Europe/Berlin:20180923T100000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 4,
    },
    {
      input: [
        "BEGIN:VEVENT",
        "CREATED:20180912T090539Z",
        "LAST-MODIFIED:20180912T090539Z",
        "DTSTAMP:20180912T090539Z",
        "UID:5b47fa17-f2fe-4d96-8cc2-19ce5be98017",
        "SUMMARY:Occurring for 3 rdates",
        "RDATE;TZID=Europe/Berlin:20180920T120000",
        "RDATE;TZID=Europe/Berlin:20180921T100000",
        "RDATE;TZID=Europe/Berlin:20180922T140000",
        "DTSTART;TZID=Europe/Berlin:20180920T120000",
        "DTEND;TZID=Europe/Berlin:20180920T130000",
        "END:VEVENT",
      ],
      expected: 3,
    },
  ];

  let i = 0;
  for (const test of data) {
    i++;

    const ics = getIcs(test.input);
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseString(ics);
    const items = parser.getItems();

    Assert.greater(items.length, 0, "parsing input succeeded (test #" + i + ")");
    for (const item of items) {
      equal(
        countOccurrences(item),
        test.expected,
        "expected number of occurrences (test #" + i + " - '" + item.title + "')"
      );
    }
  }
});
