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
 * Assert that there is an event shown on the given date in the day-view.
 *
 * @param {object} date - The date to move to.
 * @param {number} date.day - The day.
 * @param {number} date.week - The week.
 * @param {number} date.year - The year.
 * @param {object} expect - Details about the expected event.
 * @param {string} expect.name - The event name.
 * @param {boolean} expect.startInView - Whether the event starts within the
 *   view on the given date.
 * @param {boolean} expect.endInView - Whether the event ends within the view
 *   on the given date.
 * @param {string} message - A message to use in assertions.
 */
async function assertDayEvent(date, expect, message) {
  await CalendarTestUtils.goToDate(window, date.year, date.month, date.day);
  const element = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
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
 * Test an event that occurs within one day, in the day view.
 */
add_task(async function testInsideDayView() {
  const event = await createEvent("Test Event", "20190403T123400", "20190403T234500");
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
 * Test an event that starts and ends at midnight, in the day view.
 */
add_task(async function testMidnightDayView() {
  const event = await createEvent("Test Event", "20190403T000000", "20190404T000000");
  await CalendarTestUtils.setCalendarView(window, "day");

  // This event is fully within this view.
  await assertDayEvent(
    { day: 3, month: 4, year: 2019 },
    { name: "Test Event", startInView: true, endInView: true },
    "Single midnight event"
  );

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple days, in the day view.
 */
add_task(async function testOutsideDayView() {
  const event = await createEvent("Test Event", "20190402T123400", "20190404T234500");
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
