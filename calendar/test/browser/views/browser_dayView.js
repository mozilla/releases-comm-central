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
  helpersForController,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var elib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { dayView } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarTestUtils.jsm"
).CalendarTestUtils;

const TITLE1 = "Day View Event";
const TITLE2 = "Day View Event Changed";
const DESC = "Day View Event Description";

add_task(async function testDayView() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 1);

  // Verify date in view.
  await TestUtils.waitForCondition(() => {
    let dateLabel = controller.window.document.querySelector(
      "#day-view .labeldaybox calendar-day-label"
    );
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event at 8 AM.
  let eventBox = dayView.getHourBox(controller.window, 8);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Check that the start time is correct.
    let someDate = cal.createDateTime();
    someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);

    let startPicker = iframeWindow.document.getElementById("event-starttime");
    Assert.equal(startPicker._timepicker._inputField.value, cal.dtz.formatter.formatTime(someDate));
    Assert.equal(
      startPicker._datepicker._inputField.value,
      cal.dtz.formatter.formatDateShort(someDate)
    );

    // Fill in title, description and calendar.
    await setData(eventWindow, iframeWindow, {
      title: TITLE1,
      description: DESC,
      calendar: CALENDARNAME,
    });

    saveAndCloseItemDialog(eventWindow);
  });

  // If it was created successfully, it can be opened.
  eventBox = await dayView.waitForEventBox(controller.window);
  await invokeEditingEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Change title and save changes.
    await setData(eventWindow, iframeWindow, { title: TITLE2 });
    saveAndCloseItemDialog(eventWindow);
  });

  // Check if name was saved.
  eventBox = await dayView.waitForEventBox(controller.window);
  let eventName = eventBox.querySelector(".calendar-event-details-core");
  Assert.ok(eventName);
  Assert.ok(eventName.textContent == TITLE2);

  // Delete event
  controller.click(new elib.Elem(eventBox));
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  await dayView.waitForNoEvents(controller.window);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
