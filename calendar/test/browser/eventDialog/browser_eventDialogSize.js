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
  dump("#calendar-new-event-menuitem click\n");
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

  dump("#calendar-new-event-menuitem click\n");
  controller.mainMenu.click("#calendar-new-event-menuitem");
  await invokeEventDialog(controller, null, (event, iframe) => {
    checkWithinTolerance(event.window.outerWidth, 640, LARGE_TOLERANCE);
    checkWithinTolerance(event.window.outerHeight, 690, LARGE_TOLERANCE);
    checkLargeEnough(event, iframe);

    // Much smaller than necessary.
    event.window.resizeTo(350, 400);
    controller.assert(() => event.window.outerWidth < 640);
    controller.assert(() => event.window.outerHeight < 690);
    controller.assert(() => event.window.outerWidth > 350);
    controller.assert(() => event.window.outerHeight > 400);
    checkLargeEnough(event, iframe);
    event.keypress(null, "VK_ESCAPE", {});
  });

  dump("#calendar-new-event-menuitem click\n");
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

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testTaskDialog() {
  dump("#calendar-new-task-menuitem click\n");
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

  dump("#calendar-new-task-menuitem click\n");
  controller.mainMenu.click("#calendar-new-task-menuitem");
  await invokeEventDialog(controller, null, (task, iframe) => {
    checkWithinTolerance(task.window.outerWidth, 650, LARGE_TOLERANCE);
    checkWithinTolerance(task.window.outerHeight, 700, LARGE_TOLERANCE);
    checkLargeEnough(task, iframe);

    // Much smaller than necessary.
    task.window.resizeTo(350, 400);
    controller.assert(() => task.window.outerWidth < 650);
    controller.assert(() => task.window.outerHeight < 700);
    controller.assert(() => task.window.outerWidth > 350);
    controller.assert(() => task.window.outerHeight > 400);
    checkLargeEnough(task, iframe);
    task.keypress(null, "VK_ESCAPE", {});
  });

  dump("#calendar-new-task-menuitem click\n");
  controller.mainMenu.click("#calendar-new-task-menuitem");
  await invokeEventDialog(controller, null, (task, iframe) => {
    checkLargeEnough(task, iframe);

    // Much larger than necessary.
    task.window.resizeTo(650, 700);
    checkWithinTolerance(task.window.outerWidth, 650);
    checkWithinTolerance(task.window.outerHeight, 700);
    task.keypress(null, "VK_ESCAPE", {});
  });

  Assert.ok(true, "Test ran to completion");
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
  dump(`Dialog is ${outer.window.outerWidth} by ${outer.window.outerHeight}\n`);
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
    controller.assert(() => value == expected);
    return;
  }
  // In an environment where the display is scaled, rounding errors can cause
  // problems with exact tests. The mechanism for persisting and restoring
  // window sizes also appears to be buggy, so we account for that by
  // increasing the tolerance.
  controller.assert(() => Math.abs(value - expected) <= tolerance);
}
