/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  MULTIWEEK_VIEW,
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

const TITLE1 = "Multiweek View Event";
const TITLE2 = "Multiweek View Event Changed";
const DESC = "Multiweek View Event Description";

add_task(async function setupModule(module) {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 1);

  // Verify date.
  let day = lookup(`
        ${MULTIWEEK_VIEW}/{"class":"mainbox"}/{"class":"monthgrid"}/[0]/{"selected":"true"}/[0]
    `);
  controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

  // Create event.
  // Thursday of 2009-01-01 should be the selected box in the first row with default settings.
  let hour = new Date().getUTCHours(); // Remember time at click.
  let eventBox = lookupEventBox("multiweek", CANVAS_BOX, 1, 5);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Check that the start time is correct.
    // Next full hour except last hour hour of the day.
    let nextHour = hour == 23 ? hour : (hour + 1) % 24;
    let someDate = cal.dtz.now();
    someDate.resetTo(2009, 0, 1, nextHour, 0, 0, cal.dtz.floating);

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
  eventBox = lookupEventBox("multiweek", CANVAS_BOX, 1, 5, null, EVENTPATH);
  await invokeEditingEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Change title and save changes.
    await setData(eventWindow, iframeWindow, { title: TITLE2 });
    saveAndCloseItemDialog(eventWindow);
  });

  // Check if name was saved.
  let eventName = lookupEventBox(
    "multiweek",
    CANVAS_BOX,
    1,
    5,
    null,
    `${EVENTPATH}/${getEventDetails("multiweek")}/{"flex":"1"}/{"class":"event-name-label"}`
  );

  controller.waitForElement(eventName);
  controller.waitFor(() => eventName.getNode().value == TITLE2);

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
