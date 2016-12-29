/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var switchToView, goToDate, handleOccurrencePrompt;
var CALENDARNAME, EVENT_BOX, CANVAS_BOX;

var modalDialog = require("../shared-modules/modal-dialog");

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
        handleOccurrencePrompt,
        CALENDARNAME,
        EVENT_BOX,
        CANVAS_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testLastDayOfMonthRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2008, 1, 31); // start with a leap year

    // rotate view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");

    // create monthly recurring event
    let eventBox = lookupEventBox(controller, "day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        let dialog = new modalDialog.modalDialog(event.window);
        dialog.start(setRecurrence);
        event.waitForElement(eventid("item-repeat"));
        event.select(eventid("item-repeat"), null, null, "custom");

        event.click(eventid("button-saveandclose"));
    });

    //                      date      correct row in month view
    //                   vvvvvvvvvvv  v
    let checkingData = [[2008, 1, 31, 5],
                        [2008, 2, 29, 5],
                        [2008, 3, 31, 6],
                        [2008, 4, 30, 5],
                        [2008, 5, 31, 5],
                        [2008, 6, 30, 5],
                        [2008, 7, 31, 5],
                        [2008, 8, 31, 6],
                        [2008, 9, 30, 5],
                        [2008, 10, 31, 5],
                        [2008, 11, 30, 6],
                        [2008, 12, 31, 5],
                        [2009, 1, 31, 5],
                        [2009, 2, 28, 4],
                        [2009, 3, 31, 5]];
    let box = "";

    // check all dates
    for (let [y, m, d, correctRow] of checkingData) {
        goToDate(controller, y, m, d);

        // day view
        switchToView(controller, "day");
        controller.waitForElement(
            lookupEventBox(controller, "day", EVENT_BOX, null, 1, HOUR, EVENTPATH)
        );

        // week view
        switchToView(controller, "week");
        let date = new Date(y, m - 1, d);
        let column = date.getDay() + 1;
        controller.waitForElement(
            lookupEventBox(controller, "week", EVENT_BOX, null, column, HOUR, EVENTPATH)
        );

        // multiweek view
        switchToView(controller, "multiweek");
        controller.assertNode(
            lookupEventBox(controller, "multiweek", EVENT_BOX, 1, column, null, EVENTPATH)
        );

        // month view
        switchToView(controller, "month");
        controller.assertNode(
            lookupEventBox(controller, "month", EVENT_BOX, correctRow, column, null, EVENTPATH)
        );
    }

    // delete event
    goToDate(controller, checkingData[0][0], checkingData[0][1], checkingData[0][2]);
    switchToView(controller, "day");

    box = getEventBoxPath(controller, "day", EVENT_BOX, null, 1, HOUR) + EVENTPATH;
    controller.waitThenClick(lookup(box));
    handleOccurrencePrompt(controller, eid("day-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(box));

    // reset view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
}

function setRecurrence(recurrence) {
    let { lookup: reclookup, eid: recid, sleep: recsleep } = helpersForController(recurrence);

    // monthly
    recsleep();
    recurrence.select(recid("period-list"), null, null, "2");

    // last day of month
    recurrence.click(recid("montly-period-relative-date-radio"));
    recsleep();
    recurrence.select(recid("monthly-ordinal"), null, null, "-1");
    recsleep();
    recurrence.select(recid("monthly-weekday"), null, null, "-1");
    recsleep();

    // close dialog
    recurrence.click(reclookup(`
        /id("calendar-event-dialog-recurrence")/anon({"anonid":"buttons"})/
        {"dlgtype":"accept"}
    `));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
