/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CANVAS_BOX,
  EVENT_BOX,
  TIMEOUT_MODAL_DIALOG,
  deleteCalendars,
  handleNewCalendarWizard,
  helpersForController,
  invokeEventDialog,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var controller = mozmill.getMail3PaneController();
var { lookupEventBox } = helpersForController(controller);

const HOUR = 8;

// Unique name needed as deleting a calendar only unsubscribes from it and
// if same file were used on next testrun then previously created event
// would show up.
var calendarName = String(Date.now());
var calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
calendarFile.append(calendarName + ".ics");

add_task(async function testLocalICS() {
  await setCalendarView("day");

  plan_for_modal_dialog("Calendar:NewCalendarWizard", wizard => {
    handleNewCalendarWizard(wizard, calendarName, { network: { format: "ics" } });
  });
  controller.mainMenu.click("#calendar-new-calendar-menuitem");
  wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);

  // Create new event.
  let box = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  await invokeEventDialog(controller, box, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    await setData(event, iframe, { title: calendarName, calendar: calendarName });

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

  controller.assert(() => str.value.includes("SUMMARY:" + calendarName));
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, calendarName);
});
