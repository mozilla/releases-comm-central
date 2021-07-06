/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

add_task(async function testWeekView() {
  createCalendar(window, CALENDARNAME);
  await CalendarTestUtils.setCalendarView(window, "week");
  await goToDate(window, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    let dateLabel = document.querySelector("#week-view calendar-header-container[selected=true]");
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event at 8 AM.
  // Thursday of 2009-01-01 is 4th with default settings.
  let eventBox = CalendarTestUtils.weekView.getHourBoxAt(window, 5, 8);
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
    calendar: CALENDARNAME,
  });

  await saveAndCloseItemDialog(dialogWindow);

  // If it was created successfully, it can be opened.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.weekView.editEventAt(window, 5, 1));
  // Change title and save changes.
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  // Check if name was saved.
  let eventName;
  await TestUtils.waitForCondition(() => {
    eventBox = CalendarTestUtils.weekView.getEventBoxAt(window, 5, 1);
    if (!eventBox) {
      return false;
    }
    eventName = eventBox.querySelector(".event-name-label").textContent;
    return eventName == TITLE2;
  }, "event name did not update in time");

  Assert.equal(eventName, TITLE2);

  // Delete event.
  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await CalendarTestUtils.weekView.waitForNoEventBoxAt(window, 5, 1);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(window, CALENDARNAME);
  closeAllEventDialogs();
});
