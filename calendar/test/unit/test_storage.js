/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalRecurrenceDate } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceDate.sys.mjs"
);
const { CalRecurrenceRule } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceRule.sys.mjs"
);

add_task(async () => {
  do_get_profile(true);

  const storage = getStorageCal();
  const str = [
    "BEGIN:VEVENT",
    "UID:attachItem",
    "DTSTART:20120101T010101Z",
    "ATTACH;FMTTYPE=text/calendar;ENCODING=BASE64;FILENAME=test.ics:http://example.com/test.ics",
    "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;CN=Name;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT;X-THING=BAR:mailto:test@example.com",
    "RELATED-TO;RELTYPE=SIBLING;FOO=BAR:VALUE",
    "RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=5;BYDAY=MO",
    "RDATE:20120201T010101Z",
    "EXDATE:20120301T010101Z",
    "END:VEVENT",
  ].join("\r\n");

  const storageItem = createEventFromIcalString(str);

  const addedItemId = (await storage.addItem(storageItem)).id;

  // Make sure the cache is cleared, otherwise we'll get the cached item.
  storage.wrappedJSObject.mItemModel.itemCache.delete(addedItemId);

  const item = await storage.getItem(addedItemId);

  // Check start date
  equal(item.startDate.compare(cal.createDateTime("20120101T010101Z")), 0);

  // Check attachment
  const attaches = item.getAttachments();
  const attach = attaches[0];
  equal(attaches.length, 1);
  equal(attach.uri.spec, "http://example.com/test.ics");
  equal(attach.formatType, "text/calendar");
  equal(attach.encoding, "BASE64");
  equal(attach.getParameter("FILENAME"), "test.ics");

  // Check attendee
  const attendees = item.getAttendees();
  const attendee = attendees[0];
  equal(attendees.length, 1);
  equal(attendee.id, "mailto:test@example.com");
  equal(attendee.commonName, "Name");
  equal(attendee.rsvp, "TRUE");
  equal(attendee.isOrganizer, false);
  equal(attendee.role, "REQ-PARTICIPANT");
  equal(attendee.participationStatus, "ACCEPTED");
  equal(attendee.userType, "INDIVIDUAL");
  equal(attendee.getProperty("X-THING"), "BAR");

  // Check relation
  const relations = item.getRelations();
  const rel = relations[0];
  equal(relations.length, 1);
  equal(rel.relType, "SIBLING");
  equal(rel.relId, "VALUE");
  equal(rel.getParameter("FOO"), "BAR");

  // Check recurrence item
  for (const ritem of item.recurrenceInfo.getRecurrenceItems()) {
    if (ritem instanceof CalRecurrenceRule || ritem instanceof Ci.calIRecurrenceRule) {
      equal(ritem.type, "MONTHLY");
      equal(ritem.interval, 2);
      equal(ritem.count, 5);
      equal(ritem.isByCount, true);
      equal(ritem.getComponent("BYDAY").toString(), [2].toString());
      equal(ritem.isNegative, false);
    } else if (ritem instanceof CalRecurrenceDate || ritem instanceof Ci.calIRecurrenceDate) {
      if (ritem.isNegative) {
        equal(ritem.date.compare(cal.createDateTime("20120301T010101Z")), 0);
      } else {
        equal(ritem.date.compare(cal.createDateTime("20120201T010101Z")), 0);
      }
    } else {
      do_throw("Found unknown recurrence item " + ritem);
    }
  }
});

/**
 * Tests that modifying an item does not leave its old property parameters
 * behind in the database. A stale DESCRIPTION;ALTREP would make the HTML
 * description disagree with the plaintext one.
 */
add_task(async function testModifyDropsOldPropertyParameters() {
  do_get_profile(true);

  const storage = getStorageCal();
  const itemModel = storage.wrappedJSObject.mItemModel;
  const makeTodo = description =>
    createTodoFromIcalString(
      ["BEGIN:VTODO", "UID:altrepItem", "DTSTAMP:20250101T010101Z", description, "END:VTODO"].join(
        "\r\n"
      )
    );

  const addedItemId = (
    await storage.addItem(makeTodo('DESCRIPTION;ALTREP="data:text/html,old%20html":old text'))
  ).id;
  itemModel.itemCache.delete(addedItemId);

  let item = await storage.getItem(addedItemId);
  equal(item.descriptionText, "old text", "plaintext description should round-trip");
  equal(item.descriptionHTML, "old html", "HTML description should round-trip");

  // Replace it with a revision that has no ALTREP, as another client would.
  await storage.modifyItem(makeTodo("DESCRIPTION:new text"), item);
  itemModel.itemCache.delete(addedItemId);

  item = await storage.getItem(addedItemId);
  equal(item.descriptionText, "new text", "plaintext description should be updated");
  equal(
    item.getPropertyParameter("DESCRIPTION", "ALTREP"),
    null,
    "the old ALTREP parameter should be gone"
  );
  equal(item.descriptionHTML, "new text", "HTML description should be updated");
});
