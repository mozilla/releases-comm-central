/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

var calendar = CalendarTestUtils.createCalendar();
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

/**
 * Create an event item in the calendar.
 *
 * @param {string} name - The name of the event.
 * @param {string} start - The date time string for the start of the event.
 * @param {string} end - The date time string for the end of the event.
 *
 * @returns {Promise<CalEvent>} - The created event.
 */
function createEvent(name, start, end) {
  const event = new CalEvent();
  event.title = name;
  event.startDate = cal.createDateTime(start);
  event.endDate = cal.createDateTime(end);
  return calendar.addItem(event);
}

/**
 * Assert that there is a an event in the multiweek or month view between the
 * expected range, and no events on the other days.
 *
 * @param {"multiweek"|"month"} viewName - The view to test.
 * @param {number} numWeeks - The number of weeks shown in the view.
 * @param {object} date - The date to move to.
 * @param {number} date.day - The day.
 * @param {number} date.week - The week.
 * @param {number} date.year - The year.
 * @param {object} expect - Details about the expected event.
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
  const view =
    viewName == "multiweek" ? CalendarTestUtils.multiweekView : CalendarTestUtils.monthView;

  // start = (startWeek - 1) * 7 + startDay
  const startWeek = Math.floor((expect.start - 1) / 7) + 1;
  const startDay = ((expect.start - 1) % 7) + 1;
  const endWeek = Math.floor((expect.end - 1) / 7) + 1;
  const endDay = ((expect.end - 1) % 7) + 1;
  for (let week = startWeek; week <= endWeek; week++) {
    const start = week == startWeek ? startDay : 1;
    const end = week == endWeek ? endDay : 7;
    for (let day = start; day <= end; day++) {
      const element = await view.waitForItemAt(window, week, day, 1);
      Assert.equal(
        element.querySelector(".event-name-label").textContent,
        expect.name,
        `Week ${week}, day ${day} event name should match: ${message}`
      );
      const multidayIcon = element.querySelector(".item-type-icon");
      if (startDay == endDay && week == startWeek && day == startDay) {
        Assert.equal(multidayIcon.src, "", `Week ${week}, day ${day} icon has no source`);
      } else if (expect.startInView && week == startWeek && day == startDay) {
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
 * Test an event that occurs fully within the multi-week view.
 */
add_task(async function testInsideMultiweekView() {
  const event = await createEvent("Test Event", "20190402T123400", "20190419T234500");
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
 * Test an event that starts and ends at midnight, in the multi-week view.
 */
add_task(async function testMidnightMultiweekView() {
  // Event spans one day.
  const event = await createEvent("Test Event", "20190402T000000", "20190403T000000");
  await CalendarTestUtils.setCalendarView(window, "multiweek");

  await assertMultiweekEvents(
    "multiweek",
    4,
    { day: 1, month: 4, year: 2019 },
    { name: "Test Event", start: 3, end: 3, startInView: true, endInView: true },
    "one day midnight event in multiweek"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that starts or ends outside the multi-week view.
 */
add_task(async function testOutsideMultiweekView() {
  const event = await createEvent("Test Event", "20190402T123400", "20190507T234500");
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
  const event = await createEvent("Test Event", "20190702T123400", "20190719T234500");
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
 * Test an event that starts and ends at midnight, in the month view.
 */
add_task(async function testMidnightMonthView() {
  // Event spans three days.
  const event = await createEvent("Test Event", "20190702T000000", "20190705T000000");
  await CalendarTestUtils.setCalendarView(window, "month");

  await assertMultiweekEvents(
    "month",
    5,
    { day: 1, month: 7, year: 2019 },
    { name: "Test Event", start: 3, end: 5, startInView: true, endInView: true },
    "3 day midnight event in single month"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple months, in the month view.
 */
add_task(async function testOutsideMonthView() {
  const event = await createEvent("Test Event", "20190320T123400", "20190507T234500");
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
