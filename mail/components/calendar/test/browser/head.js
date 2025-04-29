/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { CalEvent } = ChromeUtils.importESModule(
  "resource:///modules/CalEvent.sys.mjs"
);
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
const { CalRecurrenceInfo } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceInfo.sys.mjs"
);

const { dayView } = CalendarTestUtils;
let count = 0;
const todayDate = new Date();
todayDate.setHours(0);
todayDate.setMinutes(0);
todayDate.setSeconds(0);
todayDate.setMilliseconds(0);

/**
 * Creates and registers a new calendar with the calendar manager. The
 * created calendar will be set as the default calendar.
 *
 * @param {object} options - Options to create the calendar with.
 * @param {string} options.name [name="Test"] - Name.
 * @param {string} options.type [type="storage"] - Type.
 *
 * @returns {calICalendar}
 */
function createCalendar({
  name = `Test Event - ${count++}`,
  type = "storage",
} = {}) {
  const calendar = cal.manager.createCalendar(
    type,
    Services.io.newURI(`moz-${type}-calendar://`)
  );
  calendar.name = name;
  calendar.setProperty("calendar-main-default", true);
  // This is done so that calItemBase#isInvitation returns true.
  calendar.setProperty("organizerId", `mailto:organizer@example.com`);
  cal.manager.registerCalendar(calendar);
  return calendar;
}

/**
 * Create an event item in the calendar.
 *
 * @param {object} options - Options to use in creating the event.
 * @param {string} [options.name="Test Event"] - The name of the event.
 * @param {number} [options.offset=0] - The number of days from today to offset the
 *  event.
 * @param {object} options.calendar - The calendar to create the event on.
 * @param {string[]} [options.categories=[]] - Categories to assign to the event.
 * @param {boolean} [options.repeats=false] - If the event is repeating.
 * @param {string} [options.location] - Location of the event. Only set if not
 *  falsy.
 *
 * @returns {CalEvent} - The created event.
 */
async function createEvent({
  name = "Test Event",
  offset = 0,
  calendar,
  categories = [],
  repeats = false,
  location,
}) {
  const start = cal.dtz.jsDateToDateTime(new Date(todayDate), 0);
  let end = new Date(todayDate);
  end.setDate(todayDate.getDate() + 1 + offset);
  end = cal.dtz.jsDateToDateTime(end, 0);
  const event = new CalEvent();
  event.title = name;
  event.startDate = start;
  event.endDate = end;
  if (repeats) {
    event.recurrenceInfo = new CalRecurrenceInfo(event);
    const rule = cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=30");
    event.recurrenceInfo.appendRecurrenceItem(rule);
  }
  event.setCategories(categories);
  if (location) {
    event.setProperty("LOCATION", location);
  }
  return calendar.addItem(event);
}

async function openEvent(offset = 0) {
  const targetDate = new Date(todayDate);
  targetDate.setDate(targetDate.getDate() + offset);
  // Since from other tests we may be elsewhere, make sure we start today.
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(
    window,
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    targetDate.getDate()
  );

  const eventBox = await dayView.waitForEventBoxAt(window, 1);

  EventUtils.synthesizeMouseAtCenter(eventBox, { clickCount: 2 }, window);

  await waitForCalendarReady();
}

async function waitForCalendarReady() {
  await BrowserTestUtils.waitForMutationCondition(
    document.documentElement,
    {
      subtree: true,
      childList: true,
    },
    () => document.getElementById("calendarDialog")
  );
}
