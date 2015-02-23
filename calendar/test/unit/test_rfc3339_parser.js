/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calProviderUtils.jsm");

function run_test() {
    do_test_pending();
    cal.getTimezoneService().startup({
        onResult: function() {
            really_run_test();
            do_test_finished();
        }
    });
}

function really_run_test() {
    // Check if the RFC 3339 date and timezone are properly parsed to the
    // expected result and if the result is properly mapped back into the RFC
    // 3339 date.
    function testRfc3339(aRfc3339Date, aTimezone, aExpectedDateTime,
                          aExpectedRfc3339Date=aRfc3339Date) {
        // Test creating a dateTime object from an RFC 3339 string.
        let dateTime = cal.fromRFC3339(aRfc3339Date, aTimezone);

        // Check that each property is as expected.
        let expectedDateProps = {
            year: aExpectedDateTime[0],
            month: aExpectedDateTime[1] - 1, // 0 based month.
            day: aExpectedDateTime[2],
            hour: aExpectedDateTime[3],
            minute: aExpectedDateTime[4],
            second: aExpectedDateTime[5],
            timezone: aExpectedDateTime[6],
            isDate: aExpectedDateTime[7]
        };
        for (let prop in expectedDateProps) {
            do_print("Checking prop: " + prop);
            // Object comparison fails with ical.js, and we only want to check
            // that we have the right timezone.
            if (prop == "timezone")
                equal(dateTime[prop].tzid, expectedDateProps[prop].tzid)
            else
                equal(dateTime[prop], expectedDateProps[prop]);
        }

        // Test round tripping that dateTime object back to an RFC 3339 string.
        let rfc3339Date = cal.toRFC3339(dateTime);

        // In theory this should just match the input RFC 3339 date, but there are
        // multiple ways of generating the same time, e.g. 2006-03-14Z is
        // equivalent to 2006-03-14.
        equal(rfc3339Date, aExpectedRfc3339Date);
    }

    /*
     * Some notes about the differences between calIDateTime and the RFC 3339
     * specification:
     * 1. calIDateTime does not support fractions of a second, they are
     *    stripped.
     * 2. If a timezone cannot be matched to the given time offset, the
     *    date/time is returned as a UTC date/time.
     * 3. The first timezone (alphabetically) that has the same offset is
     *    chosen.
     * 4. Leap seconds are not supported by calIDateTime, it resets to
     *    [0-23]:[0-59]:[0-59].
     *
     * All tests are done under the default timezone and UTC (although both
     * should give the same time).
     */

    // An arbitrary timezone (that has daylight savings time).
    let getTz = (aTz) => cal.getTimezoneService().getTimezone(aTz);
    let timezone = getTz("America/New_York");
    let utc = cal.UTC();
    // Timezones used in tests.
    belize = getTz("America/Belize");
    dawson = getTz("America/Dawson");

    /*
     * Basic tests
     */
    // This represents March 14, 2006 in the default timezone.
    testRfc3339("2006-03-14",
                timezone,
                [2006, 3, 14, 0, 0, 0, timezone, true]);
    testRfc3339("2006-03-14", utc, [2006, 3, 14, 0, 0, 0, utc, true]);
    // This represents March 14, 2006 in UTC.
    testRfc3339("2006-03-14Z",
                timezone,
                [2006, 3, 14, 0, 0, 0, utc, true],
                "2006-03-14");
    testRfc3339("2006-03-14Z",
                utc,
                [2006, 3, 14, 0, 0, 0, utc, true],
                "2006-03-14");

    // This represents 30 minutes and 53 seconds past the 13th hour of November
    // 14, 2050 in UTC.
    testRfc3339("2050-11-14t13:30:53z",
                timezone,
                [2050, 11, 14, 13, 30, 53, utc, false],
                "2050-11-14T13:30:53Z");
    testRfc3339("2050-11-14t13:30:53z",
                utc,
                [2050, 11, 14, 13, 30, 53, utc, false],
                "2050-11-14T13:30:53Z");

    // This represents 03:00:23 on October 14, 2004 in Central Standard Time.
    testRfc3339("2004-10-14T03:00:23-06:00",
                timezone,
                [2004, 10, 14, 3, 0, 23, belize, false]);
    testRfc3339("2004-10-14T03:00:23-06:00",
                utc,
                [2004, 10, 14, 3, 0, 23, belize, false]);

    /*
     * The following tests are the RFC 3339 examples
     * http://tools.ietf.org/html/rfc3339
     * Most of these would "fail" since iCalDateTime does not supported
     * all parts of the specification, the true proper response is next to each
     * test line as a comment.
     */

    // This represents 20 minutes and 50.52 seconds after the 23rd hour of
    // April 12th, 1985 in UTC.
    testRfc3339("1985-04-12T23:20:50.52Z",
                timezone,
                [1985, 4, 12, 23, 20, 50, utc, false],
                "1985-04-12T23:20:50Z"); // 1985/04/12 23:20:50.52 UTC isDate=0
    testRfc3339("1985-04-12T23:20:50.52Z",
                utc,
                [1985, 4, 12, 23, 20, 50, utc, false],
                "1985-04-12T23:20:50Z"); // 1985/04/12 23:20:50.52 UTC isDate=0

    // This represents 39 minutes and 57 seconds after the 16th hour of December
    // 19th, 1996 with an offset of -08:00 from UTC (Pacific Standard Time).
    // Note that this is equivalent to in UTC.
    testRfc3339("1996-12-19T16:39:57-08:00",
                timezone,
                [1996, 12, 19, 16, 39, 57, dawson, false]);
    testRfc3339("1996-12-19T16:39:57-08:00",
                utc,
                [1996, 12, 19, 16, 39, 57, dawson, false]);
    testRfc3339("1996-12-20T00:39:57Z",
                timezone,
                [1996, 12, 20, 0, 39, 57, utc, false]);
    testRfc3339("1996-12-20T00:39:57Z",
                utc,
                [1996, 12, 20, 0, 39, 57, utc, false]);

    // This represents the same instant of time as noon, January 1, 1937,
    // Netherlands time. Standard time in the Netherlands was exactly 19 minutes
    // and 32.13 seconds ahead of UTC by law from 1909-05-01 through 1937-06-30.
    // This time zone cannot be represented exactly using the HH:MM format, and
    // this timestamp uses the closest representable UTC offset.
    //
    // Since no current timezone exists at +00:20 it will default to giving the
    // time in UTC.
    testRfc3339("1937-01-01T12:00:27.87+00:20",
                timezone,
                [1937, 1, 1, 12, 20, 27, utc, false],
                "1937-01-01T12:20:27Z"); // 1937/01/01 12:20:27.87 UTC isDate=0
    testRfc3339("1937-01-01T12:00:27.87+00:20",
                utc,
                [1937, 1, 1, 12, 20, 27, utc, false],
                "1937-01-01T12:20:27Z"); // 1937/01/01 12:20:27.87 UTC isDate=0

    // This represents the leap second inserted at the end of 1990.
    testRfc3339("1990-12-31T23:59:60Z",
                timezone,
                [1991, 1, 1, 0, 0, 0, utc, false],
                "1991-01-01T00:00:00Z"); // 1990/12/31 23:59:60 UTC isDate=0
    testRfc3339("1990-12-31T23:59:60Z",
                utc,
                [1991, 1, 1, 0, 0, 0, utc, false],
                "1991-01-01T00:00:00Z"); // 1990/12/31 23:59:60 UTC isDate=0
    // This represents the same leap second in Pacific Standard Time, 8
    // hours behind UTC.
    testRfc3339("1990-12-31T15:59:60-08:00",
                timezone,
                [1990, 12, 31, 16, 0, 0, dawson, false],
                "1990-12-31T16:00:00-08:00"); // 1990/12/31 15:59:60 America/Dawson isDate=0
    testRfc3339("1990-12-31T15:59:60-08:00",
                utc,
                [1990, 12, 31, 16, 0, 0, dawson, false],
                "1990-12-31T16:00:00-08:00"); // 1990/12/31 15:59:60 America/Dawson isDate=0
}
