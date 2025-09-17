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
  { x: SMALL_WINDOW_WIDTH, y: SMALL_WINDOW_HEIGHT, name: "small" },
  { x: SMALL_WINDOW_WIDTH, y: LARGE_WINDOW_HEIGHT, name: "extra narrow" },
  { x: LARGE_WINDOW_WIDTH, y: SMALL_WINDOW_HEIGHT, name: "extra wide" },
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

const durationTests = [
  {
    duration: 3,
    hours: [0, 11, 21],
  },
  {
    duration: 6,
    hours: [0, 11, 18],
  },
  {
    duration: 12,
    hours: [0, 11],
  },
  {
    duration: 24,
    hours: [0],
  },
  {
    duration: 36,
    hours: [0, 12, 23],
  },
  {
    duration: 72,
    hours: [0, 12, 23],
  },
  {
    duration: 144,
    hours: [0, 12, 23],
  },
];

let count = 0;

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
 * @param {string} [options.color] - Color of the calendar.
 *
 * @returns {calICalendar}
 */
function createCalendar({
  name = `Test Event - ${count++}`,
  type = "storage",
  color,
} = {}) {
  const calendar = cal.manager.createCalendar(
    type,
    Services.io.newURI(`moz-${type}-calendar://`)
  );
  calendar.name = name;
  calendar.setProperty("calendar-main-default", true);
  // This is done so that calItemBase#isInvitation returns true.
  calendar.setProperty("organizerId", `mailto:organizer@example.com`);
  if (color) {
    calendar.setProperty("color", color);
  }
  cal.manager.registerCalendar(calendar);
  return calendar;
}

/**
 * Create an event item in the calendar.
 *
 * @param {object} options - Options to use in creating the event.
 * @param {string} [options.name="Test Event"] - The name of the event.
 * @param {Date} [options.baseDate] - Date the event start should be based on,
 *   defaults to midnight today.
 * @param {number} [options.offset=0] - The number of days from today to offset the
 *  event.
 * @param {number} [options.duration=1] - The duration of the event in hours.
 * @param {object} options.calendar - The calendar to create the event on.
 * @param {string[]} [options.categories=[]] - Categories to assign to the event.
 * @param {boolean} [options.repeats=false] - If the event is repeating.
 * @param {string} [options.location] - Location of the event. Only set if not
 *  falsy.
 * @param {string} [options.description=""] - Description for the event.
 * @param {string} [options.descriptionHTML] - HTML version of the
 *   description. Overrides description if truthy.
 *
 * @returns {CalEvent} - The created event.
 */
async function createEvent({
  name = "Test Event",
  baseDate = todayDate,
  offset = 0,
  duration = 1,
  calendar,
  categories = [],
  repeats = false,
  location,
  description = "",
  descriptionHTML,
} = {}) {
  let start = new Date(baseDate);
  start.setDate(baseDate.getDate() + offset);
  start = cal.dtz.jsDateToDateTime(start, 0);
  let end = new Date(baseDate);
  const days = Math.trunc(duration / 24);
  end.setHours(end.getHours() + (duration % 24) - 1);
  end.setMinutes(59);
  end.setSeconds(59);
  end.setMilliseconds(99);
  end.setDate(baseDate.getDate() + offset + days);
  end = cal.dtz.jsDateToDateTime(end, 0);
  const event = new CalEvent();
  event.title = name;
  event.startDate = start;
  event.endDate = end;
  event.descriptionText = description;
  if (descriptionHTML) {
    event.descriptionHTML = descriptionHTML;
  }

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
 * @param {Date} [options.baseDate] - Base date for the event to be at. Defaults
 *  to today.
 * @param {number} options.offset - The number of days offset the event is.
 * @param {"start" | "center" | "end"} options.inline - The scroll position in
 *  the inline direction.
 * @param {"start" | "center" | "end"} options.block - The scroll position in
 *  the block direction.
 *
 * @returns {HTMLElement}
 */
async function showEvent({
  baseDate = todayDate,
  offset = 0,
  block = "center",
  inline = "center",
} = {}) {
  const targetDate = new Date(baseDate);
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
 * @param {object} [options] - Options to use for showing the event.
 * @param {Date} [options.baseDate] - Base date the event is placed relative to.
 * @param {number} [options.offset] - The number of days the event is offset from
 *  today.
 * @param {"start" | "center" | "end"} [options.inline] - The scroll position in
 *  the inline direction.
 * @param {"start" | "center" | "end"} [options.block] - The scroll position in
 *  the block direction.
 *
 * @returns {HTMLElement}
 */
async function openAndShowEvent({
  baseDate = todayDate,
  offset = 0,
  block = "center",
  inline = "center",
} = {}) {
  const box = await showEvent({ baseDate, offset, block, inline });
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
 * Check that the dialog falls within the expected tolerances of the target
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

  // Distance from the target to the dialog matches margin on left.
  const horizontalLeftPositionValid =
    Math.round(targetRect.x - dialogRect.right) === DEFAULT_DIALOG_MARGIN;
  // Distance from the target to the dialog matches margin on right.
  const horizontalRightPositionValid =
    Math.round(dialogRect.x - targetRect.right) === DEFAULT_DIALOG_MARGIN;
  // Target hangs off right of the screen. The dialog should be
  // DEFAULT_DIALOG_MARGIN from the right and at least DEFAULT_DIALOG_MARGIN
  // from the left of the container.
  const horizontalLeftOverhangPositionValid =
    targetRect.right > containerRect.right &&
    Math.round(dialogRect.right) ===
      Math.round(containerRect.right - DEFAULT_DIALOG_MARGIN) &&
    dialogRect.x >= containerRect.x + DEFAULT_DIALOG_MARGIN;
  // Target hangs off left of the screen. The dialog should be
  // DEFAULT_DIALOG_MARGIN from the left and at least DEFAULT_DIALOG_MARGIN
  // from the right of the container.
  const horizontalRightOverhangPositionValid =
    targetRect.x <= containerRect.x &&
    Math.round(dialogRect.x) ===
      Math.round(containerRect.x + DEFAULT_DIALOG_MARGIN) &&
    dialogRect.right <= containerRect.right - DEFAULT_DIALOG_MARGIN;
  // The dialog is centered in the container.
  const horizontalCenteredInContainer =
    Math.round(dialogRect.x - containerRect.x) ===
    Math.round(containerRect.right - dialogRect.right);
  // The dialog is contained within the target.
  const horizontalContainedInTarget =
    targetRect.x >= dialogRect.x && targetRect.right <= dialogRect.right;

  const horizontalTarget =
    horizontalCenteredInContainer ||
    horizontalContainedInTarget ||
    horizontalLeftOverhangPositionValid ||
    horizontalRightOverhangPositionValid ||
    horizontalLeftPositionValid ||
    horizontalRightPositionValid;

  // The dialog is above the target with correct margin.
  const verticalTopPositionValid =
    Math.round(targetRect.y - dialogRect.bottom) === DEFAULT_DIALOG_MARGIN;
  // The dialog is below the target with correct margin.
  const verticalBottomPositionValid =
    Math.round(dialogRect.y - targetRect.bottom) === DEFAULT_DIALOG_MARGIN;
  // The target is hanging off the bottom of the screen the dialog should be
  // DEFAULT_DIALOG_MARGIN from the bottom of the container and at least
  // DEFAULT_DIALOG_MARGIN from the top of the container.
  const verticalTopOverhangPositionValid =
    targetRect.bottom > containerRect.bottom &&
    Math.round(dialogRect.bottom) ===
      Math.round(containerRect.bottom - DEFAULT_DIALOG_MARGIN) &&
    dialogRect.y >= containerRect.y + DEFAULT_DIALOG_MARGIN;
  // The target is hanging off the top of the screen the dialog should be
  // DEFAULT_DIALOG_MARGIN from the top of the container and at least
  // DEFAULT_DIALOG_MARGIN from the bottom of the container.
  const verticalBottomOverhangPositionValid =
    targetRect.y <= containerRect.y &&
    Math.round(dialogRect.y) ===
      Math.round(containerRect.top + DEFAULT_DIALOG_MARGIN) &&
    dialogRect.bottom <= containerRect.bottom - DEFAULT_DIALOG_MARGIN;
  // The dialog is centered in the container.
  const verticalCenteredInContainer =
    Math.round(dialogRect.y - containerRect.y) ===
    Math.round(containerRect.bottom - dialogRect.bottom);
  // The dialog is contained in the target.
  const verticalContainedInTarget =
    targetRect.y <= dialogRect.y && targetRect.bottom >= dialogRect.bottom;
  // The target is contained in the dialog.
  const verticalCoversTarget =
    targetRect.y >= dialogRect.y && targetRect.y <= dialogRect.bottom;

  const verticalTarget =
    verticalBottomOverhangPositionValid ||
    verticalTopOverhangPositionValid ||
    verticalBottomPositionValid ||
    verticalTopPositionValid ||
    verticalContainedInTarget ||
    verticalCoversTarget ||
    verticalCenteredInContainer;

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
    `${message} - within horizontal container tolerance`
  );
  Assert.ok(
    horizontalTarget,
    `${message} - within horizontal target tolerance`
  );
  Assert.ok(
    verticalContainer,
    `${message} - within vertical container tolerance`
  );
  Assert.ok(verticalTarget, `${message} - within vertical  target tolerance`);
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
  const fixedDate = new Date(todayDate);
  fixedDate.setFullYear(2025);
  fixedDate.setMonth(3);
  fixedDate.setDate(6);
  fixedDate.setHours(hour);
  await createEvent({ calendar, baseDate: fixedDate, offset, duration });
  let eventBox;

  for (const position of scrollPositions) {
    eventBox = await openAndShowEvent({
      ...position,
      baseDate: fixedDate,
      offset,
    });

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
  requestLongerTimeout(3);
  const style = document.createElement("style");
  style.textContent = `[is="calendar-dialog"] { height: 476px; }`;
  document.head.appendChild(style);

  await CalendarTestUtils.setCalendarView(window, "week");
}

/**
 * Test dialog positions with different screen sizes and durations
 *
 * @param {object} size - The size of the screen to test
 */
async function testDurations(size) {
  const calendar = createCalendar();

  await resizeWindow(size);
  for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
    for (const { duration, hours } of durationTests) {
      for (const hour of hours) {
        await positionTest({ calendar, duration, hour, offset, size });
      }
    }
  }

  window.moveTo(0, 0);
  await resizeWindow(originalWidth, originalHeight);

  CalendarTestUtils.removeCalendar(calendar);
}

/**
 * Test dialog positions with different screensizes
 *
 * @param {object[]} windowSizes
 */
async function runPositioningTest(windowSizes) {
  const calendar = createCalendar();

  for (const size of windowSizes) {
    await resizeWindow(size);

    for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
      for (const hour of [0, 6, 12, 18, 23]) {
        await positionTest({ calendar, hour, offset, size });
      }
    }

    await resizeWindow(originalWidth, originalHeight);
  }

  CalendarTestUtils.removeCalendar(calendar);
}
