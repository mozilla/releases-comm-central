/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createCalendarUsingDialog */

var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const HOUR = 8;

// Unique name needed as deleting a calendar only unsubscribes from it and
// if same file were used on next testrun then previously created event
// would show up.
var calendarName = String(Date.now());
var calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
calendarFile.append(calendarName + ".ics");

add_task(async function testLocalICS() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await createCalendarUsingDialog(calendarName, { network: {} });

  // Create new event.
  const box = CalendarTestUtils.dayView.getHourBoxAt(window, HOUR);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, box);
  await setData(dialogWindow, iframeWindow, { title: calendarName, calendar: calendarName });
  await saveAndCloseItemDialog(dialogWindow);

  // Assert presence in view.
  await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);

  // Verify in file.
  const fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  const cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(
    Ci.nsIConverterInputStream
  );

  // Wait a moment until file is written.
  await TestUtils.waitForCondition(() => calendarFile.exists());

  // Read the calendar file and check for the summary.
  fstream.init(calendarFile, -1, 0, 0);
  cstream.init(fstream, "UTF-8", 0, 0);

  const str = {};
  cstream.readString(-1, str);
  cstream.close();

  Assert.ok(str.value.includes("SUMMARY:" + calendarName));
});

registerCleanupFunction(() => {
  for (const calendar of cal.manager.getCalendars()) {
    if (calendar.name == calendarName) {
      cal.manager.removeCalendar(calendar);
    }
  }
});
