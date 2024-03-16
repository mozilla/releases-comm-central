/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the minimonth widget in a range of time zones. It will fail if the
 * widget loses time zone awareness.
 */

/* eslint-disable no-restricted-syntax */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

add_setup(async function () {
  await CalendarTestUtils.openCalendarTab(window);
});

registerCleanupFunction(async function () {
  await CalendarTestUtils.closeCalendarTab(window);
  Services.prefs.setStringPref("calendar.timezone.local", "UTC");
});

async function subtest() {
  const zone = cal.dtz.defaultTimezone;
  info(`Running test in ${zone.tzid}`);

  // Set the minimonth to display August 2016.
  const minimonth = document.getElementById("calMinimonth");
  minimonth.showMonth(new Date(2016, 7, 15));

  Assert.deepEqual(
    [...minimonth.dayBoxes.keys()],
    [
      "2016-07-31",
      "2016-08-01",
      "2016-08-02",
      "2016-08-03",
      "2016-08-04",
      "2016-08-05",
      "2016-08-06",
      "2016-08-07",
      "2016-08-08",
      "2016-08-09",
      "2016-08-10",
      "2016-08-11",
      "2016-08-12",
      "2016-08-13",
      "2016-08-14",
      "2016-08-15",
      "2016-08-16",
      "2016-08-17",
      "2016-08-18",
      "2016-08-19",
      "2016-08-20",
      "2016-08-21",
      "2016-08-22",
      "2016-08-23",
      "2016-08-24",
      "2016-08-25",
      "2016-08-26",
      "2016-08-27",
      "2016-08-28",
      "2016-08-29",
      "2016-08-30",
      "2016-08-31",
      "2016-09-01",
      "2016-09-02",
      "2016-09-03",
      "2016-09-04",
      "2016-09-05",
      "2016-09-06",
      "2016-09-07",
      "2016-09-08",
      "2016-09-09",
      "2016-09-10",
    ],
    "day boxes are stored with the correct keys"
  );

  function check(date, row, column) {
    if (date instanceof Date) {
      info(date);
    } else {
      info(`${date} ${date.timezone.tzid}`);
    }
    if (row && column) {
      Assert.equal(minimonth.getBoxForDate(date), minimonth.mCalBox.rows[row].cells[column]);
    } else {
      Assert.equal(minimonth.getBoxForDate(date), null);
    }
  }

  const dateWithZone = cal.createDateTime();

  // Dates without timezones or the local timezone.

  // All of these represent the 1st of August.
  check(new Date(2016, 7, 1), 1, 2);
  check(new Date(2016, 7, 1, 9, 0, 0), 1, 2);
  check(new Date(2016, 7, 1, 22, 0, 0), 1, 2);

  check(cal.createDateTime("20160801"), 1, 2);
  check(cal.createDateTime("20160801T030000"), 1, 2);
  check(cal.createDateTime("20160801T210000"), 1, 2);

  dateWithZone.resetTo(2016, 7, 1, 3, 0, 0, zone);
  check(dateWithZone, 1, 2);
  dateWithZone.resetTo(2016, 7, 1, 21, 0, 0, zone);
  check(dateWithZone, 1, 2);

  // All of these represent the 31st of August.
  check(new Date(2016, 7, 31), 5, 4);
  check(new Date(2016, 7, 31, 9, 0, 0), 5, 4);
  check(new Date(2016, 7, 31, 22, 0, 0), 5, 4);

  check(cal.createDateTime("20160831"), 5, 4);
  check(cal.createDateTime("20160831T030000"), 5, 4);
  check(cal.createDateTime("20160831T210000"), 5, 4);

  dateWithZone.resetTo(2016, 7, 31, 3, 0, 0, zone);
  check(dateWithZone, 5, 4);
  dateWithZone.resetTo(2016, 7, 31, 21, 0, 0, zone);
  check(dateWithZone, 5, 4);

  // August a year earlier shouldn't be displayed.
  check(new Date(2015, 7, 15));
  check(cal.createDateTime("20150815"));
  dateWithZone.resetTo(2015, 7, 15, 0, 0, 0, zone);
  check(dateWithZone);

  // The Saturday of the previous week shouldn't be displayed.
  check(new Date(2016, 6, 30));
  check(cal.createDateTime("20160730"));
  dateWithZone.resetTo(2016, 6, 30, 0, 0, 0, zone);
  check(dateWithZone);

  // The Sunday of the next week shouldn't be displayed.
  check(new Date(2016, 8, 11));
  check(cal.createDateTime("20160911"));
  dateWithZone.resetTo(2016, 8, 11, 0, 0, 0, zone);
  check(dateWithZone);

  // August a year later shouldn't be displayed.
  check(new Date(2017, 7, 15));
  check(cal.createDateTime("20170815"));
  dateWithZone.resetTo(2017, 7, 15, 0, 0, 0, zone);
  check(dateWithZone);

  // UTC dates.

  check(cal.createDateTime("20160801T030000Z"), 1, zone.tzid == "America/Vancouver" ? 1 : 2);
  check(cal.createDateTime("20160801T210000Z"), 1, zone.tzid == "Pacific/Auckland" ? 3 : 2);

  check(cal.createDateTime("20160831T030000Z"), 5, zone.tzid == "America/Vancouver" ? 3 : 4);
  check(cal.createDateTime("20160831T210000Z"), 5, zone.tzid == "Pacific/Auckland" ? 5 : 4);

  // Dates in different zones.

  const auckland = cal.timezoneService.getTimezone("Pacific/Auckland");
  const vancouver = cal.timezoneService.getTimezone("America/Vancouver");

  // Early in Auckland is the previous day everywhere else.
  dateWithZone.resetTo(2016, 7, 15, 3, 0, 0, auckland);
  check(dateWithZone, 3, zone.tzid == "Pacific/Auckland" ? 2 : 1);

  // Late in Auckland is the same day everywhere.
  dateWithZone.resetTo(2016, 7, 15, 21, 0, 0, auckland);
  check(dateWithZone, 3, 2);

  // Early in Vancouver is the same day everywhere.
  dateWithZone.resetTo(2016, 7, 15, 3, 0, 0, vancouver);
  check(dateWithZone, 3, 2);

  // Late in Vancouver is the next day everywhere else.
  dateWithZone.resetTo(2016, 7, 15, 21, 0, 0, vancouver);
  check(dateWithZone, 3, zone.tzid == "America/Vancouver" ? 2 : 3);

  // Reset the minimonth to a different month.
  minimonth.showMonth(new Date(2016, 9, 15));
}

/**
 * Run the test at UTC+12.
 */
add_task(async function auckland() {
  Services.prefs.setStringPref("calendar.timezone.local", "Pacific/Auckland");
  await subtest();
});

/**
 * Run the test at UTC+2.
 */
add_task(async function berlin() {
  Services.prefs.setStringPref("calendar.timezone.local", "Europe/Berlin");
  await subtest();
});

/**
 * Run the test at UTC.
 */
add_task(async function utc() {
  Services.prefs.setStringPref("calendar.timezone.local", "UTC");
  await subtest();
});

/**
 * Run the test at UTC-7.
 */
add_task(async function vancouver() {
  Services.prefs.setStringPref("calendar.timezone.local", "America/Vancouver");
  await subtest();
});
