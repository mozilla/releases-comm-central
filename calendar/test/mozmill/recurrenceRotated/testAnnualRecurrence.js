/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var CALENDARNAME, EVENTPATH, CANVAS_BOX, ALLDAY;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, closeAllEventDialogs, deleteCalendars, createCalendar, menulistSelect;

const STARTYEAR = 1950;
const EPOCH = 1970;

function setupModule(module) {
  controller = mozmill.getMail3PaneController();
  ({
    CALENDARNAME,
    EVENTPATH,
    CANVAS_BOX,
    ALLDAY,
    helpersForController,
    handleOccurrencePrompt,
    switchToView,
    goToDate,
    invokeEventDialog,
    closeAllEventDialogs,
    deleteCalendars,
    createCalendar,
    menulistSelect,
  } = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm"));
  Object.assign(module, helpersForController(controller));

  switchToView(controller, "day");
  createCalendar(controller, CALENDARNAME);
  // Rotate view.
  controller.mainMenu.click("#ltnViewRotated");
  controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");
}

function testAnnualRecurrence() {
  goToDate(controller, STARTYEAR, 1, 1);

  // Create yearly recurring all-day event.
  let eventBox = lookupEventBox("day", ALLDAY, null, 1, null);
  invokeEventDialog(controller, eventBox, (event, iframe) => {
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
}

function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  // Reset view.
  if (eid("day-view").getNode().orient == "horizontal") {
    controller.mainMenu.click("#ltnViewRotated");
  }
  controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
  closeAllEventDialogs();
}
