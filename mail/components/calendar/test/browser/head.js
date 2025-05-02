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
const { DEFAULT_DIALOG_MARGIN } = ChromeUtils.importESModule(
  "chrome://messenger/content/calendar-dialog.mjs",
  { global: "current" }
);

const { weekView } = CalendarTestUtils;
const SCREEN_MARGIN = 10;
const SMALL_WINDOW_WIDTH = 1300;
const SMALL_WINDOW_HEIGHT = 700;
const LARGE_WINDOW_WIDTH = window.screen.availWidth - SCREEN_MARGIN;
const LARGE_WINDOW_HEIGHT = window.screen.availHeight - SCREEN_MARGIN;
const todayDate = new Date();
const sizes = [
  { x: LARGE_WINDOW_WIDTH, y: LARGE_WINDOW_HEIGHT, name: "large" },
  { x: LARGE_WINDOW_WIDTH, y: SMALL_WINDOW_HEIGHT, name: "extra wide" },
  { x: SMALL_WINDOW_WIDTH, y: LARGE_WINDOW_HEIGHT, name: "extra narrow" },
  { x: SMALL_WINDOW_WIDTH, y: SMALL_WINDOW_HEIGHT, name: "small" },
  { y: LARGE_WINDOW_HEIGHT, name: "tall" },
  { x: LARGE_WINDOW_WIDTH, name: "wide" },
  { x: SMALL_WINDOW_WIDTH, name: "narrow" },
  { y: SMALL_WINDOW_HEIGHT, name: "short" },
  { name: "default" },
];

const scrollPositions = [
  { block: "start", inline: "start" },
  { block: "end", inline: "start" },
  { block: "start", inline: "end" },
  { block: "end", inline: "end" },
  { block: "center", inline: "start" },
  { block: "center", inline: "end" },
  { block: "end", inline: "center" },
  { block: "start", inline: "center" },
  { block: "center", inline: "center" },
];
let count = 0;

todayDate.setFullYear(2025);
todayDate.setMonth(3);
todayDate.setDate(6);
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
 * @param {number} options.hour - The hour of the day to create the event for.
 * @param {number} options.duration - The duration of the event in hours.
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
  hour = 0,
  duration = 1,
} = {}) {
  let start = new Date(todayDate);
  start.setDate(todayDate.getDate() + offset);
  start.setHours(hour);
  start = cal.dtz.jsDateToDateTime(start, 0);
  let end = new Date(todayDate);
  const days = Math.trunc(duration / 24);
  end.setHours(hour + (duration % 24) - 1);
  end.setMinutes(59);
  end.setSeconds(59);
  end.setMilliseconds(99);
  end.setDate(todayDate.getDate() + offset + days);
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

/**
 * Opens an event on the calendar.
 *
 * @param {HTMLElement} eventBox - Event box element to interact with.
 * @returns {HTMLElement}
 */
async function openEvent({ eventBox }) {
  const dblClickEvent = new MouseEvent("dblclick", {
    view: window,
    bubbles: true,
    cancelable: true,
  });
  const readyPromise = waitForCalendarReady();

  EventUtils.sendMouseEvent(dblClickEvent, eventBox, window);

  await readyPromise;

  return eventBox;
}

/**
 * Show an event on the calendar scrolling it into view.
 *
 * @param {object} options - Options to use for showing the event.
 * @param {number} options.offset - The number of days offset the event is.
 * @param {"start" | "center" | "end"} options.inline - The scroll position in
 *  the inline direction.
 * @param {"start" | "center" | "end"} options.block - The scroll position in
 *  the block direction.
 *
 * @returns {HTMLElement}
 */
async function showEvent({
  offset = 0,
  block = "center",
  inline = "center",
} = {}) {
  const targetDate = new Date(todayDate);
  targetDate.setDate(targetDate.getDate() + offset);
  // Since from other tests we may be elsewhere, make sure we start today.
  await CalendarTestUtils.setCalendarView(window, "week");
  await CalendarTestUtils.goToDate(
    window,
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    targetDate.getDate()
  );

  const eventBox = await weekView.waitForEventBoxAt(
    window,
    targetDate.getDay() + 1,
    1
  );

  const { promise, resolve } = Promise.withResolvers();
  eventBox.ownerDocument.addEventListener("scrollend", resolve, true);

  eventBox.scrollIntoView({ behavior: "instant", block, inline });

  const timeout = setTimeout(resolve, 50);

  await promise;

  clearTimeout(timeout);
  eventBox.ownerDocument.removeEventListener("scrollend", resolve, true);

  await new Promise(eventBox.ownerGlobal.requestAnimationFrame);

  return eventBox;
}

/**
 * Show and open the dialog for an event on the calendar.
 *
 * @param {object} options - Options to use for showing the event.
 * @param {number} options.offset - The number of days the event is offset from
 *  today.
 * @param {"start" | "center" | "end"} options.inline - The scroll position in
 *  the inline direction.
 * @param {"start" | "center" | "end"} options.block - The scroll position in
 *  the block direction.
 *
 * @returns {HTMLElement}
 */
async function openAndShowEvent({
  offset = 0,
  block = "center",
  inline = "center",
} = {}) {
  const box = await showEvent({ offset, block, inline });
  return openEvent({ eventBox: box, offset });
}

/**
 * Wait for the dialog element to exist.
 */
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

/**
 * Check that the dialog falls within the expected tollerances of the target
 * and the container elements.
 *
 * @param {HTMLElement} target - The target element to compare against.
 * @param {string} message - The assertion message to display.
 */
function checkTollerance(target, message) {
  const targetRect = target.getBoundingClientRect();
  const dialogRect = document
    .querySelector('[is="calendar-dialog"]')
    .getBoundingClientRect();
  const containerRect = document
    .getElementById("calendarDisplayBox")
    .getBoundingClientRect();

  const horizontalTarget =
    Math.round(targetRect.x - dialogRect.right) === DEFAULT_DIALOG_MARGIN ||
    Math.round(dialogRect.x - targetRect.right) === DEFAULT_DIALOG_MARGIN ||
    (targetRect.right > containerRect.right &&
      dialogRect.right === DEFAULT_DIALOG_MARGIN &&
      dialogRect.x >= DEFAULT_DIALOG_MARGIN) ||
    (targetRect.x <= containerRect.x &&
      dialogRect.x === DEFAULT_DIALOG_MARGIN &&
      dialogRect.right <= DEFAULT_DIALOG_MARGIN) ||
    dialogRect.x - containerRect.x === containerRect.right - dialogRect.right ||
    (targetRect.x >= dialogRect.x && targetRect.right <= dialogRect.right);
  const verticalTarget =
    Math.round(targetRect.y - dialogRect.bottom) === DEFAULT_DIALOG_MARGIN ||
    Math.round(dialogRect.y - targetRect.bottom) === DEFAULT_DIALOG_MARGIN ||
    (targetRect.bottom > containerRect.bottom &&
      Math.round(dialogRect.bottom) === DEFAULT_DIALOG_MARGIN &&
      dialogRect.y >= DEFAULT_DIALOG_MARGIN) ||
    (targetRect.y <= containerRect.y &&
      Math.round(dialogRect.y) === DEFAULT_DIALOG_MARGIN &&
      dialogRect.bottom <= DEFAULT_DIALOG_MARGIN) ||
    Math.round(dialogRect.y - containerRect.y) ===
      Math.round(containerRect.bottom - dialogRect.bottom) ||
    (targetRect.y <= dialogRect.y && targetRect.bottom >= dialogRect.bottom) ||
    (targetRect.y >= dialogRect.y && targetRect.y <= dialogRect.bottom);
  const verticalContainer =
    dialogRect.y - containerRect.y >= DEFAULT_DIALOG_MARGIN;
  const horizontalContainer =
    dialogRect.x - containerRect.x >= DEFAULT_DIALOG_MARGIN &&
    containerRect.right - dialogRect.right >= DEFAULT_DIALOG_MARGIN;

  if (
    !horizontalTarget ||
    !verticalTarget ||
    !horizontalContainer ||
    !verticalContainer
  ) {
    info(JSON.stringify({ dialogRect, targetRect, containerRect }, null, 2));
  }

  Assert.ok(
    horizontalContainer,
    `${message} - within horizontal container tollerance`
  );
  Assert.ok(
    horizontalTarget,
    `${message} - within horizontal target tollerance`
  );
  Assert.ok(
    verticalContainer,
    `${message} - within vertical container tollerance`
  );
  Assert.ok(verticalTarget, `${message} - within vertical  target tollerance`);
}

const originalWidth = window.outerWidth;
const originalHeight = window.outerHeight;

/**
 * Resize the window and wait for the next frame.
 *
 * @param {object} size - The size of the window in the x and y directions.
 * @param {number} size.x - The size in px in the x direction.
 * @param {number} size.y - The size in px in the y direction.
 *
 * @returns {Promise<void>}
 */
async function resizeWindow({ x = originalWidth, y = originalHeight }) {
  const { promise, resolve } = Promise.withResolvers();
  let timeout;
  function debounceCallback() {
    clearTimeout(timeout);

    timeout = setTimeout(resolve, 100);
  }

  window.addEventListener("resize", debounceCallback);

  window.resizeTo(x, y);

  const skipTimeout = setTimeout(resolve, 400);

  await promise;

  clearTimeout(skipTimeout);

  window.removeEventListener("resize", debounceCallback);

  await new Promise(requestAnimationFrame);
}

/**
 * Run a positioning test based on a given set of options.
 *
 * @param {options} options - The options to use for the test.
 * @param {number} options.duration - The duration of the event in hours.
 * @param {number} options.offset - The the number of days to offset the event.
 * @param {number} options.hour - The hour of the day for the event.
 * @param {object} options.size - The window size object used for the test.
 */
async function positionTest({ calendar, duration = 1, offset, hour, size }) {
  await createEvent({ calendar, offset, hour, duration });
  let eventBox;

  for (const position of scrollPositions) {
    eventBox = await openAndShowEvent({ ...position, offset });

    checkTollerance(
      eventBox,
      `Duration: ${duration} - Offset: ${offset} - Hour: ${hour} - Window ${size.name} - Position ${JSON.stringify(position)}`
    );
  }

  document.querySelector('[is="calendar-dialog"]')?.close();
  await calendar.deleteItem(eventBox.occurrence);
}

/**
 * Setup a positioning test.
 */
async function setupPositioning() {
  // While the positioning tests are optimized to run at a very high rate
  // (~20k/min), the number of tests required for full coverage of possible
  // position, duration, size, scroll position, etc combinations, means we can
  // still hit the test timeout so increasing here for reliability.
  requestLongerTimeout(6);
  const style = document.createElement("style");
  style.textContent = `[is="calendar-dialog"] { height: 476px; }`;
  document.head.appendChild(style);

  await CalendarTestUtils.setCalendarView(window, "week");
}
