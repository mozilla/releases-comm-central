/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

SimpleTest.requestCompleteLog();

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarTestUtils.jsm"
);
var {
  controller,
  goToDate,
  handleOccurrencePrompt,
  invokeEditingRepeatEventDialog,
  invokeNewEventDialog,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { PromiseUtils } = ChromeUtils.import("resource://gre/modules/PromiseUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

let manager = cal.getCalendarManager();

let calendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  /* calIObserver */

  _batchCount: 0,
  _batchRequired: true,
  onStartBatch(calendar) {
    info(`onStartBatch ${calendar?.id} ${++this._batchCount}`);
    Assert.equal(calendar, this._expectedCalendar);
  },
  onEndBatch(calendar) {
    info(`onEndBatch ${calendar?.id} ${this._batchCount--}`);
    Assert.equal(calendar, this._expectedCalendar);
  },
  onLoad(calendar) {
    info(`onLoad ${calendar.id}`);
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
  },
  onModifyItem(newItem, oldItem) {
    info(`onModifyItem ${newItem.calendar.id} ${newItem.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onModifyItem must occur in a batch");
    }
  },
  onDeleteItem(deletedItem) {
    info(`onDeleteItem ${deletedItem.calendar.id} ${deletedItem.id}`);
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
  let calendar = manager.createCalendar(type, Services.io.newURI(url));
  calendar.name = type + (useCache ? " with cache" : " without cache");
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", useCache);

  manager.registerCalendar(calendar);
  calendar = manager.getCalendarById(calendar.id);
  calendarObserver._expectedCalendar = calendar;
  calendar.addObserver(calendarObserver);

  info(`Created calendar ${calendar.id}`);
  return calendar;
}

/**
 * Unregister a calendar.
 *
 * @param {calICalendar} calendar
 */
function removeCalendar(calendar) {
  calendar.removeObserver(calendarObserver);
  manager.removeCalendar(calendar);
}

let alarmService = Cc["@mozilla.org/calendar/alarm-service;1"].getService(Ci.calIAlarmService);

let alarmObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIAlarmServiceObserver"]),

  /* calIAlarmServiceObserver */

  _alarmCount: 0,
  onAlarm(item, alarm) {
    info("onAlarm");
    this._alarmCount++;
  },
  onRemoveAlarmsByItem(item) {},
  onRemoveAlarmsByCalendar(calendar) {},
  onAlarmsLoaded(calendar) {},
};
alarmService.addObserver(alarmObserver);
registerCleanupFunction(async () => {
  alarmService.removeObserver(alarmObserver);
});

/**
 * Tests the creation, firing, dismissal, modification and deletion of an event with an alarm.
 * Also checks that the number of events in the unifinder is correct at each stage.
 *
 * Passing this test requires the active calendar to fire notifications in the correct sequence.
 */
async function runTestAlarms() {
  let today = cal.dtz.now();
  let start = today.clone();
  start.day++;
  start.hour = start.minute = start.second = 0;
  let end = start.clone();
  end.hour++;
  let repeatUntil = start.clone();
  repeatUntil.day += 15;

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  goToDate(controller, today.year, today.month + 1, today.day);
  Assert.equal(window.unifinderTreeView.rowCount, 0, "unifinder event count");

  alarmObserver._alarmCount = 0;

  await invokeNewEventDialog(controller, null, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: "test event",
      startdate: start,
      starttime: start,
      enddate: end,
      endtime: end,
      reminder: "2days",
      repeat: "weekly",
    });

    saveAndCloseItemDialog(eventWindow);
  });
  await BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-alarm-dialog.xhtml",
    {
      async callback(alarmWindow) {
        info("Alarm dialog opened");
        let alarmDocument = alarmWindow.document;

        let list = alarmDocument.getElementById("alarm-richlist");
        let items = list.querySelectorAll(`richlistitem[is="calendar-alarm-widget-richlistitem"]`);
        await TestUtils.waitForCondition(() => items.length);
        Assert.equal(items.length, 1);

        await new Promise(resolve => alarmWindow.setTimeout(resolve, 500));

        let dismissButton = alarmDocument.querySelector("#alarm-dismiss-all-button");
        EventUtils.synthesizeMouseAtCenter(dismissButton, {}, alarmWindow);
      },
    }
  );
  Services.focus.focusedWindow = window;
  info("Alarm dialog closed");

  await new Promise(r => setTimeout(r, 2000));
  Assert.equal(window.unifinderTreeView.rowCount, 1, "unifinder event count");

  Assert.equal(
    [...Services.wm.getEnumerator("Calendar:AlarmWindow")].length,
    0,
    "alarm dialog did not reappear"
  );
  Assert.equal(alarmObserver._alarmCount, 1, "only one alarm");
  alarmObserver._alarmCount = 0;

  let eventBox = await CalendarTestUtils.multiweekView.waitForItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.ok(!!eventBox.item.parentItem.alarmLastAck);

  await invokeEditingRepeatEventDialog(
    controller,
    eventBox,
    async (eventWindow, iframeWindow) => {
      await setData(eventWindow, iframeWindow, {
        title: "modified test event",
        repeat: "weekly",
        repeatuntil: repeatUntil,
      });

      saveAndCloseItemDialog(eventWindow);
    },
    true
  );

  Assert.equal(window.unifinderTreeView.rowCount, 1, "unifinder event count");

  Services.focus.focusedWindow = window;

  controller.sleep(2000);
  Assert.equal(
    [...Services.wm.getEnumerator("Calendar:AlarmWindow")].length,
    0,
    "alarm dialog did not reappear"
  );
  Assert.equal(alarmObserver._alarmCount, 0, "only one alarm");
  alarmObserver._alarmCount = 0;

  eventBox = await CalendarTestUtils.multiweekView.waitForItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.ok(!!eventBox.item.parentItem.alarmLastAck);

  controller.click(eventBox);
  eventBox.focus();
  window.calendarController.onSelectionChanged({ detail: window.currentView().getSelectedItems() });
  handleOccurrencePrompt(controller, window.currentView(), "delete", true);

  await CalendarTestUtils.multiweekView.waitForNoItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.equal(window.unifinderTreeView.rowCount, 0, "unifinder event count");
}
