/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARNAME,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  helpersForController,
  invokeEventDialog,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var controller = mozmill.getMail3PaneController();

const SMALL_TOLERANCE = 5;
const LARGE_TOLERANCE = 10;

add_task(function setupModule(module) {
  createCalendar(controller, CALENDARNAME);
});

add_task(async function testEventDialog() {
  info("#calendar-new-event-menuitem click");
  controller.mainMenu.click("#calendar-new-event-menuitem");
  await invokeEventDialog(controller, null, (event, iframe) => {
    checkLargeEnough(event, iframe);

    // Much larger than necessary.
    event.window.resizeTo(640, 690);
    checkWithinTolerance(event.window.outerWidth, 640);
    checkWithinTolerance(event.window.outerHeight, 690);
    event.keypress(null, "VK_ESCAPE", {});
  });

  checkWithinTolerance(getPersistedValue("width"), 640, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);

  info("#calendar-new-event-menuitem click");
  controller.mainMenu.click("#calendar-new-event-menuitem");
  await invokeEventDialog(controller, null, (event, iframe) => {
    let eventDocEl = event.window.document.documentElement;

    checkWithinTolerance(event.window.outerWidth, 640, LARGE_TOLERANCE);
    checkWithinTolerance(event.window.outerHeight, 690, LARGE_TOLERANCE);
    checkLargeEnough(event, iframe);

    // Much smaller than necessary.
    event.window.resizeTo(350, 400);
    checkLargeEnough(event, iframe);
    ok(event.window.outerWidth < 640, "dialog shrank");
    ok(event.window.outerHeight < 690, "dialog shrank");
    ok(event.window.outerWidth > 350, "requested size not reached");
    ok(event.window.outerHeight > 400, "requested size not reached");
    is(
      eventDocEl.getAttribute("minwidth"),
      eventDocEl.getAttribute("width"),
      "minimum width attribute set"
    );
    is(
      eventDocEl.getAttribute("minheight"),
      eventDocEl.getAttribute("height"),
      "minimum height attribute set"
    );
    event.keypress(null, "VK_ESCAPE", {});
  });

  info("#calendar-new-event-menuitem click");
  controller.mainMenu.click("#calendar-new-event-menuitem");
  await invokeEventDialog(controller, null, (event, iframe) => {
    checkLargeEnough(event, iframe);

    // Much larger than necessary.
    event.window.resizeTo(640, 690);
    checkWithinTolerance(event.window.outerWidth, 640);
    checkWithinTolerance(event.window.outerHeight, 690);
    event.keypress(null, "VK_ESCAPE", {});
  });

  checkWithinTolerance(getPersistedValue("width"), 640, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);
});

add_task(async function testTaskDialog() {
  info("#calendar-new-task-menuitem click");
  controller.mainMenu.click("#calendar-new-task-menuitem");
  await invokeEventDialog(controller, null, (task, iframe) => {
    checkWithinTolerance(getPersistedValue("width"), 640, LARGE_TOLERANCE);
    checkWithinTolerance(getPersistedValue("height"), 690, LARGE_TOLERANCE);

    checkLargeEnough(task, iframe);

    // Much larger than necessary.
    task.window.resizeTo(650, 700);
    checkWithinTolerance(task.window.outerWidth, 650);
    checkWithinTolerance(task.window.outerHeight, 700);
    task.keypress(null, "VK_ESCAPE", {});
  });

  checkWithinTolerance(getPersistedValue("width"), 650, LARGE_TOLERANCE);
  checkWithinTolerance(getPersistedValue("height"), 700, LARGE_TOLERANCE);

  info("#calendar-new-task-menuitem click");
  controller.mainMenu.click("#calendar-new-task-menuitem");
  await invokeEventDialog(controller, null, (task, iframe) => {
    let taskDocEl = task.window.document.documentElement;

    checkWithinTolerance(task.window.outerWidth, 650, LARGE_TOLERANCE);
    checkWithinTolerance(task.window.outerHeight, 700, LARGE_TOLERANCE);
    checkLargeEnough(task, iframe);

    // Much smaller than necessary.
    task.window.resizeTo(350, 400);
    checkLargeEnough(task, iframe);
    ok(task.window.outerWidth < 650, "dialog shrank");
    ok(task.window.outerHeight < 700, "dialog shrank");
    ok(task.window.outerWidth > 350, "minimum size not reached");
    ok(task.window.outerHeight > 400, "minimum size not reached");
    is(
      taskDocEl.getAttribute("minwidth"),
      taskDocEl.getAttribute("width"),
      "minimum width attribute set"
    );
    is(
      taskDocEl.getAttribute("minheight"),
      taskDocEl.getAttribute("height"),
      "minimum height attribute set"
    );
    task.keypress(null, "VK_ESCAPE", {});
  });

  info("#calendar-new-task-menuitem click");
  controller.mainMenu.click("#calendar-new-task-menuitem");
  await invokeEventDialog(controller, null, (task, iframe) => {
    checkLargeEnough(task, iframe);

    // Much larger than necessary.
    task.window.resizeTo(650, 700);
    checkWithinTolerance(task.window.outerWidth, 650);
    checkWithinTolerance(task.window.outerHeight, 700);
    task.keypress(null, "VK_ESCAPE", {});
  });
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});

// Check the dialog is resized large enough to hold the iframe.
function checkLargeEnough(outer, inner) {
  let { eid: outerId } = helpersForController(outer);

  let iframeNode = outerId("lightning-item-panel-iframe").getNode();
  let { scrollWidth, scrollHeight } = inner.window.document.documentElement;
  outer.waitFor(() => {
    return (
      iframeNode.clientWidth + SMALL_TOLERANCE >= scrollWidth &&
      iframeNode.clientHeight + SMALL_TOLERANCE >= scrollHeight
    );
  });
  info(`Dialog is ${outer.window.outerWidth} by ${outer.window.outerHeight}`);
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
    ok(value == expected);
    return;
  }
  // In an environment where the display is scaled, rounding errors can cause
  // problems with exact tests. The mechanism for persisting and restoring
  // window sizes also appears to be buggy, so we account for that by
  // increasing the tolerance.
  ok(Math.abs(value - expected) <= tolerance);
}
