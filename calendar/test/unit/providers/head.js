/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);
var { updateAppInfo } = ChromeUtils.importESModule("resource://testing-common/AppInfo.sys.mjs");

var { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");

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
  onModifyItem(newItem) {
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
  onError() {},
  onPropertyChanged() {},
  onPropertyDeleting() {},
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
  calendar.setProperty("username", "alice");

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

/**
 * Tests what happens when a calendar has a connection error. This simulates
 * what happens if Thunderbird is running when the server disappears.
 */
async function runConnectionError1(server, type, useCache) {
  calendarObserver._onLoadPromise = Promise.withResolvers();
  const calendar = createCalendar(type, `${server.origin}/calendars/alice/test/`, useCache);
  await calendarObserver._onLoadPromise.promise;

  info("refreshing with the server down");
  MockAlertsService.init();
  const shownPromise = MockAlertsService.promiseShown();
  server.close();
  calendar.refresh();
  await shownPromise;
  // Here we'd wait for an onLoad notification, but some calendars do this and some don't.
  await new Promise(resolve => do_timeout(150, resolve));

  Assert.equal(
    MockAlertsService.alert.imageURL,
    AppConstants.platform == "macosx" ? "" : "chrome://branding/content/icon48.png"
  );
  Assert.equal(
    MockAlertsService.alert.title,
    calendar.name,
    "the alert title should be the calendar name"
  );
  Assert.stringContains(
    MockAlertsService.alert.text,
    "localhost",
    "the alert text should include the hostname of the server"
  );
  Assert.stringContains(
    MockAlertsService.alert.text,
    "the connection was refused",
    "the alert text should state the problem"
  );

  Assert.equal(calendar.getProperty("currentStatus"), Ci.calIErrors.READ_FAILED);

  info("refreshing with the server back up");
  const closedPromise = MockAlertsService.promiseClosed();
  calendarObserver._onLoadPromise = Promise.withResolvers();
  server.open();
  calendar.refresh();
  await Promise.all([calendarObserver._onLoadPromise.promise, closedPromise]);
  Assert.equal(calendar.getProperty("currentStatus"), Cr.NS_OK);

  cal.manager.unregisterCalendar(calendar);
  MockAlertsService.cleanup();
}

/**
 * Tests what happens when a calendar has a connection error. This simulates
 * what happens if Thunderbird starts after the server disappears.
 */
async function runConnectionError2(server, type, useCache) {
  const origin = server.origin;
  info("setting up with the server down");
  const shownPromise = MockAlertsService.promiseShown();
  server.close();
  MockAlertsService.init();

  const calendar = createCalendar(type, `${origin}/calendars/alice/test/`, useCache);
  await shownPromise;
  // Here we'd wait for an onLoad notification, but some calendars do this and some don't.
  await new Promise(resolve => do_timeout(150, resolve));
  Assert.equal(
    MockAlertsService.alert.imageURL,
    AppConstants.platform == "macosx" ? "" : "chrome://branding/content/icon48.png"
  );
  Assert.equal(
    MockAlertsService.alert.title,
    calendar.name,
    "the alert title should be the calendar name"
  );
  Assert.stringContains(
    MockAlertsService.alert.text,
    "localhost",
    "the alert text should include the hostname of the server"
  );
  Assert.stringContains(
    MockAlertsService.alert.text,
    "the connection was refused",
    "the alert text should state the problem"
  );

  Assert.equal(calendar.getProperty("currentStatus"), Ci.calIErrors.READ_FAILED);

  info("refreshing with the server back up");
  const closedPromise = MockAlertsService.promiseClosed();
  calendarObserver._onLoadPromise = Promise.withResolvers();
  server.open();
  calendar.refresh();
  await Promise.all([calendarObserver._onLoadPromise.promise, closedPromise]);
  Assert.equal(calendar.getProperty("currentStatus"), Cr.NS_OK);

  cal.manager.unregisterCalendar(calendar);
  MockAlertsService.cleanup();
}
