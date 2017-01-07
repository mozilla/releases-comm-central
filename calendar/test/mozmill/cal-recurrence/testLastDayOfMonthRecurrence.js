/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testLastDayOfMonthRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX;
var CANVAS_BOX, REC_DLG_ACCEPT;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, deleteCalendars, createCalendar, menulistSelect;
var plan_for_modal_dialog, wait_for_modal_dialog;

const HOUR = 8;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        EVENTPATH,
        EVENT_BOX,
        CANVAS_BOX,
        REC_DLG_ACCEPT,
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        switchToView,
        goToDate,
        handleOccurrencePrompt,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers")
    );

    createCalendar(controller, CALENDARNAME);
}

function testLastDayOfMonthRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2008, 1, 31); // start with a leap year

    // create monthly recurring event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
        menulistSelect(eventid("item-repeat"), "custom", event);
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    // data tuple: [year, month, day, row in month view]
    // note: month starts here with 1 for January
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
    // check all dates
    for (let [y, m, d, correctRow] of checkingData) {
        let date = new Date(y, m - 1, d);
        let column = date.getDay() + 1;

        goToDate(controller, y, m, d);

        // day view
        switchToView(controller, "day");
        controller.waitForElement(
            lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH)
        );

        // week view
        switchToView(controller, "week");
        controller.waitForElement(
            lookupEventBox("week", EVENT_BOX, null, column, HOUR, EVENTPATH)
        );

        // multiweek view
        switchToView(controller, "multiweek");
        controller.waitForElement(
            lookupEventBox("multiweek", EVENT_BOX, 1, column, null, EVENTPATH)
        );

        // month view
        switchToView(controller, "month");
        controller.waitForElement(
            lookupEventBox("month", EVENT_BOX, correctRow, column, null, EVENTPATH)
        );
    }

    // delete event
    goToDate(controller, checkingData[0][0], checkingData[0][1], checkingData[0][2]);
    switchToView(controller, "day");
    let box = getEventBoxPath("day", EVENT_BOX, null, 1, HOUR) + EVENTPATH;
    controller.waitThenClick(lookup(box));
    handleOccurrencePrompt(controller, eid("day-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(box));
}

function setRecurrence(recurrence) {
    let {
        sleep: recsleep,
        lookup: reclookup,
        eid: recid
    } = helpersForController(recurrence);

    // monthly
    menulistSelect(recid("period-list"), "2", recurrence);

    // last day of month
    recurrence.radio(recid("montly-period-relative-date-radio"));
    menulistSelect(recid("monthly-ordinal"), "-1", recurrence);
    menulistSelect(recid("monthly-weekday"), "-1", recurrence);
    recsleep();

    // close dialog
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
