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
    test_recentzones();
    test_formatcss();
    test_attendeeMatchesAddresses();
    test_getDefaultStartDate();
    test_getStartEndProps();
    test_calOperationGroup();
    test_sameDay();
    test_binarySearch();
}

function test_recentzones() {
    let oldDefaultTz = Preferences.get("calendar.timezone.local", "");
    Preferences.set("calendar.timezone.local", "floating");

    equal(cal.getRecentTimezones().length, 0);
    equal(cal.getRecentTimezones(true).length, 0);

    cal.saveRecentTimezone("Europe/Berlin");

    let zones = cal.getRecentTimezones();
    equal(zones.length, 1);
    equal(zones[0], "Europe/Berlin");
    zones = cal.getRecentTimezones(true);
    equal(zones.length, 1);
    equal(zones[0].tzid, "Europe/Berlin");

    cal.saveRecentTimezone(cal.calendarDefaultTimezone().tzid);
    equal(cal.getRecentTimezones().length, 1);
    equal(cal.getRecentTimezones(true).length, 1);

    cal.saveRecentTimezone("Europe/Berlin");
    equal(cal.getRecentTimezones().length, 1);
    equal(cal.getRecentTimezones(true).length, 1);

    cal.saveRecentTimezone("America/New_York");
    equal(cal.getRecentTimezones().length, 2);
    equal(cal.getRecentTimezones(true).length, 2);

    cal.saveRecentTimezone("Unknown");
    equal(cal.getRecentTimezones().length, 3);
    equal(cal.getRecentTimezones(true).length, 2);

    Preferences.set("calendar.timezone.local", oldDefaultTz);
}

function test_formatcss() {
    equal(cal.formatStringForCSSRule(" "), "_");
    equal(cal.formatStringForCSSRule("ü"), "-uxfc-");
    equal(cal.formatStringForCSSRule("a"), "a");
}

function test_attendeeMatchesAddresses() {
    let a = cal.createAttendee("ATTENDEE:mailto:horst");
    ok(cal.attendeeMatchesAddresses(a, ["HORST", "peter"]));
    ok(!cal.attendeeMatchesAddresses(a, ["HORSTpeter", "peter"]));
    ok(!cal.attendeeMatchesAddresses(a, ["peter"]));

    a = cal.createAttendee("ATTENDEE;EMAIL=\"horst\":urn:uuid:horst");
    ok(cal.attendeeMatchesAddresses(a, ["HORST", "peter"]));
    ok(!cal.attendeeMatchesAddresses(a, ["HORSTpeter", "peter"]));
    ok(!cal.attendeeMatchesAddresses(a, ["peter"]));
}

function test_getDefaultStartDate() {
    function tt(n, t) {
        now = cal.createDateTime(n);
        return cal.getDefaultStartDate(t ? cal.createDateTime(t) : null);
    }

    let oldNow = cal.now;
    let now = cal.createDateTime("20120101T000000");
    cal.now = function() {
        return now;
    };

    dump("TT: " + cal.createDateTime("20120101T000000") + "\n");
    dump("TT: " + cal.getDefaultStartDate(cal.createDateTime("20120101T000000")) + "\n");

    equal(tt("20120101T000000").icalString, "20120101T010000");
    equal(tt("20120101T015959").icalString, "20120101T020000");
    equal(tt("20120101T230000").icalString, "20120101T230000");
    equal(tt("20120101T235959").icalString, "20120101T230000");

    equal(tt("20120101T000000", "20120202").icalString, "20120202T010000");
    equal(tt("20120101T015959", "20120202").icalString, "20120202T020000");
    equal(tt("20120101T230000", "20120202").icalString, "20120202T230000");
    equal(tt("20120101T235959", "20120202").icalString, "20120202T230000");

    let event = cal.createEvent();
    now = cal.createDateTime("20120101T015959");
    cal.setDefaultStartEndHour(event, cal.createDateTime("20120202"));
    equal(event.startDate.icalString, "20120202T020000");
    equal(event.endDate.icalString, "20120202T030000");

    let todo = cal.createTodo();
    now = cal.createDateTime("20120101T000000");
    cal.setDefaultStartEndHour(todo, cal.createDateTime("20120202"));
    equal(todo.entryDate.icalString, "20120202T010000");

    cal.now = oldNow;
}

function test_getStartEndProps() {
    equal(cal.calGetStartDateProp(cal.createEvent()), "startDate");
    equal(cal.calGetEndDateProp(cal.createEvent()), "endDate");
    equal(cal.calGetStartDateProp(cal.createTodo()), "entryDate");
    equal(cal.calGetEndDateProp(cal.createTodo()), "dueDate");

    throws(() => cal.calGetStartDateProp(null),
           /2147500033/);
    throws(() => cal.calGetEndDateProp(null),
           /2147500033/);
}

function test_calOperationGroup() {
    let cancelCalled = false;
    function cancelFunc() { return cancelCalled = true; }

    let group = new cal.calOperationGroup(cancelFunc);

    ok(group.isEmpty);
    equal(group.id, cal.calOperationGroup.mOpGroupPrefix + "0");
    equal(group.status, Components.results.NS_OK);
    equal(group.isPending, true);

    let completedOp = {
        isPending: false
    };

    group.add(completedOp);
    ok(group.isEmpty);
    equal(group.isPending, true);

    let pendingOp1 = {
        id: 1,
        isPending: true,
        cancel: function() { return this.cancelCalled = true; }
    };

    group.add(pendingOp1);
    ok(!group.isEmpty);
    equal(group.isPending, true);

    let pendingOp2 = {
        id: 2,
        isPending: true,
        cancel: function() { return this.cancelCalled = true; }
    };

    group.add(pendingOp2);
    group.remove(pendingOp1);
    ok(!group.isEmpty);
    equal(group.isPending, true);

    group.cancel();

    equal(group.status, Components.interfaces.calIErrors.OPERATION_CANCELLED);
    ok(!group.isPending);
    ok(cancelCalled);
    ok(pendingOp2.cancelCalled);
}

function test_sameDay() {
    let dt = cal.createDateTime;

    ok(cal.sameDay(dt("20120101"), dt("20120101T120000")));
    ok(cal.sameDay(dt("20120101"), dt("20120101")));
    ok(!cal.sameDay(dt("20120101"), dt("20120102")));
    ok(!cal.sameDay(dt("20120101T120000"), dt("20120102T120000")));
}

function test_binarySearch() {
    let arr = [2, 5, 7, 9, 20, 27, 34, 39, 41, 53, 62];
    equal(binarySearch(arr, 27), 5); // Center
    equal(binarySearch(arr, 2), 0); // Left most
    equal(binarySearch(arr, 62), 11); // Right most

    equal(binarySearch([5], 5), 1) // One element found
    equal(binarySearch([1], 0), 0) // One element insert left
    equal(binarySearch([1], 2), 1) // One element insert right
}
