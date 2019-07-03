/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testMonthView";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var CALENDARNAME, EVENT_BOX, CANVAS_BOX, MONTH_VIEW, EVENTPATH;
var helpersForController, switchToView, invokeEventDialog, getEventDetails, createCalendar;
var closeAllEventDialogs, deleteCalendars, goToDate, lookupEventBox;
var helpersForEditUI, setData;

const TITLE1 = "Month View Event";
const TITLE2 = "Month View Event Changed";
const DESC = "Month View Event Description";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        CALENDARNAME,
        EVENT_BOX,
        CANVAS_BOX,
        MONTH_VIEW,
        EVENTPATH,
        helpersForController,
        switchToView,
        invokeEventDialog,
        getEventDetails,
        createCalendar,
        closeAllEventDialogs,
        deleteCalendars,
        goToDate,
        lookupEventBox
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({
        helpersForEditUI,
        setData
    } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    createCalendar(controller, CALENDARNAME);
}

function testMonthView() {
    let dateFormatter = cal.getDateFormatter();

    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 1);

    // Verify date.
    let day = lookup(`
        ${MONTH_VIEW}/{"class":"mainbox"}/{"class":"monthgrid"}/
        {"class":"monthgridrows"}/[0]/{"selected":"true"}
    `);
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // Create event.
    // Thursday of 2009-01-01 should be the selected box in the first row with default settings.
    let hour = new Date().getHours(); // Remember time at click.
    let eventBox = lookupEventBox("month", CANVAS_BOX, 1, 5);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { getDateTimePicker } = helpersForEditUI(iframe);

        let startTimeInput = getDateTimePicker("STARTTIME");
        let startDateInput = getDateTimePicker("STARTDATE");

        // Check that the start time is correct.
        // Next full hour except last hour hour of the day.
        let nextHour = hour == 23 ? hour : (hour + 1) % 24;
        let someDate = cal.dtz.now();
        someDate.resetTo(2009, 0, 1, nextHour, 0, 0, cal.dtz.floating);
        event.waitForElement(startTimeInput);
        event.assertValue(startTimeInput, dateFormatter.formatTime(someDate));
        event.assertValue(startDateInput, dateFormatter.formatDateShort(someDate));

        // Fill in title, description and calendar.
        setData(event, iframe, {
            title: TITLE1,
            description: DESC,
            calendar: CALENDARNAME
        });

        // save
        event.click(eventid("button-saveandclose"));
    });

    // If it was created successfully, it can be opened.
    eventBox = lookupEventBox("month", EVENT_BOX, 1, 5, null, EVENTPATH);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        // Change title and save changes.
        setData(event, iframe, { title: TITLE2 });
        event.click(eventid("button-saveandclose"));
    });

    // Check if name was saved.
    let eventName = lookupEventBox("month", EVENT_BOX, 1, 5, null,
        `${EVENTPATH}/${getEventDetails("month")}/anon({"flex":"1"})/anon({"anonid":"event-name"})`
    );

    controller.waitForElement(eventName);
    controller.assertValue(eventName, TITLE2);

    // Delete event.
    controller.click(eventBox);
    controller.keypress(eventBox, "VK_DELETE", {});
    controller.waitForElementNotPresent(eventBox);
}

function teardownModule(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
