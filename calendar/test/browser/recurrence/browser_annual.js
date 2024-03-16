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

const STARTYEAR = 1950;
const EPOCH = 1970;

add_task(async function testAnnualRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, STARTYEAR, 1, 1);

  // Create yearly recurring all-day event.
  const eventBox = dayView.getAllDayHeader(window);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: "yearly" });
  await saveAndCloseItemDialog(dialogWindow);
  await TestUtils.waitForCondition(
    () => CalendarTestUtils.dayView.getAllDayItemAt(window, 1),
    "recurring all-day event created"
  );

  const checkYears = [STARTYEAR, STARTYEAR + 1, EPOCH - 1, EPOCH, EPOCH + 1];
  for (const year of checkYears) {
    await CalendarTestUtils.goToDate(window, year, 1, 1);
    const date = new Date(Date.UTC(year, 0, 1));
    const column = date.getUTCDay() + 1;

    // day view
    await CalendarTestUtils.setCalendarView(window, "day");
    await dayView.waitForAllDayItemAt(window, 1);

    // week view
    await CalendarTestUtils.setCalendarView(window, "week");
    await weekView.waitForAllDayItemAt(window, column, 1);

    // multiweek view
    await CalendarTestUtils.setCalendarView(window, "multiweek");
    await multiweekView.waitForItemAt(window, 1, column, 1);

    // month view
    await CalendarTestUtils.setCalendarView(window, "month");
    await monthView.waitForItemAt(window, 1, column, 1);
  }

  // Delete event.
  await CalendarTestUtils.goToDate(window, checkYears[0], 1, 1);
  await CalendarTestUtils.setCalendarView(window, "day");
  const box = await dayView.waitForAllDayItemAt(window, 1);
  EventUtils.synthesizeMouseAtCenter(box, {}, window);
  await handleDeleteOccurrencePrompt(window, box, true);
  await TestUtils.waitForCondition(() => !dayView.getAllDayItemAt(window, 1), "No all-day events");

  Assert.ok(true, "Test ran to completion");
});
