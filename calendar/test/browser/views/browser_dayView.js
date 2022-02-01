/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const TITLE1 = "Day View Event";
const TITLE2 = "Day View Event Changed";
const DESC = "Day View Event Description";

add_task(async function testDayView() {
  let calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  let dayView = document.getElementById("day-view");
  // Verify date in view.
  await TestUtils.waitForCondition(
    () => dayView.dayColumns[0]?.date.icalString == "20090101",
    "Inspecting the date"
  );

  // Create event at 8 AM.
  let eventBox = CalendarTestUtils.dayView.getHourBoxAt(window, 8);
  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(
    window,
    eventBox
  );

  // Check that the start time is correct.
  let someDate = cal.createDateTime();
  someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);

  let startPicker = iframeDocument.getElementById("event-starttime");
  Assert.equal(startPicker._timepicker._inputField.value, cal.dtz.formatter.formatTime(someDate));
  Assert.equal(
    startPicker._datepicker._inputField.value,
    cal.dtz.formatter.formatDateShort(someDate)
  );

  // Fill in title, description and calendar.
  await setData(dialogWindow, iframeWindow, {
    title: TITLE1,
    description: DESC,
    calendar: "Test",
  });

  await saveAndCloseItemDialog(dialogWindow);

  // If it was created successfully, it can be opened.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.dayView.editEventAt(window, 1));
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  await CalendarTestUtils.ensureViewLoaded(window);

  // Check if name was saved.
  eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(window, 1);
  let eventName = eventBox.querySelector(".event-name-label");

  Assert.ok(eventName);
  Assert.equal(eventName.textContent, TITLE2);

  // Delete event
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await CalendarTestUtils.dayView.waitForNoEventBoxAt(window, 1);

  Assert.ok(true, "Test ran to completion");
});
