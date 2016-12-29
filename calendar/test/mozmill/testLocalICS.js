/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testLocalICS";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

Cu.import("resource://calendar/modules/calUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var plan_for_modal_dialog, wait_for_modal_dialog;
var helpersForController, invokeEventDialog, switchToView, deleteCalendars;
var handleNewCalendarWizard, setData;
var CANVAS_BOX, EVENT_BOX, TIMEOUT_MODAL_DIALOG;

const HOUR = 8;
var calendarName, calendarTitle, calendarFile;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));
    ({
        helpersForController,
        invokeEventDialog,
        switchToView,
        deleteCalendars,
        handleNewCalendarWizard,
        setData,
        CANVAS_BOX,
        EVENT_BOX,
        TIMEOUT_MODAL_DIALOG
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    // unique name needed as deleting a calendar only unsubscribes from it and
    // if same file were used on next testrun then previously created event
    // would show up
    calendarName = calendarTitle = (new Date()).getTime() + "";
    calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
    calendarFile.append(calendarName + ".ics");
}

function testLocalICS() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");

    plan_for_modal_dialog("Calendar:NewCalendarWizard", (wizard) => {
        handleNewCalendarWizard(wizard, calendarName, { network: { format: "ics" } });
    });
    controller.mainMenu.click("#ltnNewCalendar");
    wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);

    // create new event
    let box = lookupEventBox("day", CANVAS_BOX, undefined, 1, HOUR);
    invokeEventDialog(controller, box, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        setData(event, iframe, { title: calendarTitle, calendar: calendarName });

        // save
        event.click(eventid("button-saveandclose"));
    });

    // assert presence in view
    let eventPath = `/{"tooltip":"itemTooltip","calendar":"${calendarName}"}`;
    controller.waitForElement(lookupEventBox("day", EVENT_BOX, null, 1, HOUR, eventPath));

    // verify in file
    let fstream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                            .createInstance(Components.interfaces.nsIFileInputStream);
    let cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                            .createInstance(Components.interfaces.nsIConverterInputStream);

    // wait a moment until file is written
    controller.waitFor(() => calendarFile.exists());

    // read the calendar file and check for the summary
    fstream.init(calendarFile, -1, 0, 0);
    cstream.init(fstream, "UTF-8", 0, 0);

    let str = {};
    cstream.readString(-1, str);
    cstream.close();

    controller.assertJS(str.value.includes("SUMMARY:" + calendarTitle));
}

function teardownTest(module) {
    deleteCalendars(controller, calendarName);
}
