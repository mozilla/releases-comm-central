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
 * @returns {CalEvent} - The created event.
 */
async function createEvent(name, start, end) {
  const event = new CalEvent();
  event.title = name;
  event.startDate = cal.createDateTime(start);
  event.endDate = cal.createDateTime(end);
  return calendar.addItem(event);
}

/**
 * Assert that there is a an event in the week-view between the expected range,
 * and no events on the other days.
 *
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
async function assertWeekEvents(date, expect, message) {
  await CalendarTestUtils.goToDate(window, date.year, date.month, date.day);
  // First test for expected events since these can take a short while to load,
  // and we don't want to test for the absence of an event before they show.
  for (let day = expect.start; day <= expect.end; day++) {
    const element = await CalendarTestUtils.weekView.waitForEventBoxAt(window, day, 1);
    Assert.equal(
      element.querySelector(".event-name-label").textContent,
      expect.name,
      `Day ${day} event name should match: ${message}`
    );
    const icon = element.querySelector(".item-recurrence-icon");
    Assert.equal(icon.src, "");
    Assert.ok(icon.hidden);
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
 * Test an event that occurs within one week, in the week view.
 */
add_task(async function testInsideWeekView() {
  const event = await createEvent("Test Event", "20190101T123400", "20190103T234500");
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
 * Test an event that starts and ends at midnight, in the week view.
 */
add_task(async function testMidnightWeekView() {
  // Spans three days.
  const event = await createEvent("Test Event", "20190101T000000", "20190104T000000");
  await CalendarTestUtils.setCalendarView(window, "week");

  // Midnight-to-midnight event only spans one day even though the end time
  // matches the starting time of the next day (midnight).
  await assertWeekEvents(
    { day: 1, month: 1, year: 2019 },
    { name: "Test Event", start: 3, end: 5, startInView: true, endInView: true },
    "Midnight week event"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple weeks, in the week view.
 */
add_task(async function testOutsideWeekView() {
  const event = await createEvent("Test Event", "20190402T123400", "20190418T234500");
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
