/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  const dbFile = do_get_profile();
  dbFile.append("test_storage.sqlite");

  const sql = await IOUtils.readUTF8(do_get_file("data/bug1790339.sql").path);
  const db = Services.storage.openDatabase(dbFile);
  db.executeSimpleSQL(sql);
  db.close();

  await new Promise(resolve => {
    do_calendar_startup(resolve);
  });

  const calendar = Cc["@mozilla.org/calendar/calendar;1?type=storage"].createInstance(
    Ci.calISyncWriteCalendar
  );
  calendar.uri = Services.io.newFileURI(dbFile);
  calendar.id = "00000000-0000-0000-0000-000000000000";

  checkItem(await calendar.getItem("00000000-0000-0000-0000-111111111111"));
  checkItem(await calendar.getItem("00000000-0000-0000-0000-222222222222"));
});

function checkItem(item) {
  info(`Checking item ${item.id}`);

  const attachments = item.getAttachments();
  Assert.equal(attachments.length, 1);
  const attach = attachments[0];
  Assert.equal(
    attach.uri.spec,
    "https://ftp.mozilla.org/pub/thunderbird/nightly/latest-comm-central/thunderbird-106.0a1.en-US.linux-x86_64.tar.bz2"
  );

  const attendees = item.getAttendees();
  Assert.equal(attendees.length, 1);
  const attendee = attendees[0];
  Assert.equal(attendee.id, "mailto:test@example.com");
  Assert.equal(attendee.role, "REQ-PARTICIPANT");
  Assert.equal(attendee.participationStatus, "NEEDS-ACTION");

  const recurrenceItems = item.recurrenceInfo.getRecurrenceItems();
  Assert.equal(recurrenceItems.length, 1);
  const recurrenceItem = recurrenceItems[0];
  Assert.equal(recurrenceItem.type, "WEEKLY");
  Assert.equal(recurrenceItem.interval, 22);
  Assert.equal(recurrenceItem.isByCount, false);
  Assert.equal(recurrenceItem.isFinite, true);
  Assert.deepEqual(recurrenceItem.getComponent("BYDAY"), [2, 3, 4, 5, 6, 7, 1]);
  Assert.equal(recurrenceItem.isNegative, false);

  const relations = item.getRelations();
  Assert.equal(relations.length, 1);
  const relation = relations[0];
  Assert.equal(relation.relType, "SIBLING");
  Assert.equal(relation.relId, "19960401-080045-4000F192713@example.com");

  const alarms = item.getAlarms();
  Assert.equal(alarms.length, 1);
  const alarm = alarms[0];
  Assert.equal(alarm.action, "DISPLAY");
  Assert.equal(alarm.offset.inSeconds, -300);
  Assert.equal(
    alarm.description,
    "Make sure you don't miss this very very important event. It's essential that you don't forget."
  );
}
