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
  invokeEditingRepeatEventDialog,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
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
  createCalendar(controller, CALENDARNAME);
  await setCalendarView(controller.window, "day");
  goToDate(controller, 2009, 1, 1);

  // Create daily event.
  let eventBox = dayView.getHourBoxAt(controller.window, HOUR);
  await invokeNewEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      title: TITLE,
      repeat: "daily",
      repeatuntil: cal.createDateTime("20090320T000000Z"),
    });
    await saveAndCloseItemDialog(eventWindow);
  });

  // Check day view for 7 days.
  for (let day = 1; day <= 7; day++) {
    await dayView.waitForEventBoxAt(controller.window, 1);
    await calendarViewForward(controller.window, 1);
  }

  // Check week view for 2 weeks.
  await setCalendarView(controller.window, "week");
  goToDate(controller, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    await weekView.waitForEventBoxAt(controller.window, day, 1);
  }

  await calendarViewForward(controller.window, 1);

  for (let day = 1; day <= 7; day++) {
    await weekView.waitForEventBoxAt(controller.window, day, 1);
  }

  // Check multiweek view for 4 weeks.
  await setCalendarView(controller.window, "multiweek");
  goToDate(controller, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    await multiweekView.waitForItemAt(controller.window, 1, day, 1);
  }

  for (let week = 2; week <= 4; week++) {
    for (let day = 1; day <= 7; day++) {
      await multiweekView.waitForItemAt(controller.window, week, day, 1);
    }
  }
  // Check month view for all 5 weeks.
  await setCalendarView(controller.window, "month");
  goToDate(controller, 2009, 1, 1);

  for (let day = 5; day <= 7; day++) {
    await monthView.waitForItemAt(controller.window, 1, day, 1);
  }

  for (let week = 2; week <= 5; week++) {
    for (let day = 1; day <= 7; day++) {
      await monthView.waitForItemAt(controller.window, week, day, 1);
    }
  }

  // Delete 3rd January occurrence.
  let saturday = await monthView.waitForItemAt(controller.window, 1, 7, 1);
  controller.click(saturday);
  handleOccurrencePrompt(controller, saturday, "delete", false);

  // Verify in all views.
  await monthView.waitForNoItemAt(controller.window, 1, 7, 1);

  await setCalendarView(controller.window, "multiweek");
  Assert.ok(!multiweekView.getItemAt(controller.window, 1, 7, 1));

  await setCalendarView(controller.window, "week");
  Assert.ok(!weekView.getEventBoxAt(controller.window, 7, 1));

  await setCalendarView(controller.window, "day");
  Assert.ok(!dayView.getEventBoxAt(controller.window, 1));

  // Go to previous day to edit event to occur only on weekdays.
  await calendarViewBackward(controller.window, 1);

  eventBox = await dayView.waitForEventBoxAt(controller.window, 1);
  await invokeEditingRepeatEventDialog(
    window,
    eventBox,
    async (eventWindow, iframeWindow) => {
      await setData(eventWindow, iframeWindow, { repeat: "every.weekday" });
      await saveAndCloseItemDialog(eventWindow);
    },
    true
  );

  // Check day view for 7 days.
  let dates = [
    [2009, 1, 3],
    [2009, 1, 4],
  ];
  for (let [y, m, d] of dates) {
    goToDate(controller, y, m, d);
    Assert.ok(!dayView.getEventBoxAt(controller.window, 1));
  }

  // Check week view for 2 weeks.
  await setCalendarView(controller.window, "week");
  goToDate(controller, 2009, 1, 1);

  for (let i = 0; i <= 1; i++) {
    await weekView.waitForNoEventBoxAt(controller.window, 1, 1);
    Assert.ok(!weekView.getEventBoxAt(controller.window, 7, 1));
    await calendarViewForward(controller.window, 1);
  }

  // Check multiweek view for 4 weeks.
  await setCalendarView(controller.window, "multiweek");
  goToDate(controller, 2009, 1, 1);

  for (let i = 1; i <= 4; i++) {
    await multiweekView.waitForNoItemAt(controller.window, i, 1, 1);
    Assert.ok(!multiweekView.getItemAt(controller.window, i, 7, 1));
  }

  // Check month view for all 5 weeks.
  await setCalendarView(controller.window, "month");
  goToDate(controller, 2009, 1, 1);

  for (let i = 1; i <= 5; i++) {
    await monthView.waitForNoItemAt(controller.window, i, 1, 1);
    Assert.ok(!monthView.getItemAt(controller.window, i, 7, 1));
  }

  // Delete event.
  let day = monthView.getItemAt(controller.window, 1, 5, 1);
  controller.click(day);
  handleOccurrencePrompt(controller, day, "delete", true);
  await monthView.waitForNoItemAt(controller.window, 1, 5, 1);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
