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
    test_aclmanager();
    test_calendar();
    test_immutable();
    test_attendee();
    test_attachment();
    test_lastack();
    test_categories();
    test_alarm();
}

function test_aclmanager() {
    let mockCalendar = {
        get superCalendar() { return this; },
        get aclManager() { return this; },

        getItemEntry: function(item) {
            if (item.id == "withentry") {
                return itemEntry;
            }
            return null;
        },
    };

    let itemEntry = {
        userCanModify: true,
        userCanRespond: false,
        userCanViewAll: true,
        userCanViewDateAndTime: false,
    };

    let e = cal.createEvent();
    e.id = "withentry";
    e.calendar = mockCalendar;

    equal(e.aclEntry.userCanModify, itemEntry.userCanModify);
    equal(e.aclEntry.userCanRespond, itemEntry.userCanRespond);
    equal(e.aclEntry.userCanViewAll, itemEntry.userCanViewAll);
    equal(e.aclEntry.userCanViewDateAndTime, itemEntry.userCanViewDateAndTime);

    let pe = cal.createEvent();
    pe.id = "parententry";
    pe.calendar = mockCalendar;
    pe.parentItem = e;

    equal(pe.aclEntry.userCanModify, itemEntry.userCanModify);
    equal(pe.aclEntry.userCanRespond, itemEntry.userCanRespond);
    equal(pe.aclEntry.userCanViewAll, itemEntry.userCanViewAll);
    equal(pe.aclEntry.userCanViewDateAndTime, itemEntry.userCanViewDateAndTime);

    e = cal.createEvent();
    e.id = "noentry";
    e.calendar = mockCalendar;
    equal(e.aclEntry, null);

}

function test_calendar() {

    let e = cal.createEvent();
    let pe = cal.createEvent();

    let mockCalendar = {
        id: "one"
    };

    pe.calendar = mockCalendar;
    e.parentItem = pe;

    notEqual(e.calendar, null);
    equal(e.calendar.id, "one");
}

function test_attachment() {
    let e = cal.createEvent();

    let a = cal.createAttachment();
    a.rawData = "horst";

    let b = cal.createAttachment();
    b.rawData = "bruno";

    e.addAttachment(a);
    equal(e.getAttachments({}).length, 1);

    e.addAttachment(b);
    equal(e.getAttachments({}).length, 2);

    e.removeAttachment(a);
    equal(e.getAttachments({}).length, 1);

    e.removeAllAttachments();
    equal(e.getAttachments({}).length, 0);
}

function test_attendee() {

    let e = cal.createEvent();
    equal(e.getAttendeeById("unknown"), null);
    equal(e.getAttendees({}).length, 0);

    let a = cal.createAttendee();
    a.id = "mailto:horst";

    let b = cal.createAttendee();
    b.id = "mailto:bruno";

    e.addAttendee(a);
    equal(e.getAttendees({}).length, 1);
    equal(e.getAttendeeById("mailto:horst"), a);

    e.addAttendee(b);
    equal(e.getAttendees({}).length, 2);

    let comp = e.icalComponent;
    let aprop = comp.getFirstProperty("ATTENDEE");
    equal(aprop.value, "mailto:horst");
    aprop = comp.getNextProperty("ATTENDEE");
    equal(aprop.value, "mailto:bruno");
    equal(comp.getNextProperty("ATTENDEE"), null);

    e.removeAttendee(a);
    equal(e.getAttendees({}).length, 1);
    equal(e.getAttendeeById("mailto:horst"), null);

    e.removeAllAttendees();
    equal(e.getAttendees({}).length, 0);
}

function test_categories() {

    let e = cal.createEvent();

    equal(e.getCategories({}).length, 0);

    let cat = ["a", "b", "c"];
    e.setCategories(3, cat);

    cat[0] = "err";
    equal(e.getCategories({}).join(","), "a,b,c");

    let comp = e.icalComponent;
    let getter = comp.getFirstProperty.bind(comp);

    cat[0] = "a";
    while (cat.length) {
        equal(cat.shift(), getter("CATEGORIES").value);
        getter = comp.getNextProperty.bind(comp);
    }
}

function test_alarm() {
    let e = cal.createEvent();
    let alarm = cal.createAlarm();

    alarm.action = "DISPLAY";
    alarm.related = Components.interfaces.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();

    e.addAlarm(alarm);
    let ecomp = e.icalComponent;
    let vcomp = ecomp.getFirstSubcomponent("VALARM");
    equal(vcomp.serializeToICS(), alarm.icalString);

    let alarm2 = alarm.clone();

    e.addAlarm(alarm2);

    equal(e.getAlarms({}).length, 2);
    e.deleteAlarm(alarm);
    equal(e.getAlarms({}).length, 1);
    equal(e.getAlarms({})[0], alarm2);

    e.clearAlarms();
    equal(e.getAlarms({}).length, 0);
}

function test_immutable() {

    let e = cal.createEvent();

    let dt = cal.createDateTime();
    dt.timezone = cal.getTimezoneService().getTimezone("Europe/Berlin");
    e.alarmLastAck = dt;

    let org = cal.createAttendee();
    org.id = "one";
    e.organizer = org;

    let alarm = cal.createAlarm();
    alarm.action = "DISPLAY";
    alarm.description = "foo";
    alarm.related = alarm.ALARM_RELATED_START;
    alarm.offset = cal.createDuration("PT1S");
    e.addAlarm(alarm);

    e.setProperty("X-NAME", "X-VALUE");
    e.setPropertyParameter("X-NAME", "X-PARAM", "X-PARAMVAL");

    e.setCategories(3, ["a", "b", "c"]);

    equal(e.alarmLastAck.timezone.tzid, cal.UTC().tzid);

    e.makeImmutable();

    // call again, should not throw
    e.makeImmutable();

    ok(!e.alarmLastAck.isMutable);
    ok(!org.isMutable);
    ok(!alarm.isMutable);

    throws(function() {
        e.alarmLastAck = cal.createDateTime();
    }, /Can not modify immutable data container/);
    throws(function() {
        e.calendar = null;
    }, /Can not modify immutable data container/);
    throws(function() {
        e.parentItem = null;
    }, /Can not modify immutable data container/);
    throws(function() {
        e.setCategories(3, ["d", "e", "f"]);
    }, /Can not modify immutable data container/);

    let e2 = e.clone();
    e2.organizer.id = "two";

    equal(org.id, "one");
    equal(e2.organizer.id, "two");

    equal(e2.getProperty("X-NAME"), "X-VALUE");
    equal(e2.getPropertyParameter("X-NAME", "X-PARAM"), "X-PARAMVAL");

    e2.setPropertyParameter("X-NAME", "X-PARAM", null);
    equal(e2.getPropertyParameter("X-NAME", "X-PARAM"), null);

    // TODO more clone checks
}

function test_lastack() {

    let e = cal.createEvent();

    e.alarmLastAck = cal.createDateTime("20120101T010101");

    // Our items don't support this yet
    //equal(e.getProperty("X-MOZ-LASTACK"), "20120101T010101");

    let comp = e.icalComponent;
    let prop = comp.getFirstProperty("X-MOZ-LASTACK");

    equal(prop.value, "20120101T010101Z");

    prop.value = "20120101T010102Z";

    e.icalComponent = comp;

    equal(e.alarmLastAck.icalString, "20120101T010102Z");
}
