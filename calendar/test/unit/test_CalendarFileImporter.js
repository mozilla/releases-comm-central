/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { CalendarFileImporter } = ChromeUtils.importESModule(
  "resource:///modules/CalendarFileImporter.sys.mjs"
);

add_setup(async function() {
  do_get_profile();
  await new Promise(resolve => {
    do_calendar_startup(resolve);
  });
});

add_task(async function test_importIcsFileUTF8() {
  const importer = new CalendarFileImporter();

  // Parse items from ics file should work.
  const items = await importer.parseIcsFile(do_get_file("data/import.ics"));
  equal(items.length, 4);

  // Create a temporary calendar.
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  // Put items to the temporary calendar should work.
  await importer.startImport(items, calendar);
  const result = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20190101T000000"),
    cal.createDateTime("20190102T000000")
  );
  equal(result.length, 4);

  // Check for title "Event Två".
  Assert.ok(result.find(e => e.title == "Event Två"), "should find the event")
})

/**
 * Test CalendarFileImporter can import a ics file encoded in charset=iso-8859-1.
 */
add_task(async function test_importIcsFileLatin1() {
  const importer = new CalendarFileImporter();

  // Parse items from ics file should work.
  const items = await importer.parseIcsFile(do_get_file("data/importLatin1.ics"));
  equal(items.length, 4);

  // Create a temporary calendar.
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  // Put items to the temporary calendar should work.
  await importer.startImport(items, calendar);
  const result = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20190101T000000"),
    cal.createDateTime("20190102T000000")
  );
  equal(result.length, 4);

  // Check for title "Event Två".
  Assert.ok(result.find(e => e.title == "Event Två"), "should find the event");
});


