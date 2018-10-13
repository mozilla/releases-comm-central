/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm", null);

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var goToDate, setData, lookupEventBox;
var CALENDARNAME, CANVAS_BOX, EVENT_BOX;

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        goToDate,
        setData,
        lookupEventBox,
        CALENDARNAME,
        CANVAS_BOX,
        EVENT_BOX
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testWeekView() {
    let dateFormatter = cal.getDateFormatter();
    // paths
    let weekView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("week-view")/
    `;

    controller.click(eid("calendar-tab-button"));
    controller.waitThenClick(eid("calendar-week-view-button"));

    goToDate(controller, 2009, 1, 1);

    // verify date
    let day = lookup(`
        ${weekView}/anon({"anonid":"mainbox"})/anon({"anonid":"headerbox"})/
        anon({"anonid":"headerdaybox"})/{"selected":"true"}
    `);
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // create event at 8 AM
    // Thursday of 2009-01-01 is 4th with default settings
    let eventBox = lookupEventBox("week", CANVAS_BOX, null, 5, 8);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { lookup: iframeLookup } = helpersForController(iframe);

        let innerFrame = '/id("calendar-event-dialog-inner")/id("event-grid")/id("event-grid-rows")/';
        let dateInput = `
            anon({"class":"datepicker-box-class"})/{"class":"datepicker-text-class"}/
            anon({"class":"menulist-editable-box textbox-input-box"})/
            anon({"anonid":"input"})
        `;
        let timeInput = `
            anon({"anonid":"hbox"})/anon({"anonid":"time-picker"})/
            anon({"class":"timepicker-box-class"})/
            anon({"class":"timepicker-text-class"})/anon({"flex":"1"})/
            anon({"anonid":"input"})
        `;
        let startId = "event-starttime";

        let startTimeInput = iframeLookup(`
            ${innerFrame}/id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("${startId}")/${timeInput}
        `);
        let startDateInput = iframeLookup(`
            ${innerFrame}/id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("${startId}")/
            anon({"anonid":"hbox"})/anon({"anonid":"date-picker"})/${dateInput}
        `);

        // check that the start time is correct
        event.waitForElement(startTimeInput);
        let someDate = cal.createDateTime();
        someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);
        event.assertValue(startTimeInput, dateFormatter.formatTime(someDate));
        event.assertValue(startDateInput, dateFormatter.formatDateShort(someDate));

        // fill in title, description and calendar
        setData(event, iframe, { title: TITLE1, description: DESC, calendar: CALENDARNAME });

        // save
        event.click(eventid("button-saveandclose"));
    });

    // if it was created successfully, it can be opened
    eventBox = lookupEventBox(
        "week", EVENT_BOX, null, 5, 8,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`
    );
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        // change title and save changes
        setData(event, iframe, { title: TITLE2 });
        event.click(eventid("button-saveandclose"));
    });

    // check if name was saved
    let eventName = lookupEventBox(
        "week", EVENT_BOX, null, 5, 8,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}/
        anon({"flex":"1"})/anon({"anonid":"event-container"})/
        {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
        {"class":"calendar-event-details"}/anon({"flex":"1"})/
        anon({"anonid":"event-name"})`
    );
    controller.waitForElement(eventName);
    controller.assertJSProperty(eventName, "textContent", TITLE2);

    // delete event
    controller.click(lookupEventBox(
        "week", EVENT_BOX, null, 5, 8,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`
    ));
    controller.keypress(eid("week-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookupEventBox(
        "week", EVENT_BOX, null, 5, 8,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`
    ));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
