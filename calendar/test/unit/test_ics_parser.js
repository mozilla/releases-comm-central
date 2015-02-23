/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    test_roundtrip();
    test_async();
    if (Preferences.get("calendar.icaljs", false)) test_failures();
    test_fake_parent();
    test_props_comps();
    test_timezone();
}

function test_props_comps() {
    let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                           .createInstance(Components.interfaces.calIIcsParser);
    let str = [
        "BEGIN:VCALENDAR",
        "X-WR-CALNAME:CALNAME",
        "BEGIN:VJOURNAL",
        "LOCATION:BEFORE TIME",
        "END:VJOURNAL",
        "BEGIN:VEVENT",
        "UID:123",
        "END:VEVENT",
        "END:VCALENDAR"].join("\r\n");
    parser.parseString(str);

    let props = parser.getProperties({});
    equal(props.length, 1);
    equal(props[0].propertyName, "X-WR-CALNAME");
    equal(props[0].value, "CALNAME");

    let comps = parser.getComponents({});
    equal(comps.length, 1);
    equal(comps[0].componentType, "VJOURNAL");
    equal(comps[0].location, "BEFORE TIME");
}

function test_failures() {
    let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                           .createInstance(Components.interfaces.calIIcsParser);

    do_test_pending()
    parser.parseString("BOGUS", null, {
        onParsingComplete: function(rc, parser) {
            dump("Note: The previous error message is expected ^^\n");
            equal(rc, Components.results.NS_ERROR_FAILURE);
            do_test_finished();
        }
    });

    // No real error here, but there is a message...
    parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                       .createInstance(Components.interfaces.calIIcsParser);
    let str = [
        "BEGIN:VWORLD",
        "BEGIN:VEVENT",
        "UID:123",
        "END:VEVENT",
        "END:VWORLD"].join("\r\n");
    dump("Note: The following error message is expected:\n");
    parser.parseString(str);
    equal(parser.getComponents({}).length, 0);
    equal(parser.getItems({}).length, 0);

}

function test_fake_parent() {
    let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                           .createInstance(Components.interfaces.calIIcsParser);

    let str = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:123",
        "RECURRENCE-ID:20120101T010101",
        "DTSTART:20120101T010102",
        "LOCATION:HELL",
        "END:VEVENT",
        "END:VCALENDAR"].join("\r\n");

    parser.parseString(str);

    let items = parser.getItems({});
    equal(items.length, 1);
    let item = items[0];

    equal(item.id, "123");
    ok(!!item.recurrenceInfo);
    equal(item.startDate.icalString, "20120101T010101");
    equal(item.getProperty("X-MOZ-FAKED-MASTER"), "1");

    let rinfo = item.recurrenceInfo;

    equal(rinfo.countRecurrenceItems(), 1);
    let excs = rinfo.getOccurrences(cal.createDateTime("20120101T010101"), null, 0, {});
    equal(excs.length, 1);
    let exc = excs[0];
    equal(exc.startDate.icalString, "20120101T010102");

    equal(parser.getParentlessItems({})[0], exc);
}

function test_async() {
    let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                           .createInstance(Components.interfaces.calIIcsParser);
    let str = [
        "BEGIN:VCALENDAR",
        "BEGIN:VTODO",
        "UID:1",
        "DTSTART:20120101T010101",
        "DUE:20120101T010102",
        "END:VTODO",
        "BEGIN:VTODO",
        "UID:2",
        "DTSTART:20120101T010103",
        "DUE:20120101T010104",
        "END:VTODO",
        "END:VCALENDAR"].join("\r\n");

    do_test_pending();
    parser.parseString(str, null, {
        onParsingComplete: function(rc, parser) {
            let items = parser.getItems({});
            equal(items.length, 2);
            let item = items[0];
            ok(cal.isToDo(item));

            equal(item.entryDate.icalString, "20120101T010101");
            equal(item.dueDate.icalString, "20120101T010102");

            item = items[1];
            ok(cal.isToDo(item));

            equal(item.entryDate.icalString, "20120101T010103");
            equal(item.dueDate.icalString, "20120101T010104");

            do_test_finished();
        }
    });
}

function test_timezone() {
    // TODO
}

function test_roundtrip() {
    let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                           .createInstance(Components.interfaces.calIIcsParser);
    let serializer = Components.classes["@mozilla.org/calendar/ics-serializer;1"]
                               .createInstance(Components.interfaces.calIIcsSerializer);
    let str = [
        "BEGIN:VCALENDAR",
        "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN",
        "VERSION:2.0",
        "X-PROP:VAL",
        "BEGIN:VTODO",
        "UID:1",
        "DTSTART:20120101T010101",
        "DUE:20120101T010102",
        "END:VTODO",
        "BEGIN:VJOURNAL",
        "LOCATION:BEFORE TIME",
        "END:VJOURNAL",
        "END:VCALENDAR",
        ""].join("\r\n");

    parser.parseString(str);

    let items = parser.getItems({});
    serializer.addItems(items, items.length);

    parser.getProperties({}).forEach(serializer.addProperty, serializer);
    parser.getComponents({}).forEach(serializer.addComponent, serializer);

    equal(serializer.serializeToString().split("\r\n").sort().join("\r\n"),
                str.split("\r\n").sort().join("\r\n"));

    // Test parseFromStream
    parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                       .createInstance(Components.interfaces.calIIcsParser);
    let stream = serializer.serializeToInputStream();

    parser.parseFromStream(stream);

    items = parser.getItems({});
    let comps = parser.getComponents({});
    let props = parser.getProperties({});
    equal(items.length, 1);
    equal(comps.length, 1);
    equal(props.length, 1);

    let everything = items[0].icalString.split("\r\n").concat(comps[0].serializeToICS().split("\r\n"))
    everything.push((props[0].icalString.split("\r\n"))[0]);
    everything.sort();

    equal(everything.join("\r\n"), str.split("\r\n").concat([""]).sort().join("\r\n"));

    // Test serializeToStream/parseFromStream
    parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                       .createInstance(Components.interfaces.calIIcsParser);
    let pipe = Components.classes["@mozilla.org/pipe;1"]
                         .createInstance(Components.interfaces.nsIPipe);
    pipe.init(true, true, 0, 0, null);

    serializer.serializeToStream(pipe.outputStream);
    parser.parseFromStream(pipe.inputStream);

    items = parser.getItems({});
    comps = parser.getComponents({});
    props = parser.getProperties({});
    equal(items.length, 1);
    equal(comps.length, 1);
    equal(props.length, 1);

    everything = items[0].icalString.split("\r\n").concat(comps[0].serializeToICS().split("\r\n"));
    everything.push((props[0].icalString.split("\r\n"))[0]);
    everything.sort();

    equal(everything.join("\r\n"), str.split("\r\n").concat([""]).sort().join("\r\n"));
}
