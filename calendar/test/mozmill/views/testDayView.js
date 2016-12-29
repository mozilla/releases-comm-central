/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var CALENDARNAME;

var TITLE1 = "Day View Event";
var TITLE2 = "Day View Event Changed";
var DESC = "Day View Event Description";

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

function testDayView() {
    let dateService = Cc["@mozilla.org/intl/scriptabledateformat;1"]
                        .getService(Components.interfaces.nsIScriptableDateFormat);
    // paths
    let miniMonth = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
        id("calMinimonthBox")/id("calMinimonth")
    `;
    let dayView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("day-view")
    `;
    let day = lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"labelbox"})/
        anon({"anonid":"labeldaybox"})/{"flex":"1"}
    `);
    let eventDialog = '/id("calendar-event-dialog")/id("event-grid")/id("event-grid-rows")/';

    // open day view
    controller.click(eid("calendar-tab-button"));
    controller.waitThenClick(eid("calendar-day-view-button"));

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
        ${miniMonth}/anon({"anonid":"minimonth-header"})/
        anon({"anonid":"monthheader"})
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

    // verify date in view
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // create event at 8 AM
    let eventBox = lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"bgbox"})/[8]')
    `);

    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        // check that the start time is correct
        let startTimeInput = eventlookup(`
            ${eventDialog}/id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("event-starttime")/
            anon({"anonid":"hbox"})/anon({"anonid":"time-picker"})/
            anon({"class":"timepicker-box-class"})/
            anon({"class":"timepicker-text-class"})/anon({"flex":"1"})/
            anon({"anonid":"input"})'
        `);
        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, "8:00");
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
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), TITLE1);
        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-description-row")/id("item-description")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), DESC);
        event.select(eventid("item-calendar"), null, CALENDARNAME);

        // save
        event.click(eventid("button-saveandclose"));
    });

    // if it was created successfully, it can be opened
    eventBox = lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"topbox"})/{"flex":"1"}/
        {"flex":"1"}/[0]/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}
    `);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        // change title and save changes
        let titleTextBox = eventlookup(`
            ${eventDialog}/id("event-grid-title-row")/id("item-title")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `);
        event.waitForElement(titleTextBox);
        event.type(titleTextBox, TITLE2);
        event.click(eventid("button-saveandclose"));
    });

    // check if name was saved
    let eventName = lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"topbox"})/{"flex":"1"}/
        {"flex":"1"}/{"flex":"1"}/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}/
        anon({"flex":"1"})/anon({"anonid":"event-container"})/
        {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
        {"class":"calendar-event-details"}/anon({"anonid":"event-name"})
    `);
    controller.waitForElement(eventName);
    controller.assertJSProperty(eventName, "textContent", TITLE2);

    // delete event
    controller.click(lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"topbox"})/{"flex":"1"}/
        {"flex":"1"}/{"flex":"1"}/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}
    `));
    controller.keypress(eid("day-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"topbox"})/{"flex":"1"}/
        {"flex":"1"}/{"flex":"1"}/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}
    `));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
