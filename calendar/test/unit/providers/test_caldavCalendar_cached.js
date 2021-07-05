/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalDAVServer } = ChromeUtils.import("resource://testing-common/calendar/CalDAVServer.jsm");

CalDAVServer.open();
CalDAVServer.putItemInternal(
  "testfile.ics",
  CalendarTestUtils.dedent`
    BEGIN:VCALENDAR
    BEGIN:VEVENT
    UID:5a9fa76c-93f3-4ad8-9f00-9e52aedd2821
    SUMMARY:exists before time
    DTSTART:20210401T120000Z
    DTEND:20210401T130000Z
    END:VEVENT
    END:VCALENDAR
    `
);
registerCleanupFunction(() => CalDAVServer.close());

add_task(async function() {
  calendarObserver._onAddItemPromise = PromiseUtils.defer();
  calendarObserver._onLoadPromise = PromiseUtils.defer();
  let calendar = createCalendar("caldav", CalDAVServer.url, true);
  await calendarObserver._onAddItemPromise.promise;
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  Assert.ok(await getItem(calendar, "5a9fa76c-93f3-4ad8-9f00-9e52aedd2821"));

  info("creating the item");
  calendarObserver._batchRequired = true;
  calendarObserver._onLoadPromise = PromiseUtils.defer();
  await runAddItem(calendar);
  await calendarObserver._onLoadPromise.promise;

  info("modifying the item");
  calendarObserver._onLoadPromise = PromiseUtils.defer();
  await runModifyItem(calendar);
  await calendarObserver._onLoadPromise.promise;

  info("deleting the item");
  await runDeleteItem(calendar);
});
