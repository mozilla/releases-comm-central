/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testEventDialogSize";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var helpersForController, invokeEventDialog, createCalendar, closeAllEventDialogs, deleteCalendars;
var CALENDARNAME;

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const SMALL_TOLERANCE = 5;
const LARGE_TOLERANCE = 10;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        closeAllEventDialogs,
        deleteCalendars,
        CALENDARNAME,
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testEventDialog() {
    dump("#ltnNewEvent click\n");
    controller.mainMenu.click("#ltnNewEvent");
    invokeEventDialog(controller, null, (event, iframe) => {
        checkLargeEnough(event, iframe);

        // Much larger than necessary.
        event.window.resizeTo(640, 690);
        checkWithinTolerance(event.window.outerWidth, 640);
        checkWithinTolerance(event.window.outerHeight, 690);
        event.keypress(null, "VK_ESCAPE", {});
    });

    checkWithinTolerance(getPersistedValue("event", "width"), 640, LARGE_TOLERANCE);
    checkWithinTolerance(getPersistedValue("event", "height"), 690, LARGE_TOLERANCE);

    dump("#ltnNewEvent click\n");
    controller.mainMenu.click("#ltnNewEvent");
    invokeEventDialog(controller, null, (event, iframe) => {
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

    dump("#ltnNewEvent click\n");
    controller.mainMenu.click("#ltnNewEvent");
    invokeEventDialog(controller, null, (event, iframe) => {
        checkLargeEnough(event, iframe);

        // Much larger than necessary.
        event.window.resizeTo(640, 690);
        checkWithinTolerance(event.window.outerWidth, 640);
        checkWithinTolerance(event.window.outerHeight, 690);
        event.keypress(null, "VK_ESCAPE", {});
    });

    checkWithinTolerance(getPersistedValue("event", "width"), 640, LARGE_TOLERANCE);
    checkWithinTolerance(getPersistedValue("event", "height"), 690, LARGE_TOLERANCE);
}

function testTaskDialog() {
    dump("#ltnNewTask click\n");
    controller.mainMenu.click("#ltnNewTask");
    invokeEventDialog(controller, null, (task, iframe) => {
        checkWithinTolerance(getPersistedValue("event", "width"), 640, LARGE_TOLERANCE);
        checkWithinTolerance(getPersistedValue("event", "height"), 690, LARGE_TOLERANCE);

        checkLargeEnough(task, iframe);

        // Much larger than necessary.
        task.window.resizeTo(650, 700);
        checkWithinTolerance(task.window.outerWidth, 650);
        checkWithinTolerance(task.window.outerHeight, 700);
        task.keypress(null, "VK_ESCAPE", {});
    });

    checkWithinTolerance(getPersistedValue("task", "width"), 650, LARGE_TOLERANCE);
    checkWithinTolerance(getPersistedValue("task", "height"), 700, LARGE_TOLERANCE);

    dump("#ltnNewTask click\n");
    controller.mainMenu.click("#ltnNewTask");
    invokeEventDialog(controller, null, (task, iframe) => {
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

    dump("#ltnNewTask click\n");
    controller.mainMenu.click("#ltnNewTask");
    invokeEventDialog(controller, null, (task, iframe) => {
        checkLargeEnough(task, iframe);

        // Much larger than necessary.
        task.window.resizeTo(650, 700);
        checkWithinTolerance(task.window.outerWidth, 650);
        checkWithinTolerance(task.window.outerHeight, 700);
        task.keypress(null, "VK_ESCAPE", {});
    });
}

function teardownModule(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}

// Check the dialog is resized large enough to hold the iframe.
function checkLargeEnough(outer, inner) {
    let { eid: outerId } = helpersForController(outer);

    let iframeNode = outerId("lightning-item-panel-iframe").getNode();
    let { scrollWidth, scrollHeight } = inner.window.document.documentElement;
    outer.waitFor(() => {
        return (iframeNode.clientWidth + SMALL_TOLERANCE >= scrollWidth) &&
            (iframeNode.clientHeight + SMALL_TOLERANCE >= scrollHeight);
    });
    dump(`Dialog is ${outer.window.outerWidth} by ${outer.window.outerHeight}\n`);
}

function getPersistedValue(type, which) {
    return Services.xulStore.getValue("chrome://calendar/content/calendar-event-dialog.xul",
                                      `calendar-${type}-dialog`, which);
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
