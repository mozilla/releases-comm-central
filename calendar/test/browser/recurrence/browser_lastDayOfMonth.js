/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { handleDeleteOccurrencePrompt } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);

var { menulistSelect } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { setCalendarView, dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;

add_task(async function testLastDayOfMonthRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2008, 1, 31); // Start with a leap year.

  // Create monthly recurring event.
  const eventBox = dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
  await saveAndCloseItemDialog(dialogWindow);

  // data tuple: [year, month, day, row in month view]
  // note: Month starts here with 1 for January.
  const checkingData = [
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
  for (const [y, m, d, correctRow] of checkingData) {
    const date = new Date(Date.UTC(y, m - 1, d));
    const column = date.getUTCDay() + 1;

    await CalendarTestUtils.goToDate(window, y, m, d);

    // day view
    await setCalendarView(window, "day");
    await dayView.waitForEventBoxAt(window, 1);

    // week view
    await setCalendarView(window, "week");
    await weekView.waitForEventBoxAt(window, column, 1);

    // multiweek view
    await setCalendarView(window, "multiweek");
    await multiweekView.waitForItemAt(window, 1, column, 1);

    // month view
    await setCalendarView(window, "month");
    await monthView.waitForItemAt(window, correctRow, column, 1);
  }

  // Delete event.
  await CalendarTestUtils.goToDate(
    window,
    checkingData[0][0],
    checkingData[0][1],
    checkingData[0][2]
  );
  await setCalendarView(window, "day");
  const box = await dayView.waitForEventBoxAt(window, 1);
  EventUtils.synthesizeMouseAtCenter(box, {}, window);
  await handleDeleteOccurrencePrompt(window, box, true);
  await dayView.waitForNoEventBoxAt(window, 1);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  const recurrenceDocument = recurrenceWindow.document;
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

  const button = recurrenceDocument.querySelector("dialog").getButton("accept");
  button.scrollIntoView();
  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(button, {}, recurrenceWindow);
}
