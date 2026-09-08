/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { formatDate, menulistSelect, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { dayView, monthView } = CalendarTestUtils;

const UNTIL = cal.createDateTime("20250111"); // Second Saturday of January.
const HOUR = 8;

/**
 * Tests that the last occurrence of an all-day event is not dropped, the until
 * date being inclusive (bug 1917314).
 */
add_task(async function testMonthlyUntilAllDayRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2024, 10, 12); // Second Saturday of October.

  const eventBox = dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, {
    title: "Event",
    allday: true,
    repeat: setRecurrence,
  });
  await saveAndCloseItemDialog(dialogWindow);

  const items = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    null,
    null
  );
  const [rule] = items[0].recurrenceInfo.getRecurrenceItems();
  Assert.equal(
    rule.untilDate.icalString,
    "20250111",
    "the until date should be the date entered in the recurrence dialog"
  );

  // Each second Saturday from October to January should have an occurrence,
  // the one on the until date included. All of them are in the second row of
  // the month view, on the last day of the week.
  await CalendarTestUtils.setCalendarView(window, "month");
  for (const [year, month, day] of [
    [2024, 10, 12],
    [2024, 11, 9],
    [2024, 12, 14],
    [2025, 1, 11],
  ]) {
    await CalendarTestUtils.goToDate(window, year, month, day);
    await monthView.waitForItemAt(window, 2, 7, 1);
  }

  // February is past the until date.
  await CalendarTestUtils.goToDate(window, 2025, 2, 8);
  await monthView.waitForNoItemAt(window, 2, 7, 1);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  await SimpleTest.promiseFocus(recurrenceWindow);
  const recurrenceDocument = recurrenceWindow.document;

  // Monthly.
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "2");

  // "The second Saturday", already preselected from the start date.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.getElementById("montly-period-relative-date-radio"),
    {},
    recurrenceWindow
  );

  // Set until date.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.getElementById("recurrence-range-until"),
    {},
    recurrenceWindow
  );

  // Delete previous date.
  const untilInput = recurrenceDocument.getElementById("repeat-until-date");
  untilInput.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, recurrenceWindow);
  untilInput.focus();
  EventUtils.synthesizeKey("KEY_Delete", {}, recurrenceWindow);

  EventUtils.sendString(formatDate(UNTIL), recurrenceWindow);

  // Move focus to ensure the date is selected.
  untilInput.focus();
  EventUtils.synthesizeKey("KEY_Tab", {}, recurrenceWindow);
}
