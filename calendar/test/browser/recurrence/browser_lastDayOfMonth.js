/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  TIMEOUT_MODAL_DIALOG,
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
var { REC_DLG_ACCEPT } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var controller = mozmill.getMail3PaneController();
var { lookupEventBox } = helpersForController(controller);

const HOUR = 8;

add_task(async function testLastDayOfMonthRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2008, 1, 31); // Start with a leap year.

  // Create monthly recurring event.
  let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  await invokeEventDialog(controller, eventBox, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
    menulistSelect(eventid("item-repeat"), "custom", event);
    wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

    event.click(eventid("button-saveandclose"));
  });

  // data tuple: [year, month, day, row in month view]
  // note: Month starts here with 1 for January.
  let checkingData = [
    [2008, 1, 31, 5],
    [2008, 2, 29, 5],
    [2008, 3, 31, 6],
    [2008, 4, 30, 5],
    [2008, 5, 31, 5],
    [2008, 6, 30, 5],
    [2008, 7, 31, 5],
    [2008, 8, 31, 6],
    [2008, 9, 30, 5],
    [2008, 10, 31, 5],
    [2008, 11, 30, 6],
    [2008, 12, 31, 5],
    [2009, 1, 31, 5],
    [2009, 2, 28, 4],
    [2009, 3, 31, 5],
  ];
  // Check all dates.
  for (let [y, m, d, correctRow] of checkingData) {
    let date = new Date(y, m - 1, d);
    let column = date.getDay() + 1;

    goToDate(controller, y, m, d);

    // day view
    switchToView(controller, "day");
    controller.waitForElement(lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH));

    // week view
    switchToView(controller, "week");
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, column, null, EVENTPATH));

    // multiweek view
    switchToView(controller, "multiweek");
    controller.waitForElement(lookupEventBox("multiweek", CANVAS_BOX, 1, column, null, EVENTPATH));

    // month view
    switchToView(controller, "month");
    controller.waitForElement(
      lookupEventBox("month", CANVAS_BOX, correctRow, column, null, EVENTPATH)
    );
  }

  // Delete event.
  goToDate(controller, checkingData[0][0], checkingData[0][1], checkingData[0][2]);
  switchToView(controller, "day");
  let box = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  controller.waitThenClick(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  controller.waitForElementNotPresent(box);

  Assert.ok(true, "Test ran to completion");
});

function setRecurrence(recurrence) {
  let { sleep: recsleep, lookup: reclookup, eid: recid } = helpersForController(recurrence);

  // monthly
  menulistSelect(recid("period-list"), "2", recurrence);

  // last day of month
  recurrence.radio(recid("montly-period-relative-date-radio"));
  menulistSelect(recid("monthly-ordinal"), "-1", recurrence);
  menulistSelect(recid("monthly-weekday"), "-1", recurrence);
  recsleep();

  // Close dialog.
  recurrence.click(reclookup(REC_DLG_ACCEPT));
}

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
