/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createCalendarUsingDialog */

var { controller, deleteCalendars, invokeNewEventDialog } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarUtils.jsm"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const HOUR = 8;

// Unique name needed as deleting a calendar only unsubscribes from it and
// if same file were used on next testrun then previously created event
// would show up.
var calendarName = String(Date.now());
var calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
calendarFile.append(calendarName + ".ics");

add_task(async function testLocalICS() {
  await CalendarTestUtils.setCalendarView(controller.window, "day");
  await createCalendarUsingDialog(calendarName, { network: {} });

  // Create new event.
  let box = CalendarTestUtils.dayView.getHourBoxAt(controller.window, HOUR);
  await invokeNewEventDialog(window, box, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: calendarName, calendar: calendarName });
    await saveAndCloseItemDialog(eventWindow);
  });

  // Assert presence in view.
  await CalendarTestUtils.dayView.waitForEventBoxAt(controller.window, 1);

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

  Assert.ok(str.value.includes("SUMMARY:" + calendarName));
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, calendarName);
});
