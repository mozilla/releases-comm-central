/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  WEEK_VIEW,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  getEventDetails,
  goToDate,
  helpersForController,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { lookup, lookupEventBox } = helpersForController(controller);

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

add_task(async function testWeekView() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 1);

  // Verify date.
  let day = lookup(`
        ${WEEK_VIEW}/{"class":"mainbox"}/{"class":"headerbox"}/
        {"class":"headerdaybox"}/{"selected":"true"}
    `);
  controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

  // Create event at 8 AM.
  // Thursday of 2009-01-01 is 4th with default settings.
  let eventBox = lookupEventBox("week", CANVAS_BOX, null, 5, 8);
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
  eventBox = lookupEventBox("week", EVENT_BOX, null, 5, null, EVENTPATH);
  await invokeEditingEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Change title and save changes.
    await setData(eventWindow, iframeWindow, { title: TITLE2 });
    saveAndCloseItemDialog(eventWindow);
  });

  // Check if name was saved.
  let eventName = lookupEventBox(
    "week",
    EVENT_BOX,
    null,
    5,
    null,
    `${EVENTPATH}/${getEventDetails(
      "week"
    )}/{"flex":"1"}/{"class":"calendar-event-details-core event-name-label"}`
  );
  controller.waitForElement(eventName);
  controller.waitFor(() => eventName.getNode().textContent == TITLE2);

  // Delete event.
  controller.click(eventBox);
  eventBox.getNode().focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  controller.waitForElementNotPresent(eventBox);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
