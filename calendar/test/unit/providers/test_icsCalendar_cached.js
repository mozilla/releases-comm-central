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
  const calendar = createCalendar("ics", ICSServer.url, true);
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

add_task(async function testConnectionError1() {
  await runConnectionError1(ICSServer, "ics", true);
});

add_task(async function testConnectionError2() {
  await runConnectionError2(ICSServer, "ics", true);
});

/**
 * Builds a VEVENT, recurring daily three times if `recurring` is set.
 *
 * @param {string} uid - The UID and summary to give the event.
 * @param {string} day - The day of April 2021 the event starts on.
 * @param {boolean} [recurring] - Whether to give it a recurrence rule.
 * @returns {string[]} The lines of the VEVENT.
 */
function buildVEvent(uid, day, recurring) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${uid}`,
    `DTSTART:202104${day}T120000Z`,
    `DTEND:202104${day}T130000Z`,
    ...(recurring ? ["RRULE:FREQ=DAILY;COUNT=3"] : []),
    "END:VEVENT",
  ];
}

// Two events the server keeps and two it drops, one of each recurring: a
// recurring event is read from the cache alone, a single one from the database.
const STAYING = [
  ...buildVEvent("staying-event", "01"),
  ...buildVEvent("staying-series", "01", true),
];
const GOING = [...buildVEvent("going-event", "02"), ...buildVEvent("going-series", "02", true)];

/**
 * Puts the given events on the server and subscribes to it with a cached
 * calendar.
 *
 * @param {string[]} events - The lines of the VEVENTs to serve.
 * @returns {calICalendar} The calendar, once it has finished loading.
 */
async function subscribeTo(events) {
  await putOnServer(events);
  calendarObserver._onLoadPromise = Promise.withResolvers();
  const calendar = createCalendar("ics", ICSServer.url, true);
  await calendarObserver._onLoadPromise.promise;
  calendar.setProperty("refreshInterval", "0");
  return calendar;
}

/**
 * Replaces what the server holds, the way another client would.
 *
 * @param {string[]} events - The lines of the VEVENTs to serve.
 */
async function putOnServer(events) {
  await ICSServer.putICSInternal(
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//Test//EN", ...events, "END:VCALENDAR"].join(
      "\r\n"
    )
  );
}

/**
 * Refreshes a calendar and waits for the synchronization to report back.
 *
 * @param {calICalendar} calendar
 */
async function refreshAndWait(calendar) {
  calendarObserver._onLoadPromise = Promise.withResolvers();
  calendar.refresh();
  await calendarObserver._onLoadPromise.promise;
}

/**
 * Returns the sorted ids of the items in a calendar.
 *
 * @param {calICalendar} calendar
 * @returns {string[]}
 */
async function idsInCalendar(calendar) {
  const items = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    null,
    null
  );
  return items.map(item => item.id).sort();
}

/**
 * Tests that a synchronization drops from the cache what the server no longer
 * has. It wipes the cache and refills it from what the server still offers.
 */
add_task(async function testServerDeletionDropsItemsFromTheCache() {
  const calendar = await subscribeTo([...STAYING, ...GOING]);
  try {
    Assert.deepEqual(
      await idsInCalendar(calendar),
      ["going-event", "going-series", "staying-event", "staying-series"],
      "all four events should have arrived in the cache"
    );

    info("deleting two of the events on the server");
    await putOnServer(STAYING);
    await refreshAndWait(calendar);

    Assert.deepEqual(
      await idsInCalendar(calendar),
      ["staying-event", "staying-series"],
      "the events deleted on the server should be gone from the cache"
    );
    Assert.equal(
      await calendar.getItem("going-event"),
      null,
      "the deleted event should not be found by its id either"
    );
  } finally {
    cal.manager.unregisterCalendar(calendar);
  }
});

/**
 * Tests that the refill of the cache waits for the wipe it follows. Asserted is
 * the order, not the end state - a wipe landing in the middle of a refill can
 * leave exactly the expected items behind.
 */
add_task(async function testRefillWaitsForTheWipe() {
  const calendar = await subscribeTo(STAYING);
  const storage = calendar.wrappedJSObject.mCachedCalendar.wrappedJSObject;
  const wipe = storage.deleteCalendar;
  const add = storage.addItem;
  Assert.equal(
    typeof wipe,
    "function",
    "the storage calendar should have a deleteCalendar method to hook"
  );
  Assert.equal(
    typeof add,
    "function",
    "the storage calendar should have an addItem method to hook"
  );

  const order = [];
  storage.deleteCalendar = async (...args) => {
    order.push("wipe start");
    await new Promise(resolve => do_timeout(250, resolve));
    const result = await wipe.apply(storage, args);
    order.push("wipe end");
    return result;
  };
  storage.addItem = (...args) => {
    order.push("add");
    return add.apply(storage, args);
  };

  try {
    await putOnServer(STAYING);
    await refreshAndWait(calendar);

    Assert.deepEqual(
      order.slice(0, 2),
      ["wipe start", "wipe end"],
      "the cache should be refilled only after the wipe has finished"
    );
    Assert.deepEqual(
      await idsInCalendar(calendar),
      ["staying-event", "staying-series"],
      "the events the server still has should survive the wipe"
    );
  } finally {
    delete storage.deleteCalendar;
    delete storage.addItem;
    cal.manager.unregisterCalendar(calendar);
  }
});
