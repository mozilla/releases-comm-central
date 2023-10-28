/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalendarsEngine } = ChromeUtils.importESModule(
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

  Assert.equal(tracker.score, 0);
  Assert.equal(tracker._isTracking, false);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  tracker.start();
  Assert.equal(tracker._isTracking, true);
});

/**
 * Test creating, changing, and deleting a calendar that should be synced.
 */
add_task(async function testNetworkCalendar() {
  Assert.equal(tracker.score, 0);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  const id = newUID();
  const calendar = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("https://localhost:1234/a/calendar")
  );
  calendar.name = "Sync Calendar";
  calendar.id = id;
  cal.manager.registerCalendar(calendar);
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  tracker.resetScore();
  Assert.equal(tracker.score, 0);

  calendar.name = "changed name";
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  calendar.setProperty("color", "#123456");
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  calendar.setProperty("calendar-main-in-composite", true);
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  cal.manager.unregisterCalendar(calendar);
  cal.manager.removeCalendar(calendar);
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();
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
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  storageCalendar.name = "changed name";
  storageCalendar.setProperty("color", "#123456");
  storageCalendar.setProperty("calendar-main-in-composite", true);
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  cal.manager.unregisterCalendar(storageCalendar);
  cal.manager.removeCalendar(storageCalendar);
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);
});

/**
 * Test the store methods on calendars. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    name: "New Calendar",
    type: "ics",
    uri: "https://localhost/ics",
    prefs: {},
  });
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  tracker.clearChangedIDs();
  tracker.resetScore();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    name: "New Calendar (changed)",
    type: "ics",
    uri: "https://localhost/ics",
    prefs: {},
  });
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    deleted: true,
  });
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);
});
