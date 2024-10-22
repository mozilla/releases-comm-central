/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests calendar internationalisation for English (New Zealand).
 * The week starts on Monday, and Saturday and Sunday are the days off.
 * DST applies at the start and end of the year, not the middle.
 *
 * Note that intl.regional_prefs.use_os_locales is not set, as tests are run
 * on an en-US build and the preferences is ignored (effectively true) where
 * the build language is the same as the OS language.
 */

const longDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const narrowDays = ["M", "T", "W", "T", "F", "S", "S"];
const daysOff = [false, false, false, false, false, true, true];

add_setup(function () {
  Assert.equal(
    Services.prefs.getIntPref("calendar.week.start"),
    1,
    "the week should start on Monday"
  );
  Assert.ok(Services.prefs.getBoolPref("calendar.week.d0sundaysoff"), "Sunday should be a day off");
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.week.d1mondaysoff"),
    "Monday should not be a day off"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.week.d2tuesdaysoff"),
    "Tuesday should not be a day off"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.week.d3wednesdaysoff"),
    "Wednesday should not be a day off"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.week.d4thursdaysoff"),
    "Thursday should not be a day off"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.week.d5fridaysoff"),
    "Friday should not be a day off"
  );
  Assert.ok(
    Services.prefs.getBoolPref("calendar.week.d6saturdaysoff"),
    "Saturday should be a day off"
  );
  Assert.equal(
    cal.dtz.defaultTimezone,
    "Pacific/Auckland",
    "the timezone should be set from the OS"
  );

  const january = cal.createDateTime("20240101T120000").getInTimezone(cal.dtz.defaultTimezone);
  Assert.equal(january.timezoneOffset, 13 * 3600, "the UTC offset should be +13 hours in January");
  const july = cal.createDateTime("20240701T120000").getInTimezone(cal.dtz.defaultTimezone);
  Assert.equal(july.timezoneOffset, 12 * 3600, "the UTC offset should be +12 hours in July");
});

add_task(async function testWeekView() {
  await subtestWeekView(longDays, shortDays, daysOff);
});

add_task(async function testMultiweekView() {
  await subtestMultiweekView(longDays, shortDays, daysOff);
});

add_task(async function testMonthView() {
  await subtestMonthView(longDays, shortDays, daysOff);
});

add_task(function testMinimonth() {
  subtestMinimonth(narrowDays);
});

add_task(async function testIntervalDescription() {
  await subtestIntervalDescription(
    "Saturday, 19 October 2024",
    "14–20 October 2024",
    "14 October – 10 November 2024",
    "October 2024"
  );
});
