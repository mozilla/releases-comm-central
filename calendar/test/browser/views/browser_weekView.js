/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  WEEK_VIEW,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  getEventDetails,
  goToDate,
  helpersForController,
  invokeEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { helpersForEditUI, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var controller = mozmill.getMail3PaneController();
var { lookup, lookupEventBox } = helpersForController(controller);

var TITLE1 = "Week View Event";
var TITLE2 = "Week View Event Changed";
var DESC = "Week View Event Description";

add_task(async function testWeekView() {
  let dateFormatter = cal.getDateFormatter();

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
  await invokeEventDialog(controller, eventBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    let { getDateTimePicker } = helpersForEditUI(iframe);

    let startTimeInput = getDateTimePicker("STARTTIME");
    let startDateInput = getDateTimePicker("STARTDATE");

    // Check that the start time is correct.
    event.waitForElement(startTimeInput);
    let someDate = cal.createDateTime();
    someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);
    event.assertValue(startTimeInput, dateFormatter.formatTime(someDate));
    event.assertValue(startDateInput, dateFormatter.formatDateShort(someDate));

    // Fill in title, description and calendar.
    await setData(event, iframe, {
      title: TITLE1,
      description: DESC,
      calendar: CALENDARNAME,
    });

    // save
    event.click(eventid("button-saveandclose"));
  });

  // If it was created successfully, it can be opened.
  eventBox = lookupEventBox("week", EVENT_BOX, null, 5, null, EVENTPATH);
  await invokeEventDialog(controller, eventBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    // Change title and save changes.
    await setData(event, iframe, { title: TITLE2 });
    event.click(eventid("button-saveandclose"));
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
  controller.keypress(eventBox, "VK_DELETE", {});
  controller.waitForElementNotPresent(eventBox);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
