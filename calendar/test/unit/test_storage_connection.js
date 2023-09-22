/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  do_get_profile();
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));
});

/**
 * Tests that local storage calendars share a database connection.
 */
add_task(async function testLocal() {
  const localCalendarA = cal.manager.createCalendar(
    "storage",
    Services.io.newURI(`moz-storage-calendar://`)
  );
  localCalendarA.id = cal.getUUID();
  const dbA = localCalendarA.wrappedJSObject.mStorageDb.db;

  const localCalendarB = cal.manager.createCalendar(
    "storage",
    Services.io.newURI(`moz-storage-calendar://`)
  );
  localCalendarB.id = cal.getUUID();
  const dbB = localCalendarB.wrappedJSObject.mStorageDb.db;

  Assert.equal(
    dbA.databaseFile.path,
    PathUtils.join(PathUtils.profileDir, "calendar-data", "local.sqlite"),
    "local calendar A uses the right database file"
  );
  Assert.equal(
    dbB.databaseFile.path,
    PathUtils.join(PathUtils.profileDir, "calendar-data", "local.sqlite"),
    "local calendar B uses the right database file"
  );
  Assert.equal(dbA, dbB, "local calendars share a database connection");
});

/**
 * Tests that local storage calendars using the same specified database file share a connection,
 * and that local storage calendars with a different specified database file do not.
 */
add_task(async function testLocalFile() {
  const testFileA = new FileUtils.File(PathUtils.join(PathUtils.tempDir, "file-a.sqlite"));
  const testFileB = new FileUtils.File(PathUtils.join(PathUtils.tempDir, "file-b.sqlite"));

  const fileCalendarA = cal.manager.createCalendar("storage", Services.io.newFileURI(testFileA));
  fileCalendarA.id = cal.getUUID();
  const dbA = fileCalendarA.wrappedJSObject.mStorageDb.db;

  const fileCalendarB = cal.manager.createCalendar("storage", Services.io.newFileURI(testFileB));
  fileCalendarB.id = cal.getUUID();
  const dbB = fileCalendarB.wrappedJSObject.mStorageDb.db;

  const fileCalendarC = cal.manager.createCalendar("storage", Services.io.newFileURI(testFileA));
  fileCalendarC.id = cal.getUUID();
  const dbC = fileCalendarC.wrappedJSObject.mStorageDb.db;

  Assert.equal(
    dbA.databaseFile.path,
    testFileA.path,
    "local calendar A uses the right database file"
  );
  Assert.equal(
    dbB.databaseFile.path,
    testFileB.path,
    "local calendar B uses the right database file"
  );
  Assert.equal(
    dbC.databaseFile.path,
    testFileA.path,
    "local calendar C uses the right database file"
  );
  Assert.notEqual(
    dbA,
    dbB,
    "calendars with different file URLs do not share a database connection"
  );
  Assert.notEqual(
    dbB,
    dbC,
    "calendars with different file URLs do not share a database connection"
  );
  Assert.equal(dbA, dbC, "calendars with matching file URLs share a database connection");
});

/**
 * Tests that cached network calendars share a database connection.
 */
add_task(async function testNetwork() {
  // Pretend to be offline so connecting to calendars that don't exist doesn't throw errors.
  Services.io.offline = true;

  let networkCalendarA = cal.manager.createCalendar(
    "ics",
    Services.io.newURI("http://localhost/ics")
  );
  networkCalendarA.id = cal.getUUID();
  networkCalendarA.setProperty("cache.enabled", true);
  cal.manager.registerCalendar(networkCalendarA);
  networkCalendarA = cal.manager.getCalendarById(networkCalendarA.id);
  const dbA = networkCalendarA.wrappedJSObject.mCachedCalendar.wrappedJSObject.mStorageDb.db;

  let networkCalendarB = cal.manager.createCalendar(
    "caldav",
    Services.io.newURI("http://localhost/caldav")
  );
  networkCalendarB.id = cal.getUUID();
  networkCalendarB.setProperty("cache.enabled", true);
  cal.manager.registerCalendar(networkCalendarB);
  networkCalendarB = cal.manager.getCalendarById(networkCalendarB.id);
  const dbB = networkCalendarB.wrappedJSObject.mCachedCalendar.wrappedJSObject.mStorageDb.db;

  Assert.equal(
    dbA.databaseFile.path,
    PathUtils.join(PathUtils.profileDir, "calendar-data", "cache.sqlite"),
    "network calendar A uses the right database file"
  );
  Assert.equal(
    dbB.databaseFile.path,
    PathUtils.join(PathUtils.profileDir, "calendar-data", "cache.sqlite"),
    "network calendar B uses the right database file"
  );
  Assert.equal(dbA, dbB, "network calendars share a database connection");
});
