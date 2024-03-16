/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { updateAppInfo } = ChromeUtils.importESModule("resource://testing-common/AppInfo.sys.mjs");
updateAppInfo();

// The tests in this directory each do the same thing, with slight variations as needed for each
// calendar provider. The core of the test lives in this file and the tests call it when ready.

do_get_profile();
add_setup(async () => {
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));
  await new Promise(resolve => cal.timezoneService.startup({ onResult: resolve }));
  cal.manager.addCalendarObserver(calendarObserver);
});

const calendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  /* calIObserver */

  _batchCount: 0,
  _batchRequired: true,
  onStartBatch(calendar) {
    info(`onStartBatch ${calendar?.id} ${++this._batchCount}`);
    Assert.equal(calendar, this._expectedCalendar);
    Assert.equal(this._batchCount, 1, "onStartBatch must not occur in a batch");
  },
  onEndBatch(calendar) {
    info(`onEndBatch ${calendar?.id} ${this._batchCount--}`);
    Assert.equal(calendar, this._expectedCalendar);
    Assert.equal(this._batchCount, 0, "onEndBatch must occur in a batch");
  },
  onLoad(calendar) {
    info(`onLoad ${calendar.id}`);
    Assert.equal(this._batchCount, 0, "onLoad must not occur in a batch");
    Assert.equal(calendar, this._expectedCalendar);
    if (this._onLoadPromise) {
      this._onLoadPromise.resolve();
    }
  },
  onAddItem(item) {
    info(`onAddItem ${item.calendar.id} ${item.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onAddItem must occur in a batch");
    }
    if (this._onAddItemPromise) {
      this._onAddItemPromise.resolve();
    }
  },
  onModifyItem(newItem, oldItem) {
    info(`onModifyItem ${newItem.calendar.id} ${newItem.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onModifyItem must occur in a batch");
    }
    if (this._onModifyItemPromise) {
      this._onModifyItemPromise.resolve();
    }
  },
  onDeleteItem(deletedItem) {
    info(`onDeleteItem ${deletedItem.calendar.id} ${deletedItem.id}`);
    if (this._onDeleteItemPromise) {
      this._onDeleteItemPromise.resolve();
    }
  },
  onError(calendar, errNo, message) {},
  onPropertyChanged(calendar, name, value, oldValue) {},
  onPropertyDeleting(calendar, name) {},
};

/**
 * Create and register a calendar.
 *
 * @param {string} type - The calendar provider to use.
 * @param {string} url - URL of the server.
 * @param {boolean} useCache - Should this calendar have offline storage?
 * @returns {calICalendar}
 */
function createCalendar(type, url, useCache) {
  let calendar = cal.manager.createCalendar(type, Services.io.newURI(url));
  calendar.name = type + (useCache ? " with cache" : " without cache");
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", useCache);

  cal.manager.registerCalendar(calendar);
  calendar = cal.manager.getCalendarById(calendar.id);
  calendarObserver._expectedCalendar = calendar;

  info(`Created calendar ${calendar.id}`);
  return calendar;
}

/**
 * Creates an event and adds it to the given calendar.
 *
 * @param {calICalendar} calendar
 * @returns {calIEvent}
 */
async function runAddItem(calendar) {
  const event = new CalEvent();
  event.id = "6b7dd6f6-d6f0-4e93-a953-bb5473c4c47a";
  event.title = "New event";
  event.startDate = cal.createDateTime("20200303T205500Z");
  event.endDate = cal.createDateTime("20200303T210200Z");

  calendarObserver._onAddItemPromise = Promise.withResolvers();
  calendarObserver._onModifyItemPromise = Promise.withResolvers();
  await calendar.addItem(event);
  await Promise.any([
    calendarObserver._onAddItemPromise.promise,
    calendarObserver._onModifyItemPromise.promise,
  ]);

  return event;
}

/**
 * Modifies the event from runAddItem.
 *
 * @param {calICalendar} calendar
 */
async function runModifyItem(calendar) {
  const event = await calendar.getItem("6b7dd6f6-d6f0-4e93-a953-bb5473c4c47a");

  const clone = event.clone();
  clone.title = "Modified event";

  calendarObserver._onModifyItemPromise = Promise.withResolvers();
  await calendar.modifyItem(clone, event);
  await calendarObserver._onModifyItemPromise.promise;
}

/**
 * Deletes the event from runAddItem.
 *
 * @param {calICalendar} calendar
 */
async function runDeleteItem(calendar) {
  const event = await calendar.getItem("6b7dd6f6-d6f0-4e93-a953-bb5473c4c47a");

  calendarObserver._onDeleteItemPromise = Promise.withResolvers();
  await calendar.deleteItem(event);
  await calendarObserver._onDeleteItemPromise.promise;
}
