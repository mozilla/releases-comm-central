/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm", null);

var plan_for_modal_dialog, wait_for_modal_dialog;
var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var handleAddingAttachment, handleOccurrencePrompt;
var goToDate, setData, lookupEventBox;
var CALENDARNAME, TIMEOUT_MODAL_DIALOG;

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
        handleOccurrencePrompt,
        goToDate,
        setData,
        lookupEventBox,
        CALENDARNAME,
        TIMEOUT_MODAL_DIALOG
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testEventDialog() {
    let dateFormatter = cal.getDateFormatter();
    // paths
    let monthView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("month-view")
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

    goToDate(controller, 2009, 1, 1);
    sleep();

    // create new event
    let now = new Date();
    let hour = now.getHours();
    let startHour = hour == 23 ? hour : (hour + 1) % 24;

    let nextHour = cal.dtz.now();
    nextHour.resetTo(2009, 0, 1, startHour, 0, 0, cal.dtz.floating);
    let startTime = dateFormatter.formatTime(nextHour);
    nextHour.resetTo(2009, 0, 1, (startHour + 1) % 24, 0, 0, cal.dtz.floating);
    let endTime = dateFormatter.formatTime(nextHour);

    controller.mainMenu.click("#ltnNewEvent");
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { lookup: iframeLookup, eid: iframeId } = helpersForController(iframe);

        let timeInput = `
            anon({"anonid":"hbox"})/anon({"anonid":"time-picker"})/
            anon({"class":"timepicker-box-class"})/
            anon({"class":"timepicker-text-class"})/anon({"flex":"1"})/
            anon({"anonid":"input"})
        `;
        let startTimeInput = iframeLookup(`
            /id("calendar-event-dialog-inner")/id("event-grid")/id("event-grid-rows")/
            id("event-grid-startdate-row")/
            id("event-grid-startdate-picker-box")/id("event-starttime")/${timeInput}
        `);

        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, startTime);

        // check selected calendar
        event.assertValue(iframeId("item-calendar"), CALENDARNAME);

        // fill in name, location, description
        setData(event, iframe, {
            title: eventTitle,
            location: eventLocation,
            description: eventDescription,
            category: "Clients",
            repeat: "daily"
        });
        event.click(iframeId("item-alarm"));
        event.click(iframeId("reminder-5minutes-menuitem"));
        event.waitFor(() => iframeId("item-alarm").getNode().label == "5 minutes before");
        iframeId("item-alarm-menupopup").getNode().hidePopup();

        // add an attendee and verify added
        event.click(iframeId("event-grid-tab-attendees"));

        plan_for_modal_dialog("Calendar:EventDialog:Attendees", handleAttendees);
        event.click(eventid("options-attendees-menuitem"));
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);
        event.assertNode(iframeLookup(`
            ${eventDialog}/id("event-grid-tabbox")/id("event-grid-tabpanels")/
            id("event-grid-tabpanel-attendees")/[0]/[1]/id("item-attendees-box")/
            {"class":"item-attendees-row"}/{"class":"item-attendees-cell"}/
            {"class":"item-attendees-cell-label","value":"${eventAttendee}"}
        `));
        event.click(iframeId("notify-attendees-checkbox"));
        event.waitFor(() => !iframeId("notify-attendees-checkbox").getNode().checked);

        // make it private and verify label visible
        let toolbarbutton = eventid("button-privacy");
        let rect = toolbarbutton.getNode().getBoundingClientRect();
        event.click(toolbarbutton, rect.width - 5, 5);
        event.click(eventid("event-privacy-private-menuitem"));
        event.waitFor(() => !eventid("status-privacy-private-box").getNode().hasAttribute("collapsed"));
        eventid("event-privacy-menupopup").getNode().hidePopup();

        // add attachment and verify added
        event.click(iframeId("event-grid-tab-attachments"));

        handleAddingAttachment(event, eventUrl);
        event.click(eventid("button-url"));
        wait_for_modal_dialog("commonDialog");
        event.assertNode(iframeLookup(`
            ${eventDialog}/id("event-grid-tabbox")/id("event-grid-tabpanels")/
            id("event-grid-tabpanel-attachments")/{"flex":"1"}/
            id("attachment-link")/[0]/{"value":"mozilla.org"}
        `));

        // save
        event.click(eventid("button-saveandclose"));
    });

    // catch and dismiss alarm
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
        let { lookup: alarmlookup } = helpersForController(alarm);
        alarm.waitThenClick(alarmlookup('/id("calendar-alarm-dialog")/id("alarm-actionbar")/[1]'));
    });
    wait_for_modal_dialog("Calendar:AlarmWindow");

    // verify event and alarm icon visible every day of the month and check tooltip
    // 1st January is Thursday so there's three days to check in the first row
    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "4")
    ));
    checkIcon(eventBox, "0", "4");
    checkTooltip(monthView, 0, 4, 1, startTime, endTime);

    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "5")
    ));
    checkIcon(eventBox, "0", "5");
    checkTooltip(monthView, 0, 5, 2, startTime, endTime);

    controller.assertNode(lookup(
        eventBox.replace("rowNumber", "0").replace("columnNumber", "6")
    ));
    checkIcon(eventBox, "0", "6");
    checkTooltip(monthView, 0, 6, 3, startTime, endTime);

    // 31st of January is Saturday so there's four more full rows to check
    let date = 4;
    for (let row = 1; row < 5; row++) {
        for (let col = 0; col < 7; col++) {
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

    for (let row = 1; row < 5; row++) {
        for (let col = 0; col < 7; col++) {
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

    for (let row = 1; row < 5; row++) {
        for (let col = 0; col < 7; col++) {
            controller.assertNodeNotExist(lookup(
                eventBox.replace("rowNumber", row).replace("columnNumber", col)
            ));
        }
    }
}

function handleAttendees(attendees) {
    let { lookup: attendeeslookup } = helpersForController(attendees);

    let input = attendeeslookup(`
        /id("calendar-event-dialog-attendees-v2")/{"flex":"1"}/
        id("attendees-container")/id("attendees-list")/[1]/[2]/[0]
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
        anon({"align": "center"})/anon({"class":"alarm-icons-box"})/
        anon({"class": "reminder-icon"})
    `).replace("rowNumber", row).replace("columnNumber", col));

    controller.assertJS(icon.getNode().getAttribute("value") == "DISPLAY");
}

function checkTooltip(monthView, row, col, date, startTime, endTime) {
    let item = lookupEventBox(
        "month", null, row + 1, col + 1, null,
        `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`
    );

    let toolTip = '/id("messengerWindow")/id("calendar-popupset")/id("itemTooltip")';
    let toolTipNode = lookup(toolTip).getNode();
    toolTipNode.ownerGlobal.onMouseOverItem({ currentTarget: item.getNode() });

    // check title
    let toolTipGrid = toolTip + '/{"class":"tooltipBox"}/{"class":"tooltipHeaderGrid"}/';
    let eventName = lookup(`${toolTipGrid}/[1]/[0]/[1]`);
    controller.assert(() => eventName.getNode().textContent == eventTitle);

    // check date and time
    let dateTime = lookup(`${toolTipGrid}/[1]/[2]/[1]`);

    let formatter = new Services.intl.DateTimeFormat(undefined, { dateStyle: "full" });
    let startDate = formatter.format(new Date(2009, 0, date));

    controller.assert(() => {
        let text = dateTime.getNode().textContent;
        return text.includes(`${startDate} ${startTime} – `);
    });

    // This could be on the next day if it is 00:00.
    controller.assert(() => dateTime.getNode().textContent.endsWith(endTime));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
