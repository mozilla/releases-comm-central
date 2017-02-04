/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeeklyUntilRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

Cu.import("resource://calendar/modules/calUtils.jsm");

var SHORT_SLEEP, TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX;
var CANVAS_BOX, REC_DLG_DAYS, REC_DLG_ACCEPT, REC_DLG_UNTIL_INPUT;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, viewForward, deleteCalendars, createCalendar, menulistSelect;
var plan_for_modal_dialog, wait_for_modal_dialog;

const ENDDATE = new Date(2009, 0, 26); // last Monday in month
const HOUR = 8;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        SHORT_SLEEP,
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        EVENTPATH,
        EVENT_BOX,
        CANVAS_BOX,
        REC_DLG_DAYS,
        REC_DLG_ACCEPT,
        REC_DLG_UNTIL_INPUT,
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

function testWeeklyUntilRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 5); // Monday

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

    let box = getEventBoxPath("day", EVENT_BOX, null, 1, HOUR) + EVENTPATH;

    // check day view
    for (let week = 0; week < 3; week++) {
        // Monday
        controller.waitForElement(lookup(box));
        viewForward(controller, 2);

        // Wednesday
        controller.waitForElement(lookup(box));
        viewForward(controller, 2);

        // Friday
        controller.waitForElement(lookup(box));
        viewForward(controller, 3);
    }

    // Monday, last occurrence
    controller.waitForElement(lookup(box));
    viewForward(controller, 2);

    // Wednesday
    controller.waitForElementNotPresent(lookup(box));

    // check week view
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 5);
    for (let week = 0; week < 3; week++) {
        // Monday
        controller.waitForElement(
            lookupEventBox("week", EVENT_BOX, null, 2, HOUR, EVENTPATH)
        );

        // Wednesday
        controller.waitForElement(
            lookupEventBox("week", EVENT_BOX, null, 4, HOUR, EVENTPATH)
        );

        // Friday
        controller.waitForElement(
            lookupEventBox("week", EVENT_BOX, null, 6, HOUR, EVENTPATH)
        );

        viewForward(controller, 1);
    }

    // Monday, last occurrence
    controller.waitForElement(
        lookupEventBox("week", EVENT_BOX, null, 2, HOUR, EVENTPATH)
    );
    // Wednesday
    controller.assertNodeNotExist(
        lookupEventBox("week", EVENT_BOX, null, 4, HOUR, EVENTPATH)
    );

    // check multiweek view
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 5);
    checkMultiWeekView("multiweek");

    // check month view
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 5);
    checkMultiWeekView("month");

    // delete event
    box = getEventBoxPath("month", EVENT_BOX, 2, 2, null) + EVENTPATH;
    controller.click(lookup(box));
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(box));
}

function setRecurrence(recurrence) {
    let { sleep: recsleep, lookup: reclookup, eid: recid } =
        helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    menulistSelect(recid("period-list"), "1", recurrence);

    let mon = cal.calGetString("dateFormat", "day.2.Mmm");
    let wed = cal.calGetString("dateFormat", "day.4.Mmm");
    let fri = cal.calGetString("dateFormat", "day.6.Mmm");

    // starting from Monday so it should be checked. We have to wait a little,
    // because the checkedstate is set in background by JS.
    recurrence.waitFor(() => {
        return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    }, 30000);
    // starting from Monday so it should be checked
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    // check Wednesday and Friday too
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));

    // set until date
    recurrence.radio(recid("recurrence-range-until"));

    // delete previous date
    let untilInput = reclookup(REC_DLG_UNTIL_INPUT);
    recurrence.keypress(untilInput, "a", { accelKey: true });
    recurrence.keypress(untilInput, "VK_DELETE", {});

    let dateService = Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
                       .getService(Components.interfaces.nsIScriptableDateFormat);
    let ymd = [ENDDATE.getFullYear(), ENDDATE.getMonth() + 1, ENDDATE.getDate()];
    let endDateString = dateService.FormatDate("", dateService.dateFormatShort, ...ymd);
    recsleep(SHORT_SLEEP);
    recurrence.type(untilInput, endDateString);

    recsleep(SHORT_SLEEP);
    // Move focus to ensure the date is selected
    recurrence.keypress(untilInput, "VK_TAB", {});

    // close dialog
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
    let startWeek = view == "month" ? 2 : 1;

    for (let week = startWeek; week < startWeek + 3; week++) {
        // Monday
        controller.waitForElement(
            lookupEventBox(view, EVENT_BOX, week, 2, null, EVENTPATH)
        );
        // Wednesday
        controller.assertNode(
            lookupEventBox(view, EVENT_BOX, week, 4, null, EVENTPATH)
        );
        // Friday
        controller.assertNode(
            lookupEventBox(view, EVENT_BOX, week, 6, null, EVENTPATH)
        );
    }

    // Monday, last occurrence
    controller.assertNode(
        lookupEventBox(view, EVENT_BOX, startWeek + 3, 2, null, EVENTPATH)
    );

    // Wednesday
    controller.assertNodeNotExist(
        lookupEventBox(view, EVENT_BOX, startWeek + 3, 4, null, EVENTPATH)
    );
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
