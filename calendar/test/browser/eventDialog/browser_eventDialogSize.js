/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { cancelItemDialog } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const SMALL_TOLERANCE = 5;
const LARGE_TOLERANCE = 10;

add_task(function setupModule(module) {
  createCalendar(controller, CALENDARNAME);
});

add_task(async function testEventDialog() {
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window);
  checkLargeEnough(dialogWindow, iframeWindow);

  // Much larger than necessary.
  dialogWindow.resizeTo(650, 690);
  checkWithinTolerance(dialogWindow.outerWidth, 650);
  checkWithinTolerance(dialogWindow.outerHeight, 690);
  cancelItemDialog(dialogWindow);

  checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);

  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window));
  let eventDocEl = dialogWindow.document.documentElement;

  checkWithinTolerance(dialogWindow.outerWidth, 650, LARGE_TOLERANCE);
  checkWithinTolerance(dialogWindow.outerHeight, 690, LARGE_TOLERANCE);
  checkLargeEnough(dialogWindow, iframeWindow);

  // Much smaller than necessary.
  dialogWindow.resizeTo(350, 400);
  checkLargeEnough(dialogWindow, iframeWindow);
  Assert.less(dialogWindow.outerWidth, 650, "dialog shrank");
  Assert.less(dialogWindow.outerHeight, 690, "dialog shrank");
  Assert.greater(dialogWindow.outerWidth, 350, "requested size not reached");
  Assert.greater(dialogWindow.outerHeight, 400, "requested size not reached");
  Assert.equal(
    eventDocEl.getAttribute("minwidth"),
    eventDocEl.getAttribute("width"),
    "minimum width attribute set"
  );
  Assert.equal(
    eventDocEl.getAttribute("minheight"),
    eventDocEl.getAttribute("height"),
    "minimum height attribute set"
  );
  cancelItemDialog(dialogWindow);

  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window));
  checkLargeEnough(dialogWindow, iframeWindow);

  // Much larger than necessary.
  dialogWindow.resizeTo(650, 690);
  checkWithinTolerance(dialogWindow.outerWidth, 650);
  checkWithinTolerance(dialogWindow.outerHeight, 690);
  cancelItemDialog(dialogWindow);

  checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);
});

add_task(async function testTaskDialog() {
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewTask(window);
  checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);

  checkLargeEnough(dialogWindow, iframeWindow);

  // Much larger than necessary.
  dialogWindow.resizeTo(680, 700);
  checkWithinTolerance(dialogWindow.outerWidth, 680);
  checkWithinTolerance(dialogWindow.outerHeight, 700);
  cancelItemDialog(dialogWindow);

  checkWithinTolerance(getPersistedValue("width"), 680, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 700, LARGE_TOLERANCE);

  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editNewTask(window));
  let taskDocEl = dialogWindow.document.documentElement;

  checkWithinTolerance(dialogWindow.outerWidth, 680, LARGE_TOLERANCE);
  checkWithinTolerance(dialogWindow.outerHeight, 700, LARGE_TOLERANCE);
  checkLargeEnough(dialogWindow, iframeWindow);

  // Much smaller than necessary.
  dialogWindow.resizeTo(350, 400);
  checkLargeEnough(dialogWindow, iframeWindow);
  Assert.less(dialogWindow.outerWidth, 680, "dialog shrank");
  Assert.less(dialogWindow.outerHeight, 700, "dialog shrank");
  Assert.greater(dialogWindow.outerWidth, 350, "minimum size not reached");
  Assert.greater(dialogWindow.outerHeight, 400, "minimum size not reached");
  Assert.equal(
    taskDocEl.getAttribute("minwidth"),
    taskDocEl.getAttribute("width"),
    "minimum width attribute set"
  );
  Assert.equal(
    taskDocEl.getAttribute("minheight"),
    taskDocEl.getAttribute("height"),
    "minimum height attribute set"
  );
  cancelItemDialog(dialogWindow);

  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editNewTask(window));
  checkLargeEnough(dialogWindow, iframeWindow);

  // Much larger than necessary.
  dialogWindow.resizeTo(680, 700);
  checkWithinTolerance(dialogWindow.outerWidth, 680);
  checkWithinTolerance(dialogWindow.outerHeight, 700);
  cancelItemDialog(dialogWindow);
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});

// Check the dialog is resized large enough to hold the iframe.
function checkLargeEnough(outerWindow, innerWindow) {
  let iframeNode = outerWindow.document.getElementById("calendar-item-panel-iframe");
  let { scrollWidth, scrollHeight } = innerWindow.document.documentElement;
  controller.waitFor(() => {
    return (
      iframeNode.clientWidth + SMALL_TOLERANCE >= scrollWidth &&
      iframeNode.clientHeight + SMALL_TOLERANCE >= scrollHeight
    );
  });
  info(`Dialog is ${outerWindow.outerWidth} by ${outerWindow.outerHeight}`);
}

function getPersistedValue(which) {
  return Services.xulStore.getValue(
    "chrome://calendar/content/calendar-event-dialog.xhtml",
    "calendar-event-window",
    which
  );
}

function checkWithinTolerance(value, expected, tolerance = 1) {
  if (controller.window.devicePixelRatio == 1) {
    Assert.equal(value, expected);
    return;
  }
  // In an environment where the display is scaled, rounding errors can cause
  // problems with exact tests. The mechanism for persisting and restoring
  // window sizes also appears to be buggy, so we account for that by
  // increasing the tolerance.
  Assert.lessOrEqual(Math.abs(value - expected), tolerance);
}
