/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { handleDeleteOccurrencePrompt } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);

var { formatDate, menulistSelect, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const ENDDATE = cal.createDateTime("20090126T000000Z"); // Last Monday in month.
const HOUR = 8;

add_task(async function testWeeklyUntilRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5); // Monday

  // Create weekly recurring event.
  const eventBox = dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
  await saveAndCloseItemDialog(dialogWindow);

  // Check day view.
  for (let week = 0; week < 3; week++) {
    // Monday
    await dayView.waitForEventBoxAt(window, 1);
    await CalendarTestUtils.calendarViewForward(window, 2);

    // Wednesday
    await dayView.waitForEventBoxAt(window, 1);
    await CalendarTestUtils.calendarViewForward(window, 2);

    // Friday
    await dayView.waitForEventBoxAt(window, 1);
    await CalendarTestUtils.calendarViewForward(window, 3);
  }

  // Monday, last occurrence
  await dayView.waitForEventBoxAt(window, 1);
  await CalendarTestUtils.calendarViewForward(window, 2);

  // Wednesday
  await dayView.waitForNoEventBoxAt(window, 1);

  // Check week view.
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);
  for (let week = 0; week < 3; week++) {
    // Monday
    await weekView.waitForEventBoxAt(window, 2, 1);

    // Wednesday
    await weekView.waitForEventBoxAt(window, 4, 1);

    // Friday
    await weekView.waitForEventBoxAt(window, 6, 1);

    await CalendarTestUtils.calendarViewForward(window, 1);
  }

  // Monday, last occurrence
  await weekView.waitForEventBoxAt(window, 2, 1);
  // Wednesday
  await weekView.waitForNoEventBoxAt(window, 4, 1);

  // Check multiweek view.
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);
  for (let week = 1; week < 4; week++) {
    // Monday
    await multiweekView.waitForItemAt(window, week, 2, 1);
    // Wednesday
    await multiweekView.waitForItemAt(window, week, 4, 1);
    // Friday
    await multiweekView.waitForItemAt(window, week, 6, 1);
  }

  // Monday, last occurrence
  await multiweekView.waitForItemAt(window, 4, 2, 1);

  // Wednesday
  await multiweekView.waitForNoItemAt(window, 4, 4, 1);

  // Check month view.
  await CalendarTestUtils.setCalendarView(window, "month");
  await CalendarTestUtils.goToDate(window, 2009, 1, 5);
  // starts on week 2 in month-view
  for (let week = 2; week < 5; week++) {
    // Monday
    await monthView.waitForItemAt(window, week, 2, 1);
    // Wednesday
    await monthView.waitForItemAt(window, week, 4, 1);
    // Friday
    await monthView.waitForItemAt(window, week, 6, 1);
  }

  // Monday, last occurrence
  await monthView.waitForItemAt(window, 5, 2, 1);

  // Wednesday
  await monthView.waitForNoItemAt(window, 5, 4, 1);

  // Delete event.
  const box = monthView.getItemAt(window, 2, 2, 1);
  EventUtils.synthesizeMouseAtCenter(box, {}, window);
  await handleDeleteOccurrencePrompt(window, box, true);
  await monthView.waitForNoItemAt(window, 2, 2, 1);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  const recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  const mon = cal.l10n.getDateFmtString("day.2.Mmm");
  const wed = cal.l10n.getDateFmtString("day.4.Mmm");
  const fri = cal.l10n.getDateFmtString("day.6.Mmm");

  const dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

  // Starting from Monday so it should be checked.
  Assert.ok(dayPicker.querySelector(`[label="${mon}"]`).checked, "mon checked");
  // Check Wednesday and Friday too.
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${wed}"]`),
    {},
    recurrenceWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${fri}"]`),
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
  EventUtils.synthesizeKey("VK_DELETE", {}, recurrenceWindow);

  const endDateString = formatDate(ENDDATE);
  EventUtils.sendString(endDateString, recurrenceWindow);

  // Move focus to ensure the date is selected.
  untilInput.focus();
  EventUtils.synthesizeKey("VK_TAB", {}, recurrenceWindow);

  const button = recurrenceDocument.querySelector("dialog").getButton("accept");
  button.scrollIntoView();
  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(button, {}, recurrenceWindow);
}
