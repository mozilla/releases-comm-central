/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  invokeNewEventDialog,
  invokeNewTaskDialog,
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
  await invokeNewEventDialog(window, null, (eventWindow, iframeWindow) => {
    checkLargeEnough(eventWindow, iframeWindow);

    // Much larger than necessary.
    eventWindow.resizeTo(650, 690);
    checkWithinTolerance(eventWindow.outerWidth, 650);
    checkWithinTolerance(eventWindow.outerHeight, 690);
    cancelItemDialog(eventWindow);
  });

  checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);

  await invokeNewEventDialog(window, null, (eventWindow, iframeWindow) => {
    let eventDocEl = eventWindow.document.documentElement;

    checkWithinTolerance(eventWindow.outerWidth, 650, LARGE_TOLERANCE);
    checkWithinTolerance(eventWindow.outerHeight, 690, LARGE_TOLERANCE);
    checkLargeEnough(eventWindow, iframeWindow);

    // Much smaller than necessary.
    eventWindow.resizeTo(350, 400);
    checkLargeEnough(eventWindow, iframeWindow);
    Assert.less(eventWindow.outerWidth, 650, "dialog shrank");
    Assert.less(eventWindow.outerHeight, 690, "dialog shrank");
    Assert.greater(eventWindow.outerWidth, 350, "requested size not reached");
    Assert.greater(eventWindow.outerHeight, 400, "requested size not reached");
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
    cancelItemDialog(eventWindow);
  });

  await invokeNewEventDialog(window, null, (eventWindow, iframeWindow) => {
    checkLargeEnough(eventWindow, iframeWindow);

    // Much larger than necessary.
    eventWindow.resizeTo(650, 690);
    checkWithinTolerance(eventWindow.outerWidth, 650);
    checkWithinTolerance(eventWindow.outerHeight, 690);
    cancelItemDialog(eventWindow);
  });

  checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);
});

add_task(async function testTaskDialog() {
  await invokeNewTaskDialog(window, null, (taskWindow, iframeWindow) => {
    checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
    checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);

    checkLargeEnough(taskWindow, iframeWindow);

    // Much larger than necessary.
    taskWindow.resizeTo(680, 700);
    checkWithinTolerance(taskWindow.outerWidth, 680);
    checkWithinTolerance(taskWindow.outerHeight, 700);
    cancelItemDialog(taskWindow);
  });

  checkWithinTolerance(getPersistedValue("width"), 680, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 700, LARGE_TOLERANCE);

  await invokeNewTaskDialog(window, null, (taskWindow, iframeWindow) => {
    let taskDocEl = taskWindow.document.documentElement;

    checkWithinTolerance(taskWindow.outerWidth, 680, LARGE_TOLERANCE);
    checkWithinTolerance(taskWindow.outerHeight, 700, LARGE_TOLERANCE);
    checkLargeEnough(taskWindow, iframeWindow);

    // Much smaller than necessary.
    taskWindow.resizeTo(350, 400);
    checkLargeEnough(taskWindow, iframeWindow);
    Assert.less(taskWindow.outerWidth, 680, "dialog shrank");
    Assert.less(taskWindow.outerHeight, 700, "dialog shrank");
    Assert.greater(taskWindow.outerWidth, 350, "minimum size not reached");
    Assert.greater(taskWindow.outerHeight, 400, "minimum size not reached");
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
    cancelItemDialog(taskWindow);
  });

  await invokeNewTaskDialog(window, null, (taskWindow, iframeWindow) => {
    checkLargeEnough(taskWindow, iframeWindow);

    // Much larger than necessary.
    taskWindow.resizeTo(680, 700);
    checkWithinTolerance(taskWindow.outerWidth, 680);
    checkWithinTolerance(taskWindow.outerHeight, 700);
    cancelItemDialog(taskWindow);
  });
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
