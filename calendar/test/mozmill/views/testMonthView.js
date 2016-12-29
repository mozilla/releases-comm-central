/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var CALENDARNAME;

var TITLE1 = "Month View Event";
var TITLE2 = "Month View Event Changed";
var DESC = "Month View Event Description";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        CALENDARNAME
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testMonthView() {
    let dateService = Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
                                .getService(Components.interfaces.nsIScriptableDateFormat);
    // paths
    let miniMonth = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
        id("calMinimonthBox")/id("calMinimonth")
    `;
    let monthView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("month-view")
    `;
    let eventDialog = '/id("calendar-event-dialog")/id("event-grid")/id("event-grid-rows")/';
    let eventBox = `
        ${monthView}/anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
        anon({"anonid":"monthgridrows"})/[0]/{"selected":"true"}/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}/
        anon({"flex":"1"})/[0]/anon({"anonid":"event-container"})/
        {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
        {"class":"calendar-event-details"}
    `;

    controller.click(eid("calendar-tab-button"));
    controller.waitThenClick(eid("calendar-month-view-button"));

    // pick year
    controller.click(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/anon({"anonid":"yearcell"})
    `));
    controller.click(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/
        anon({"anonid":"minmonth-popupset"})/anon({"anonid":"years-popup"})/[0]/
        {"value":"2009"}
    `));

    // pick month
    controller.waitThenClick(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/anon({"anonid":"monthheader"})
    `));
    controller.click(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/
        anon({"anonid":"minmonth-popupset"})/anon({"anonid":"months-popup"})/[0]/
        {"index":"0"}
    `));

    // pick day
    controller.waitThenClick(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-calendar"})/[1]/{"value":"1"}
    `));

    // verify date
    let day = lookup(`
        ${monthView}/anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
        anon({"anonid":"monthgridrows"})/[0]/{"selected":"true"}
    `);
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // create event
    // Thursday of 2009-01-01 should be the selected box in the first row with default settings
    let hour = new Date().getHours(); // remember time at click
    eventBox = lookup(`
        ${monthView}/anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
        anon({"anonid":"monthgridrows"})/[0]/{"selected":"true"}/
        anon({"anonid":"day-items"})
    `);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        // check that the start time is correct
        // next full hour except last hour hour of the day
        let nextHour = hour == 23 ? hour : (hour + 1) % 24;
        let startTime = nextHour + ":00"; // next full hour
        let startTimeInput = eventlookup(`
            ${eventDialog}/id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("event-starttime")/
            anon({"anonid":"hbox"})/anon({"anonid":"time-picker"})/
            anon({"class":"timepicker-box-class"})/
            anon({"class":"timepicker-text-class"})/anon({"flex":"1"})/
            anon({"anonid":"input"})
        `);
        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, startTime);

        let date = dateService.FormatDate("", dateService.dateFormatShort, 2009, 1, 1);
        event.assertValue(eventlookup(`
            ${eventDialog}/id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("event-starttime")/
            anon({"anonid":"hbox"})/anon({"anonid":"date-picker"})/
            anon({"flex":"1","id":"hbox","class":"datepicker-box-class"})/
            {"class":"datepicker-text-class"}/
            anon({"class":"menulist-editable-box textbox-input-box"})/
            anon({"anonid":"input"})
        `), date);

        // fill in title, description and calendar
        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-title-row")/id("item-title")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})'),
        `), TITLE1);
        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-description-row")/id("item-description")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), DESC);
        event.click(eventid("item-calendar"));
        event.click(eventlookup(`
            ${eventDialog}/id("event-grid-category-color-row")/
            id("event-grid-category-box")/id("item-calendar")/[0]/
            {"label":"${CALENDARNAME}"}'
        `));

        // save
        event.click(eventid("button-saveandclose"));
    });

    // if it was created successfully, it can be opened
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        // change title and save changes
        let titleTextBox = eventlookup(`
            ${eventDialog}/id("event-grid-title-row")/id("item-title")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})'
        `);
        event.waitForElement(titleTextBox);
        event.type(titleTextBox, TITLE2);
        event.click(eventid("button-saveandclose"));
    });

    // check if name was saved
    let eventName = lookup(eventBox + '/{"flex":"1"}/anon({"anonid":"event-name"})');

    controller.waitForElement(eventName);
    controller.assertValue(eventName, TITLE2);

    // delete event
    controller.click(lookup(eventBox));
    controller.keypress(eid("month-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookup(eventBox));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
