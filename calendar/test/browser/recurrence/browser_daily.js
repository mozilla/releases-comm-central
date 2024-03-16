/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { handleDeleteOccurrencePrompt } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var {
  calendarViewBackward,
  calendarViewForward,
  setCalendarView,
  dayView,
  weekView,
  multiweekView,
  monthView,
} = CalendarTestUtils;

const HOUR = 8;
const TITLE = "Event";

add_task(async function testDailyRecurrence() {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  // Create daily event.
  const eventBox = dayView.getHourBoxAt(window, HOUR);
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, {
    title: TITLE,
    repeat: "daily",
    repeatuntil: cal.createDateTime("20090320T000000Z"),
  });
  await saveAndCloseItemDialog(dialogWindow);

  // Check day view for 7 days.
  for (let day = 1; day <= 7; day++) {
    await dayView.waitForEventBoxAt(window, 1);
    await calendarViewForward(window, 1);
  }

  // Check week view for 2 weeks.
  await setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    await weekView.waitForEventBoxAt(window, day, 1);
  }

  await calendarViewForward(window, 1);

  for (let day = 1; day <= 7; day++) {
    await weekView.waitForEventBoxAt(window, day, 1);
  }

  // Check multiweek view for 4 weeks.
  await setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    await multiweekView.waitForItemAt(window, 1, day, 1);
  }

  for (let week = 2; week <= 4; week++) {
    for (let day = 1; day <= 7; day++) {
      await multiweekView.waitForItemAt(window, week, day, 1);
    }
  }
  // Check month view for all 5 weeks.
  await setCalendarView(window, "month");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    await monthView.waitForItemAt(window, 1, day, 1);
  }

  for (let week = 2; week <= 5; week++) {
    for (let day = 1; day <= 7; day++) {
      await monthView.waitForItemAt(window, week, day, 1);
    }
  }

  // Delete 3rd January occurrence.
  const saturday = await monthView.waitForItemAt(window, 1, 7, 1);
  EventUtils.synthesizeMouseAtCenter(saturday, {}, window);
  await handleDeleteOccurrencePrompt(window, saturday, false);

  // Verify in all views.
  await monthView.waitForNoItemAt(window, 1, 7, 1);

  await setCalendarView(window, "multiweek");
  Assert.ok(!multiweekView.getItemAt(window, 1, 7, 1));

  await setCalendarView(window, "week");
  Assert.ok(!weekView.getEventBoxAt(window, 7, 1));

  await setCalendarView(window, "day");
  Assert.ok(!dayView.getEventBoxAt(window, 1));

  // Go to previous day to edit event to occur only on weekdays.
  await calendarViewBackward(window, 1);

  ({ dialogWindow, iframeWindow } = await dayView.editEventOccurrencesAt(window, 1));
  await setData(dialogWindow, iframeWindow, { repeat: "every.weekday" });
  await saveAndCloseItemDialog(dialogWindow);

  // Check day view for 7 days.
  const dates = [
    [2009, 1, 3],
    [2009, 1, 4],
  ];
  for (const [y, m, d] of dates) {
    await CalendarTestUtils.goToDate(window, y, m, d);
    Assert.ok(!dayView.getEventBoxAt(window, 1));
  }

  // Check week view for 2 weeks.
  await setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  for (let i = 0; i <= 1; i++) {
    await weekView.waitForNoEventBoxAt(window, 1, 1);
    Assert.ok(!weekView.getEventBoxAt(window, 7, 1));
    await calendarViewForward(window, 1);
  }

  // Check multiweek view for 4 weeks.
  await setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  for (let i = 1; i <= 4; i++) {
    await multiweekView.waitForNoItemAt(window, i, 1, 1);
    Assert.ok(!multiweekView.getItemAt(window, i, 7, 1));
  }

  // Check month view for all 5 weeks.
  await setCalendarView(window, "month");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  for (let i = 1; i <= 5; i++) {
    await monthView.waitForNoItemAt(window, i, 1, 1);
    Assert.ok(!monthView.getItemAt(window, i, 7, 1));
  }

  // Delete event.
  const day = monthView.getItemAt(window, 1, 5, 1);
  EventUtils.synthesizeMouseAtCenter(day, {}, window);
  await handleDeleteOccurrencePrompt(window, day, true);
  await monthView.waitForNoItemAt(window, 1, 5, 1);

  Assert.ok(true, "Test ran to completion");
});
