/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    test_freebusy();
    test_period();
}

function test_freebusy() {
    var icsService = Components.classes["@mozilla.org/calendar/ics-service;1"]
                               .getService(Components.interfaces.calIICSService);

    // Bug 415987 - FREEBUSY decoding does not support comma-separated entries
    // (https://bugzilla.mozilla.org/show_bug.cgi?id=415987)
    var fbVal1 = "20080206T160000Z/PT1H";
    var fbVal2 = "20080206T180000Z/PT1H";
    var fbVal3 = "20080206T220000Z/PT1H";
    var data =
        "BEGIN:VCALENDAR\n" +
        "BEGIN:VFREEBUSY\n" +
        "FREEBUSY;FBTYPE=BUSY:" + fbVal1 + "," + fbVal2 + "," + fbVal3 + "\n" +
        "END:VFREEBUSY\n" +
        "END:VCALENDAR\n";
    var fbComp = icsService.parseICS(data, null).getFirstSubcomponent("VFREEBUSY");
    equal(fbComp.getFirstProperty("FREEBUSY").value, fbVal1);
    equal(fbComp.getNextProperty("FREEBUSY").value, fbVal2);
    equal(fbComp.getNextProperty("FREEBUSY").value, fbVal3);
}

function test_period() {
    let period = Components.classes["@mozilla.org/calendar/period;1"]
                           .createInstance(Components.interfaces.calIPeriod);

    period.start = cal.createDateTime("20120101T010101");
    period.end = cal.createDateTime("20120101T010102");

    equal(period.icalString, "20120101T010101/20120101T010102");
    equal(period.duration.icalString, "PT1S");

    period.icalString = "20120101T010103/20120101T010104";

    equal(period.start.icalString, "20120101T010103");
    equal(period.end.icalString, "20120101T010104");
    equal(period.duration.icalString, "PT1S");

    period.icalString = "20120101T010105/PT1S";
    equal(period.start.icalString, "20120101T010105");
    equal(period.end.icalString, "20120101T010106");
    equal(period.duration.icalString, "PT1S");

    period.makeImmutable();
    if (!Preferences.get("calendar.icaljs", false)) {
        // ical.js doesn't support immutability yet
        throws(function() {
            period.start = cal.createDateTime("20120202T020202");
        }, /0x80460002/,"Object is Immutable");
        throws(function() {
            period.end = cal.createDateTime("20120202T020202");
        }, /0x80460002/,"Object is Immutable");
    }

    let copy = period.clone();
    equal(copy.start.icalString, "20120101T010105");
    equal(copy.end.icalString, "20120101T010106");
    equal(copy.duration.icalString, "PT1S");

    copy.start.icalString = "20120101T010106";
    copy.end = cal.createDateTime("20120101T010107");

    equal(period.start.icalString, "20120101T010105");
    equal(period.end.icalString, "20120101T010106");
    equal(period.duration.icalString, "PT1S");
}
