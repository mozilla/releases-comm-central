/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalendarsEngine, CalendarRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/calendars.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);

let engine, store, tracker;
let calDAVCalendar, icsCalendar, fileICSCalendar, storageCalendar;

add_setup(async function () {
  await populateCacheFile();

  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));

  engine = new CalendarsEngine(Service);
  await engine.initialize();
  store = engine._store;

  calDAVCalendar = cal.manager.createCalendar(
    "caldav",
    Services.io.newURI("https://localhost/caldav")
  );
  calDAVCalendar.name = "CalDAV Calendar";
  calDAVCalendar.setProperty("username", "CalDAV User");
  cal.manager.registerCalendar(calDAVCalendar);

  icsCalendar = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("https://localhost/ics")
  );
  icsCalendar.name = "Ical Calendar";
  cal.manager.registerCalendar(icsCalendar);

  fileICSCalendar = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("file:///home/user/test.ics")
  );
  fileICSCalendar.name = "File Ical Calendar";
  cal.manager.registerCalendar(fileICSCalendar);

  storageCalendar = cal.manager.createCalendar(
    "storage",
    Services.io.newURI("moz-storage-calendar://")
  );
  storageCalendar.name = "Storage Calendar";
  cal.manager.registerCalendar(storageCalendar);
});

add_task(async function testGetAllIDs() {
  Assert.deepEqual(await store.getAllIDs(), {
    [calDAVCalendar.id]: true,
    [icsCalendar.id]: true,
    "f8830f91-5181-41c4-8123-54302ba44e2b": true,
  });
});

add_task(async function testItemExists() {
  Assert.ok(await store.itemExists(calDAVCalendar.id));
  Assert.ok(await store.itemExists(icsCalendar.id));
  Assert.ok(await store.itemExists("f8830f91-5181-41c4-8123-54302ba44e2b"));
  Assert.ok(!(await store.itemExists("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")));
});

// Test that we create records with all of the expected properties. After
// creating each record, encrypt it and decrypt the encrypted text, so that
// we're testing what gets sent to the server, not just the object created.

add_task(async function testCreateCalDAVRecord() {
  let record = await store.createRecord(calDAVCalendar.id);
  record = await roundTripRecord(record, CalendarRecord);
  Assert.equal(record.id, calDAVCalendar.id);
  Assert.equal(record.name, "CalDAV Calendar");
  Assert.equal(record.type, "caldav");
  Assert.equal(record.url, "https://localhost/caldav");
  Assert.equal(record.username, "CalDAV User");
});

add_task(async function testCreateICSRecord() {
  let record = await store.createRecord(icsCalendar.id);
  record = await roundTripRecord(record, CalendarRecord);
  Assert.equal(record.id, icsCalendar.id);
  Assert.equal(record.name, "Ical Calendar");
  Assert.equal(record.type, "ics");
  Assert.equal(record.url, "https://localhost/ics");
  Assert.strictEqual(record.username, undefined);
});

add_task(async function testCreateCachedUnknownRecord() {
  let record = await store.createRecord("f8830f91-5181-41c4-8123-54302ba44e2b");
  record = await roundTripRecord(record, CalendarRecord);
  Assert.equal(record.id, "f8830f91-5181-41c4-8123-54302ba44e2b");
  Assert.equal(record.name, "Unknown Calendar");
  Assert.equal(record.type, "unknown");
  Assert.equal(record.url, "https://unknown.hostname/calendar");
  Assert.strictEqual(record.username, undefined);
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  let record = await store.createRecord(fakeID);
  record = await roundTripRecord(record, CalendarRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

// Test creating, updating, and deleting calendars from incoming records.

add_task(async function testSyncRecords() {
  const id = newUID();
  const data = {
    id,
    name: "Ical Calendar",
    type: "ics",
    url: "https://localhost/calendars/file.ics",
    username: "username",
  };

  await store.applyIncoming(CalendarRecord.from(data));

  Assert.equal(cal.manager.getCalendars().length, 5);
  let calendar = cal.manager.getCalendarById(id);
  Assert.equal(calendar.id, id);
  Assert.equal(calendar.name, "Ical Calendar");
  Assert.equal(calendar.type, "ics");
  Assert.equal(calendar.uri.spec, "https://localhost/calendars/file.ics");
  Assert.equal(calendar.getProperty("username"), "username");

  // Change the name and username.

  data.name = "Changed Ical Calendar";
  data.username = "changed username";
  await store.applyIncoming(CalendarRecord.from(data));

  Assert.equal(calendar.name, "Changed Ical Calendar");
  Assert.equal(calendar.uri.spec, "https://localhost/calendars/file.ics");
  Assert.strictEqual(calendar.getProperty("username"), "changed username");

  // Remove the username.

  delete data.username;
  await store.applyIncoming(CalendarRecord.from(data));

  Assert.strictEqual(calendar.getProperty("username"), null);

  // Change the calendar type. This should fail.

  await Assert.rejects(
    store.applyIncoming(CalendarRecord.from({ ...data, type: "caldav" })),
    /Refusing to change calendar type/,
    "changing the calendar type should fail"
  );

  // Change the calendar URL. This should fail.

  await Assert.rejects(
    store.applyIncoming(
      CalendarRecord.from({
        ...data,
        url: "https://localhost/calendars/changed.ics",
      })
    ),
    /Refusing to change calendar URL/,
    "changing the calendar URL should fail"
  );

  // Delete the calendar.

  await store.applyIncoming(CalendarRecord.from({ id, deleted: true }));

  Assert.equal(cal.manager.getCalendars().length, 4);
  calendar = cal.manager.getCalendarById(id);
  Assert.equal(calendar, null);
});

// Test things we don't understand.

/**
 * Tests a calendar type we don't know about.
 */
add_task(async function testSyncUnknownType() {
  const id = newUID();
  const data = {
    id,
    name: "XYZ Calendar",
    type: "xyz",
    url: "https://localhost/calendars/file.xyz",
    username: "username",
  };
  await store.applyIncoming(CalendarRecord.from(data));

  Assert.equal(cal.manager.getCalendars().length, 4);
  Assert.ok(!cal.manager.getCalendarById(id));

  await store.applyIncoming(CalendarRecord.from(data));

  await store.applyIncoming(CalendarRecord.from({ id, deleted: true }));

  Assert.equal(cal.manager.getCalendars().length, 4);
});

/**
 * Tests a calendar type we know about, but properties we don't know about.
 */
add_task(async function testSyncUnknownProperties() {
  const id = newUID();
  await store.applyIncoming(
    CalendarRecord.from({
      id,
      name: "Future Ical Calendar",
      type: "ics",
      url: "https://v999.hostname/calendars/file.ics",
      username: "username",
      extra: {},
      additional: "much data",
      more: "wow!",
    })
  );

  Assert.equal(cal.manager.getCalendars().length, 5);
  const calendar = cal.manager.getCalendarById(id);
  Assert.equal(calendar.id, id);
  Assert.equal(calendar.name, "Future Ical Calendar");
  Assert.equal(calendar.type, "ics");
  Assert.equal(calendar.uri.spec, "https://v999.hostname/calendars/file.ics");
  Assert.equal(calendar.getProperty("username"), "username");

  let record = await store.createRecord(id);
  record = await roundTripRecord(record, CalendarRecord);

  Assert.equal(record.id, id);
  Assert.equal(record.name, "Future Ical Calendar");
  Assert.equal(record.type, "ics");
  Assert.equal(record.url, "https://v999.hostname/calendars/file.ics");
  Assert.equal(record.username, "username");
  Assert.deepEqual(record.cleartext.extra, {});
  Assert.equal(record.cleartext.additional, "much data");
  Assert.equal(record.cleartext.more, "wow!");

  await store.applyIncoming(CalendarRecord.from({ id, deleted: true }));

  Assert.equal(cal.manager.getCalendars().length, 4);
});
