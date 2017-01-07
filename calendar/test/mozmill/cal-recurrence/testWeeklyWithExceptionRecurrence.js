/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeeklyWithExceptionRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX;
var CANVAS_BOX, REC_DLG_ACCEPT, REC_DLG_DAYS;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, viewForward, deleteCalendars, createCalendar, setData;
var menulistSelect;
var plan_for_modal_dialog, wait_for_modal_dialog;

Cu.import("resource://calendar/modules/calUtils.jsm");

const HOUR = 8;
const STARTDATE = new Date(2009, 0, 6);

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        EVENT_BOX,
        CANVAS_BOX,
        EVENTPATH,
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
        setData,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers")
    );

    createCalendar(controller, CALENDARNAME);
}

function testWeeklyWithExceptionRecurrence() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 5);

    // create weekly recurring event
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        event.waitForElement(eventid("item-repeat"));
        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
        menulistSelect(eventid("item-repeat"), "custom", event);
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    // move 5th January occurrence to 6th January
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH);
    handleOccurrencePrompt(controller, eventBox, "modify", false, false);
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        setData(event, iframe, { startdate: STARTDATE, enddate: STARTDATE });
        event.click(eventid("button-saveandclose"));
    });

    // change recurrence rule
    goToDate(controller, 2009, 1, 7);
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH);
    handleOccurrencePrompt(controller, eventBox, "modify", true, false);
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { lookup: iframelookup } = helpersForController(iframe);

        event.waitForElement(eventid("item-repeat"));
        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", changeRecurrence);
        event.click(iframelookup(`
            /id("calendar-event-dialog-inner")/id("event-grid")/
            id("event-grid-rows")/id("event-grid-recurrence-row")/
            id("event-grid-recurrence-picker-box")/id("repeat-deck")/
            id("repeat-details")/[0]
        `));
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    // check two weeks
    // day view
    switchToView(controller, "day");
    let path = getEventBoxPath("day", EVENT_BOX, null, 1, HOUR) + EVENTPATH;

    goToDate(controller, 2009, 1, 5);
    controller.waitForElementNotPresent(lookup(path));

    viewForward(controller, 1);
    let tuesPath = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("day-view")/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/[0]/anon({"anonid":"boxstack"})/
        anon({"anonid":"topbox"})/{"flex":"1"}/{"flex":"1"}/[eventIndex]
    `;

    // assert exactly two
    controller.waitForElement(lookup(tuesPath.replace("eventIndex", "0") + EVENTPATH));
    controller.assertNode(lookup(tuesPath.replace("eventIndex", "1") + EVENTPATH));
    controller.assertNodeNotExist(lookup(tuesPath.replace("eventIndex", "2") + EVENTPATH));

    viewForward(controller, 1);
    controller.waitForElement(lookup(path));
    viewForward(controller, 1);
    controller.waitForElementNotPresent(lookup(path));
    viewForward(controller, 1);
    controller.waitForElement(lookup(path));
    viewForward(controller, 1);
    controller.waitForElementNotPresent(lookup(path));
    viewForward(controller, 1);
    controller.waitForElementNotPresent(lookup(path));

    // next week
    viewForward(controller, 1);
    controller.waitForElement(lookup(path));
    viewForward(controller, 1);
    controller.waitForElement(lookup(path));
    viewForward(controller, 1);
    controller.waitForElement(lookup(path));
    viewForward(controller, 1);
    controller.waitForElementNotPresent(lookup(path));
    viewForward(controller, 1);
    controller.waitForElement(lookup(path));
    viewForward(controller, 1);
    controller.waitForElementNotPresent(lookup(path));

    // week view
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 5);

    tuesPath = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("week-view")/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/[dayIndex]/anon({"anonid":"boxstack"})/
        anon({"anonid":"topbox"})/{"flex":"1"}/{"flex":"1"}/[eventIndex]
    `;

    // assert exactly two
    controller.waitForElement(lookup(
        tuesPath.replace("dayIndex", "2").replace("eventIndex", "0") + EVENTPATH
    ));
    controller.assertNode(lookup(
        tuesPath.replace("dayIndex", "2").replace("eventIndex", "1") + EVENTPATH
    ));
    controller.assertNodeNotExist(lookup(
        tuesPath.replace("dayIndex", "2").replace("eventIndex", "2") + EVENTPATH
    ));

    // check not present node after we are sure the existing ones are displayed.
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 2, HOUR));

    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 4, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 5, HOUR));
    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 6, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, HOUR));

    viewForward(controller, 1);
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 2, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 1, HOUR));
    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 3, HOUR));
    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 4, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 5, HOUR));
    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 6, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, HOUR));

    // multiweek view
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 5);
    checkMultiWeekView("multiweek");

    // month view
    switchToView(controller, "month");
    checkMultiWeekView("month");

    // delete event
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 12);
    path = getEventBoxPath("day", EVENT_BOX, null, 1, HOUR) + EVENTPATH;
    controller.click(lookup(path));
    handleOccurrencePrompt(controller, eid("day-view"), "delete", true, false);
    controller.waitForElementNotPresent(lookup(path));
}

function setRecurrence(recurrence) {
    let { lookup: reclookup, eid: recid } = helpersForController(recurrence);

    // weekly
    menulistSelect(recid("period-list"), "1", recurrence);

    let mon = cal.calGetString("dateFormat", "day.2.Mmm");
    let wed = cal.calGetString("dateFormat", "day.4.Mmm");
    let fri = cal.calGetString("dateFormat", "day.6.Mmm");

    // starting from Monday so it should be checked. We have to wait a little,
    // because the checkedstate is set in background by JS.
    recurrence.waitFor(() => {
        return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    }, 10000);
    // check Wednesday and Friday too
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));

    // close dialog
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function changeRecurrence(recurrence) {
    let { lookup: reclookup, eid: recid } = helpersForController(recurrence);

    // weekly
    menulistSelect(recid("period-list"), "1", recurrence);

    let mon = cal.calGetString("dateFormat", "day.2.Mmm");
    let tue = cal.calGetString("dateFormat", "day.3.Mmm");
    let wed = cal.calGetString("dateFormat", "day.4.Mmm");
    let fri = cal.calGetString("dateFormat", "day.6.Mmm");

    // check old rule
    // starting from Monday so it should be checked. We have to wait a little,
    // because the checkedstate is set in background by JS.
    recurrence.waitFor(() => {
        return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    }, 10000);
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));

    // check Tuesday
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));

    // close dialog
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
    let startWeek = view == "multiweek" ? 1 : 2;
    let assertNodeLookup = (...args) => {
        return controller.assertNode(lookupEventBox(...args));
    };
    let assertNodeNotExistLookup = (...args) => {
        return controller.assertNodeNotExist(lookupEventBox(...args));
    };

    // wait for the first items, then check te ones not to be present
    // assert exactly two
    controller.waitForElement(
        lookupEventBox(view, EVENT_BOX, startWeek, 3, HOUR, "/[0]")
    );
    assertNodeLookup(view, EVENT_BOX, startWeek, 3, HOUR, "/[1]");
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 3, HOUR, "/[2]");
    // Then check no item on the 5th.
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 2, HOUR, EVENTPATH);
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 3, HOUR, "/[2]");
    assertNodeLookup(view, EVENT_BOX, startWeek, 4, HOUR, EVENTPATH);
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 5, HOUR, EVENTPATH);
    assertNodeLookup(view, EVENT_BOX, startWeek, 6, HOUR, EVENTPATH);
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 7, HOUR, EVENTPATH);

    assertNodeNotExistLookup(view, EVENT_BOX, startWeek + 1, 1, HOUR, EVENTPATH);
    assertNodeLookup(view, EVENT_BOX, startWeek + 1, 2, HOUR, EVENTPATH);
    assertNodeLookup(view, EVENT_BOX, startWeek + 1, 3, HOUR, EVENTPATH);
    assertNodeLookup(view, EVENT_BOX, startWeek + 1, 4, HOUR, EVENTPATH);
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek + 1, 5, HOUR, EVENTPATH);
    assertNodeLookup(view, EVENT_BOX, startWeek + 1, 6, HOUR, EVENTPATH);
    assertNodeNotExistLookup(view, EVENT_BOX, startWeek + 1, 7, HOUR, EVENTPATH);
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
