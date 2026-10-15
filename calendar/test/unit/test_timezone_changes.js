/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { default: ICAL } = ChromeUtils.importESModule("resource:///modules/calendar/Ical.sys.mjs");

const FEBRUARY = 1;
const OCTOBER = 9;
const NOVEMBER = 10;

const UTC_MINUS_3 = -3 * 3600;
const UTC_MINUS_2 = -2 * 3600;

add_setup(() => do_get_profile(true));

// This test requires timezone data going back to 2016. It's been kept here as an example.
/* add_test(function testCaracas() {
    let time = cal.createDateTime();
    let zone = cal.timezoneService.getTimezone("America/Caracas");

    for (let month = JANUARY; month <= DECEMBER; month++) {
        time.resetTo(2015, month, 1, 0, 0, 0, zone);
        equal(time.timezoneOffset, UTC_MINUS_430, time.toString());
    }

    for (let month = JANUARY; month <= APRIL; month++) {
        time.resetTo(2016, month, 1, 0, 0, 0, zone);
        equal(time.timezoneOffset, UTC_MINUS_430, time.toString());
    }

    time.resetTo(2016, MAY, 1, 1, 0, 0, zone);
    equal(time.timezoneOffset, UTC_MINUS_430, time.toString());

    time.resetTo(2016, MAY, 1, 3, 0, 0, zone);
    equal(time.timezoneOffset, UTC_MINUS_4, time.toString());

    for (let month = JUNE; month <= DECEMBER; month++) {
        time.resetTo(2016, month, 1, 0, 0, 0, zone);
        equal(time.timezoneOffset, UTC_MINUS_4, time.toString());
    }

    for (let month = JANUARY; month <= DECEMBER; month++) {
        time.resetTo(2017, month, 1, 0, 0, 0, zone);
        equal(time.timezoneOffset, UTC_MINUS_4, time.toString());
    }

    run_next_test();
}); */

// Brazil's rules are complicated. This tests every change in the time range we have data for.
// Updated for 2019b: Brazil no longer has DST.
add_test(function testSaoPaulo() {
  const time = cal.createDateTime();
  const zone = cal.timezoneService.getTimezone("America/Sao_Paulo");

  time.resetTo(2018, FEBRUARY, 17, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_2, time.toString());

  time.resetTo(2018, FEBRUARY, 18, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2018, NOVEMBER, 3, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2018, NOVEMBER, 4, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_2, time.toString());

  time.resetTo(2019, FEBRUARY, 16, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_2, time.toString());

  time.resetTo(2019, FEBRUARY, 17, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2019, NOVEMBER, 2, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2019, NOVEMBER, 3, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2020, FEBRUARY, 15, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2020, FEBRUARY, 16, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2020, OCTOBER, 31, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  time.resetTo(2020, NOVEMBER, 1, 0, 0, 0, zone);
  equal(time.timezoneOffset, UTC_MINUS_3, time.toString());

  run_next_test();
});

function makeTimezone(rrule) {
  return new ICAL.Timezone(
    ICAL.Component.fromString(
      [
        "BEGIN:VTIMEZONE",
        "TZID:Test",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        `RRULE:${rrule}`,
        "END:STANDARD",
        "END:VTIMEZONE",
      ].join("\r\n")
    )
  );
}

// Bug 2077830: timezone rules that change too often must not hang expansion.
add_test(function testSubDailyRule() {
  for (const rrule of [
    "FREQ=SECONDLY",
    "FREQ=MINUTELY",
    "FREQ=HOURLY;BYMINUTE=30",
    "FREQ=SECONDLY;BYMONTH=2;BYMONTHDAY=30",
  ]) {
    const zone = makeTimezone(rrule);
    const time = ICAL.Time.fromDateTimeString("2025-06-01T12:00:00");
    equal(zone.utcOffset(time), 2 * 3600, `${rrule} offset should be applied`);
    equal(zone.changes.length, 1, `${rrule} should only expand its DTSTART`);
    const { year, month, day, hour, minute, second } = zone.changes[0];
    deepEqual(
      [year, month, day, hour, minute, second],
      [1969, 12, 31, 23, 0, 0],
      `${rrule} change should be at DTSTART in UTC`
    );
  }
  run_next_test();
});

add_test(function testExplodingRule() {
  const range = n => Array.from({ length: n }, (_, i) => i).join(",");
  const zone = makeTimezone(
    `FREQ=YEARLY;BYHOUR=${range(24)};BYMINUTE=${range(60)};BYSECOND=${range(60)}`
  );
  const time = ICAL.Time.fromDateTimeString("2025-06-01T12:00:00");
  equal(zone.utcOffset(time), 2 * 3600, "offset should be applied");
  equal(zone.changes.length, ICAL.Timezone.MAX_CHANGES, "changes should be capped");
  run_next_test();
});
