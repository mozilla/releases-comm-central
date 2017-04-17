/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Preferences.jsm");

function run_test() {
    do_calendar_startup(run_next_test);
}

// this test assumes the timezone of your system is not set to Pacific/Fakaofo or equivalent

add_task(function* formatDate_test() {
    let data = [{
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Fakaofo",
            dateformat: 0 // long
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Fakaofo",
            dateformat: 1 // short
        },
        expected: "04/01/2017"
    }];

    let dateformat = Preferences.get("calendar.date.format", 0);
    let tzlocal = Preferences.get("calendar.timezone.local", "Pacific/Fakaofo");
    Preferences.set("calendar.timezone.local", "Pacific/Fakaofo");


    let tzs = cal.getTimezoneService();

    let i = 0;
    for (let test of data) {
        i++;
        Preferences.set("calendar.date.format", test.input.dateformat);
        let tz = (test.input.timezone == 'floating') ? cal.floating() : tzs.getTimezone(test.input.timezone);
        let date = cal.createDateTime(test.input.datetime).getInTimezone(tz);

        let dtFormatter = Components.classes["@mozilla.org/calendar/datetime-formatter;1"]
                                    .getService(Components.interfaces.calIDateTimeFormatter);

        equal(dtFormatter.formatDate(date), test.expected, "(test #" + i + ")");
    }
    // let's reset the preferences
    Preferences.set("calendar.timezone.local", tzlocal);
    Preferences.set("calendar.date.format", dateformat);
});

add_task(function* formatDateShort_test() {
    let data = [{
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Fakaofo"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Kiritimati"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "UTC"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "floating"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Fakaofo"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Kiritimati"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "UTC"
        },
        expected: "04/01/2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "floating"
        },
        expected: "04/01/2017"
    }];

    let dateformat = Preferences.get("calendar.date.format", 0);
    let tzlocal = Preferences.get("calendar.timezone.local", "Pacific/Fakaofo");
    Preferences.set("calendar.timezone.local", "Pacific/Fakaofo");
    // we make sure to have set long format
    Preferences.set("calendar.date.format", 0);

    let tzs = cal.getTimezoneService();

    let i = 0;
    for (let test of data) {
        i++;

        let tz = (test.input.timezone == 'floating') ? cal.floating() : tzs.getTimezone(test.input.timezone);
        let date = cal.createDateTime(test.input.datetime).getInTimezone(tz);

        let dtFormatter = Components.classes["@mozilla.org/calendar/datetime-formatter;1"]
                                    .getService(Components.interfaces.calIDateTimeFormatter);

        equal(dtFormatter.formatDateShort(date), test.expected, "(test #" + i + ")");
    }
    // let's reset the preferences
    Preferences.set("calendar.timezone.local", tzlocal);
    Preferences.set("calendar.date.format", dateformat);
});

add_task(function* formatDateLong_test() {
    let data = [{
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Fakaofo"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Kiritimati"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "UTC"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "floating"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Fakaofo"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Kiritimati"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "UTC"
        },
        expected: "Saturday, April 01, 2017"
    }, {
        input: {
            datetime: "20170401",
            timezone: "floating"
        },
        expected: "Saturday, April 01, 2017"
    }];

    let dateformat = Preferences.get("calendar.date.format", 0);
    let tzlocal = Preferences.get("calendar.timezone.local", "Pacific/Fakaofo");
    Preferences.set("calendar.timezone.local", "Pacific/Fakaofo");
    // we make sure to have set short format
    Preferences.set("calendar.date.format", 1);

    let tzs = cal.getTimezoneService();

    let i = 0;
    for (let test of data) {
        i++;

        let tz = (test.input.timezone == 'floating') ? cal.floating() : tzs.getTimezone(test.input.timezone);
        let date = cal.createDateTime(test.input.datetime).getInTimezone(tz);

        let dtFormatter = Components.classes["@mozilla.org/calendar/datetime-formatter;1"]
                                    .getService(Components.interfaces.calIDateTimeFormatter);

        equal(dtFormatter.formatDateLong(date), test.expected, "(test #" + i + ")");
    }
    // let's reset the preferences
    Preferences.set("calendar.timezone.local", tzlocal);
    Preferences.set("calendar.date.format", dateformat);
});

add_task(function* formatDateWithoutYear_test() {
    let data = [{
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Fakaofo"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "Pacific/Kiritimati"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "UTC"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "floating"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Fakaofo"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Kiritimati"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401",
            timezone: "UTC"
        },
        expected: "Apr 1"
    }, {
        input: {
            datetime: "20170401",
            timezone: "floating"
        },
        expected: "Apr 1"
    }];

    let dateformat = Preferences.get("calendar.date.format", 0);
    let tzlocal = Preferences.get("calendar.timezone.local", "Pacific/Fakaofo");
    Preferences.set("calendar.timezone.local", "Pacific/Fakaofo");
    // we make sure to have set short format
    Preferences.set("calendar.date.format", 1);

    let tzs = cal.getTimezoneService();

    let i = 0;
    for (let test of data) {
        i++;

        let tz = (test.input.timezone == 'floating') ? cal.floating() : tzs.getTimezone(test.input.timezone);
        let date = cal.createDateTime(test.input.datetime).getInTimezone(tz);

        let dtFormatter = Components.classes["@mozilla.org/calendar/datetime-formatter;1"]
                                    .getService(Components.interfaces.calIDateTimeFormatter);

        equal(dtFormatter.formatDateWithoutYear(date), test.expected, "(test #" + i + ")");
    }
    // let's reset the preferences
    Preferences.set("calendar.timezone.local", tzlocal);
    Preferences.set("calendar.date.format", dateformat);
});

add_task(function* formatTime_test() {
    let data = [{
        input: {
            datetime: "20170401T090000",
            timezone: "Pacific/Fakaofo"
        },
        expected: "9:00 AM"
    }, {
        input: {
            datetime: "20170401T090000",
            timezone: "Pacific/Kiritimati"
        },
        expected: "9:00 AM"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "UTC"
        },
        expected: "6:00 PM"
    }, {
        input: {
            datetime: "20170401T180000",
            timezone: "floating"
        },
        expected: "6:00 PM"
    }, {
        input: {
            datetime: "20170401",
            timezone: "Pacific/Fakaofo"
        },
        expected: "All Day"
    }];

    let tzlocal = Preferences.get("calendar.timezone.local", "Pacific/Fakaofo");
    Preferences.set("calendar.timezone.local", "Pacific/Fakaofo");

    let tzs = cal.getTimezoneService();

    let i = 0;
    for (let test of data) {
        i++;

        let tz = (test.input.timezone == 'floating') ? cal.floating() : tzs.getTimezone(test.input.timezone);
        let date = cal.createDateTime(test.input.datetime).getInTimezone(tz);

        let dtFormatter = Components.classes["@mozilla.org/calendar/datetime-formatter;1"]
                                    .getService(Components.interfaces.calIDateTimeFormatter);

        equal(dtFormatter.formatTime(date), test.expected, "(test #" + i + ")");
    }
    // let's reset the preferences
    Preferences.set("calendar.timezone.local", tzlocal);
});
