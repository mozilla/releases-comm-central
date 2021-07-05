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
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { weekView } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
).CalendarTestUtils;

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

add_task(async function testWeekView() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    let dateLabel = controller.window.document.querySelector(
      "#week-view calendar-header-container[selected=true]"
    );
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event at 8 AM.
  // Thursday of 2009-01-01 is 4th with default settings.
  let eventBox = weekView.getHourBoxAt(controller.window, 5, 8);
  await invokeNewEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
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

    await saveAndCloseItemDialog(eventWindow);
  });

  // If it was created successfully, it can be opened.
  eventBox = await weekView.waitForEventBoxAt(controller.window, 5, 1);
  await invokeEditingEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
    // Change title and save changes.
    await setData(eventWindow, iframeWindow, { title: TITLE2 });
    await saveAndCloseItemDialog(eventWindow);
  });

  // Check if name was saved.
  eventBox = await TestUtils.waitForCondition(() => {
    let newEventBox = weekView.getEventBoxAt(controller.window, 5, 1);
    if (newEventBox && newEventBox != eventBox) {
      return newEventBox;
    }
    return false;
  });
  let eventName = eventBox.querySelector(".event-name-label");
  Assert.ok(eventName);
  Assert.equal(eventName.textContent, TITLE2);

  // Delete event.
  controller.click(eventBox);
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  await weekView.waitForNoEventBoxAt(controller.window, 5, 1);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
