/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var switchToView, goToDate, viewForward, handleOccurrencePrompt;
var CALENDARNAME, EVENT_BOX, CANVAS_BOX;

var modalDialog = require("../shared-modules/modal-dialog");
var utils = require("../shared-modules/utils");

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
        handleOccurrencePrompt,
        CALENDARNAME,
        EVENT_BOX,
        CANVAS_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testWeeklyNRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 5);

    // rotate view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");

    // create weekly recurring event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        let dialog = new modalDialog.modalDialog(event.window);
        dialog.start(setRecurrence);
        event.waitForElement(eventid("item-repeat"));
        event.select(eventid("item-repeat"), null, null, "custom");

        event.click(eventid("button-saveandclose"));
    });

    // check day view

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 0; i < 4; i++) {
        controller.assertNode(lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH));
        viewForward(controller, 1);
    }

    // Saturday
    viewForward(controller, 1);
    controller.assertNodeNotExist(lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH));

    // check week view
    switchToView(controller, "week");

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 2; i < 6; i++) {
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, i, HOUR, EVENTPATH));
    }

    // Saturday
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, HOUR, EVENTPATH));

    // check multiweek view
    switchToView(controller, "multiweek");
    checkMultiWeekView("multiweek");

    // check month view
    switchToView(controller, "month");
    checkMultiWeekView("month");

    // delete event
    let box = getEventBoxPath("month", EVENT_BOX, 2, 2, HOUR) + EVENTPATH;
    controller.click(lookup(box));
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(box));

    // reset view
    switchToView(controller, "day");
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
}

function setRecurrence(recurrence) {
    let { lookup: reclookup, eid: recid, sleep: recsleep } = helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    recurrence.select(recid("period-list"), null, null, "1");
    recsleep();

    let mon = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.2.Mmm");
    let tue = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.3.Mmm");
    let wed = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.4.Mmm");
    let thu = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.5.Mmm");
    let sat = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.7.Mmm");

    let days = `
        /id("calendar-event-dialog-recurrence")/id("recurrence-pattern-groupbox")/
        id("recurrence-pattern-grid")/id("recurrence-pattern-rows")/
        id("recurrence-pattern-period-row")/id("period-deck")/
        id("period-deck-weekly-box")/[1]/id("daypicker-weekday")/
        anon({"anonid":"mainbox"})
    `;

    // starting from Monday so it should be checked
    recurrence.assertChecked(reclookup(`${days}/{"label":"${mon}"}`));
    // check Tuesday, Wednesday, Thursday and Saturday too
    recurrence.click(reclookup(`${days}/{"label":"${tue}"}`));
    recurrence.click(reclookup(`${days}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${days}/{"label":"${thu}"}`));
    recurrence.click(reclookup(`${days}/{"label":"${sat}"}`));

    // set number of occurrences
    recurrence.click(recid("recurrence-range-for"));
    let input = `
        /id("calendar-event-dialog-recurrence")/id("recurrence-range-groupbox")/[1]/
        id("recurrence-duration")/id("recurrence-range-count-box")/
        id("repeat-ntimes-count")/
        anon({"class":"textbox-input-box numberbox-input-box"})/
        anon({"anonid":"input"})
    `;
    // replace previous number
    recurrence.keypress(reclookup(input), "a", { ctrlKey: true });
    recurrence.type(reclookup(input), "4");

    // close dialog
    recurrence.click(reclookup(`
        /id("calendar-event-dialog-recurrence")/anon({"anonid":"buttons"})/
        {"dlgtype":"accept"}
    `));
}

function checkMultiWeekView(view) {
    let week = 1;

    // in month view event starts from 2nd row
    if (view == "month") {
        week++;
    }

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 2; i < 6; i++) {
        controller.assertNode(lookupEventBox(view, EVENT_BOX, week, i, null, EVENTPATH));
    }

    // Saturday
    controller.assertNodeNotExist(lookupEventBox(view, EVENT_BOX, week, 7, null, EVENTPATH));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
