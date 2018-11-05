/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testEventDialog";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers", "window-helpers"];

ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm", null);

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX;
var helpersForController, handleOccurrencePrompt, goToDate, lookupEventBox;
var invokeEventDialog, checkAlarmIcon, closeAllEventDialogs, deleteCalendars, createCalendar;
var EVENT_TABPANELS, ATTENDEES_ROW;
var helpersForEditUI, setData;
var plan_for_modal_dialog, wait_for_modal_dialog;

const EVENTTITLE = "Event";
const EVENTLOCATION = "Location";
const EVENTDESCRIPTION = "Event Description";
const EVENTATTENDEE = "foo@bar.com";
const EVENTURL = "http://mozilla.org/";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));
    ({
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        EVENTPATH,
        EVENT_BOX,
        helpersForController,
        handleOccurrencePrompt,
        goToDate,
        lookupEventBox,
        invokeEventDialog,
        checkAlarmIcon,
        closeAllEventDialogs,
        deleteCalendars,
        createCalendar
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({
        EVENT_TABPANELS,
        ATTENDEES_ROW,
        helpersForEditUI,
        setData
    } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    createCalendar(controller, CALENDARNAME);
}

function testEventDialog() {
    let dateFormatter = cal.getDateFormatter();

    // Open month view.
    controller.waitThenClick(eid("calendar-month-view-button"));

    goToDate(controller, 2009, 1, 1);

    // Create new event.
    controller.mainMenu.click("#ltnNewEvent");

    // Check that the start time is correct -
    // next full hour except last hour of the day.
    let now = new Date();
    let hour = now.getHours();
    let startHour = hour == 23 ? hour : (hour + 1) % 24;

    let nextHour = cal.dtz.now();
    nextHour.resetTo(2009, 0, 1, startHour, 0, 0, cal.dtz.floating);
    let startTime = dateFormatter.formatTime(nextHour);
    nextHour.resetTo(2009, 0, 1, (startHour + 1) % 24, 0, 0, cal.dtz.floating);
    let endTime = dateFormatter.formatTime(nextHour);

    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { eid: iframeId } = helpersForController(iframe);
        let { iframeLookup, getDateTimePicker } = helpersForEditUI(iframe);

        // First check all standard-values are set correctly.
        let startTimeInput = getDateTimePicker("STARTTIME");

        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, startTime);

        // Check selected calendar.
        event.assertValue(iframeId("item-calendar"), CALENDARNAME);

        // Check standard title.
        let defTitle = cal.calGetString("calendar", "newEvent");
        event.assertValue(eventid("item-title"), defTitle);

        // Prepare category.
        let categories = cal.calGetString("categories", "categories2");
        // Pick 4th value in a comma-separated list.
        let category = categories.split(",")[4];

        // Fill in the rest of the values.
        setData(event, iframe, {
            title: EVENTTITLE,
            location: EVENTLOCATION,
            description: EVENTDESCRIPTION,
            categories: [category],
            repeat: "daily",
            reminder: "5minutes",
            privacy: "private",
            attachment: { add: EVENTURL },
            attendees: { add: EVENTATTENDEE }
        });

        // Verify attendee added.
        let attendeeLabel = iframeLookup(`
            ${ATTENDEES_ROW}/{"class":"item-attendees-cell"}/{"class":"item-attendees-cell-label"}
        `);

        event.click(eventid("event-grid-tab-attendees"));
        event.assertValue(attendeeLabel, EVENTATTENDEE);
        event.waitFor(() => !iframeId("notify-attendees-checkbox").getNode().checked);

        // Verify private label visible.
        event.waitFor(
            () => !eventid("status-privacy-private-box").getNode().hasAttribute("collapsed")
        );
        eventid("event-privacy-menupopup").getNode().hidePopup();

        // Add attachment and verify added.
        event.click(iframeId("event-grid-tab-attachments"));
        event.assertNode(iframeLookup(`
            ${EVENT_TABPANELS}/id("event-grid-tabpanel-attachments")/{"flex":"1"}/
            id("attachment-link")/[0]/{"value":"mozilla.org"}
        `));

        // save
        event.click(eventid("button-saveandclose"));
    });

    // Catch and dismiss alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
        let { lookup: alarmlookup } = helpersForController(alarm);
        alarm.waitThenClick(alarmlookup(`
            /id("calendar-alarm-dialog")/id("alarm-actionbar")/[1]`
        ));
    });
    wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

    // Verify event and alarm icon visible every day of the month and check tooltip.
    // 1st January is Thursday so there's three days to check in the first row.
    let date = 1;
    for (col = 5; col <= 7; col++) {
        controller.waitForElement(lookupEventBox("month", EVENT_BOX, 1, col, null, EVENTPATH));
        checkAlarmIcon(controller, "month", 1, col);
        checkTooltip(1, col, date, startTime, endTime);
        date++;
    }

    // 31st of January is Saturday so there's four more full rows to check.
    for (let row = 2; row <= 5; row++) {
        for (let col = 1; col <= 7; col++) {
            controller.assertNode(lookupEventBox("month", EVENT_BOX, row, col, null, EVENTPATH));
            checkAlarmIcon(controller, "month", row, col);
            checkTooltip(row, col, date, startTime, endTime);
            date++;
        }
    }

    // Delete and verify deleted 2nd Jan.
    controller.click(lookupEventBox("month", EVENT_BOX, 1, 6, null, EVENTPATH));
    let elemToDelete = eid("month-view");
    handleOccurrencePrompt(controller, elemToDelete, "delete", false);
    controller.waitForElementNotPresent(lookupEventBox("month", EVENT_BOX, 1, 6, null, EVENTPATH));

    // Verify all others still exist.
    controller.assertNode(lookupEventBox("month", EVENT_BOX, 1, 5, null, EVENTPATH));
    controller.assertNode(lookupEventBox("month", EVENT_BOX, 1, 7, null, EVENTPATH));

    for (let row = 2; row <= 5; row++) {
        for (let col = 1; col <= 7; col++) {
            controller.assertNode(lookupEventBox("month", EVENT_BOX, row, col, null, EVENTPATH));
        }
    }

    // Delete series by deleting 3rd January and confirming to delete all.
    controller.click(lookupEventBox("month", EVENT_BOX, 1, 7, null, EVENTPATH));
    elemToDelete = eid("month-view");
    handleOccurrencePrompt(controller, elemToDelete, "delete", true);

    // Verify all deleted.
    controller.waitForElementNotPresent(lookupEventBox("month", EVENT_BOX, 1, 5, null, EVENTPATH));
    controller.assertNodeNotExist(lookupEventBox("month", EVENT_BOX, 1, 6, null, EVENTPATH));
    controller.assertNodeNotExist(lookupEventBox("month", EVENT_BOX, 1, 7, null, EVENTPATH));

    for (let row = 2; row <= 5; row++) {
        for (let col = 1; col <= 7; col++) {
            controller.assertNodeNotExist(lookupEventBox(
                "month", EVENT_BOX, row, col, null, EVENTPATH
            ));
        }
    }
}

function checkTooltip(row, col, date, startTime, endTime) {
    let item = lookupEventBox("month", null, row, col, null, EVENTPATH);

    let toolTip = '/id("messengerWindow")/id("calendar-popupset")/id("itemTooltip")';
    let toolTipNode = lookup(toolTip).getNode();
    toolTipNode.ownerGlobal.onMouseOverItem({ currentTarget: item.getNode() });

    // Check title.
    let toolTipGrid = toolTip + '/{"class":"tooltipBox"}/{"class":"tooltipHeaderGrid"}/';
    let eventName = lookup(`${toolTipGrid}/[1]/[0]/[1]`);
    controller.assert(() => eventName.getNode().textContent == EVENTTITLE);

    // Check date and time.
    let dateTime = lookup(`${toolTipGrid}/[1]/[2]/[1]`);

    let formatter = new Services.intl.DateTimeFormat(undefined, { dateStyle: "full" });
    let startDate = formatter.format(new Date(2009, 0, date));

    controller.assert(() => {
        let text = dateTime.getNode().textContent;
        dump(`${text} / ${startDate} ${startTime} -\n`);
        return text.includes(`${startDate} ${startTime} – `);
    });

    // This could be on the next day if it is 00:00.
    controller.assert(() => dateTime.getNode().textContent.endsWith(endTime));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
