/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests calendar internationalisation for Arabic (Qatar).
 * The week starts on Saturday, and Friday and Saturday are the days off.
 * No DST applies.
 */

const longDays = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const shortDays = longDays;
const narrowDays = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const daysOff = [true, false, false, false, false, false, true];

add_setup(function () {
  Assert.equal(
    Services.prefs.getIntPref("calendar.week.start"),
    6,
    "the week should start on Saturday"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.week.d0sundaysoff"),
    "Sunday should not be a day off"
  );
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
  Assert.ok(Services.prefs.getBoolPref("calendar.week.d5fridaysoff"), "Friday should be a day off");
  Assert.ok(
    Services.prefs.getBoolPref("calendar.week.d6saturdaysoff"),
    "Saturday should be a day off"
  );
  Assert.equal(cal.dtz.defaultTimezone, "Asia/Qatar", "the timezone should be set from the OS");

  const january = cal.createDateTime("20240101T120000").getInTimezone(cal.dtz.defaultTimezone);
  Assert.equal(january.timezoneOffset, 3 * 3600, "the UTC offset should be +3 hours in January");
  const july = cal.createDateTime("20240701T120000").getInTimezone(cal.dtz.defaultTimezone);
  Assert.equal(july.timezoneOffset, 3 * 3600, "the UTC offset should be +3 hours in July");
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
    "السبت، ١٩ أكتوبر ٢٠٢٤",
    "١٩–٢٥ أكتوبر ٢٠٢٤",
    "١٩ أكتوبر – ١٥ نوفمبر ٢٠٢٤",
    "أكتوبر ٢٠٢٤"
  );
});
