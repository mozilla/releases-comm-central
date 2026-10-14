/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an ICS calendar whose file does not parse as iCalendar is treated
 * as read-only, so that its contents are never overwritten, and that it
 * recovers once the file parses again.
 */

var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

do_get_profile();

const VALID_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:valid-file-event",
  "SUMMARY:Existing event",
  "DTSTART:20260301T120000Z",
  "DTEND:20260301T130000Z",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

/** Changes of the readOnly property reported to calendar observers. */
const readOnlyChanges = [];

const observer = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
  onStartBatch() {},
  onEndBatch() {},
  onLoad(calendar) {
    this._onLoad?.(calendar);
  },
  onAddItem() {},
  onModifyItem() {},
  onDeleteItem() {},
  onError() {},
  onPropertyChanged(calendar, name, value) {
    if (name == "readOnly") {
      readOnlyChanges.push(value);
    }
  },
  onPropertyDeleting() {},
};

add_setup(function () {
  cal.manager.addCalendarObserver(observer);
  registerCleanupFunction(() => cal.manager.removeCalendarObserver(observer));
});

/**
 * Run a function that makes the calendar load, and wait for the load to end.
 *
 * @param {string} id - The calendar ID.
 * @param {Function} func - Function that starts the load.
 */
async function loadAndWait(id, func) {
  const { promise, resolve } = Promise.withResolvers();
  observer._onLoad = calendar => {
    if (calendar.id == id) {
      resolve();
    }
  };
  func();
  await promise;
  observer._onLoad = null;
}

/**
 * Register an ICS calendar for a local file and wait for it to load.
 *
 * @param {string} contents - The initial contents of the file.
 * @returns {{calendar: calICalendar, path: string}}
 */
async function loadCalendarFromFile(contents) {
  const path = PathUtils.join(PathUtils.tempDir, `${cal.getUUID()}.ics`);
  await IOUtils.writeUTF8(path, contents);

  const calendar = cal.manager.createCalendar("ics", Services.io.newURI(PathUtils.toFileURI(path)));
  calendar.name = "invalid file test";
  calendar.id = cal.getUUID();
  readOnlyChanges.length = 0;
  await loadAndWait(calendar.id, () => cal.manager.registerCalendar(calendar));

  registerCleanupFunction(async () => {
    cal.manager.unregisterCalendar(calendar);
    await IOUtils.remove(path);
  });
  return { calendar: cal.manager.getCalendarById(calendar.id), path };
}

function createEvent() {
  const event = new CalEvent();
  event.id = cal.getUUID();
  event.title = "New event";
  event.startDate = cal.createDateTime("20260303T205500Z");
  event.endDate = cal.createDateTime("20260303T210200Z");
  return event;
}

add_task(async function test_invalidFileIsReadOnly() {
  const contents = "Important notes\nthat are not a calendar\n";
  const { calendar, path } = await loadCalendarFromFile(contents);

  Assert.ok(calendar.readOnly, "calendar with an invalid file should be read-only");
  Assert.deepEqual(readOnlyChanges, [true], "observers should be told it became read-only");
  Assert.equal(
    calendar.getProperty("currentStatus"),
    Ci.calIErrors.ICS_MALFORMEDDATA,
    "calendar should be in the error state"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue(`calendar.registry.${calendar.id}.readOnly`),
    "read-only state should not be persisted"
  );
  await Assert.rejects(
    calendar.addItem(createEvent()),
    e => e.result == Ci.calIErrors.CAL_IS_READONLY,
    "adding an item should be refused"
  );
  Assert.equal(await IOUtils.readUTF8(path), contents, "file should be unchanged");
});

add_task(async function test_fileBecomesInvalid() {
  const { calendar, path } = await loadCalendarFromFile(VALID_ICS);
  Assert.ok(!calendar.readOnly, "calendar with a valid file should be writable");

  const contents = "Important notes\nthat are not a calendar\n";
  await IOUtils.writeUTF8(path, contents);
  await loadAndWait(calendar.id, () => calendar.refresh());

  Assert.ok(calendar.readOnly, "calendar should be read-only once the file no longer parses");
  await Assert.rejects(
    calendar.addItem(createEvent()),
    e => e.result == Ci.calIErrors.CAL_IS_READONLY,
    "adding an item should be refused"
  );
  Assert.equal(await IOUtils.readUTF8(path), contents, "file should be unchanged");
});

add_task(async function test_invalidFileRecovers() {
  const { calendar, path } = await loadCalendarFromFile("Not a calendar\n");
  Assert.ok(calendar.readOnly, "calendar with an invalid file should be read-only");

  await IOUtils.writeUTF8(path, VALID_ICS);
  await loadAndWait(calendar.id, () => calendar.refresh());

  Assert.ok(!calendar.readOnly, "calendar should be writable once the file parses");
  Assert.deepEqual(
    readOnlyChanges,
    [true, false],
    "observers should be told it became read-only and then writable"
  );
  Assert.ok(
    Components.isSuccessCode(calendar.getProperty("currentStatus")),
    "calendar should no longer be in the error state"
  );
  Assert.ok(await calendar.getItem("valid-file-event"), "event from the file should be loaded");

  await calendar.addItem(createEvent());
  await TestUtils.waitForCondition(
    async () => (await IOUtils.readUTF8(path)).includes("New event"),
    "waiting for the new event to be written"
  );
  Assert.ok(
    (await IOUtils.readUTF8(path)).includes("valid-file-event"),
    "existing event should be kept when writing"
  );
});

add_task(async function test_persistedReadOnlyIsKept() {
  const { calendar, path } = await loadCalendarFromFile("Not a calendar\n");
  calendar.readOnly = true;
  readOnlyChanges.length = 0;

  await IOUtils.writeUTF8(path, VALID_ICS);
  await loadAndWait(calendar.id, () => calendar.refresh());

  Assert.ok(calendar.readOnly, "a calendar set read-only should stay read-only");
  Assert.deepEqual(readOnlyChanges, [], "observers should not be told of a change");
});

add_task(async function test_emptyFileIsWritable() {
  const { calendar, path } = await loadCalendarFromFile("");

  Assert.ok(!calendar.readOnly, "calendar with an empty file should be writable");
  await calendar.addItem(createEvent());
  await TestUtils.waitForCondition(
    async () => (await IOUtils.readUTF8(path)).includes("BEGIN:VEVENT"),
    "waiting for the event to be written"
  );
});

add_task(async function test_validFileIsWritable() {
  const { calendar } = await loadCalendarFromFile(VALID_ICS);

  Assert.ok(!calendar.readOnly, "calendar with a valid file should be writable");
  Assert.deepEqual(readOnlyChanges, [], "observers should not be told of a change");
  Assert.ok(await calendar.getItem("valid-file-event"), "existing event should be loaded");
});
