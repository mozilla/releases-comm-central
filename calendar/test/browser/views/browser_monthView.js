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
  switchToView,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

const TITLE1 = "Month View Event";
const TITLE2 = "Month View Event Changed";
const DESC = "Month View Event Description";

add_task(async function testMonthView() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "month");
  goToDate(controller, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    let dateLabel = controller.window.document.querySelector(
      '#month-view td[selected="true"] > calendar-month-day-box'
    );
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event.
  // Thursday of 2009-01-01 should be the selected box in the first row with default settings.
  let hour = new Date().getUTCHours(); // Remember time at click.
  let eventBox = CalendarTestUtils.monthView.getDayBox(controller.window, 1, 5);
  let { dialogWindow, iframeWindow, iframeDocument } = await CalendarTestUtils.editNewEvent(
    window,
    eventBox
  );

  // Check that the start time is correct.
  // Next full hour except last hour hour of the day.
  let nextHour = hour == 23 ? hour : (hour + 1) % 24;
  let someDate = cal.dtz.now();
  someDate.resetTo(2009, 0, 1, nextHour, 0, 0, cal.dtz.floating);

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
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.monthView.editItemAt(
    controller.window,
    1,
    5,
    1
  ));
  // Change title and save changes.
  await setData(dialogWindow, iframeWindow, { title: TITLE2 });
  await saveAndCloseItemDialog(dialogWindow);

  // Check if name was saved.
  let eventName;
  await TestUtils.waitForCondition(() => {
    eventBox = CalendarTestUtils.monthView.getItemAt(controller.window, 1, 5, 1);
    if (!eventBox) {
      return false;
    }
    eventName = eventBox.querySelector(".event-name-label").textContent;
    return eventName == TITLE2;
  }, "event name did not update in time");

  Assert.equal(eventName, TITLE2);

  // Delete event.
  controller.click(eventBox);
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  await CalendarTestUtils.monthView.waitForNoItemAt(controller.window, 1, 5, 1);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
