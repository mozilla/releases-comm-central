/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm", null);

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var goToDate, setData, lookupEventBox;
var CALENDARNAME, CANVAS_BOX, EVENT_BOX;

var TITLE1 = "Multiweek View Event";
var TITLE2 = "Multiweek View Event Changed";
var DESC = "Multiweek View Event Description";

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

function testMultiWeekView() {
    let dateFormatter = cal.getDateFormatter();
    // paths
    let multiWeekView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("multiweek-view")/
    `;

    controller.click(eid("calendar-tab-button"));
    controller.waitThenClick(eid("calendar-multiweek-view-button"));

    goToDate(controller, 2009, 1, 1);

    // verify date
    let day = lookup(`
        ${multiWeekView}/anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
        anon({"anonid":"monthgridrows"})/[0]/{"selected":"true"}
    `);
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // create event
    // Thursday of 2009-01-01 should be the selected box in the first row with default settings
    let hour = new Date().getHours(); // remember time at click
    let eventBox = lookupEventBox("multiweek", CANVAS_BOX, 1, 5);
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
        // next full hour except last hour hour of the day
        let nextHour = hour == 23 ? hour : (hour + 1) % 24;
        let someDate = cal.dtz.now();
        someDate.resetTo(2009, 0, 1, nextHour, 0, 0, cal.dtz.floating);
        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, dateFormatter.formatTime(someDate));
        event.assertValue(startDateInput, dateFormatter.formatDateShort(someDate));

        // fill in title, description and calendar
        setData(event, iframe, { title: TITLE1, description: DESC, calendar: CALENDARNAME });

        // save
        event.click(eventid("button-saveandclose"));
    });

    // if it was created successfully, it can be opened
    eventBox = lookupEventBox(
        "multiweek", EVENT_BOX, 1, 5, null,
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
        "multiweek", EVENT_BOX, 1, 5, null,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}/
        anon({"flex":"1"})/[0]/anon({"anonid":"event-container"})/
        {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
        {"class":"calendar-event-details"}/{"flex":"1"}/anon({"anonid":"event-name"})`
    );

    controller.waitForElement(eventName);
    controller.assertValue(eventName, TITLE2);

    // delete event
    controller.click(lookupEventBox(
        "multiweek", EVENT_BOX, 1, 5, null,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`
    ));
    controller.keypress(eid("multiweek-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookupEventBox(
        "multiweek", EVENT_BOX, 1, 5, null,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`
    ));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
