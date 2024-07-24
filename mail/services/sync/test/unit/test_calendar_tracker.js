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

add_setup(async function () {
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));
  cal.manager.getCalendars();

  engine = new CalendarsEngine(Service);
  await engine.initialize();
  store = engine._store;
  tracker = engine._tracker;

  Assert.equal(tracker._isTracking, false, "tracker is disabled");
  await assertNoChangeTracked(tracker);

  tracker.start();
  Assert.equal(tracker._isTracking, true, "tracker is enabled");

  registerCleanupFunction(function () {
    tracker.stop();
  });
});

/**
 * Test creating, changing, and deleting a calendar that should be synced.
 */
add_task(async function testNetworkCalendar() {
  const id = newUID();
  const calendar = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("https://hostname:1234/a/calendar")
  );
  // Calendars aren't tracked until registered.
  calendar.id = id;
  calendar.name = "Calendar";
  calendar.setProperty("username", "username");
  cal.manager.registerCalendar(calendar);
  await assertChangeTracked(tracker, id);
  await assertNoChangeTracked(tracker);

  await checkPropertyChanges(tracker, calendar, [["name", "Changed Calendar"]]);
  calendar.setProperty("username", "changed username");
  await assertChangeTracked(tracker, id);

  // Change some untracked properties.

  calendar.setProperty("color", "#123456");
  calendar.setProperty("calendar-main-in-composite", true);
  await assertNoChangeTracked(tracker);

  cal.manager.unregisterCalendar(calendar);
  cal.manager.removeCalendar(calendar);
  let record = await assertChangeTracked(tracker, id);
  record = await roundTripRecord(record, CalendarRecord);
  Assert.ok(record.deleted, "record should be a tombstone record");
  await assertNoChangeTracked(tracker);
});

/**
 * Test a storage calendar. This shouldn't affect the tracker at all.
 */
add_task(async function testStorageCalendar() {
  const storageCalendar = cal.manager.createCalendar(
    "storage",
    Services.io.newURI("moz-storage-calendar://")
  );
  storageCalendar.name = "Sync Calendar";
  storageCalendar.id = newUID();
  cal.manager.registerCalendar(storageCalendar);
  await assertNoChangeTracked(tracker);

  storageCalendar.name = "changed name";
  storageCalendar.setProperty("color", "#123456");
  storageCalendar.setProperty("calendar-main-in-composite", true);
  await assertNoChangeTracked(tracker);

  cal.manager.unregisterCalendar(storageCalendar);
  cal.manager.removeCalendar(storageCalendar);
  await assertNoChangeTracked(tracker);
});

/**
 * Test the store methods on calendars. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming(
    CalendarRecord.from({
      id,
      name: "New Calendar",
      type: "ics",
      url: "https://localhost/ics",
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(
    CalendarRecord.from({
      id,
      name: "New Calendar (changed)",
      type: "ics",
      url: "https://localhost/ics",
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(CalendarRecord.from({ id, deleted: true }));
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);
});
