/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let dbFile = do_get_profile();
  dbFile.append("test_storage.sqlite");

  let sql = await IOUtils.readUTF8(do_get_file("data/bug1790339.sql").path);
  let db = Services.storage.openDatabase(dbFile);
  db.executeSimpleSQL(sql);
  db.close();

  await new Promise(resolve => {
    do_calendar_startup(resolve);
  });

  let calendar = Cc["@mozilla.org/calendar/calendar;1?type=storage"].createInstance(
    Ci.calISyncWriteCalendar
  );
  calendar.uri = Services.io.newFileURI(dbFile);
  calendar.id = "00000000-0000-0000-0000-000000000000";

  checkItem(await calendar.getItem("00000000-0000-0000-0000-111111111111"));
  checkItem(await calendar.getItem("00000000-0000-0000-0000-222222222222"));
});

function checkItem(item) {
  info(`Checking item ${item.id}`);

  let attachments = item.getAttachments();
  Assert.equal(attachments.length, 1);
  let attach = attachments[0];
  Assert.equal(
    attach.uri.spec,
    "https://ftp.mozilla.org/pub/thunderbird/nightly/latest-comm-central/thunderbird-106.0a1.en-US.linux-x86_64.tar.bz2"
  );

  let attendees = item.getAttendees();
  Assert.equal(attendees.length, 1);
  let attendee = attendees[0];
  Assert.equal(attendee.id, "mailto:test@example.com");
  Assert.equal(attendee.role, "REQ-PARTICIPANT");
  Assert.equal(attendee.participationStatus, "NEEDS-ACTION");

  let recurrenceItems = item.recurrenceInfo.getRecurrenceItems();
  Assert.equal(recurrenceItems.length, 1);
  let recurrenceItem = recurrenceItems[0];
  Assert.equal(recurrenceItem.type, "WEEKLY");
  Assert.equal(recurrenceItem.interval, 22);
  Assert.equal(recurrenceItem.isByCount, false);
  Assert.equal(recurrenceItem.isFinite, true);
  Assert.deepEqual(recurrenceItem.getComponent("BYDAY"), [2, 3, 4, 5, 6, 7, 1]);
  Assert.equal(recurrenceItem.isNegative, false);

  let relations = item.getRelations();
  Assert.equal(relations.length, 1);
  let relation = relations[0];
  Assert.equal(relation.relType, "SIBLING");
  Assert.equal(relation.relId, "19960401-080045-4000F192713@example.com");

  let alarms = item.getAlarms();
  Assert.equal(alarms.length, 1);
  let alarm = alarms[0];
  Assert.equal(alarm.action, "DISPLAY");
  Assert.equal(alarm.offset.inSeconds, -300);
  Assert.equal(
    alarm.description,
    "Make sure you don't miss this very very important event. It's essential that you don't forget."
  );
}
