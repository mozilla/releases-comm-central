/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testLocalICS";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers", "window-helpers"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var TIMEOUT_MODAL_DIALOG, CANVAS_BOX, EVENT_BOX;
var helpersForController, invokeEventDialog, deleteCalendars, handleNewCalendarWizard;
var setData;
var plan_for_modal_dialog, wait_for_modal_dialog;

const HOUR = 8;
var calendarName, calendarTitle, calendarFile;

function setupModule(module) {
  controller = mozmill.getMail3PaneController();

  ({
    TIMEOUT_MODAL_DIALOG,
    CANVAS_BOX,
    EVENT_BOX,
    helpersForController,
    invokeEventDialog,
    deleteCalendars,
    handleNewCalendarWizard,
  } = collector.getModule("calendar-utils"));
  collector.getModule("calendar-utils").setupModule(controller);
  Object.assign(module, helpersForController(controller));

  ({ setData } = collector.getModule("item-editing-helpers"));
  collector.getModule("item-editing-helpers").setupModule(module);

  ({ plan_for_modal_dialog, wait_for_modal_dialog } = collector.getModule("window-helpers"));

  // Unique name needed as deleting a calendar only unsubscribes from it and
  // if same file were used on next testrun then previously created event
  // would show up.
  calendarName = calendarTitle = new Date().getTime() + "";
  calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  calendarFile.append(calendarName + ".ics");
}

function testLocalICS() {
  plan_for_modal_dialog("Calendar:NewCalendarWizard", wizard => {
    handleNewCalendarWizard(wizard, calendarName, { network: { format: "ics" } });
  });
  controller.mainMenu.click("#ltnNewCalendar");
  wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);

  // Create new event.
  let box = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  invokeEventDialog(controller, box, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    setData(event, iframe, { title: calendarTitle, calendar: calendarName });

    // save
    event.click(eventid("button-saveandclose"));
  });

  // Assert presence in view.
  controller.waitForElement(
    lookupEventBox(
      "day",
      EVENT_BOX,
      null,
      1,
      null,
      `
        /{"tooltip":"itemTooltip","calendar":"${calendarName.toLowerCase()}"}
    `
    )
  );

  // Verify in file.
  let fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  let cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(
    Ci.nsIConverterInputStream
  );

  // Wait a moment until file is written.
  controller.waitFor(() => calendarFile.exists());

  // Read the calendar file and check for the summary.
  fstream.init(calendarFile, -1, 0, 0);
  cstream.init(fstream, "UTF-8", 0, 0);

  let str = {};
  cstream.readString(-1, str);
  cstream.close();

  controller.assert(() => str.value.includes("SUMMARY:" + calendarTitle));
}

function teardownModule(module) {
  deleteCalendars(controller, calendarName);
}
