/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  invokeNewEventDialog,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");

var { menulistSelect } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { setCalendarView, dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;

add_task(async function testLastDayOfMonthRecurrence() {
  createCalendar(controller, CALENDARNAME);
  await setCalendarView(controller.window, "day");
  goToDate(controller, 2008, 1, 31); // Start with a leap year.

  // Create monthly recurring event.
  let eventBox = dayView.getHourBoxAt(controller.window, HOUR);
  await invokeNewEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
    await saveAndCloseItemDialog(eventWindow);
  });

  // data tuple: [year, month, day, row in month view]
  // note: Month starts here with 1 for January.
  let checkingData = [
    [2008, 1, 31, 5],
    [2008, 2, 29, 5],
    [2008, 3, 31, 6],
    [2008, 4, 30, 5],
    [2008, 5, 31, 5],
    [2008, 6, 30, 5],
    [2008, 7, 31, 5],
    [2008, 8, 31, 6],
    [2008, 9, 30, 5],
    [2008, 10, 31, 5],
    [2008, 11, 30, 6],
    [2008, 12, 31, 5],
    [2009, 1, 31, 5],
    [2009, 2, 28, 4],
    [2009, 3, 31, 5],
  ];
  // Check all dates.
  for (let [y, m, d, correctRow] of checkingData) {
    let date = new Date(Date.UTC(y, m - 1, d));
    let column = date.getUTCDay() + 1;

    goToDate(controller, y, m, d);

    // day view
    await setCalendarView(controller.window, "day");
    await dayView.waitForEventBoxAt(controller.window, 1);

    // week view
    await setCalendarView(controller.window, "week");
    await weekView.waitForEventBoxAt(controller.window, column, 1);

    // multiweek view
    await setCalendarView(controller.window, "multiweek");
    await multiweekView.waitForItemAt(controller.window, 1, column, 1);

    // month view
    await setCalendarView(controller.window, "month");
    await monthView.waitForItemAt(controller.window, correctRow, column, 1);
  }

  // Delete event.
  goToDate(controller, checkingData[0][0], checkingData[0][1], checkingData[0][2]);
  await setCalendarView(controller.window, "day");
  let box = await dayView.waitForEventBoxAt(controller.window, 1);
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  await dayView.waitForNoEventBoxAt(controller.window, 1);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  let recurrenceDocument = recurrenceWindow.document;
  // monthly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "2");

  // last day of month
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.getElementById("montly-period-relative-date-radio"),
    {},
    recurrenceWindow
  );
  await menulistSelect(recurrenceDocument.getElementById("monthly-ordinal"), "-1");
  await menulistSelect(recurrenceDocument.getElementById("monthly-weekday"), "-1");

  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.querySelector("dialog").getButton("accept"),
    {},
    recurrenceWindow
  );
}

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
