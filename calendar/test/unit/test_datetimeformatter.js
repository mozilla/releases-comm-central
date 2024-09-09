/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatter } = cal.dtz;

const { CalTimezone } = ChromeUtils.importESModule("resource:///modules/CalTimezone.sys.mjs");
const { default: ICAL } = ChromeUtils.importESModule("resource:///modules/calendar/Ical.sys.mjs");

function run_test() {
  do_calendar_startup(run_next_test);
}

// This test assumes the timezone of your system is not set to Pacific/Fakaofo or equivalent.

// Time format is platform dependent, so we use alternative result sets here in 'expected'.
// The first two meet configurations running for automated tests,
// the first one is for Windows, the second one for Linux and Mac, unless otherwise noted.
// If you get a failure for this test, add your pattern here.

add_task(async function formatDate_test() {
  const data = [
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
        dateformat: 0, // long
      },
      expected: ["Saturday, 1 April 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
        dateformat: 1, // short
      },
      expected: ["4/1/2017", "4/1/17"],
    },
  ];

  const dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  const tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");

  let i = 0;
  for (const test of data) {
    i++;
    Services.prefs.setIntPref("calendar.date.format", test.input.dateformat);
    const zone =
      test.input.timezone == "floating"
        ? cal.dtz.floating
        : cal.timezoneService.getTimezone(test.input.timezone);
    const date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    const formatted = formatter.formatDate(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
});

add_task(async function formatDateShort_test() {
  const data = [
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Kiritimati",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "UTC",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "floating",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Fakaofo",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Kiritimati",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "UTC",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "floating",
      },
      expected: ["4/1/2017", "4/1/17"],
    },
  ];

  const dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  const tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set long format
  Services.prefs.setIntPref("calendar.date.format", 0);

  let i = 0;
  for (const test of data) {
    i++;

    const zone =
      test.input.timezone == "floating"
        ? cal.dtz.floating
        : cal.timezoneService.getTimezone(test.input.timezone);
    const date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    const formatted = formatter.formatDateShort(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
});

add_task(async function formatDateLong_test() {
  const data = [
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Kiritimati",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "UTC",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "floating",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Fakaofo",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Kiritimati",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "UTC",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "floating",
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
    },
  ];

  const dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  const tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set short format
  Services.prefs.setIntPref("calendar.date.format", 1);

  let i = 0;
  for (const test of data) {
    i++;

    const zone =
      test.input.timezone == "floating"
        ? cal.dtz.floating
        : cal.timezoneService.getTimezone(test.input.timezone);
    const date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    const formatted = formatter.formatDateLong(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
});

add_task(async function formatDateWithoutYear_test() {
  const data = [
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Kiritimati",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "UTC",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "floating",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Fakaofo",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Kiritimati",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "UTC",
      },
      expected: "Apr 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "floating",
      },
      expected: "Apr 1",
    },
  ];

  const dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  const tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set short format
  Services.prefs.setIntPref("calendar.date.format", 1);

  let i = 0;
  for (const test of data) {
    i++;

    const zone =
      test.input.timezone == "floating"
        ? cal.dtz.floating
        : cal.timezoneService.getTimezone(test.input.timezone);
    const date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    equal(formatter.formatDateWithoutYear(date), test.expected, "(test #" + i + ")");
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
});

add_task(async function formatDateLongWithoutYear_test() {
  const data = [
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Kiritimati",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "UTC",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "floating",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Fakaofo",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Kiritimati",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "UTC",
      },
      expected: "Saturday, April 1",
    },
    {
      input: {
        datetime: "20170401",
        timezone: "floating",
      },
      expected: "Saturday, April 1",
    },
  ];

  const dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  const tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set short format
  Services.prefs.setIntPref("calendar.date.format", 1);

  let i = 0;
  for (const test of data) {
    i++;

    const zone =
      test.input.timezone == "floating"
        ? cal.dtz.floating
        : cal.timezoneService.getTimezone(test.input.timezone);
    const date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    equal(formatter.formatDateLongWithoutYear(date), test.expected, "(test #" + i + ")");
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
});

add_task(async function formatTime_test() {
  const data = [
    {
      input: {
        datetime: "20170401T090000",
        timezone: "Pacific/Fakaofo",
      },
      expected: ["9:00 AM", "09:00"], // Windows+Mac, Linux.
    },
    {
      input: {
        datetime: "20170401T090000",
        timezone: "Pacific/Kiritimati",
      },
      expected: ["9:00 AM", "09:00"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "UTC",
      },
      expected: ["6:00 PM", "18:00"],
    },
    {
      input: {
        datetime: "20170401T180000",
        timezone: "floating",
      },
      expected: ["6:00 PM", "18:00"],
    },
    {
      input: {
        datetime: "20170401",
        timezone: "Pacific/Fakaofo",
      },
      expected: "All Day",
    },
  ];

  const tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");

  let i = 0;
  for (const test of data) {
    i++;

    const zone =
      test.input.timezone == "floating"
        ? cal.dtz.floating
        : cal.timezoneService.getTimezone(test.input.timezone);
    const date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    const formatted = formatter.formatTime(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
});

add_task(function formatTime_test_with_arbitrary_timezone() {
  // Create a timezone with an arbitrary offset and a time zone ID we can be
  // reasonably sure Gecko won't recognize so we can be sure that we aren't
  // relying on the time zone ID to be valid.
  const tzdef =
    "BEGIN:VTIMEZONE\n" +
    "TZID:Nowhere/Middle\n" +
    "BEGIN:STANDARD\n" +
    "DTSTART:16010101T000000\n" +
    "TZOFFSETFROM:-0741\n" +
    "TZOFFSETTO:-0741\n" +
    "END:STANDARD\n" +
    "END:VTIMEZONE";

  const timezone = new CalTimezone(
    ICAL.Timezone.fromData({
      tzid: "Nowhere/Middle",
      component: tzdef,
    })
  );

  const expected = ["6:19 AM", "06:19"];

  const dateTime = cal.createDateTime("20220916T140000Z").getInTimezone(timezone);
  const formatted = formatter.formatTime(dateTime);

  ok(expected.includes(formatted), `expected '${expected}', actual result ${formatted}`);
});

add_task(async function formatInterval_test() {
  const data = [
    //1: task-without-dates
    {
      input: {},
      expected: "no start or due date",
    },
    //2: task-without-due-date
    {
      input: { start: "20220916T140000Z" },
      expected: [
        "start date Friday, September 16, 2022 2:00 PM",
        "start date Friday, September 16, 2022 14:00",
      ],
    },
    //3: task-without-start-date
    {
      input: { end: "20220916T140000Z" },
      expected: [
        "due date Friday, September 16, 2022 2:00 PM",
        "due date Friday, September 16, 2022 14:00",
      ],
    },
    //4: all-day
    {
      input: {
        start: "20220916",
        end: "20220916",
      },
      expected: "Friday, September 16, 2022",
    },
    //5: all-day-between-years
    {
      input: {
        start: "20220916",
        end: "20230916",
      },
      expected: [
        "September 16, 2022 – September 16, 2023",
        "Friday, September 16, 2022 – Saturday, September 16, 2023",
      ],
    },
    //6: all-day-in-month
    {
      input: {
        start: "20220916",
        end: "20220920",
      },
      expected: ["September 16 – 20, 2022", "Friday, September 16 – Tuesday, September 20, 2022"],
    },
    //7: all-day-between-months
    {
      input: {
        start: "20220916",
        end: "20221020",
      },
      expected: [
        "September 16 – October 20, 2022",
        "Friday, September 16 – Thursday, October 20, 2022",
      ],
    },
    //8: same-date-time
    {
      input: {
        start: "20220916T140000Z",
        end: "20220916T140000Z",
      },
      expected: [
        "Friday, September 16, 2022 at 2:00 PM",
        "Friday, September 16, 2022, 2:00 PM",
        "Friday, September 16, 2022 at 14:00",
      ],
    },
    //9: same-day
    {
      input: {
        start: "20220916T140000Z",
        end: "20220916T160000Z",
      },
      expected: [
        "Friday, September 16, 2022, 2:00 – 4:00 PM",
        "Friday, September 16, 2022, 14:00 – 16:00",
      ],
    },
    //10: several-days
    {
      input: {
        start: "20220916T140000Z",
        end: "20220920T160000Z",
      },
      expected: [
        "Friday, September 16, 2022 at 2:00 PM – Tuesday, September 20, 2022 at 4:00 PM",
        "Friday, September 16, 2022 at 14:00 – Tuesday, September 20, 2022 at 16:00",
      ],
    },
  ];

  let i = 0;
  for (const test of data) {
    i++;
    const startDate = test.input.start ? cal.createDateTime(test.input.start) : null;
    const endDate = test.input.end ? cal.createDateTime(test.input.end) : null;

    const formatted = formatter.formatInterval(startDate, endDate);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
});
