/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    test_iterator();
    test_icalcomponent();
    test_icsservice();
    test_icalstring();
    test_param();

    // Only supported with ical.js
    if (Preferences.get("calendar.icaljs", false)) test_icalproperty();
}

function test_icalstring() {
    function checkComp(createFunc, icalString, members, properties) {
        let thing = createFunc(icalString);
        equal(ics_unfoldline(thing.icalString), icalString + "\r\n");

        if (members) {
            for (let k in members) {
                equal(thing[k], members[k]);
            }
        }

        if (properties) {
            for (let k in properties) {
                if ("getParameter" in thing) {
                    equal(thing.getParameter(k), properties[k]);
                } else if ("getProperty" in thing) {
                    equal(thing.getProperty(k), properties[k]);
                }
            }
        }
        return thing;
    }

    let attach = checkComp(cal.createAttachment.bind(cal),
                           "ATTACH;ENCODING=BASE64;FMTTYPE=text/calendar;FILENAME=test.ics:http://example.com/test.ics",
                           { formatType: "text/calendar", encoding: "BASE64" },
                           { FILENAME: "test.ics" });
    equal(attach.uri.spec, "http://example.com/test.ics");

    checkComp(cal.createAttendee.bind(cal),
              "ATTENDEE;RSVP=TRUE;CN=Name;PARTSTAT=ACCEPTED;CUTYPE=RESOURCE;ROLE=REQ-PARTICIPANT;X-THING=BAR:mailto:test@example.com",
              { id: "mailto:test@example.com", commonName: "Name", rsvp: "TRUE",
                isOrganizer: false, role: "REQ-PARTICIPANT", participationStatus: "ACCEPTED",
                userType: "RESOURCE" },
              { "X-THING": "BAR" });

    checkComp(cal.createRelation.bind(cal),
              "RELATED-TO;RELTYPE=SIBLING;FOO=BAR:VALUE",
              { relType: "SIBLING", relId: "VALUE" },
              { FOO: "BAR" });

    let rrule = checkComp(cal.createRecurrenceRule.bind(cal),
                          "RRULE:FREQ=WEEKLY;COUNT=5;INTERVAL=2;BYDAY=MO",
                          { count: 5, isByCount: true, type: "WEEKLY", interval: 2 });
    equal(rrule.getComponent("BYDAY", {}).toString(), [2].toString());

    if (Preferences.get("calendar.icaljs", false)) {
        let rdate = checkComp(cal.createRecurrenceDate.bind(cal),
                              "RDATE:20120101T000000",
                              { isNegative: false });
        equal(rdate.date.compare(cal.createDateTime("20120101T000000")), 0);
    } else {
        let rdate = checkComp(cal.createRecurrenceDate.bind(cal),
                              "RDATE;VALUE=DATE-TIME:20120101T000000",
                              { isNegative: false });
        equal(rdate.date.compare(cal.createDateTime("20120101T000000")), 0);
    }

    /* TODO consider removing period support, ics throws badarg
    let rdateperiod = checkComp(cal.createRecurrenceDate.bind(cal),
                                "RDATE;VALUE=PERIOD;20120101T000000Z/20120102T000000Z");
    equal(rdate.date.compare(cal.createDateTime("20120101T000000Z")), 0);
    */

    let exdate = checkComp(cal.createRecurrenceDate.bind(cal),
                           "EXDATE:20120101T000000",
                           { isNegative: true });
    equal(exdate.date.compare(cal.createDateTime("20120101T000000")), 0);
}

function test_icsservice() {
    let svc = cal.getIcsService();

    function checkProp(createFunc, icalString, members, parameters) {
        let thing = createFunc(icalString);
        equal(ics_unfoldline(thing.icalString), icalString + "\r\n");

        for (let k in members) {
            equal(thing[k], members[k]);
        }

        for (let k in parameters) {
            equal(thing.getParameter(k), parameters[k]);
        }
        return thing;
    }

    // Test ::createIcalPropertyFromString
    checkProp(svc.createIcalPropertyFromString.bind(svc),
              "ATTACH;ENCODING=BASE64;FMTTYPE=text/calendar;FILENAME=test.ics:http://example.com/test.ics",
              { value: "http://example.com/test.ics", propertyName: "ATTACH" },
              { ENCODING: "BASE64", FMTTYPE: "text/calendar", FILENAME: "test.ics" });

    checkProp(svc.createIcalPropertyFromString.bind(svc),
              "DESCRIPTION:new\\nlines\\nare\\ngreat\\,eh?",
              { value: "new\nlines\nare\ngreat,eh?",
                valueAsIcalString: "new\\nlines\\nare\\ngreat\\,eh?" }, {});

    // Test ::createIcalProperty
    let attach2 = svc.createIcalProperty("ATTACH");
    equal(attach2.propertyName, "ATTACH");
    attach2.value = "http://example.com/";
    equal(attach2.icalString, "ATTACH:http://example.com/\r\n");
}

function test_icalproperty() {
    let svc = cal.getIcsService();
    let comp = svc.createIcalComponent("VEVENT");
    let prop = svc.createIcalProperty("PROP");
    prop.value = "VAL";

    comp.addProperty(prop);
    equal(prop.parent.toString(), comp.toString());
    equal(prop.valueAsDatetime, null);

    prop = svc.createIcalProperty("PROP");
    prop.value = "A\nB";
    equal(prop.value, "A\nB");
    equal(prop.valueAsIcalString, "A\\nB");
    equal(prop.valueAsDatetime, null);

    prop = svc.createIcalProperty("PROP");
    prop.valueAsIcalString = "A\\nB";
    equal(prop.value, "A\nB");
    equal(prop.valueAsIcalString, "A\\nB");
    equal(prop.valueAsDatetime, null);

    prop = svc.createIcalProperty("PROP");
    prop.value = "A\\nB";
    equal(prop.value, "A\\nB");
    equal(prop.valueAsIcalString, "A\\\\nB");
    equal(prop.valueAsDatetime, null);
}

function test_icalcomponent() {
    let svc = cal.getIcsService();
    let event = svc.createIcalComponent("VEVENT");
    let todo = svc.createIcalComponent("VTODO");
    let alarm = svc.createIcalComponent("VALARM");
    event.addSubcomponent(alarm);

    // Check that the parent works and does not appear on cloned instances
    let alarm2 = alarm.clone();
    equal(alarm.parent.toString(), event.toString());
    equal(alarm2.parent, null);

    function check_getset(k, v) {
        dump("Checking " + k + " = " + v + "\n");
        event[k] = v;
        vstring = v.icalString || v;
        equal(event[k].icalString || event[k], vstring);
        equal(event.serializeToICS().match(new RegExp(vstring, "g")).length, 1);
        event[k] = v;
        equal(event.serializeToICS().match(new RegExp(vstring, "g")).length, 1);
    }

    let props = [
       ["uid", "123"],
       ["prodid", "//abc/123"],
       ["version", "2.0"],
       ["method", "REQUEST"],
       ["status", "TENTATIVE"],
       ["summary", "sum"],
       ["description", "descr"],
       ["location", "here"],
       ["categories", "cat"],
       ["URL", "url"],
       ["priority", 5],
       ["startTime", cal.createDateTime("20120101T010101")],
       ["endTime", cal.createDateTime("20120101T010102")],
       /* TODO readonly, how to set... ["duration", cal.createDuration("PT2S")], */
       ["dueTime", cal.createDateTime("20120101T010103")],
       ["stampTime", cal.createDateTime("20120101T010104")],
       ["createdTime", cal.createDateTime("20120101T010105")],
       ["completedTime", cal.createDateTime("20120101T010106")],
       ["lastModified", cal.createDateTime("20120101T010107")],
       ["recurrenceId", cal.createDateTime("20120101T010108")]
    ];

    for each (let prop in props) {
        check_getset.apply(null, prop);
    }
}

function test_param() {
    let svc = cal.getIcsService();
    let prop = svc.createIcalProperty("DTSTART");
    prop.value = "20120101T010101";
    equal(prop.icalString, "DTSTART:20120101T010101\r\n");
    prop.setParameter("VALUE", "TEXT");
    equal(prop.icalString, "DTSTART;VALUE=TEXT:20120101T010101\r\n");
    prop.removeParameter("VALUE");
    equal(prop.icalString, "DTSTART:20120101T010101\r\n");

    prop.setParameter("X-FOO", "BAR");
    equal(prop.icalString, "DTSTART;X-FOO=BAR:20120101T010101\r\n");
    prop.removeParameter("X-FOO", "BAR");
    equal(prop.icalString, "DTSTART:20120101T010101\r\n");

}

function test_iterator() {
    let svc = cal.getIcsService();

    // Property iterator
    let comp = svc.createIcalComponent("VEVENT");
    let propNames = ["X-ONE", "X-TWO"];
    for (let i = 0; i < propNames.length; i++) {
        let prop = svc.createIcalProperty(propNames[i]);
        prop.value = "" + (i+1);
        comp.addProperty(prop);
    }

    for (let p = comp.getFirstProperty("ANY");
         p;
         p = comp.getNextProperty("ANY")) {
        equal(p.propertyName, propNames.shift());
        equal(p.parent.toString(), comp.toString());
    }
    propNames = ["X-ONE", "X-TWO"];
    for (let p = comp.getNextProperty("ANY");
         p;
         p = comp.getNextProperty("ANY")) {
        equal(p.propertyName, propNames.shift());
        equal(p.parent.toString(), comp.toString());
    }

    // Property iterator with multiple values
    comp = svc.parseICS("BEGIN:VEVENT\r\n" +
                        "CATEGORIES:a,b,c\r\n" +
                        "END:VEVENT", null);
    let propValues = ["a", "b", "c"];
    for (let p = comp.getFirstProperty("CATEGORIES");
         p;
         p = comp.getNextProperty("CATEGORIES")) {
        equal(p.propertyName, "CATEGORIES");
        equal(p.value, propValues.shift());
        equal(p.parent.toString(), comp.toString());
    }

    // Param iterator
    let prop = svc.createIcalProperty("DTSTART");
    let params = ["X-ONE", "X-TWO"];
    for (let i = 0; i < params.length; i++) {
        prop.setParameter(params[i], "" + (i+1));
    }

    for (let p = prop.getFirstParameterName();
         p;
         p = prop.getNextParameterName()) {
        equal(p, params.shift());
    }

    // Now try again, but start with next. Should act like first
    params = ["X-ONE", "X-TWO"];
    for (let p = prop.getNextParameterName();
         p;
         p = prop.getNextParameterName()) {
        equal(p, params.shift());
    }
}
