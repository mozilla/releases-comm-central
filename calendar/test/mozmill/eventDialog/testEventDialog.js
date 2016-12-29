/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var plan_for_modal_dialog, wait_for_modal_dialog;
var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var handleAddingAttachment, acceptSendingNotificationMail, handleOccurrencePrompt;
var CALENDARNAME, TIMEOUT_MODAL_DIALOG;

var utils = require("../shared-modules/utils");

var eventTitle = "Event";
var eventLocation = "Location";
var eventDescription = "Event Description";
var eventAttendee = "foo@bar.com";
var eventUrl = "http://mozilla.org";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        handleAddingAttachment,
        acceptSendingNotificationMail,
        handleOccurrencePrompt,
        CALENDARNAME,
        TIMEOUT_MODAL_DIALOG
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testEventDialog() {
    // paths
    let monthView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("month-view")
    `;
    let miniMonth = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
        id("calMinimonthBox")/id("calMinimonth")/
    `;
    let eventDialog = `
        /id("calendar-event-dialog-inner")/id("event-grid")/id("event-grid-rows")/
    `;

    let eventBox = `
        ${monthView}/anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
        anon({"anonid":"monthgridrows"})/[rowNumber]/[columnNumber]/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}/
        anon({"flex":"1"})/[0]/anon({"anonid":"event-container"})/
        {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
        {"class":"calendar-event-details"}
    `;

    // open month view
    controller.click(eid("calendar-tab-button"));
    controller.waitThenClick(eid("calendar-month-view-button"));

    // pick year
    controller.click(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/anon({"anonid":"yearcell"})
    `));
    controller.waitThenClick(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/
        anon({"anonid":"minmonth-popupset"})/anon({"anonid":"years-popup"})/
        [0]/{"value":"2009"}
    `));

    // pick month
    controller.waitThenClick(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/anon({"anonid":"monthheader"})
    `));

    controller.waitThenClick(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/
        anon({"anonid":"minmonth-popupset"})/anon({"anonid":"months-popup"})/
        [0]/{"index":"0"}
    `));

    // pick day
    controller.waitThenClick(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-calendar"})/[1]/{"value":"1"}
    `));
    sleep();

    // create new event
    let now = new Date();
    let hour = now.getHours();
    let startHour = hour == 23 ? hour : (hour + 1) % 24;
    let ampm = "";
    // check that the start time is correct
    // next full hour except last hour hour of the day
    if (now.toLocaleTimeString().match(/AM|PM/)) {
        ampm = (hour >= 12 ? " PM" : " AM");
        startHour = startHour % 12;
        if (startHour == 0) {
            startHour = 12;
        }
    }
    let startTime = startHour + ":00" + ampm;
    let endTime = ((startHour + 1) % 24) + ":00" + ampm;

    controller.mainMenu.click("#ltnNewEvent");
    invokeEventDialog(controller, null, (event, iframe) => {
        let { lookup: eventlookup, eid: eventid } = helpersForController(event);

        let startTimeInput = eventlookup(`
            ${eventDialog}/id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("event-starttime")/
            anon({"anonid":"hbox"})/anon({"anonid":"time-picker"})/
            anon({"class":"timepicker-box-class"})/id("timepicker-text")/
            anon({"class":"menulist-editable-box textbox-input-box"})/
            anon({"anonid":"input"})
        `);
        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, startTime);

        // check selected calendar
        event.assertNode(eventlookup(`
            ${eventDialog}/id("event-grid-category-color-row")/
            id("event-grid-category-box")/id("item-calendar")/[0]/
            {"selected":"true","label":"${CALENDARNAME}"}
        `));

        // fill in name, location, description
        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-title-row")/id("item-title")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), eventTitle);

        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-location-row")/id("item-location")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), eventLocation);

        event.type(eventlookup(`
            ${eventDialog}/id("event-grid-description-row")/
            id("item-description")/anon({"class":"textbox-input-box"})/
            anon({"anonid":"input"})
        `), eventDescription);

        // set category
        let categories = utils.getProperty("chrome://calendar/locale/categories.properties", "categories2");
        let category = categories.split(",")[4]; // pick 4th value in a comma-separated list
        event.select(eventid("item-categories"), null, category);

        // repeat daily
        event.click(eventid("repeat-daily-menuitem"));

        // add reminder
        event.click(eventid("reminder-5minutes-menuitem"));

        // add an attendee and verify added
        plan_for_modal_dialog("Calendar:EventDialog:Attendees", handleAttendees);
        event.click(eventid("button-attendees"));
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);
        event.assertValue(eventid("attendee-list"), eventAttendee);

        // make it private and verify label visible
        event.click(eventid("button-privacy"));
        event.click(eventid("event-privacy-private-menuitem"));
        let label = eventid("status-privacy-private-box");
        event.assertJS(event.window.getComputedStyle(label.getNode(), null).getPropertyValue("visibility") == "visible");

        // add attachment and verify added
        handleAddingAttachment(event, eventUrl);
        event.click(eventid("button-url"));
        event.assertNode(eventlookup(`
            ${eventDialog}/id("event-grid-attachment-row")/
            id("attachment-link")/{"label":"mozilla.org"}
        `));

        // save
        acceptSendingNotificationMail(event);
        event.click(eventid("button-saveandclose"));
    });

    // catch and dismiss alarm
    controller.waitFor(() => mozmill.utils.getWindows("Calendar:AlarmWindow").length > 0);
    let alarm = new mozmill.controller.MozMillController(mozmill.utils.getWindows("Calendar:AlarmWindow")[0]);
    let { lookup: alarmlookup } = helpersForController(alarm);

    // dismiss all button, label in .dtd file, bug #504635
    alarm.waitThenClick(alarmlookup('/id("calendar-alarm-dialog")/id("alarm-actionbar")/[1]'));
    controller.waitFor(() => mozmill.utils.getWindows("Calendar:AlarmWindow").length == 0);

    // verify event and alarm icon visible every day of the month and check tooltip
    // 1st January is Thursday so there's three days to check in the first row
    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "4")
    ));
    checkIcon(eventBox, "0", "4");
    checkTooltip(monthView, "0", "4", "1", startTime, endTime);

    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "5")
    ));
    checkIcon(eventBox, "0", "5");
    checkTooltip(monthView, "0", "5", "2", startTime, endTime);

    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "6")
    ));
    checkIcon(eventBox, "0", "6");
    checkTooltip(monthView, "0", "6", "3", startTime, endTime);

    // 31st of January is Saturday so there's four more full rows to check
    let date = 4;
    for (row = 1; row < 5; row++) {
        for (col = 0; col < 7; col++) {
            controller.assertNode(lookup(
                eventBox.replace("rowNumber", row).replace("columnNumber", col)
            ));
            checkIcon(eventBox, row, col);
            checkTooltip(monthView, row, col, date, startTime, endTime);
            date++;
        }
    }

    // delete and verify deleted 2nd Jan
    controller.click(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "5")
    ));
    let elemToDelete = eid("month-view");
    handleOccurrencePrompt(controller, elemToDelete, "delete", false, false);
    controller.waitForElementNotPresent(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "5")
    ));

    // verify all others still exist
    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "4")
    ));
    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "6")
    ));

    for (row = 1; row < 5; row++) {
        for (col = 0; col < 7; col++) {
            controller.assertNode(lookup(
                eventBox.replace("rowNumber", row).replace("columnNumber", col)
            ));
        }
    }

    // delete series by deleting 3rd January and confirming to delete all
    controller.click(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "6")
    ));
    elemToDelete = eid("month-view");
    handleOccurrencePrompt(controller, elemToDelete, "delete", true, false);

    // verify all deleted
    controller.waitForElementNotPresent(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "4")
    ));
    controller.assertNodeNotExist(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "5")
    ));
    controller.assertNodeNotExist(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "6")
    ));

    for (row = 1; row < 5; row++) {
        for (col = 0; col < 7; col++) {
            controller.assertNodeNotExist(lookup(
                eventBox.replace("rowNumber", row).replace("columnNumber", col)
            ));
        }
    }
}

function handleAttendees(attendees) {
    let { lookup: attendeeslookup } = helpersForController(attendees);

    let input = attendeeslookup(`
        /id("calendar-event-dialog-attendees-v2")/[6]/[0]/id("attendees-list")/
        anon({"anonid":"listbox"})/[1]/[1]/anon({"anonid":"input"})/
        anon({"class":"autocomplete-textbox-container"})/
        {"class":"textbox-input-box"}/anon({"anonid":"input"})
    `);
    attendees.waitForElement(input);
    attendees.type(input, eventAttendee);
    attendees.click(attendeeslookup(`
        /id("calendar-event-dialog-attendees-v2")/anon({"anonid":"buttons"})/
        {"dlgtype":"accept"}
    `));
}

function checkIcon(eventBox, row, col) {
    let icon = lookup((`
        ${eventBox}/anon({"anonid":"category-box-stack"})/
        anon({"align": "right"})/anon({"class":"alarm-icons-box"})/
        anon({"class": "reminder-icon"})
    `).replace("rowNumber", row).replace("columnNumber", col));

    controller.assertJS(icon.getNode().getAttribute("value") == "DISPLAY");
}

function checkTooltip(monthView, row, col, date, startTime, endTime) {
    controller.mouseOver(lookup((`
        ${monthView}/anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
        anon({"anonid":"monthgridrows"})/[rowNumber]/[columnNumber]/
        {"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}
    `).replace("rowNumber", row).replace("columnNumber", col)));

    // check title
    let eventName = lookup(`
        /id("messengerWindow")/id("calendar-popupset")/id("itemTooltip")/
        {"class":"tooltipBox"}/{"class":"tooltipHeaderGrid"}/[1]/[0]/[1]
    `);
    controller.assertJS(eventName.getNode().textContent == eventTitle);

    // check date and time
    // date-time string contains strings formatted in operating system language
    // so check numeric values only
    let dateTime = lookup(`
        /id("messengerWindow")/id("calendar-popupset")/id("itemTooltip")/
        {"class":"tooltipBox"}/{"class":"tooltipHeaderGrid"}/[1]/[2]/[1]
    `).getNode().textContent;

    controller.assertJS(
        dateTime.includes(date) &&
        dateTime.includes(startTime) &&
        dateTime.includes(endTime)
    );
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
