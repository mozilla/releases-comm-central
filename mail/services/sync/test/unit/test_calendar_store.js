/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

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

// TODO test caldav calendars

add_setup(async function () {
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));

  engine = new CalendarsEngine(Service);
  await engine.initialize();
  store = engine._store;

  calDAVCalendar = cal.manager.createCalendar(
    "caldav",
    Services.io.newURI("https://localhost/caldav")
  );
  calDAVCalendar.name = "CalDAV Calendar";
  cal.manager.registerCalendar(calDAVCalendar);

  icsCalendar = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("https://localhost/ics")
  );
  icsCalendar.name = "ICS Calendar";
  cal.manager.registerCalendar(icsCalendar);

  fileICSCalendar = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("file:///home/user/test.ics")
  );
  fileICSCalendar.name = "File ICS Calendar";
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
  });
});

add_task(async function testItemExists() {
  Assert.equal(await store.itemExists(calDAVCalendar.id), true);
  Assert.equal(await store.itemExists(icsCalendar.id), true);
});

add_task(async function testCreateCalDAVRecord() {
  const record = await store.createRecord(calDAVCalendar.id);
  Assert.ok(record instanceof CalendarRecord);
  Assert.equal(record.id, calDAVCalendar.id);
  Assert.equal(record.name, "CalDAV Calendar");
  Assert.equal(record.type, "caldav");
  Assert.equal(record.uri, "https://localhost/caldav");
  Assert.deepEqual(record.prefs, {});
});

add_task(async function testCreateICSRecord() {
  const record = await store.createRecord(icsCalendar.id);
  Assert.ok(record instanceof CalendarRecord);
  Assert.equal(record.id, icsCalendar.id);
  Assert.equal(record.name, "ICS Calendar");
  Assert.equal(record.type, "ics");
  Assert.equal(record.uri, "https://localhost/ics");
  Assert.deepEqual(record.prefs, {});
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  const record = await store.createRecord(fakeID);
  Assert.ok(record instanceof CalendarRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

add_task(async function testSyncRecords() {
  // Sync a new calendar.

  const newID = newUID();
  await store.applyIncoming({
    id: newID,
    name: "New ICS Calendar",
    type: "ics",
    uri: "https://localhost/newICS",
    prefs: {
      color: "#abcdef",
    },
  });

  Assert.equal(cal.manager.getCalendars().length, 5);
  let calendar = cal.manager.getCalendarById(newID);
  Assert.equal(calendar.id, newID);
  Assert.equal(calendar.name, "New ICS Calendar");
  Assert.equal(calendar.type, "ics");
  Assert.equal(calendar.uri.spec, "https://localhost/newICS");
  Assert.equal(calendar.getProperty("color"), "#abcdef");

  // Change the name and some properties.

  await store.applyIncoming({
    id: newID,
    name: "Changed ICS Calendar",
    type: "ics",
    uri: "https://localhost/changedICS",
    prefs: {
      color: "#123456",
      readOnly: true,
    },
  });

  Assert.equal(cal.manager.getCalendars().length, 5);
  calendar = cal.manager.getCalendarById(newID);
  Assert.equal(calendar.name, "Changed ICS Calendar");
  Assert.equal(calendar.type, "ics");
  Assert.equal(calendar.uri.spec, "https://localhost/changedICS");
  Assert.equal(calendar.getProperty("color"), "#123456");
  Assert.equal(calendar.getProperty("readOnly"), true);

  // Change the calendar type. This should fail.

  await Assert.rejects(
    store.applyIncoming({
      id: newID,
      name: "New CalDAV Calendar",
      type: "caldav",
      uri: "https://localhost/caldav",
      prefs: {
        color: "#123456",
        readOnly: true,
      },
    }),
    /Refusing to change calendar type/
  );

  // Enable the cache. This should fail.

  await Assert.rejects(
    store.applyIncoming({
      id: newID,
      name: "Changed ICS Calendar",
      type: "ics",
      uri: "https://localhost/changedICS",
      prefs: {
        cacheEnabled: true,
        color: "#123456",
        readOnly: true,
      },
    }),
    /Refusing to change the cache setting/
  );

  await store.applyIncoming({
    id: newID,
    deleted: true,
  });

  Assert.equal(cal.manager.getCalendars().length, 4);
  calendar = cal.manager.getCalendarById(newID);
  Assert.equal(calendar, null);
});
