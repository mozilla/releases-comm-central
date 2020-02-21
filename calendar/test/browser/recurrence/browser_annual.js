/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  ALLDAY,
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  helpersForController,
  invokeEventDialog,
  menulistSelect,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var controller = mozmill.getMail3PaneController();
var { getEventBoxPath, lookup, lookupEventBox } = helpersForController(controller);

const STARTYEAR = 1950;
const EPOCH = 1970;

add_task(async function testAnnualRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, STARTYEAR, 1, 1);

  // Create yearly recurring all-day event.
  let eventBox = lookupEventBox("day", ALLDAY, null, 1, null);
  await invokeEventDialog(controller, eventBox, event => {
    let { eid: eventid } = helpersForController(event);

    menulistSelect(eventid("item-repeat"), "yearly", event);
    event.click(eventid("button-saveandclose"));
  });

  let checkYears = [STARTYEAR, STARTYEAR + 1, EPOCH - 1, EPOCH, EPOCH + 1];
  for (let year of checkYears) {
    goToDate(controller, year, 1, 1);
    let date = new Date(year, 0, 1);
    let column = date.getDay() + 1;

    // day view
    switchToView(controller, "day");
    controller.waitForElement(lookupEventBox("day", ALLDAY, null, 1, null, EVENTPATH));

    // week view
    switchToView(controller, "week");
    controller.waitForElement(lookupEventBox("week", ALLDAY, null, column, null, EVENTPATH));

    // multiweek view
    switchToView(controller, "multiweek");
    controller.waitForElement(lookupEventBox("multiweek", CANVAS_BOX, 1, column, null, EVENTPATH));

    // month view
    switchToView(controller, "month");
    controller.waitForElement(lookupEventBox("month", CANVAS_BOX, 1, column, null, EVENTPATH));
  }

  // Delete event.
  goToDate(controller, checkYears[0], 1, 1);
  switchToView(controller, "day");
  const boxPath = getEventBoxPath("day", ALLDAY, null, 1, null) + EVENTPATH;
  const box = lookup(boxPath);
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  controller.waitForElementNotPresent(box);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
