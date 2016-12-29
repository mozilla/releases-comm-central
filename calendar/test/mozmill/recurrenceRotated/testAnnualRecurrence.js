/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var switchToView, goToDate, handleOccurrencePrompt;
var ALLDAY, CALENDARNAME;

var STARTYEAR = 1950;
var EPOCH = 1970;

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
        ALLDAY,
        CALENDARNAME
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testAnnualRecurrence() {
    let EVENTPATH = `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`;
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, STARTYEAR, 1, 1);

    // rotate view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");

    // create yearly recurring all-day event
    let eventBox = lookupEventBox("day", ALLDAY, null, 1, null);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        event.select(eventid("item-repeat"), null, null, "yearly");
        event.click(eventid("button-save"));
    });

    let checkYears = [STARTYEAR, STARTYEAR + 1, EPOCH - 1, EPOCH, EPOCH + 1];
    let box = "";
    for (let year of checkYears) {
        goToDate(controller, year, 1, 1);
        let date = new Date(year, 0, 1);
        let column = date.getDay() + 1;

        // day view
        switchToView(controller, "day");
        controller.assertNode(
            lookupEventBox("day", ALLDAY, null, 1, null, EVENTPATH)
        );

        // week view
        switchToView(controller, "week");
        controller.assertNode(
            lookupEventBox("week", ALLDAY, null, column, null, EVENTPATH)
        );

        // multiweek view
        switchToView(controller, "multiweek");
        controller.assertNode(
            lookupEventBox("multiweek", ALLDAY, 1, column, null, EVENTPATH)
        );

        // month view
        switchToView(controller, "month");
        controller.assertNode(
            lookupEventBox("month", ALLDAY, 1, column, null, EVENTPATH)
        );
    }

    // delete event
    goToDate(controller, checkYears[0], 1, 1);
    switchToView(controller, "day");
    box = getEventBoxPath("day", ALLDAY, null, 1, null) + EVENTPATH;
    controller.click(lookup(box));
    handleOccurrencePrompt(controller, eid("day-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(box));

    // reset view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
