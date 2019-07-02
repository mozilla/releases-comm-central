/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testDayView";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var CALENDARNAME, CANVAS_BOX, EVENT_BOX, DAY_VIEW, LABELDAYBOX, EVENTPATH;
var helpersForController, invokeEventDialog, getEventDetails, createCalendar;
var closeAllEventDialogs, deleteCalendars, goToDate, lookupEventBox;
var helpersForEditUI, setData;

const TITLE1 = "Day View Event";
const TITLE2 = "Day View Event Changed";
const DESC = "Day View Event Description";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        CALENDARNAME,
        CANVAS_BOX,
        EVENT_BOX,
        DAY_VIEW,
        LABELDAYBOX,
        EVENTPATH,
        helpersForController,
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

function testDayView() {
    let dateFormatter = cal.getDateFormatter();

    goToDate(controller, 2009, 1, 1);

    // Verify date in view.
    let day = lookup(`${DAY_VIEW}/${LABELDAYBOX}/{"flex":"1"}`);
    controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

    // Create event at 8 AM.
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);
        let { getDateTimePicker } = helpersForEditUI(iframe);

        let startTimeInput = getDateTimePicker("STARTTIME");
        let startDateInput = getDateTimePicker("STARTDATE");

        // Check that the start time is correct.
        let someDate = cal.createDateTime();
        someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);
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
    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        // Change title and save changes.
        setData(event, iframe, { title: TITLE2 });
        event.click(eventid("button-saveandclose"));
    });

    // Check if name was saved.
    let eventName = lookupEventBox("day", EVENT_BOX, null, 1, null,
        `${EVENTPATH}/${getEventDetails("day")}/anon({"flex":"1"})/anon({"anonid":"event-name"})`
    );
    controller.waitForElement(eventName);
    controller.assertJSProperty(eventName, "textContent", TITLE2);

    // Delete event
    controller.click(eventBox);
    controller.keypress(eventBox, "VK_DELETE", {});
    controller.waitForElementNotPresent(eventBox);
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
