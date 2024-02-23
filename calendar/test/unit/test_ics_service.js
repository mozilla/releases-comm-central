/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalRelation: "resource:///modules/CalRelation.sys.mjs",
});

function run_test() {
  do_calendar_startup(really_run_test);
}

function really_run_test() {
  test_iterator();
  test_icalcomponent();
  test_icsservice();
  test_icalstring();
  test_param();
  test_icalproperty();
}

function test_icalstring() {
  function checkComp(createFunc, icalString, members, properties) {
    const thing = createFunc(icalString);
    equal(ics_unfoldline(thing.icalString), icalString + "\r\n");

    if (members) {
      for (const k in members) {
        equal(thing[k], members[k]);
      }
    }

    if (properties) {
      for (const k in properties) {
        if ("getParameter" in thing) {
          equal(thing.getParameter(k), properties[k]);
        } else if ("getProperty" in thing) {
          equal(thing.getProperty(k), properties[k]);
        }
      }
    }
    return thing;
  }

  const attach = checkComp(
    icalString => new CalAttachment(icalString),
    "ATTACH;ENCODING=BASE64;FMTTYPE=text/calendar;FILENAME=test.ics:http://example.com/test.ics",
    { formatType: "text/calendar", encoding: "BASE64" },
    { FILENAME: "test.ics" }
  );
  equal(attach.uri.spec, "http://example.com/test.ics");

  checkComp(
    icalString => new CalAttendee(icalString),
    "ATTENDEE;RSVP=TRUE;CN=Name;PARTSTAT=ACCEPTED;CUTYPE=RESOURCE;ROLE=REQ-PARTICIPANT;X-THING=BAR:mailto:test@example.com",
    {
      id: "mailto:test@example.com",
      commonName: "Name",
      rsvp: "TRUE",
      isOrganizer: false,
      role: "REQ-PARTICIPANT",
      participationStatus: "ACCEPTED",
      userType: "RESOURCE",
    },
    { "X-THING": "BAR" }
  );

  checkComp(
    icalString => new CalRelation(icalString),
    "RELATED-TO;RELTYPE=SIBLING;FOO=BAR:VALUE",
    { relType: "SIBLING", relId: "VALUE" },
    { FOO: "BAR" }
  );

  const rrule = checkComp(
    cal.createRecurrenceRule.bind(cal),
    "RRULE:FREQ=WEEKLY;COUNT=5;INTERVAL=2;BYDAY=MO",
    { count: 5, isByCount: true, type: "WEEKLY", interval: 2 }
  );
  equal(rrule.getComponent("BYDAY").toString(), [2].toString());

  const rdate = checkComp(cal.createRecurrenceDate.bind(cal), "RDATE:20120101T000000", {
    isNegative: false,
  });
  equal(rdate.date.compare(cal.createDateTime("20120101T000000")), 0);

  /* TODO consider removing period support, ics throws badarg
    let rdateperiod = checkComp(cal.createRecurrenceDate.bind(cal),
                                "RDATE;VALUE=PERIOD;20120101T000000Z/20120102T000000Z");
    equal(rdate.date.compare(cal.createDateTime("20120101T000000Z")), 0);
    */

  const exdate = checkComp(cal.createRecurrenceDate.bind(cal), "EXDATE:20120101T000000", {
    isNegative: true,
  });
  equal(exdate.date.compare(cal.createDateTime("20120101T000000")), 0);
}

function test_icsservice() {
  function checkProp(createFunc, icalString, members, parameters) {
    const thing = createFunc(icalString);
    equal(ics_unfoldline(thing.icalString), icalString + "\r\n");

    for (const k in members) {
      equal(thing[k], members[k]);
    }

    for (const k in parameters) {
      equal(thing.getParameter(k), parameters[k]);
    }
    return thing;
  }

  // Test ::createIcalPropertyFromString
  checkProp(
    cal.icsService.createIcalPropertyFromString.bind(cal.icsService),
    "ATTACH;ENCODING=BASE64;FMTTYPE=text/calendar;FILENAME=test.ics:http://example.com/test.ics",
    { value: "http://example.com/test.ics", propertyName: "ATTACH" },
    { ENCODING: "BASE64", FMTTYPE: "text/calendar", FILENAME: "test.ics" }
  );

  checkProp(
    cal.icsService.createIcalPropertyFromString.bind(cal.icsService),
    "DESCRIPTION:new\\nlines\\nare\\ngreat\\,eh?",
    {
      value: "new\nlines\nare\ngreat,eh?",
      valueAsIcalString: "new\\nlines\\nare\\ngreat\\,eh?",
    },
    {}
  );

  // Test ::createIcalProperty
  const attach2 = cal.icsService.createIcalProperty("ATTACH");
  equal(attach2.propertyName, "ATTACH");
  attach2.value = "http://example.com/";
  equal(attach2.icalString, "ATTACH:http://example.com/\r\n");
}

function test_icalproperty() {
  const comp = cal.icsService.createIcalComponent("VEVENT");
  let prop = cal.icsService.createIcalProperty("PROP");
  prop.value = "VAL";

  comp.addProperty(prop);
  equal(prop.parent.toString(), comp.toString());
  equal(prop.valueAsDatetime, null);

  prop = cal.icsService.createIcalProperty("DESCRIPTION");
  prop.value = "A\nB";
  equal(prop.value, "A\nB");
  equal(prop.valueAsIcalString, "A\\nB");
  equal(prop.valueAsDatetime, null);

  prop = cal.icsService.createIcalProperty("DESCRIPTION");
  prop.valueAsIcalString = "A\\nB";
  equal(prop.value, "A\nB");
  equal(prop.valueAsIcalString, "A\\nB");
  equal(prop.valueAsDatetime, null);

  prop = cal.icsService.createIcalProperty("DESCRIPTION");
  prop.value = "A\\nB";
  equal(prop.value, "A\\nB");
  equal(prop.valueAsIcalString, "A\\\\nB");
  equal(prop.valueAsDatetime, null);

  prop = cal.icsService.createIcalProperty("GEO");
  prop.value = "43.4913662534171;12.085559129715";
  equal(prop.value, "43.4913662534171;12.085559129715");
  equal(prop.valueAsIcalString, "43.4913662534171;12.085559129715");
}

function test_icalcomponent() {
  const event = cal.icsService.createIcalComponent("VEVENT");
  const alarm = cal.icsService.createIcalComponent("VALARM");
  event.addSubcomponent(alarm);

  // Check that the parent works and does not appear on cloned instances
  const alarm2 = alarm.clone();
  equal(alarm.parent.toString(), event.toString());
  equal(alarm2.parent, null);

  function check_getset(key, value) {
    dump("Checking " + key + " = " + value + "\n");
    event[key] = value;
    const valuestring = value.icalString || value;
    equal(event[key].icalString || event[key], valuestring);
    equal(event.serializeToICS().match(new RegExp(valuestring, "g")).length, 1);
    event[key] = value;
    equal(event.serializeToICS().match(new RegExp(valuestring, "g")).length, 1);
  }

  const props = [
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
    ["recurrenceId", cal.createDateTime("20120101T010108")],
  ];

  for (const prop of props) {
    check_getset(...prop);
  }
}

function test_param() {
  const prop = cal.icsService.createIcalProperty("DTSTART");
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
  // Property iterator
  let comp = cal.icsService.createIcalComponent("VEVENT");
  let propNames = ["X-ONE", "X-TWO"];
  for (let i = 0; i < propNames.length; i++) {
    const prop = cal.icsService.createIcalProperty(propNames[i]);
    prop.value = "" + (i + 1);
    comp.addProperty(prop);
  }

  for (let prop = comp.getFirstProperty("ANY"); prop; prop = comp.getNextProperty("ANY")) {
    equal(prop.propertyName, propNames.shift());
    equal(prop.parent.toString(), comp.toString());
  }
  propNames = ["X-ONE", "X-TWO"];
  for (let prop = comp.getNextProperty("ANY"); prop; prop = comp.getNextProperty("ANY")) {
    equal(prop.propertyName, propNames.shift());
    equal(prop.parent.toString(), comp.toString());
  }

  // Property iterator with multiple values
  // eslint-disable-next-line no-useless-concat
  comp = cal.icsService.parseICS("BEGIN:VEVENT\r\n" + "CATEGORIES:a,b,c\r\n" + "END:VEVENT");
  const propValues = ["a", "b", "c"];
  for (
    let prop = comp.getFirstProperty("CATEGORIES");
    prop;
    prop = comp.getNextProperty("CATEGORIES")
  ) {
    equal(prop.propertyName, "CATEGORIES");
    equal(prop.value, propValues.shift());
    equal(prop.parent.toString(), comp.toString());
  }

  // Param iterator
  const dtstart = cal.icsService.createIcalProperty("DTSTART");
  let params = ["X-ONE", "X-TWO"];
  for (let i = 0; i < params.length; i++) {
    dtstart.setParameter(params[i], "" + (i + 1));
  }

  for (let prop = dtstart.getFirstParameterName(); prop; prop = dtstart.getNextParameterName()) {
    equal(prop, params.shift());
  }

  // Now try again, but start with next. Should act like first
  params = ["X-ONE", "X-TWO"];
  for (let param = dtstart.getNextParameterName(); param; param = dtstart.getNextParameterName()) {
    equal(param, params.shift());
  }
}
