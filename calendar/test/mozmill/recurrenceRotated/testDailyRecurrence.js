/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var switchToView, goToDate, viewForward, viewBack, handleOccurrencePrompt;
var CALENDARNAME, EVENT_BOX, CANVAS_BOX;

var HOUR = 8;
var EVENTPATH = `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        switchToView,
        goToDate,
        viewForward,
        viewBack,
        handleOccurrencePrompt,
        CALENDARNAME,
        EVENT_BOX,
        CANVAS_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testDailyRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 1);

    // rotate view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");

    // create daily event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        event.waitForElement(eventid("item-repeat"));
        event.select(eventid("item-repeat"), null, null, "daily");
        event.click(eventid("button-saveandclose"));
    });

    // check day view for 7 days
    let daybox = getEventBoxPath("day", EVENT_BOX, null, 1, HOUR, null) + EVENTPATH;
    controller.waitForElement(lookup(daybox));

    for (let day = 1; day <= 7; day++) {
        controller.assertNode(lookup(daybox));
        viewForward(controller, 1);
    }

    // check week view for 2 weeks
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 1);

    for (let day = 5; day <= 7; day++) {
        controller.assertNode(lookupEventBox("week", EVENT_BOX, 1, day, HOUR, EVENTPATH));
    }

    viewForward(controller, 1);

    for (let day = 1; day <= 7; day++) {
        controller.assertNode(lookupEventBox("week", EVENT_BOX, 2, day, HOUR, EVENTPATH));
    }

    // check multiweek view for 4 weeks
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 1);

    for (let day = 5; day <= 7; day++) {
        controller.assertNode(lookupEventBox("multiweek", EVENT_BOX, 1, day, HOUR, EVENTPATH));
    }

    for (let week = 2; week <= 4; week++) {
        for (let day = 1; day <= 7; day++) {
            controller.assertNode(
                lookupEventBox("multiweek", EVENT_BOX, week, day, HOUR, EVENTPATH)
            );
        }
    }

    // check month view for all 5 weeks
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 1);

    for (let day = 5; day <= 7; day++) {
        controller.assertNode(lookupEventBox("month", EVENT_BOX, 1, day, null, EVENTPATH));
    }

    for (let week = 2; week <= 5; week++) {
        for (let day = 1; day <= 7; day++) {
            controller.assertNode(
                lookupEventBox("month", EVENT_BOX, week, day, null, EVENTPATH)
            );
        }
    }

    // delete 3rd January occurrence
    let saturday = getEventBoxPath("month", EVENT_BOX, 1, 7, null) + EVENTPATH;
    controller.click(lookup(saturday));
    handleOccurrencePrompt(controller, eid("month-view"), "delete", false, false);

    // verify in all views
    controller.waitForElementNotPresent(lookup(saturday));

    switchToView(controller, "multiweek");
    controller.assertNodeNotExist(
        lookupEventBox("multiweek", EVENT_BOX, 1, 7, null, EVENTPATH)
    );

    switchToView(controller, "week");
    controller.assertNodeNotExist(
        lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH)
    );

    switchToView(controller, "day");
    controller.assertNodeNotExist(
        lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH)
    );

    // go to previous day to edit event to occur only on weekdays
    viewBack(controller, 1);

    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH);
    handleOccurrencePrompt(controller, eventBox, "modify", true, false);
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        event.waitForElement(eventid("item-repeat"));
        event.select(eventid("item-repeat"), null, null, "every.weekday");
        event.click(eventid("button-saveandclose"));
    });

    // check day view for 7 days
    let day = getEventBoxPath("day", EVENT_BOX, null, 1, null) + EVENTPATH;
    let dates = [[2009, 1, 3], [2009, 1, 4]];
    for (let [y, m, d] of dates) {
        goToDate(controller, y, m, d);
        controller.assertNodeNotExist(lookup(day));
    }

    // check week view for 2 weeks
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 1);

    for (let i = 0; i <= 1; i++) {
        controller.assertNodeNotExist(
            lookupEventBox("week", EVENT_BOX, null, 1, null, EVENTPATH)
        );
        controller.assertNodeNotExist(
            lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH)
        );

        viewForward(controller, 1);
    }

    // check multiweek view for 4 weeks
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 1);

    for (let i = 1; i <= 4; i++) {
        controller.assertNodeNotExist(
            lookupEventBox("multiweek", EVENT_BOX, i, 1, null, EVENTPATH)
        );

        controller.assertNodeNotExist(
            lookupEventBox("multiweek", EVENT_BOX, i, 7, null, EVENTPATH)
        );

        viewForward(controller, 1);
    }

    // check month view for all 5 weeks
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 1);

    for (let i = 1; i <= 5; i++) {
        controller.assertNodeNotExist(
            lookupEventBox("month", EVENT_BOX, i, 1, null, EVENTPATH)
        );

        controller.assertNodeNotExist(
            lookupEventBox("month", EVENT_BOX, i, 7, null, EVENTPATH)
        );

        viewForward(controller, 1);
    }

    // delete event
    day = getEventBoxPath("month", EVENT_BOX, 1, 5, null) + EVENTPATH;
    controller.click(lookup(day));
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(day));

    // reset view
    switchToView(controller, "day");
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
