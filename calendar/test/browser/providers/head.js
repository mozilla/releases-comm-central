/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

SimpleTest.requestCompleteLog();

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { handleDeleteOccurrencePrompt } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);

var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

const calendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  /* calIObserver */

  _batchCount: 0,
  _batchRequired: true,
  onStartBatch(calendar) {
    info(`onStartBatch ${calendar?.id} ${++this._batchCount}`);
    Assert.equal(
      calendar,
      this._expectedCalendar,
      "onStartBatch should occur on the expected calendar"
    );
  },
  onEndBatch(calendar) {
    info(`onEndBatch ${calendar?.id} ${this._batchCount--}`);
    Assert.equal(
      calendar,
      this._expectedCalendar,
      "onEndBatch should occur on the expected calendar"
    );
  },
  onLoad(calendar) {
    info(`onLoad ${calendar.id}`);
    Assert.equal(calendar, this._expectedCalendar, "onLoad should occur on the expected calendar");
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
  onModifyItem(newItem) {
    info(`onModifyItem ${newItem.calendar.id} ${newItem.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onModifyItem must occur in a batch");
    }
  },
  onDeleteItem(deletedItem) {
    info(`onDeleteItem ${deletedItem.calendar.id} ${deletedItem.id}`);
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
  calendar.setProperty("calendar-main-default", true);

  cal.manager.registerCalendar(calendar);
  calendar = cal.manager.getCalendarById(calendar.id);
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
  cal.manager.removeCalendar(calendar);
}

const alarmService = Cc["@mozilla.org/calendar/alarm-service;1"].getService(Ci.calIAlarmService);

const alarmObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIAlarmServiceObserver"]),

  /* calIAlarmServiceObserver */

  _alarmCount: 0,
  onAlarm() {
    info("onAlarm");
    this._alarmCount++;
  },
  onRemoveAlarmsByItem() {},
  onRemoveAlarmsByCalendar() {},
  onAlarmsLoaded() {},
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
  const today = cal.dtz.now();
  const start = today.clone();
  start.day++;
  start.hour = start.minute = start.second = 0;
  const end = start.clone();
  end.hour++;
  const repeatUntil = start.clone();
  repeatUntil.day += 15;

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToToday(window);
  Assert.equal(window.getUnifinderView().rowCount, 0, "there should be no events in the unifinder");

  alarmObserver._alarmCount = 0;

  const alarmDialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-alarm-dialog.xhtml",
    {
      async callback(alarmWindow) {
        info("Alarm dialog opened");
        const alarmDocument = alarmWindow.document;

        const list = alarmDocument.getElementById("alarm-richlist");
        const items = list.querySelectorAll(
          `richlistitem[is="calendar-alarm-widget-richlistitem"]`
        );
        await TestUtils.waitForCondition(() => items.length);
        Assert.equal(items.length, 1);

        await new Promise(resolve => alarmWindow.setTimeout(resolve, 500));

        const dismissButton = alarmDocument.querySelector("#alarm-dismiss-all-button");
        EventUtils.synthesizeMouseAtCenter(dismissButton, {}, alarmWindow);
      },
    }
  );
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window);
  await setData(dialogWindow, iframeWindow, {
    title: "test event",
    startdate: start,
    starttime: start,
    enddate: end,
    endtime: end,
    reminder: "2days",
    repeat: "weekly",
  });

  await saveAndCloseItemDialog(dialogWindow);
  await alarmDialogPromise;
  info("Alarm dialog closed");

  await new Promise(r => setTimeout(r, 2000));
  Assert.equal(window.getUnifinderView().rowCount, 1, "there should be one event in the unifinder");

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

  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editItemOccurrences(window, eventBox));
  await setData(dialogWindow, iframeWindow, {
    title: "modified test event",
    repeat: "weekly",
    repeatuntil: repeatUntil,
  });

  await saveAndCloseItemDialog(dialogWindow);

  Assert.equal(window.getUnifinderView().rowCount, 1, "there should be one event in the unifinder");

  Services.focus.focusedWindow = window;

  await new Promise(resolve => setTimeout(resolve, 2000));
  Assert.equal(
    [...Services.wm.getEnumerator("Calendar:AlarmWindow")].length,
    0,
    "alarm dialog should not reappear"
  );
  Assert.equal(alarmObserver._alarmCount, 0, "there should not be any remaining alarms");
  alarmObserver._alarmCount = 0;

  eventBox = await CalendarTestUtils.multiweekView.waitForItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.ok(!!eventBox.item.parentItem.alarmLastAck);

  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  window.calendarController.onSelectionChanged({ detail: window.currentView().getSelectedItems() });
  await handleDeleteOccurrencePrompt(window, window.currentView(), true);

  await CalendarTestUtils.multiweekView.waitForNoItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.equal(window.getUnifinderView().rowCount, 0, "there should be no events in the unifinder");
}

const syncItem1Name = "holy cow, a new item!";
const syncItem2Name = "a changed item";

const syncChangesTest = {
  async setUp() {
    await CalendarTestUtils.openCalendarTab(window);

    if (document.getElementById("today-pane-panel").collapsed) {
      EventUtils.synthesizeMouseAtCenter(
        document.getElementById("calendar-status-todaypane-button"),
        {}
      );
    }

    if (document.getElementById("agenda-panel").collapsed) {
      EventUtils.synthesizeMouseAtCenter(document.getElementById("today-pane-cycler-next"), {});
    }
  },

  get part1Item() {
    const today = cal.dtz.now();
    const start = today.clone();
    start.day += 9 - start.weekday;
    start.hour = 13;
    start.minute = start.second = 0;
    const end = start.clone();
    end.hour++;

    return CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:ad0850e5-8020-4599-86a4-86c90af4e2cd
      SUMMARY:${syncItem1Name}
      DTSTART:${start.icalString}
      DTEND:${end.icalString}
      END:VEVENT
      END:VCALENDAR
      `;
  },

  async runPart1() {
    await CalendarTestUtils.setCalendarView(window, "multiweek");
    await CalendarTestUtils.goToToday(window);

    // Sanity check that we have not already synchronized and that there is no
    // existing item.
    Assert.ok(
      !CalendarTestUtils.multiweekView.getItemAt(window, 2, 3, 1),
      "there should be no existing item in the calendar"
    );

    // Synchronize.
    EventUtils.synthesizeMouseAtCenter(document.getElementById("refreshCalendar"), {});

    // Verify that the item we added appears in the calendar view.
    const item = await CalendarTestUtils.multiweekView.waitForItemAt(window, 2, 3, 1);
    Assert.equal(item.item.title, syncItem1Name, "view should include newly-added item");

    // Verify that the today pane updates and shows the item we added.
    await TestUtils.waitForCondition(() => window.TodayPane.agenda.rowCount == 1);
    Assert.equal(
      getTodayPaneItemTitle(0),
      syncItem1Name,
      "today pane should include newly-added item"
    );
    Assert.ok(
      !window.TodayPane.agenda.rows[0].nextElementSibling,
      "there should be no additional items in the today pane"
    );
  },

  get part2Item() {
    const today = cal.dtz.now();
    const start = today.clone();
    start.day += 10 - start.weekday;
    start.hour = 9;
    start.minute = start.second = 0;
    const end = start.clone();
    end.hour++;

    return CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:ad0850e5-8020-4599-86a4-86c90af4e2cd
      SUMMARY:${syncItem2Name}
      DTSTART:${start.icalString}
      DTEND:${end.icalString}
      END:VEVENT
      END:VCALENDAR
      `;
  },

  async runPart2() {
    // Sanity check that we have not already synchronized and that there is no
    // existing item.
    Assert.ok(
      !CalendarTestUtils.multiweekView.getItemAt(window, 2, 4, 1),
      "there should be no existing item on the specified day"
    );

    // Synchronize.
    EventUtils.synthesizeMouseAtCenter(document.getElementById("refreshCalendar"), {});

    // Verify that the item has updated in the calendar view.
    await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 2, 3, 1);
    const item = await CalendarTestUtils.multiweekView.waitForItemAt(window, 2, 4, 1);
    Assert.equal(item.item.title, syncItem2Name, "view should show updated item");

    // Verify that the today pane updates and shows the updated item.
    await TestUtils.waitForCondition(
      () => window.TodayPane.agenda.rowCount == 1 && getTodayPaneItemTitle(0) != syncItem1Name
    );
    Assert.equal(getTodayPaneItemTitle(0), syncItem2Name, "today pane should show updated item");
    Assert.ok(
      !window.TodayPane.agenda.rows[0].nextElementSibling,
      "there should be no additional items in the today pane"
    );
  },

  async runPart3() {
    // Synchronize via the calendar context menu.
    await calendarListContextMenu(
      document.querySelector("#calendar-list > li:nth-child(2)"),
      "list-calendar-context-reload"
    );

    // Verify that the item is removed from the calendar view.
    await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 2, 3, 1);
    await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 2, 4, 1);

    // Verify that the item is removed from the today pane.
    await TestUtils.waitForCondition(() => window.TodayPane.agenda.rowCount == 0);
  },
};

function getTodayPaneItemTitle(idx) {
  const row = window.TodayPane.agenda.rows[idx];
  return row.querySelector(".agenda-listitem-title").textContent;
}

async function calendarListContextMenu(target, menuItem) {
  await new Promise(r => setTimeout(r));
  window.focus();
  await TestUtils.waitForCondition(
    () => Services.focus.focusedWindow == window,
    "waiting for window to be focused"
  );

  const contextMenu = document.getElementById("list-calendars-context-menu");
  const shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(target, { type: "contextmenu" });
  await shownPromise;

  if (menuItem) {
    const hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
    contextMenu.activateItem(document.getElementById(menuItem));
    await hiddenPromise;
  }
}
