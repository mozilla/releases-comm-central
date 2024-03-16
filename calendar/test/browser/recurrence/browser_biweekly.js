/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { handleDeleteOccurrencePrompt } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);

var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;

add_task(async function testBiweeklyRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 31);

  // Create biweekly event.
  const eventBox = dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: "bi.weekly" });
  await saveAndCloseItemDialog(dialogWindow);

  // Check day view.
  await CalendarTestUtils.setCalendarView(window, "day");
  for (let i = 0; i < 4; i++) {
    await dayView.waitForEventBoxAt(window, 1);
    await CalendarTestUtils.calendarViewForward(window, 14);
  }

  // Check week view.
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(window, 2009, 1, 31);

  for (let i = 0; i < 4; i++) {
    await weekView.waitForEventBoxAt(window, 7, 1);
    await CalendarTestUtils.calendarViewForward(window, 2);
  }

  // Check multiweek view.
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 31);

  // Always two occurrences in view, 1st and 3rd or 2nd and 4th week.
  for (let i = 0; i < 5; i++) {
    await multiweekView.waitForItemAt(window, (i % 2) + 1, 7, 1);
    Assert.ok(multiweekView.getItemAt(window, (i % 2) + 3, 7, 1));
    await CalendarTestUtils.calendarViewForward(window, 1);
  }

  // Check month view.
  await CalendarTestUtils.setCalendarView(window, "month");
  await CalendarTestUtils.goToDate(window, 2009, 1, 31);

  // January
  await monthView.waitForItemAt(window, 5, 7, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);

  // February
  await monthView.waitForItemAt(window, 2, 7, 1);
  Assert.ok(monthView.getItemAt(window, 4, 7, 1));
  await CalendarTestUtils.calendarViewForward(window, 1);

  // March
  await monthView.waitForItemAt(window, 2, 7, 1);

  const box = monthView.getItemAt(window, 4, 7, 1);
  Assert.ok(box);

  // Delete event.
  EventUtils.synthesizeMouseAtCenter(box, {}, window);
  await handleDeleteOccurrencePrompt(window, box, true);

  await monthView.waitForNoItemAt(window, 4, 7, 1);

  Assert.ok(true, "Test ran to completion");
});
