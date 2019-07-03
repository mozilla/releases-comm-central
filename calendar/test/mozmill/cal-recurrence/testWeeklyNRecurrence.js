/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeeklyNRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers", "window-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX, CANVAS_BOX;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate, invokeEventDialog;
var viewForward, deleteCalendars, closeAllEventDialogs, createCalendar, menulistSelect;
var REC_DLG_ACCEPT, REC_DLG_DAYS;
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
        helpersForController,
        handleOccurrencePrompt,
        switchToView,
        goToDate,
        invokeEventDialog,
        viewForward,
        deleteCalendars,
        closeAllEventDialogs,
        createCalendar,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({
        REC_DLG_ACCEPT,
        REC_DLG_DAYS
    } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers")
    );

    createCalendar(controller, CALENDARNAME);
}

function testWeeklyNRecurrence() {
    goToDate(controller, 2009, 1, 5);

    // Create weekly recurring event.
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
        event.waitForElement(eventid("item-repeat"));
        menulistSelect(eventid("item-repeat"), "custom", event);
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    // Check day view.
    let box = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 0; i < 4; i++) {
        controller.waitForElement(box);
        viewForward(controller, 1);
    }

    // Not Friday.
    controller.waitForElementNotPresent(box);
    viewForward(controller, 1);

    // Not Saturday as only 4 occurrences are set.
    controller.waitForElementNotPresent(box);

    // Check week view.
    switchToView(controller, "week");

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 2; i < 6; i++) {
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, i, null, EVENTPATH));
    }

    // Saturday
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH));

    // Check multiweek view.
    switchToView(controller, "multiweek");
    checkMultiWeekView("multiweek");

    // Check month view.
    switchToView(controller, "month");
    checkMultiWeekView("month");

    // Delete event.
    box = lookupEventBox("month", EVENT_BOX, 2, 2, null, EVENTPATH);
    controller.click(box);
    handleOccurrencePrompt(controller, box, "delete", true);
    controller.waitForElementNotPresent(box);
}

function setRecurrence(recurrence) {
    let { sleep: recsleep, lookup: reclookup, eid: recid } = helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    menulistSelect(recid("period-list"), "1", recurrence);
    recsleep();

    let mon = cal.l10n.getDateFmtString("day.2.Mmm");
    let tue = cal.l10n.getDateFmtString("day.3.Mmm");
    let wed = cal.l10n.getDateFmtString("day.4.Mmm");
    let thu = cal.l10n.getDateFmtString("day.5.Mmm");
    let sat = cal.l10n.getDateFmtString("day.7.Mmm");

    // Starting from Monday so it should be checked. We have to wait a little,
    // because the checkedstate is set in background by JS.
    recurrence.waitFor(() => {
        return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    }, 30000);
    // Check Tuesday, Wednesday, Thursday and Saturday too.
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${thu}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${sat}"}`));

    // Set number of recurrences.
    recurrence.click(recid("recurrence-range-for"));
    let ntimesField = recid("repeat-ntimes-count");
    ntimesField.getNode().value = "4";

    // Close dialog.
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
    // In month view event starts from 2nd row.
    let week = view == "month" ? 2 : 1;

    // Monday, Tuesday, Wednesday, Thursday
    for (let i = 2; i < 6; i++) {
        controller.assertNode(lookupEventBox(view, EVENT_BOX, week, i, null, EVENTPATH));
    }

    // Saturday
    controller.assertNodeNotExist(lookupEventBox(view, EVENT_BOX, week, 7, null, EVENTPATH));
}

function teardownModule(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
