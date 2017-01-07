/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeeklyNRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

Cu.import("resource://calendar/modules/calUtils.jsm");

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX, CANVAS_BOX;
var REC_DLG_ACCEPT, REC_DLG_DAYS;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, viewForward, deleteCalendars, createCalendar, menulistSelect;
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
        REC_DLG_DAYS,
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

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers")
    );

    createCalendar(controller, CALENDARNAME);
}

function testWeeklyNRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 5);

    // create weekly recurring event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
        event.waitForElement(eventid("item-repeat"));
        menulistSelect(eventid("item-repeat"), "custom", event);
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    // check day view
    let box = getEventBoxPath("day", EVENT_BOX, undefined, 1, HOUR) + EVENTPATH;
    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 0; i < 4; i++) {
        controller.waitForElement(lookup(box));
        viewForward(controller, 1);
    }

    // Not Friday
    sleep();
    controller.assertNodeNotExist(lookup(box));
    viewForward(controller, 1);

    // Not Saturday as only 4 occurrences are set.
    sleep();
    controller.assertNodeNotExist(lookup(box));

    // check week view
    switchToView(controller, "week");

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 2; i < 6; i++) {
        controller.waitForElement(
            lookupEventBox("week", EVENT_BOX, null, i, HOUR, EVENTPATH)
        );
    }

    // Saturday
    controller.assertNodeNotExist(
        lookupEventBox("week", EVENT_BOX, null, 7, HOUR, EVENTPATH)
    );

    // check multiweek view
    switchToView(controller, "multiweek");
    checkMultiWeekView("multiweek");

    // check month view
    switchToView(controller, "month");
    checkMultiWeekView("month");

    // delete event
    box = getEventBoxPath("month", EVENT_BOX, 2, 2, HOUR) + EVENTPATH;
    controller.click(lookup(box));
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(box));
}

function setRecurrence(recurrence) {
    let {
        sleep: recsleep,
        lookup: reclookup,
        eid: recid,
    } = helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    menulistSelect(recid("period-list"), "1", recurrence);
    recsleep();

    let mon = cal.calGetString("dateFormat", "day.2.Mmm");
    let tue = cal.calGetString("dateFormat", "day.3.Mmm");
    let wed = cal.calGetString("dateFormat", "day.4.Mmm");
    let thu = cal.calGetString("dateFormat", "day.5.Mmm");
    let sat = cal.calGetString("dateFormat", "day.7.Mmm");

    // starting from Monday so it should be checked. We have to wait a little,
    // because the checkedstate is set in background by JS.
    recurrence.waitFor(() => {
        return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    }, 30000);
    // check Tuesday, Wednesday, Thursday and Saturday too
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${thu}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${sat}"}`));

    // set number of occurrences
    recurrence.click(recid("recurrence-range-for"));
    let ntimesField = recid("repeat-ntimes-count");
    ntimesField.getNode().value = "4";

    // close dialog
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
    // make sure, the view has time to load
    sleep();

    // In month view event starts from 2nd row
    let week = view == "month" ? 2 : 1;

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 2; i < 6; i++) {
        controller.assertNode(
            lookupEventBox(view, EVENT_BOX, week, i, null, EVENTPATH)
        );
    }

    // Saturday
    controller.assertNodeNotExist(
        getEventBoxPath(view, EVENT_BOX, week, 7, null, EVENTPATH)
    );
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
