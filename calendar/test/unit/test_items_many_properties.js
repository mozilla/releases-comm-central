/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests items with very many attendees, attachments and relations, and the
 * lookups that keep adding them from taking quadratic time.
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

add_task(function testParseManyProperties() {
  const count = 20000;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    "BEGIN:VEVENT",
    "UID:many@example.com",
    "DTSTAMP:20260101T120000Z",
    "DTSTART:20260115T140000Z",
    "DTEND:20260115T150000Z",
    "SUMMARY:Many",
  ];
  for (let i = 0; i < count; i++) {
    lines.push(`ATTENDEE;PARTSTAT=ACCEPTED:mailto:a${i}@example.com`);
    lines.push(`ATTACH:https://example.com/${i}`);
    lines.push(`RELATED-TO;RELTYPE=PARENT:item-${i}@example.com`);
  }
  // A declined duplicate replaces the earlier attendee, other duplicates are
  // ignored.
  lines.push("ATTENDEE;PARTSTAT=DECLINED:MAILTO:A0@EXAMPLE.COM");
  lines.push("ATTENDEE;PARTSTAT=TENTATIVE:mailto:a1@example.com");
  lines.push("ATTACH:https://example.com/0");
  lines.push("END:VEVENT", "END:VCALENDAR");

  const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
  parser.parseString(lines.join("\r\n"));
  const [item] = parser.getItems();

  Assert.equal(item.getAttendees().length, count, "all attendees should be kept");
  Assert.equal(
    item.getAttendeeById("mailto:a0@example.com").participationStatus,
    "DECLINED",
    "a declined duplicate should replace the earlier attendee"
  );
  Assert.equal(
    item.getAttendeeById("MAILTO:A1@EXAMPLE.COM").participationStatus,
    "ACCEPTED",
    "other duplicates should be ignored"
  );
  Assert.equal(
    item.getAttendeeById(`mailto:a${count - 1}@example.com`).id,
    `mailto:a${count - 1}@example.com`,
    "the last attendee should be found"
  );
  Assert.equal(item.getAttachments().length, count, "duplicate attachments should be ignored");
  Assert.equal(item.getRelations().length, count, "all relations should be kept");
});

add_task(function testLookupsAfterChanges() {
  const event = new CalEvent();
  const attendee = new CalAttendee();
  attendee.id = "mailto:x@example.com";
  event.addAttendee(attendee);
  Assert.equal(event.getAttendeeById("MAILTO:X@example.com"), attendee, "attendee should be found");

  const clone = event.clone();
  const cloneAttendee = new CalAttendee();
  cloneAttendee.id = "mailto:y@example.com";
  clone.addAttendee(cloneAttendee);
  Assert.equal(clone.getAttendeeById("mailto:x@example.com").id, "mailto:x@example.com");
  Assert.equal(clone.getAttendeeById("mailto:y@example.com"), cloneAttendee);
  Assert.equal(
    event.getAttendeeById("mailto:y@example.com"),
    null,
    "adding to the clone should not add to the original"
  );

  event.removeAttendee(attendee);
  Assert.equal(event.getAttendeeById("mailto:x@example.com"), null, "removed attendee is gone");
  event.addAttendee(attendee);
  Assert.equal(event.getAttendeeById("mailto:x@example.com"), attendee, "attendee is back");

  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI("https://example.com/a");
  const sameAttachment = new CalAttachment();
  sameAttachment.uri = Services.io.newURI("https://example.com/a");
  event.addAttachment(attachment);
  event.addAttachment(sameAttachment);
  Assert.equal(event.getAttachments().length, 1, "a duplicate attachment should be ignored");
  event.removeAttachment(attachment);
  Assert.equal(event.getAttachments().length, 0, "the attachment should be removed");
  event.addAttachment(sameAttachment);
  Assert.equal(event.getAttachments().length, 1, "the attachment can be added again");

  // Occurrences of a recurring event start with the attendees of their parent.
  const recurring = new CalEvent(
    [
      "BEGIN:VEVENT",
      "UID:recurring@example.com",
      "DTSTART:20260115T140000Z",
      "DTEND:20260115T150000Z",
      "RRULE:FREQ=DAILY;COUNT=2",
      "ATTENDEE:mailto:x@example.com",
      "END:VEVENT",
    ].join("\r\n")
  );
  const occurrence = recurring.recurrenceInfo.getOccurrenceFor(
    cal.createDateTime("20260116T140000Z")
  );
  Assert.equal(occurrence.getAttendeeById("mailto:x@example.com").id, "mailto:x@example.com");
  const occurrenceAttendee = new CalAttendee();
  occurrenceAttendee.id = "mailto:z@example.com";
  occurrence.addAttendee(occurrenceAttendee);
  Assert.equal(occurrence.getAttendeeById("mailto:z@example.com"), occurrenceAttendee);
  Assert.equal(
    recurring.getAttendeeById("mailto:z@example.com"),
    null,
    "adding to an occurrence should not add to its parent"
  );
});
