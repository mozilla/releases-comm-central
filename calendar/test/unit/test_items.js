/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function run_test() {
    do_calendar_startup(really_run_test);
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
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calICalendar]),

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
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIItemACLEntry]),
        userCanModify: true,
        userCanRespond: false,
        userCanViewAll: true,
        userCanViewDateAndTime: false,
    };

    let event = cal.createEvent();
    event.id = "withentry";
    event.calendar = mockCalendar;

    equal(event.aclEntry.userCanModify, itemEntry.userCanModify);
    equal(event.aclEntry.userCanRespond, itemEntry.userCanRespond);
    equal(event.aclEntry.userCanViewAll, itemEntry.userCanViewAll);
    equal(event.aclEntry.userCanViewDateAndTime, itemEntry.userCanViewDateAndTime);

    let parentEntry = cal.createEvent();
    parentEntry.id = "parententry";
    parentEntry.calendar = mockCalendar;
    parentEntry.parentItem = event;

    equal(parentEntry.aclEntry.userCanModify, itemEntry.userCanModify);
    equal(parentEntry.aclEntry.userCanRespond, itemEntry.userCanRespond);
    equal(parentEntry.aclEntry.userCanViewAll, itemEntry.userCanViewAll);
    equal(parentEntry.aclEntry.userCanViewDateAndTime, itemEntry.userCanViewDateAndTime);

    event = cal.createEvent();
    event.id = "noentry";
    event.calendar = mockCalendar;
    equal(event.aclEntry, null);
}

function test_calendar() {
    let event = cal.createEvent();
    let parentEntry = cal.createEvent();

    let mockCalendar = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calICalendar]),
        id: "one"
    };

    parentEntry.calendar = mockCalendar;
    event.parentItem = parentEntry;

    notEqual(event.calendar, null);
    equal(event.calendar.id, "one");
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
    let event = cal.createEvent();

    let date = cal.createDateTime();
    date.timezone = cal.getTimezoneService().getTimezone("Europe/Berlin");
    event.alarmLastAck = date;

    let org = cal.createAttendee();
    org.id = "one";
    event.organizer = org;

    let alarm = cal.createAlarm();
    alarm.action = "DISPLAY";
    alarm.description = "foo";
    alarm.related = alarm.ALARM_RELATED_START;
    alarm.offset = cal.createDuration("PT1S");
    event.addAlarm(alarm);

    event.setProperty("X-NAME", "X-VALUE");
    event.setPropertyParameter("X-NAME", "X-PARAM", "X-PARAMVAL");

    event.setCategories(3, ["a", "b", "c"]);

    equal(event.alarmLastAck.timezone.tzid, cal.UTC().tzid);

    event.makeImmutable();

    // call again, should not throw
    event.makeImmutable();

    ok(!event.alarmLastAck.isMutable);
    ok(!org.isMutable);
    ok(!alarm.isMutable);

    throws(() => {
        event.alarmLastAck = cal.createDateTime();
    }, /Can not modify immutable data container/);
    throws(() => {
        event.calendar = null;
    }, /Can not modify immutable data container/);
    throws(() => {
        event.parentItem = null;
    }, /Can not modify immutable data container/);
    throws(() => {
        event.setCategories(3, ["d", "e", "f"]);
    }, /Can not modify immutable data container/);

    let event2 = event.clone();
    event2.organizer.id = "two";

    equal(org.id, "one");
    equal(event2.organizer.id, "two");

    equal(event2.getProperty("X-NAME"), "X-VALUE");
    equal(event2.getPropertyParameter("X-NAME", "X-PARAM"), "X-PARAMVAL");

    event2.setPropertyParameter("X-NAME", "X-PARAM", null);
    equal(event2.getPropertyParameter("X-NAME", "X-PARAM"), null);

    // TODO more clone checks
}

function test_lastack() {
    let e = cal.createEvent();

    e.alarmLastAck = cal.createDateTime("20120101T010101");

    // Our items don't support this yet
    //  equal(e.getProperty("X-MOZ-LASTACK"), "20120101T010101");

    let comp = e.icalComponent;
    let prop = comp.getFirstProperty("X-MOZ-LASTACK");

    equal(prop.value, "20120101T010101Z");

    prop.value = "20120101T010102Z";

    e.icalComponent = comp;

    equal(e.alarmLastAck.icalString, "20120101T010102Z");
}
