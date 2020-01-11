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
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { REC_DLG_ACCEPT, REC_DLG_DAYS } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var controller = mozmill.getMail3PaneController();
var { lookupEventBox } = helpersForController(controller);

const HOUR = 8;

add_task(async function testWeeklyNRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 5);

  // Create weekly recurring event.
  let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  await invokeEventDialog(controller, eventBox, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
    event.waitForElement(eventid("item-repeat"));
    menulistSelect(eventid("item-repeat"), "custom", event);
    wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

    event.click(eventid("button-saveandclose"));
  });

  // Check day view.
  let box = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 0; i < 4; i++) {
    controller.waitForElement(box);
    viewForward(controller, 1);
  }

  // Not Friday.
  controller.waitForElementNotPresent(box);
  viewForward(controller, 1);

  // Not Saturday as only 4 occurrences are set.
  controller.waitForElementNotPresent(box);

  // Check week view.
  switchToView(controller, "week");

  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 2; i < 6; i++) {
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, i, null, EVENTPATH));
  }

  // Saturday
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH));

  // Check multiweek view.
  switchToView(controller, "multiweek");
  checkMultiWeekView("multiweek");

  // Check month view.
  switchToView(controller, "month");
  checkMultiWeekView("month");

  // Delete event.
  box = lookupEventBox("month", CANVAS_BOX, 2, 2, null, EVENTPATH);
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  controller.waitForElementNotPresent(box);

  Assert.ok(true, "Test ran to completion");
});

function setRecurrence(recurrence) {
  let { sleep: recsleep, lookup: reclookup, eid: recid } = helpersForController(recurrence);

  // weekly
  recurrence.waitForElement(recid("period-list"));
  menulistSelect(recid("period-list"), "1", recurrence);
  recsleep();

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let tue = cal.l10n.getDateFmtString("day.3.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let thu = cal.l10n.getDateFmtString("day.5.Mmm");
  let sat = cal.l10n.getDateFmtString("day.7.Mmm");

  // Starting from Monday so it should be checked. We have to wait a little,
  // because the checkedstate is set in background by JS.
  recurrence.waitFor(() => {
    return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
  }, 30000);
  // Check Tuesday, Wednesday, Thursday and Saturday too.
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${thu}"}`));
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${sat}"}`));

  // Set number of recurrences.
  recurrence.click(recid("recurrence-range-for"));
  let ntimesField = recid("repeat-ntimes-count");
  ntimesField.getNode().value = "4";

  // Close dialog.
  recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
  // In month view event starts from 2nd row.
  let week = view == "month" ? 2 : 1;

  // Monday, Tuesday, Wednesday, Thursday
  for (let i = 2; i < 6; i++) {
    controller.assertNode(lookupEventBox(view, CANVAS_BOX, week, i, null, EVENTPATH));
  }

  // Saturday
  controller.assertNodeNotExist(lookupEventBox(view, CANVAS_BOX, week, 7, null, EVENTPATH));
}

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
