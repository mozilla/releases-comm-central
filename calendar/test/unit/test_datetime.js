/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
    function getMozTimezone(tzid) {
        return cal.getTimezoneService().getTimezone(tzid);
    }

    let cd = cal.createDateTime();
    cd.resetTo(2005, 10, 13,
               10, 0, 0,
               getMozTimezone("/mozilla.org/20050126_1/America/Bogota"));

    equal(cd.hour, 10);
    equal(cd.icalString, "20051113T100000");

    let cd_floating = cd.getInTimezone(cal.floating());
    equal(cd_floating.hour, 10);


    let cd_utc = cd.getInTimezone(cal.UTC());
    equal(cd_utc.hour, 15);
    equal(cd_utc.icalString, "20051113T150000Z");

    cd.hour = 25;
    equal(cd.hour, 1);
    equal(cd.day, 14);


    // Test nativeTime on dates
    // setting .isDate to be true on a date should not change its nativeTime
    // bug 315954,
    cd.hour = 0;
    let cd_allday = cd.clone();
    cd_allday.isDate = true;
    equal(cd.nativeTime, cd_allday.nativeTime);

    // Daylight savings test
    cd.resetTo(2006, 2, 26,
               1, 0, 0,
               getMozTimezone("/mozilla.org/20050126_1/Europe/Amsterdam"));

    equal(cd.weekday, 0);
    equal(cd.timezoneOffset, 1*3600);

    cd.day += 1;
    equal(cd.timezoneOffset, 2*3600);

    // Bug 398724 - Problems with floating all-day items
    let event = cal.createEvent("BEGIN:VEVENT\nUID:45674d53-229f-48c6-9f3b-f2b601e7ae4d\nSUMMARY:New Event\nDTSTART;VALUE=DATE:20071003\nDTEND;VALUE=DATE:20071004\nEND:VEVENT");
    ok(event.startDate.timezone.isFloating);
    ok(event.endDate.timezone.isFloating);

    // Bug 392853 - Same times, different timezones, but subtractDate says times are PT0S apart
    const zeroLength = cal.createDuration();
    const a = cal.jsDateToDateTime(new Date());
    a.timezone = getMozTimezone("/mozilla.org/20071231_1/Europe/Berlin");

    let b = a.clone();
    b.timezone = getMozTimezone("/mozilla.org/20071231_1/America/New_York");

    let duration = a.subtractDate(b);
    notEqual(duration.compare(zeroLength), 0);
    notEqual(a.compare(b), 0);

    // Should lead to zero length duration
    b = a.getInTimezone(getMozTimezone("/mozilla.org/20071231_1/America/New_York"));
    duration = a.subtractDate(b);
    equal(duration.compare(zeroLength), 0);
    equal(a.compare(b), 0);

    equal(b.timezone.displayName, "America/New York");
    equal(b.timezone.latitude, "+0404251");
    equal(b.timezone.longitude, "-0740023");

    // check aliases
    equal(getMozTimezone("/mozilla.org/xyz/Asia/Calcutta").tzid, "Asia/Kolkata");
    equal(getMozTimezone("Asia/Calcutta").tzid, "Asia/Kolkata");

    // A newly created date should be in UTC, as should its clone
    let utc = cal.createDateTime();
    equal(utc.timezone.tzid, "UTC");
    equal(utc.clone().timezone.tzid, "UTC");
    equal(utc.timezoneOffset, 0);

    // Bug 794477 - setting jsdate across compartments needs to work
    let someDate = new Date();
    let createdDate = cal.jsDateToDateTime(someDate).getInTimezone(cal.calendarDefaultTimezone());
    someDate.setMilliseconds(0);
    equal(someDate.getTime(), cal.dateTimeToJsDate(createdDate).getTime());

    // Comparing a date-time with a date of the same day should be 0
    equal(cal.createDateTime("20120101T120000").compare(cal.createDateTime("20120101")), 0);
    equal(cal.createDateTime("20120101").compare(cal.createDateTime("20120101T120000")), 0);
}

