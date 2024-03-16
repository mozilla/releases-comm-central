/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ICSServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ICSServer.sys.mjs"
);

ICSServer.open();
ICSServer.putICSInternal(
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
registerCleanupFunction(() => ICSServer.close());

add_task(async function () {
  calendarObserver._onAddItemPromise = Promise.withResolvers();
  calendarObserver._onLoadPromise = Promise.withResolvers();
  const calendar = createCalendar("ics", ICSServer.url, false);
  await calendarObserver._onAddItemPromise.promise;
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  Assert.ok(await calendar.getItem("5a9fa76c-93f3-4ad8-9f00-9e52aedd2821"));

  info("creating the item");
  calendarObserver._onLoadPromise = Promise.withResolvers();
  await runAddItem(calendar);
  await calendarObserver._onLoadPromise.promise;

  info("modifying the item");
  calendarObserver._onLoadPromise = Promise.withResolvers();
  await runModifyItem(calendar);
  await calendarObserver._onLoadPromise.promise;

  info("deleting the item");
  calendarObserver._onLoadPromise = Promise.withResolvers();
  await runDeleteItem(calendar);
  await calendarObserver._onLoadPromise.promise;
});
