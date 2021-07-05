/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CALENDARNAME, controller, createCalendar, deleteCalendars } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

var calendarId = createCalendar(controller, CALENDARNAME);
var calendar = cal.async.promisifyCalendar(cal.getCalendarManager().getCalendarById(calendarId));

let formatter = cal.dtz.formatter;
let startTime = formatter.formatTime(cal.createDateTime("20190403T123400"));
let endTime = formatter.formatTime(cal.createDateTime("20190403T234500"));

Services.prefs.setIntPref("calendar.week.start", 1);

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
  let dayView = document.getElementById("day-view");
  let dayBoxes = [...dayView.querySelectorAll("calendar-event-column")];
  is(dayBoxes.length, 1);

  // This event is fully within this view.

  goToDate(cal.createDateTime("20190403"));
  await BrowserTestUtils.waitForEvent(dayView, "viewloaded");
  // The timeouts here and elsewhere in this test match a timeout in the
  // `addEvent` method of <calendar-event-column>.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  info(dayBoxes[0].date.icalString);
  let item = dayBoxes[0].querySelector("stack calendar-event-box");
  ok(item, "Event shown");
  is(item.querySelector(".event-name-label").textContent, "Test Event");
  is(item.getAttribute("gripBars"), "both");

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
  let dayView = document.getElementById("day-view");
  let dayBoxes = [...dayView.querySelectorAll("calendar-event-column")];
  is(dayBoxes.length, 1);

  // Go to the start of the event. The end of the event is beyond the current view.

  goToDate(cal.createDateTime("20190402"));
  await BrowserTestUtils.waitForEvent(dayView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  info(dayBoxes[0].date.icalString);
  let item = dayBoxes[0].querySelector("stack calendar-event-box");
  ok(item, "Event shown");
  is(item.querySelector(".event-name-label").textContent, "Test Event");
  is(item.getAttribute("gripBars"), "start");

  // Go to the middle of the event. Both ends of the event are beyond the current view.

  dayView.moveView(1);
  await BrowserTestUtils.waitForEvent(dayView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  info(dayBoxes[0].date.icalString);
  item = dayBoxes[0].querySelector("stack calendar-event-box");
  ok(item, "Event shown");
  is(item.querySelector(".event-name-label").textContent, "Test Event");
  is(item.getAttribute("gripBars"), "");

  // Go to the end of the event. The start of the event is beyond the current view.

  dayView.moveView(1);
  await BrowserTestUtils.waitForEvent(dayView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  info(dayBoxes[0].date.icalString);
  item = dayBoxes[0].querySelector("stack calendar-event-box");
  ok(item, "Event shown");
  is(item.querySelector(".event-name-label").textContent, "Test Event");
  is(item.getAttribute("gripBars"), "end");

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that occurs within one week, in the week view.
 */
add_task(async function testInsideWeekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190102T123400");
  event.endDate = cal.createDateTime("20190104T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "week");
  let weekView = document.getElementById("week-view");
  let dayBoxes = [...weekView.querySelectorAll("calendar-event-column")];
  is(dayBoxes.length, 7);

  // This event is fully within this view.

  goToDate(cal.createDateTime("20190101"));
  await BrowserTestUtils.waitForEvent(weekView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  for (let i = 0; i <= 1; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("stack calendar-event-box"), "No event shown");
  }
  for (let i = 2; i <= 4; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("stack calendar-event-box");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 2) {
      is(item.getAttribute("gripBars"), "start");
    } else if (i == 4) {
      is(item.getAttribute("gripBars"), "end");
    } else {
      is(item.getAttribute("gripBars"), "");
    }
  }
  for (let i = 5; i <= 6; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("stack calendar-event-box"), "No event shown");
  }

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple weeks, in the week view.
 */
add_task(async function testOutsideWeekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190403T123400");
  event.endDate = cal.createDateTime("20190419T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "week");
  let weekView = document.getElementById("week-view");
  let dayBoxes = [...weekView.querySelectorAll("calendar-event-column")];
  is(dayBoxes.length, 7);

  // Go to the start of the event. The end of the event is beyond the current view:
  // --[++++

  goToDate(cal.createDateTime("20190403"));
  await BrowserTestUtils.waitForEvent(weekView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  for (let i = 0; i <= 1; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("stack calendar-event-box"), "No event shown");
  }
  for (let i = 2; i <= 6; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("stack calendar-event-box");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 2) {
      is(item.getAttribute("gripBars"), "start");
    } else {
      is(item.getAttribute("gripBars"), "");
    }
  }

  // Go to the middle of the event. Both ends of the event are beyond the current view:
  // +++++++

  weekView.moveView(1);
  await BrowserTestUtils.waitForEvent(weekView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  for (let i = 0; i <= 6; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("stack calendar-event-box");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    is(item.getAttribute("gripBars"), "");
  }

  // Go to the end of the event. The start of the event is beyond the current view:
  // ++++]--

  weekView.moveView(1);
  await BrowserTestUtils.waitForEvent(weekView, "viewloaded");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 5));

  for (let i = 0; i <= 4; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("stack calendar-event-box");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 4) {
      is(item.getAttribute("gripBars"), "end");
    } else {
      is(item.getAttribute("gripBars"), "");
    }
  }
  for (let i = 5; i <= 6; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("stack calendar-event-box"), "No event shown");
  }

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that occurs fully within the multi-week view.
 */
add_task(async function testInsideMultiweekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190403T123400");
  event.endDate = cal.createDateTime("20190420T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  let multiweekView = document.getElementById("multiweek-view");
  let dayBoxes = [...multiweekView.querySelectorAll("calendar-month-day-box")];
  is(dayBoxes.length, 42);

  // This event is fully within this view:
  // --[++++
  // +++++++
  // +++++]-
  // -------

  goToDate(cal.createDateTime("20190401"));
  await BrowserTestUtils.waitForEvent(multiweekView, "viewloaded");

  for (let i = 0; i <= 1; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }
  for (let i = 2; i <= 19; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 2) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "start");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, startTime);
    } else if (i == 19) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "end");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, endTime);
    } else {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
    }
  }
  for (let i = 20; i <= 27; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that starts or ends outside the multi-week view.
 */
add_task(async function testOutsideMultiweekView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190403T123400");
  event.endDate = cal.createDateTime("20190508T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  let multiweekView = document.getElementById("multiweek-view");
  let dayBoxes = [...multiweekView.querySelectorAll("calendar-month-day-box")];
  is(dayBoxes.length, 42);

  // Go to the start of the event. The end of the event is beyond the current view:
  // -------
  // -------
  // -------
  // --[++++

  goToDate(cal.createDateTime("20190311"));
  await BrowserTestUtils.waitForEvent(multiweekView, "viewloaded");

  for (let i = 0; i <= 22; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }
  for (let i = 23; i <= 27; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 23) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "start");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, startTime);
    } else {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
    }
  }

  // Go to the middle of the event. Both ends of the event are beyond the current view:
  // +++++++
  // +++++++
  // +++++++
  // +++++++

  goToDate(cal.createDateTime("20190408"));
  await BrowserTestUtils.waitForEvent(multiweekView, "viewloaded");

  for (let i = 0; i <= 27; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
  }

  // Go to the end of the event. The start of the event is beyond the current view:
  // +++++++
  // ++]----
  // -------
  // -------

  goToDate(cal.createDateTime("20190429"));
  await BrowserTestUtils.waitForEvent(multiweekView, "viewloaded");

  for (let i = 0; i <= 9; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 9) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "end");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, endTime);
    } else {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
    }
  }
  for (let i = 10; i <= 27; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that occurs within one month, in the month view.
 */
add_task(async function testInsideMonthView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190703T123400");
  event.endDate = cal.createDateTime("20190720T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "month");
  let monthView = document.getElementById("month-view");
  let dayBoxes = [...monthView.querySelectorAll("calendar-month-day-box")];
  is(dayBoxes.length, 42);

  // This event is fully within this view:
  // --[++++
  // +++++++
  // +++++]-
  // -------
  // -------

  goToDate(cal.createDateTime("20190701"));
  await BrowserTestUtils.waitForEvent(monthView, "viewloaded");

  for (let i = 0; i <= 1; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }
  for (let i = 2; i <= 19; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 2) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "start");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, startTime);
    } else if (i == 19) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "end");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, endTime);
    } else {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
    }
  }
  for (let i = 20; i <= 34; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

/**
 * Test an event that spans multiple months, in the month view.
 */
add_task(async function testOutsideMonthView() {
  let event = new CalEvent();
  event.title = "Test Event";
  event.startDate = cal.createDateTime("20190321T123400");
  event.endDate = cal.createDateTime("20190508T234500");
  event = await calendar.addItem(event);

  await CalendarTestUtils.setCalendarView(window, "month");
  let monthView = document.getElementById("month-view");
  let dayBoxes = [...monthView.querySelectorAll("calendar-month-day-box")];
  is(dayBoxes.length, 42);

  // Go to the start of the event. The end of the event is beyond the current view:
  // -------
  // -------
  // -------
  // ---[+++
  // +++++++

  goToDate(cal.createDateTime("20190301"));
  await BrowserTestUtils.waitForEvent(monthView, "viewloaded");

  for (let i = 0; i <= 23; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }
  for (let i = 24; i <= 34; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 24) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "start");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, startTime);
    } else {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
    }
  }

  // Go to the middle of the event. Both ends of the event are beyond the current view:
  // +++++++
  // +++++++
  // +++++++
  // +++++++
  // +++++++

  goToDate(cal.createDateTime("20190401"));
  await BrowserTestUtils.waitForEvent(monthView, "viewloaded");

  for (let i = 0; i <= 34; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
  }

  // Go to the end of the event. The start of the event is beyond the current view:
  // +++++++
  // ++]----
  // -------
  // -------
  // -------

  goToDate(cal.createDateTime("20190501"));
  await BrowserTestUtils.waitForEvent(monthView, "viewloaded");

  for (let i = 0; i <= 9; i++) {
    info(dayBoxes[i].date.icalString);
    let item = dayBoxes[i].querySelector("calendar-month-day-box-item");
    ok(item, "Event shown");
    is(item.querySelector(".event-name-label").textContent, "Test Event");
    if (i == 9) {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "end");
      let timeLabel = item.querySelector(".item-time-label");
      is(timeLabel.textContent, endTime);
    } else {
      is(item.querySelector(".item-type-icon").getAttribute("type"), "continue");
    }
  }
  for (let i = 10; i <= 34; i++) {
    info(dayBoxes[i].date.icalString);
    ok(!dayBoxes[i].querySelector("calendar-month-day-box-item"), "No event shown");
  }

  await CalendarTestUtils.closeCalendarTab(window);
  await calendar.deleteItem(event);
});

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("calendar.week.start");
  deleteCalendars(controller, CALENDARNAME);
});
