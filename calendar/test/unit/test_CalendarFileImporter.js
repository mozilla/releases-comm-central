/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { CalendarFileImporter } = ChromeUtils.importESModule(
  "resource:///modules/CalendarFileImporter.sys.mjs"
);

/**
 * Test CalendarFileImporter can import ics file correctly.
 */
async function test_importIcsFile() {
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
}

function run_test() {
  do_get_profile();

  add_test(() => {
    do_calendar_startup(async () => {
      await test_importIcsFile();
      run_next_test();
    });
  });
}
