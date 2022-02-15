/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

var calendar = CalendarTestUtils.createCalendar();
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

let formatter = cal.dtz.formatter;
let startTime = formatter.formatTime(cal.createDateTime("20190403T123400"));
let endTime = formatter.formatTime(cal.createDateTime("20190403T234500"));

/**
 * Assert that there is an event shown on the given date in the day-view.
 *
 * @param {Object} date - The date to move to.
 * @param {number} date.day - The day.
 * @param {number} date.week - The week.
 * @param {number} date.year - The year.
 * @param {Object} expect - Details about the expected event.
 * @param {string} expect.name - The event name.
 * @param {boolean} expect.startInView - Whether the event starts within the
 *   view on the given date.
 * @param {boolean} expect.endInView - Whether the event ends within the view
 *   on the given date.
 * @param {string} message - A message to use in assertions.
 */
async function assertDayEvent(date, expect, message) {
  await CalendarTestUtils.goToDate(window, date.year, date.month, date.day);
  let element = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
  Assert.equal(
    element.querySelector(".event-name-label").textContent,
    expect.name,
    `Event name should match: ${message}`
  );
  await CalendarTestUtils.assertEventBoxDraggable(
    element,
    expect.startInView,
    expect.endInView,
    message
  );
}

/**
 * Assert that there is a an event in the week-view between the expected range,
 * and no events on the other days.
 *
 * @param {Object} date - The date to move to.
 * @param {number} date.day - The day.
 * @param {number} date.week - The week.
 * @param {number} date.year - The year.
 * @param {Object} expect - Details about the expected event.
 * @param {string} expect.name - The event name.
 * @param {number} expect.start - The day that the event should start in the
 *   week. Between 1 and 7.
 * @param {number} expect.end - The day that the event should end in the week.
 * @param {boolean} expect.startInView - Whether the event starts within the
 *   view on the given date.
 * @param {boolean} expect.endInView - Whether the event ends within the view
 *   on the given date.
 * @param {string} message - A message to use in assertions.
 */
async function assertWeekEvents(date, expect, message) {
  await CalendarTestUtils.goToDate(window, date.year, date.month, date.day);
  // First test for expected events since these can take a short while to load,
  // and we don't want to test for the absence of an event before they show.
  for (let day = expect.start; day <= expect.end; day++) {
    let element = await CalendarTestUtils.weekView.waitForEventBoxAt(window, day, 1);
    Assert.equal(
      element.querySelector(".event-name-label").textContent,
      expect.name,
      `Day ${day} event name should match: ${message}`
    );
    await CalendarTestUtils.assertEventBoxDraggable(
      element,
      expect.startInView && day == expect.start,
      expect.endInView && day == expect.end,
      `Day ${day}: ${message}`
    );
  }
  // Test no events loaded on the other days.
  for (let day = 1; day <= 7; day++) {
    if (day >= expect.start && day <= expect.end) {
      continue;
    }
    Assert.equal(
      CalendarTestUtils.weekView.getEventBoxes(window, day).length,
      0,
      `Should be no events on day ${day}: ${message}`
    );
  }
}

/**
 * Assert that there is a an event in the multiweek or month view between the
 * expected range, and no events on the other days.
 *
 * @param {"multiweek"|"month"} viewName - The view to test.
 * @param {number} numWeeks - The number of weeks shown in the view.
 * @param {Object} date - The date to move to.
 * @param {number} date.day - The day.
 * @param {number} date.week - The week.
 * @param {number} date.year - The year.
 * @param {Object} expect - Details about the expected event.
 * @param {string} expect.name - The event name.
 * @param {number} expect.start - The day that the event should start in the
 *   week. Between 1 and 7.
 * @param {number} expect.end - The day that the event should end in the week.
 * @param {boolean} expect.startInView - Whether the event starts within the
 *   view on the given date.
 * @param {boolean} expect.endInView - Whether the event ends within the view
 *   on the given date.
 * @param {string} message - A message to use in assertions.
 */
async function assertMultiweekEvents(viewName, numWeeks, date, expect, message) {
  await CalendarTestUtils.goToDate(window, date.year, date.month, date.day);
  let view =
    viewName == "multiweek" ? CalendarTestUtils.multiweekView : CalendarTestUtils.monthView;

  // start = (startWeek - 1) * 7 + startDay
  let startWeek = Math.floor((expect.start - 1) / 7) + 1;
  let startDay = ((expect.start - 1) % 7) + 1;
  let endWeek = Math.floor((expect.end - 1) / 7) + 1;
  let endDay = ((expect.end - 1) % 7) + 1;
  for (let week = startWeek; week <= endWeek; week++) {
    let start = week == startWeek ? startDay : 1;
    let end = week == endWeek ? endDay : 7;
    for (let day = start; day <= end; day++) {
      let element = await view.waitForItemAt(window, week, day, 1);
      Assert.equal(
        element.querySelector(".event-name-label").textContent,
        expect.name,
        `Week ${week}, day ${day} event name should match: ${message}`
      );
      let multidayIcon = element.querySelector(".item-type-icon");
      if (expect.startInView && week == startWeek && day == startDay) {
        Assert.equal(
          multidayIcon.src,
          "chrome://calendar/skin/shared/event-start.svg",
          `Week ${week}, day ${day} icon src shows event start: ${message}`
        );
      } else if (expect.endInView && week == endWeek && day == endDay) {
        Assert.equal(
          multidayIcon.src,
          "chrome://calendar/skin/shared/event-end.svg",
          `Week ${week}, day ${day} icon src shows event end: ${message}`
        );
      } else {
        Assert.equal(
          multidayIcon.src,
          "chrome://calendar/skin/shared/event-continue.svg",
          `Week ${week}, day ${day} icon src shows event continue: ${message}`
        );
      }
    }
  }
  Assert.equal(
    numWeeks,
    document.querySelectorAll(`#${viewName}-view .monthbody tr:not([hidden])`).length,
    `Should show ${numWeeks} weeks in the view: ${message}`
  );
  // Test no events loaded on the other days.
  for (let week = 1; week <= numWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      if (
        (week > startWeek && week < endWeek) ||
        (week == startWeek && day >= startDay) ||
        (week == endWeek && day <= endDay)
      ) {
        continue;
      }
      Assert.ok(
        !view.getItemAt(window, week, day, 1),
        `Should be no events on day ${day}: ${message}`
      );
    }
  }
}

/**
 * Test an event that occurs within one day, in the day view.
 */
add_task(async function testInsideDayView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190403T123400");
  event.endDate = cal.createDateTime("20190403T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "day");
  Assert.equal(
    document.querySelectorAll("#day-view calendar-event-column").length,
    1,
    "1 day column in the day view"
  );

  // This event is fully within this view.
  await assertDayEvent(
    { day: 3, month: 4, year: 2019 },
    { name: "Test Event", startInView: true, endInView: true },
    "Single day event"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple days, in the day view.
 */
add_task(async function testOutsideDayView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190402T123400");
  event.endDate = cal.createDateTime("20190404T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "day");

  // Go to the start of the event. The end of the event is beyond the current view.
  await assertDayEvent(
    { day: 2, month: 4, year: 2019 },
    { name: "Test Event", startInView: true, endInView: false },
    "First day"
  );

  // Go to the middle of the event. Both ends of the event are beyond the current view.
  await assertDayEvent(
    { day: 3, month: 4, year: 2019 },
    { name: "Test Event", startInView: false, endInView: false },
    "Middle day"
  );

  // Go to the end of the event. The start of the event is beyond the current view.
  await assertDayEvent(
    { day: 4, month: 4, year: 2019 },
    { name: "Test Event", startInView: false, endInView: true },
    "Last day"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that occurs within one week, in the week view.
 */
add_task(async function testInsideWeekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190101T123400");
  event.endDate = cal.createDateTime("20190103T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "week");
  Assert.equal(
    document.querySelectorAll("#week-view calendar-event-column").length,
    7,
    "7 day columns in the week view"
  );

  await assertWeekEvents(
    { day: 1, month: 1, year: 2019 },
    { name: "Test Event", start: 3, end: 5, startInView: true, endInView: true },
    "Single week event"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple weeks, in the week view.
 */
add_task(async function testOutsideWeekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190402T123400");
  event.endDate = cal.createDateTime("20190418T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "week");

  await assertWeekEvents(
    { day: 3, month: 4, year: 2019 },
    { name: "Test Event", start: 3, end: 7, startInView: true, endInView: false },
    "First week"
  );
  await assertWeekEvents(
    { day: 10, month: 4, year: 2019 },
    { name: "Test Event", start: 1, end: 7, startInView: false, endInView: false },
    "Middle week"
  );
  await assertWeekEvents(
    { day: 17, month: 4, year: 2019 },
    { name: "Test Event", start: 1, end: 5, startInView: false, endInView: true },
    "Last week"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that occurs fully within the multi-week view.
 */
add_task(async function testInsideMultiweekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190402T123400");
  event.endDate = cal.createDateTime("20190419T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  Assert.equal(
    document.querySelectorAll("#multiweek-view tr:not([hidden]) calendar-month-day-box").length,
    28,
    "28 days in the multiweek view"
  );

  await assertMultiweekEvents(
    "multiweek",
    4,
    { day: 1, month: 4, year: 2019 },
    { name: "Test Event", start: 3, end: 20, startInView: true, endInView: true },
    "3 week event in multiweek view"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that starts or ends outside the multi-week view.
 */
add_task(async function testOutsideMultiweekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190402T123400");
  event.endDate = cal.createDateTime("20190507T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "multiweek");

  await assertMultiweekEvents(
    "multiweek",
    4,
    { day: 11, month: 3, year: 2019 },
    { name: "Test Event", start: 24, end: 28, startInView: true, endInView: false },
    "First block in multiweek"
  );

  await assertMultiweekEvents(
    "multiweek",
    4,
    { day: 8, month: 4, year: 2019 },
    { name: "Test Event", start: 1, end: 28, startInView: false, endInView: false },
    "Middle block in multiweek"
  );

  await assertMultiweekEvents(
    "multiweek",
    4,
    { day: 29, month: 4, year: 2019 },
    { name: "Test Event", start: 1, end: 10, startInView: false, endInView: true },
    "End block in multiweek"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that occurs within one month, in the month view.
 */
add_task(async function testInsideMonthView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190702T123400");
  event.endDate = cal.createDateTime("20190719T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "month");
  Assert.equal(
    document.querySelectorAll("#month-view tr:not([hidden]) calendar-month-day-box").length,
    35,
    "35 days in the month view"
  );

  await assertMultiweekEvents(
    "month",
    5,
    { day: 1, month: 7, year: 2019 },
    { name: "Test Event", start: 3, end: 20, startInView: true, endInView: true },
    "Event in single month"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple months, in the month view.
 */
add_task(async function testOutsideMonthView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190320T123400");
  event.endDate = cal.createDateTime("20190507T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "month");

  await assertMultiweekEvents(
    "month",
    6,
    { day: 1, month: 3, year: 2019 },
    { name: "Test Event", start: 25, end: 42, startInView: true, endInView: false },
    "First month"
  );

  await assertMultiweekEvents(
    "month",
    5,
    { day: 1, month: 4, year: 2019 },
    { name: "Test Event", start: 1, end: 35, startInView: false, endInView: false },
    "Middle month"
  );

  await assertMultiweekEvents(
    "month",
    5,
    { day: 1, month: 5, year: 2019 },
    { name: "Test Event", start: 1, end: 10, startInView: false, endInView: true },
    "End month"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});
