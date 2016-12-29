/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var switchToView, goToDate, handleOccurrencePrompt;
var CALENDARNAME, EVENT_BOX, CANVAS_BOX;

var modalDialog = require("../shared-modules/modal-dialog");
var utils = require("../shared-modules/utils");

var HOUR = 8;
var STARTDATE = new Date(2009, 0, 6);
var EVENTPATH = `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        switchToView,
        viewForward,
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

function testWeeklyWithExceptionRecurrence() {
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

    // move 5th January occurrence to 6th January
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH);
    handleOccurrencePrompt(controller, eventBox, "modify", false, false);
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        let startDateInput = eventlookup(`
            /id("calendar-event-dialog")/id("event-grid")/id("event-grid-rows")/
            id("event-grid-startdate-row")/id("event-grid-startdate-picker-box")/
            id("event-starttime")/anon({"anonid":"hbox"})/
            anon({"anonid":"date-picker"})/anon({"class":"datepicker-box-class"})/
            {"class":"datepicker-text-class"}/
            anon({"class":"menulist-editable-box textbox-input-box"})/
            anon({"anonid":"input"})
        `);
        let endDateInput = eventlookup(`
            /id("calendar-event-dialog")/id("event-grid")/id("event-grid-rows")/
            id("event-grid-enddate-row")/[1]/id("event-grid-enddate-picker-box")/
            id("event-endtime")/anon({"anonid":"hbox"})/
            anon({"anonid":"date-picker"})/anon({"class":"datepicker-box-class"})/
            {"class":"datepicker-text-class"}/
            anon({"class":"menulist-editable-box textbox-input-box"})/
            anon({"anonid":"input"})
        `);

        event.keypress(startDateInput, "a", { ctrlKey: true });
        let dateService = Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
                                    .getService(Components.interfaces.nsIScriptableDateFormat);
        let ymd = [STARTDATE.getFullYear(), STARTDATE.getMonth() + 1, STARTDATE.getDate()];
        let startDateString = dateService.FormatDate("", dateService.dateFormatShort, ...ymd);
        event.type(startDateInput, startDateString);
        // applies startdate change
        event.click(endDateInput);

        event.click(eventid("button-saveandclose"));
    });

    // change recurrence rule
    goToDate(controller, 2009, 1, 7);
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, HOUR, EVENTPATH);
    handleOccurrencePrompt(controller, eventBox, "modify", true, false);
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        dialog = new modalDialog.modalDialog(event.window);
        dialog.start(changeRecurrence);
        event.waitForElement(eventid("item-repeat"));
        event.select(eventid("item-repeat"), null, null, "custom");

        event.click(eventid("button-saveandclose"));
    });

    // check two weeks
    // day view
    switchToView(controller, "day");
    let path = getEventBoxPath("day", EVENT_BOX, null, 1, HOUR) + EVENTPATH;

    goToDate(controller, 2009, 1, 5);
    controller.assertNodeNotExist(lookup(path));

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
    controller.assertNode(lookup(tuesPath.replace("eventIndex", "0") + EVENTPATH));
    controller.assertNode(lookup(tuesPath.replace("eventIndex", "1") + EVENTPATH));
    controller.assertNodeNotExist(lookup(tuesPath.replace("eventIndex", "2") + EVENTPATH));

    viewForward(controller, 1);
    controller.assertNode(lookup(path));
    viewForward(controller, 1);
    controller.assertNodeNotExist(lookup(path));
    viewForward(controller, 1);
    controller.assertNode(lookup(path));
    viewForward(controller, 1);
    controller.assertNodeNotExist(lookup(path));
    viewForward(controller, 1);
    controller.assertNodeNotExist(lookup(path));

    // next week
    viewForward(controller, 1);
    controller.assertNode(lookup(path));
    viewForward(controller, 1);
    controller.assertNode(lookup(path));
    viewForward(controller, 1);
    controller.assertNode(lookup(path));
    viewForward(controller, 1);
    controller.assertNodeNotExist(lookup(path));
    viewForward(controller, 1);
    controller.assertNode(lookup(path));
    viewForward(controller, 1);
    controller.assertNodeNotExist(lookup(path));

    // week view
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 5);

    path = getEventBoxPath("week", EVENT_BOX, null, 2, HOUR) + EVENTPATH;
    controller.assertNodeNotExist(lookup(path));

    tuesPath = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("week-view")/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/[dayIndex]/anon({"anonid":"boxstack"})/
        anon({"anonid":"topbox"})/{"flex":"1"}/{"flex":"1"}/[eventIndex]
    `;
    // assert exactly two
    controller.assertNode(
        lookup(tuesPath.replace("dayIndex", "2").replace("eventIndex", "0") + EVENTPATH)
    );
    controller.assertNode(
        lookup(tuesPath.replace("dayIndex", "2").replace("eventIndex", "1") + EVENTPATH)
    );
    controller.assertNodeNotExist(
        lookup(tuesPath.replace("dayIndex", "2").replace("eventIndex", "2") + EVENTPATH)
    );

    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 4, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 5, HOUR));
    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 6, HOUR));
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, HOUR));

    viewForward(controller, 1);
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 1, HOUR));
    controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 2, HOUR));
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

    // reset view
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
}

function setRecurrence(recurrence) {
    let { sleep: recsleep, lookup: reclookup, eid: recid } = helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    recurrence.select(recid("period-list"), null, null, "1");
    recsleep();

    let mon = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.2.Mmm");
    let wed = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.4.Mmm");
    let fri = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.6.Mmm");

    let days = `
        /id("calendar-event-dialog-recurrence")/id("recurrence-pattern-groupbox")/
        id("recurrence-pattern-grid")/id("recurrence-pattern-rows")/
        id("recurrence-pattern-period-row")/id("period-deck")/
        id("period-deck-weekly-box")/[1]/id("daypicker-weekday")/
        anon({"anonid":"mainbox"})
    `;

    // starting from Monday so it should be checked
    recurrence.assertChecked(reclookup(`${days}/{"label":"${mon}"}`));
    // check Wednesday and Friday too
    recurrence.click(reclookup(`${days}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${days}/{"label":"${fri}"}`));

    // close dialog
    recurrence.click(reclookup(`
        /id("calendar-event-dialog-recurrence")/anon({"anonid":"buttons"})/
        {"dlgtype":"accept"}
    `));
}

function changeRecurrence(recurrence) {
    let { sleep: recsleep, lookup: reclookup, eid: recid } = helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    recurrence.select(recid("period-list"), null, null, "1");
    recsleep();

    let mon = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.2.Mmm");
    let tue = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.3.Mmm");
    let wed = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.4.Mmm");
    let fri = utils.getProperty("chrome://calendar/locale/dateFormat.properties", "day.6.Mmm");

    let days = `
        /id("calendar-event-dialog-recurrence")/id("recurrence-pattern-groupbox")/
        id("recurrence-pattern-grid")/id("recurrence-pattern-rows")/
        id("recurrence-pattern-period-row")/id("period-deck")/
        id("period-deck-weekly-box")/[1]/id("daypicker-weekday")/
        anon({"anonid":"mainbox"})/
     `;

    // check old rule
    recurrence.assertChecked(reclookup(`${days}/{"label":"${mon}"}`));
    recurrence.assertChecked(reclookup(`${days}/{"label":"${wed}"}`));
    recurrence.assertChecked(reclookup(`${days}/{"label":"${fri}"}`));

    // check Tuesday
    recurrence.click(reclookup(`${days}/{"label":"${tue}"}`));

    // close dialog
    recurrence.click(reclookup(`
        /id("calendar-event-dialog-recurrence")/anon({"anonid":"buttons"})/
        {"dlgtype":"accept"}
    `));
}

function checkMultiWeekView(view) {
    let startWeek = view == "multiweek" ? 1 : 2;

    controller.assertNodeNotExist(
        lookupEventBox(view, EVENT_BOX, startWeek, 2, HOUR, EVENTPATH)
    );

    // assert exactly two
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 3, HOUR, "/[0]"));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 3, HOUR, "/[1]"));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 3, HOUR, "/[2]"));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 4, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 5, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 6, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 7, HOUR, EVENTPATH));

    startWeek++;
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 1, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 2, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 3, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 4, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 5, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 6, HOUR, EVENTPATH));
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek, 7, HOUR, EVENTPATH));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
