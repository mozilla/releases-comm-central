/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const FEBRUARY = 1;
const OCTOBER = 9;
const NOVEMBER = 10;

const UTC_MINUS_3 = -3 * 3600;
const UTC_MINUS_2 = -2 * 3600;

function run_test() {
    do_calendar_startup(run_next_test);
}


// This test requires timezone data going back to 2016. It's been kept here as an example.
/* add_test(function testCaracas() {
    let time = cal.createDateTime();
    let zone = cal.getTimezoneService().getTimezone("America/Caracas");

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
    let time = cal.createDateTime();
    let zone = cal.getTimezoneService().getTimezone("America/Sao_Paulo");

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
