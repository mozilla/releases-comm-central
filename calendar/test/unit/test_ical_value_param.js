/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { default: ICAL } = ChromeUtils.importESModule("resource:///modules/calendar/Ical.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalItipItem: "resource:///modules/CalItipItem.sys.mjs",
});

const INJECTED_VALUE =
  'X-A;VALUE="text:z^nORGANIZER:mailto:victim@example.com' +
  '^nATTENDEE:mailto:cfo@example.com^nX-B":hello';

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:x",
  "METHOD:PUBLISH",
  "BEGIN:VEVENT",
  "UID:pub-1",
  "DTSTAMP:20261118T000000Z",
  "DTSTART:20261120T090000Z",
  "DTEND:20261120T100000Z",
  "SUMMARY:Test",
  INJECTED_VALUE,
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

add_setup(() => do_get_profile(true));

add_task(function testParseIgnoresInvalidValueType() {
  const comp = new ICAL.Component(ICAL.parse(ICS));
  const prop = comp.getFirstSubcomponent("vevent").getFirstProperty("x-a");
  Assert.equal(prop.type, "unknown", "An invalid VALUE parameter should be ignored");
  Assert.equal(prop.getFirstValue(), "hello", "The property value should be kept");

  const out = comp.toString();
  Assert.ok(!/^ORGANIZER/im.test(out), "No ORGANIZER line should be injected");
  Assert.ok(!/^ATTENDEE/im.test(out), "No ATTENDEE line should be injected");
});

add_task(function testParseKeepsValidValueType() {
  const comp = new ICAL.Component(
    ICAL.parse(
      "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261120\r\nX-A;VALUE=INTEGER:5\r\nEND:VEVENT\r\n"
    )
  );
  Assert.equal(comp.getFirstProperty("dtstart").type, "date", "VALUE=DATE should be kept");
  Assert.equal(comp.getFirstProperty("x-a").type, "integer", "VALUE=INTEGER should be kept");
  Assert.stringContains(comp.toString(), "X-A;VALUE=INTEGER:5", "A valid VALUE should round-trip");
});

add_task(function testStringifyRejectsInvalidValueType() {
  const prop = new ICAL.Property("x-a");
  prop.resetType("text:z\nORGANIZER:mailto:victim@example.com");
  prop.setValue("hello");
  Assert.throws(
    () => prop.toICALString(),
    /Invalid value type/,
    "Serializing an invalid value type should throw"
  );
});

add_task(function testItipItemSerialization() {
  const itipItem = new CalItipItem();
  itipItem.init(ICS);
  const item = itipItem.getItemList()[0].clone();
  Assert.ok(!item.organizer, "The item should have no organizer");
  Assert.equal(item.getAttendees().length, 0, "The item should have no attendees");

  const out = item.icalString;
  Assert.ok(!/^ORGANIZER/im.test(out), "No ORGANIZER line should be serialized");
  Assert.ok(!/^ATTENDEE/im.test(out), "No ATTENDEE line should be serialized");
  Assert.stringContains(out, "X-A:hello", "The property should be serialized without VALUE");
});

add_task(function testStoredInvalidValueParameter() {
  const item = new CalEvent();
  item.id = "stored-1";
  item.title = "Test";
  item.setProperty("X-A", "hello");
  item.setPropertyParameter(
    "X-A",
    "VALUE",
    "TEXT:Z\nORGANIZER:MAILTO:VICTIM@EXAMPLE.COM\nATTENDEE:MAILTO:CFO@EXAMPLE.COM\nX-B"
  );

  const out = item.icalString;
  Assert.ok(!/^ORGANIZER/im.test(out), "No ORGANIZER line should be serialized");
  Assert.ok(!/^ATTENDEE/im.test(out), "No ATTENDEE line should be serialized");
  Assert.stringContains(out, "X-A:hello", "The property should be serialized without VALUE");
});
