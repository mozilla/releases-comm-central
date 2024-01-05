/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalDAVServer } = ChromeUtils.import("resource://testing-common/calendar/CalDAVServer.jsm");

add_setup(async function () {
  CalDAVServer.open();
  await CalDAVServer.putItemInternal(
    "5a9fa76c-93f3-4ad8-9f00-9e52aedd2821.ics",
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
});
registerCleanupFunction(() => CalDAVServer.close());

add_task(async function () {
  calendarObserver._onAddItemPromise = Promise.withResolvers();
  calendarObserver._onLoadPromise = Promise.withResolvers();
  const calendar = createCalendar("caldav", CalDAVServer.url, false);
  await calendarObserver._onAddItemPromise.promise;
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  Assert.ok(await calendar.getItem("5a9fa76c-93f3-4ad8-9f00-9e52aedd2821"));

  info("creating the item");
  calendarObserver._batchRequired = true;
  calendarObserver._onLoadPromise = Promise.withResolvers();
  await runAddItem(calendar);
  await calendarObserver._onLoadPromise.promise;

  info("modifying the item");
  calendarObserver._onLoadPromise = Promise.withResolvers();
  await runModifyItem(calendar);
  await calendarObserver._onLoadPromise.promise;

  info("deleting the item");
  await runDeleteItem(calendar);

  cal.manager.unregisterCalendar(calendar);
});

/**
 * Tests calendars that return status 404 for "current-user-privilege-set" are
 * not flagged read-only.
 */
add_task(async function testCalendarWithNoPrivSupport() {
  CalDAVServer.privileges = null;
  calendarObserver._onLoadPromise = Promise.withResolvers();

  const calendar = createCalendar("caldav", CalDAVServer.url, false);
  await calendarObserver._onLoadPromise.promise;
  info("calendar set-up complete");

  Assert.ok(!calendar.readOnly, "calendar was not marked read-only");

  cal.manager.unregisterCalendar(calendar);
});

/**
 * Tests modifyItem() does not hang when the server reports no actual
 * modifications were made.
 */
add_task(async function testModifyItemWithNoChanges() {
  const event = new CalEvent();
  const calendar = createCalendar("caldav", CalDAVServer.url, false);
  event.id = "6f6dd7b6-0fbd-39e4-359a-a74c4c3745bb";
  event.title = "A New Event";
  event.startDate = cal.createDateTime("20200303T205500Z");
  event.endDate = cal.createDateTime("20200303T210200Z");
  await calendar.addItem(event);

  const clone = event.clone();
  clone.title = "A Modified Event";

  const putItemInternal = CalDAVServer.putItemInternal;
  CalDAVServer.putItemInternal = () => {};

  const modifiedEvent = await calendar.modifyItem(clone, event);
  CalDAVServer.putItemInternal = putItemInternal;

  Assert.ok(modifiedEvent, "an event was returned");
  Assert.equal(modifiedEvent.title, event.title, "the un-modified event is returned");

  await calendar.deleteItem(modifiedEvent);
  cal.manager.unregisterCalendar(calendar);
});
