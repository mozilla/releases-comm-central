/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARNAME,
  CANVAS_BOX,
  DAY_VIEW,
  EVENTPATH,
  EVENT_BOX,
  LABELDAYBOX,
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

const TITLE1 = "Day View Event";
const TITLE2 = "Day View Event Changed";
const DESC = "Day View Event Description";

add_task(async function testDayView() {
  let dateFormatter = cal.getDateFormatter();

  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 1);

  // Verify date in view.
  let day = lookup(`${DAY_VIEW}/${LABELDAYBOX}/{"flex":"1"}`);
  controller.waitFor(() => day.getNode().mDate.icalString == "20090101");

  // Create event at 8 AM.
  let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
  await invokeEventDialog(controller, eventBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    let { getDateTimePicker } = helpersForEditUI(iframe);

    let startTimeInput = getDateTimePicker("STARTTIME");
    let startDateInput = getDateTimePicker("STARTDATE");

    // Check that the start time is correct.
    let someDate = cal.createDateTime();
    someDate.resetTo(2009, 0, 1, 8, 0, 0, cal.dtz.floating);
    event.waitForElement(startTimeInput);
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
  eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  await invokeEventDialog(controller, eventBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    // Change title and save changes.
    await setData(event, iframe, { title: TITLE2 });
    event.click(eventid("button-saveandclose"));
  });

  // Check if name was saved.
  let eventName = lookupEventBox(
    "day",
    EVENT_BOX,
    null,
    1,
    null,
    `${EVENTPATH}/${getEventDetails(
      "day"
    )}/{"flex":"1"}/{"class":"calendar-event-details-core event-name-label"}`
  );
  controller.waitForElement(eventName);
  controller.waitFor(() => eventName.getNode().textContent == TITLE2);

  // Delete event
  controller.click(eventBox);
  controller.keypress(eventBox, "VK_DELETE", {});
  controller.waitForElementNotPresent(eventBox);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
