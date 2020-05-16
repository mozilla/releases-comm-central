/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { formatter } = cal.dtz;

function run_test() {
  do_calendar_startup(run_next_test);
}

// This test assumes the timezone of your system is not set to Pacific/Fakaofo or equivalent.

// Time format is platform dependent, so we use alternative result sets here in 'expected'.
// The first two meet configurations running for automated tests,
// the first one is for Windows, the second one for Linux and Mac, unless otherwise noted.
// If you get a failure for this test, add your pattern here.

add_task(async function formatDate_test() {
  let data = [
    {
      input: {
        datetime: "20170401T180000",
        timezone: "Pacific/Fakaofo",
        dateformat: 0, // long
      },
      expected: ["Saturday, April 01, 2017", "Saturday, April 1, 2017"],
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

  let dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  let tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  let useOsLocale = Services.prefs.getBoolPref("intl.regional_prefs.use_os_locales", false);
  // make sure to use the app locale to avoid test failures when running
  // locally on an OS with a regional setting other than en-US
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", false);
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");

  let tzs = cal.getTimezoneService();

  let i = 0;
  for (let test of data) {
    i++;
    Services.prefs.setIntPref("calendar.date.format", test.input.dateformat);
    let zone =
      test.input.timezone == "floating" ? cal.dtz.floating : tzs.getTimezone(test.input.timezone);
    let date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    let formatted = formatter.formatDate(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", useOsLocale);
});

add_task(async function formatDateShort_test() {
  let data = [
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

  let dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  let tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  let useOsLocale = Services.prefs.getBoolPref("intl.regional_prefs.use_os_locales", false);
  // make sure to use the app locale to avoid test failures when running
  // locally on an OS with a regional setting other than en-US
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", false);
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set long format
  Services.prefs.setIntPref("calendar.date.format", 0);

  let tzs = cal.getTimezoneService();

  let i = 0;
  for (let test of data) {
    i++;

    let zone =
      test.input.timezone == "floating" ? cal.dtz.floating : tzs.getTimezone(test.input.timezone);
    let date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    let formatted = formatter.formatDateShort(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", useOsLocale);
});

add_task(async function formatDateLong_test() {
  let data = [
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

  let dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  let tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  let useOsLocale = Services.prefs.getBoolPref("intl.regional_prefs.use_os_locales", false);
  // make sure to use the app locale to avoid test failures when running
  // locally on an OS with a regional setting other than en-US
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", false);
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set short format
  Services.prefs.setIntPref("calendar.date.format", 1);

  let tzs = cal.getTimezoneService();

  let i = 0;
  for (let test of data) {
    i++;

    let zone =
      test.input.timezone == "floating" ? cal.dtz.floating : tzs.getTimezone(test.input.timezone);
    let date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    let formatted = formatter.formatDateLong(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", useOsLocale);
});

add_task(async function formatDateWithoutYear_test() {
  let data = [
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

  let dateformat = Services.prefs.getIntPref("calendar.date.format", 0);
  let tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  let useOsLocale = Services.prefs.getBoolPref("intl.regional_prefs.use_os_locales", false);
  // make sure to use the app locale to avoid test failures when running
  // locally on an OS with a regional setting other than en-US
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", false);
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  // we make sure to have set short format
  Services.prefs.setIntPref("calendar.date.format", 1);

  let tzs = cal.getTimezoneService();

  let i = 0;
  for (let test of data) {
    i++;

    let zone =
      test.input.timezone == "floating" ? cal.dtz.floating : tzs.getTimezone(test.input.timezone);
    let date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    equal(formatter.formatDateWithoutYear(date), test.expected, "(test #" + i + ")");
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setIntPref("calendar.date.format", dateformat);
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", useOsLocale);
});

add_task(async function formatTime_test() {
  let data = [
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

  let tzlocal = Services.prefs.getStringPref("calendar.timezone.local", "Pacific/Fakaofo");
  let useOsLocale = Services.prefs.getBoolPref("intl.regional_prefs.use_os_locales", false);
  // make sure to use the app locale to avoid test failures when running
  // locally on an OS with a regional setting other than en-US
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", false);
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Fakaofo");

  let tzs = cal.getTimezoneService();

  let i = 0;
  for (let test of data) {
    i++;

    let zone =
      test.input.timezone == "floating" ? cal.dtz.floating : tzs.getTimezone(test.input.timezone);
    let date = cal.createDateTime(test.input.datetime).getInTimezone(zone);

    let formatted = formatter.formatTime(date);
    ok(
      test.expected.includes(formatted),
      "(test #" + i + ": result '" + formatted + "', expected '" + test.expected + "')"
    );
  }
  // let's reset the preferences
  Services.prefs.setStringPref("calendar.timezone.local", tzlocal);
  Services.prefs.setBoolPref("intl.regional_prefs.use_os_locales", useOsLocale);
});
