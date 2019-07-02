/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeekView";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var CALENDARNAME, CANVAS_BOX, EVENT_BOX, WEEK_VIEW, EVENTPATH;
var helpersForController, switchToView, invokeEventDialog, getEventDetails, createCalendar;
var closeAllEventDialogs, deleteCalendars, goToDate, lookupEventBox;
var helpersForEditUI, setData;

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        CALENDARNAME,
        CANVAS_BOX,
        EVENT_BOX,
        WEEK_VIEW,
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

function testWeekView() {
    let dateFormatter = cal.getDateFormatter();

    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 1);

    // Verify date.
    let day = lookup(`
        ${WEEK_VIEW}/{"class":"mainbox"}/{"class":"headerbox"}/
        {"class":"headerdaybox"}/{"selected":"true"}
    `);
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // Create event at 8 AM.
    // Thursday of 2009-01-01 is 4th with default settings.
    let eventBox = lookupEventBox("week", CANVAS_BOX, null, 5, 8);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { getDateTimePicker } = helpersForEditUI(iframe);

        let startTimeInput = getDateTimePicker("STARTTIME");
        let startDateInput = getDateTimePicker("STARTDATE");

        // Check that the start time is correct.
        event.waitForElement(startTimeInput);
        let someDate = cal.createDateTime();
        someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);
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
    eventBox = lookupEventBox("week", EVENT_BOX, null, 5, null, EVENTPATH);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        // Change title and save changes.
        setData(event, iframe, { title: TITLE2 });
        event.click(eventid("button-saveandclose"));
    });

    // Check if name was saved.
    let eventName = lookupEventBox("week", EVENT_BOX, null, 5, null,
        `${EVENTPATH}/${getEventDetails("week")}/anon({"flex":"1"})/anon({"anonid":"event-name"})`
    );
    controller.waitForElement(eventName);
    controller.assertJSProperty(eventName, "textContent", TITLE2);

    // Delete event.
    controller.click(eventBox);
    controller.keypress(eventBox, "VK_DELETE", {});
    controller.waitForElementNotPresent(eventBox);
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
