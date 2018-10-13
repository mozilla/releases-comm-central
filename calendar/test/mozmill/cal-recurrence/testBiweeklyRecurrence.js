/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testBiweeklyRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var CALENDARNAME, EVENTPATH, EVENT_BOX, CANVAS_BOX;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, viewForward, createCalendar, deleteCalendars, menulistSelect;

const HOUR = 8;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        CALENDARNAME,
        EVENTPATH,
        EVENT_BOX,
        CANVAS_BOX,
        helpersForController,
        handleOccurrencePrompt,
        switchToView,
        goToDate,
        invokeEventDialog,
        viewForward,
        deleteCalendars,
        createCalendar,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testBiweeklyRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 31);

    // create biweekly event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        menulistSelect(eventid("item-repeat"), "bi.weekly", event);
        event.click(eventid("button-saveandclose"));
    });

    // check day view
    for (let i = 0; i < 4; i++) {
        controller.waitForElement(
            lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH)
        );
        viewForward(controller, 14);
    }

    // check week view
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 31);

    for (let i = 0; i < 4; i++) {
        controller.waitForElement(
            lookupEventBox("week", EVENT_BOX, null, 7, HOUR, EVENTPATH)
        );
        viewForward(controller, 2);
    }

    // check multiweek view
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 31);

    // always two occurrences in view, 1st and 3rd or 2nd and 4th week
    for (let i = 0; i < 5; i++) {
        controller.waitForElement(
            lookupEventBox("multiweek", EVENT_BOX, i % 2 + 1, 7, null, EVENTPATH)
        );
        controller.assertNode(
            lookupEventBox("multiweek", EVENT_BOX, i % 2 + 3, 7, null, EVENTPATH)
        );
        viewForward(controller, 1);
    }

    // check month view
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 31);

    // January
    controller.waitForElement(lookupEventBox("month", EVENT_BOX, 5, 7, null, EVENTPATH));
    viewForward(controller, 1);

    // February
    controller.waitForElement(lookupEventBox("month", EVENT_BOX, 2, 7, null, EVENTPATH));
    controller.assertNode(lookupEventBox("month", EVENT_BOX, 4, 7, null, EVENTPATH));
    viewForward(controller, 1);

    // March
    controller.waitForElement(lookupEventBox("month", EVENT_BOX, 2, 7, null, EVENTPATH));
    controller.assertNode(lookupEventBox("month", EVENT_BOX, 4, 7, null, EVENTPATH));

    // delete event
    let box = lookupEventBox("month", EVENT_BOX, 4, 7, null, EVENTPATH);
    controller.click(box);
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true, false);
    controller.waitForElementNotPresent(box);
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
