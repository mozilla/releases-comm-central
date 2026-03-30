/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createCalendarUsingDialog */

var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

const HOUR = 8;

// Unique name needed as deleting a calendar only unsubscribes from it and
// if same file were used on next testrun then previously created event
// would show up.
var calendarName = String(Date.now());
var calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
calendarFile.append(calendarName + ".ics");
const TASK_TITLE = `${calendarName}-task`;

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

  const calendar = cal.manager
    .getCalendars()
    .find(existingCalendar => existingCalendar.name == calendarName);
  const task = new CalTodo();
  task.title = TASK_TITLE;
  task.entryDate = cal.createDateTime("20260110");
  task.entryDate.isDate = true;
  task.dueDate = cal.createDateTime("20260111");
  task.dueDate.isDate = true;
  await calendar.addItem(task);

  let taskStr;
  await TestUtils.waitForCondition(() => {
    fstream.init(calendarFile, -1, 0, 0);
    taskStr = NetUtil.readInputStreamToString(fstream, fstream.available());
    fstream.close();
    return taskStr.includes("BEGIN:VTODO");
  }, "Timed out waiting for VTODO to be written to file");

  const todoBlock = taskStr.match(/BEGIN:VTODO[\s\S]*?END:VTODO/)?.[0] || "";
  Assert.ok(todoBlock, "task is exported as VTODO");
  Assert.ok(todoBlock.includes("SUMMARY:" + TASK_TITLE), "task summary is exported");
  Assert.ok(/DTSTART;VALUE=DATE:\d{8}/.test(todoBlock), "task start uses VALUE=DATE");
  Assert.ok(/DUE;VALUE=DATE:\d{8}/.test(todoBlock), "task due uses VALUE=DATE");
  Assert.ok(!/DTSTART:\d{8}T/.test(todoBlock), "task start is not exported as datetime");
  Assert.ok(!/DUE:\d{8}T/.test(todoBlock), "task due is not exported as datetime");
});

registerCleanupFunction(() => {
  for (const calendar of cal.manager.getCalendars()) {
    if (calendar.name == calendarName) {
      cal.manager.removeCalendar(calendar);
    }
  }
});
