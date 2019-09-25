/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeeklyWithExceptionRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENT_BOX, CANVAS_BOX;
var DAY_VIEW, WEEK_VIEW, EVENTPATH;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, viewForward, closeAllEventDialogs, deleteCalendars, createCalendar;
var menulistSelect;
var REPEAT_DETAILS, REC_DLG_ACCEPT, REC_DLG_DAYS;
var helpersForEditUI, setData;

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

const HOUR = 8;
const STARTDATE = new Date(2009, 0, 6);

function setupModule(module) {
  controller = mozmill.getMail3PaneController();
  ({
    TIMEOUT_MODAL_DIALOG,
    CALENDARNAME,
    EVENT_BOX,
    CANVAS_BOX,
    EVENTPATH,
    DAY_VIEW,
    WEEK_VIEW,
    helpersForController,
    handleOccurrencePrompt,
    switchToView,
    goToDate,
    invokeEventDialog,
    viewForward,
    closeAllEventDialogs,
    deleteCalendars,
    createCalendar,
    menulistSelect,
  } = collector.getModule("calendar-utils"));
  collector.getModule("calendar-utils").setupModule(controller);
  Object.assign(module, helpersForController(controller));

  ({
    REPEAT_DETAILS,
    REC_DLG_ACCEPT,
    REC_DLG_DAYS,
    helpersForEditUI,
    setData,
  } = collector.getModule("item-editing-helpers"));
  collector.getModule("item-editing-helpers").setupModule(module);

  createCalendar(controller, CALENDARNAME);
}

function testWeeklyWithExceptionRecurrence() {
  goToDate(controller, 2009, 1, 5);

  // Create weekly recurring event.
  let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  invokeEventDialog(controller, eventBox, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    event.waitForElement(eventid("item-repeat"));
    plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
    menulistSelect(eventid("item-repeat"), "custom", event);
    wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

    event.click(eventid("button-saveandclose"));
  });

  // Move 5th January occurrence to 6th January.
  eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  handleOccurrencePrompt(controller, eventBox, "modify", false);
  invokeEventDialog(controller, null, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    setData(event, iframe, { startdate: STARTDATE, enddate: STARTDATE });
    event.click(eventid("button-saveandclose"));
  });

  // Change recurrence rule.
  goToDate(controller, 2009, 1, 7);
  eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  handleOccurrencePrompt(controller, eventBox, "modify", true);
  invokeEventDialog(controller, null, (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    let { iframeLookup } = helpersForEditUI(iframe);

    event.waitForElement(eventid("item-repeat"));
    plan_for_modal_dialog("Calendar:EventDialog:Recurrence", changeRecurrence);
    event.click(iframeLookup(REPEAT_DETAILS));
    wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

    event.click(eventid("button-saveandclose"));
  });

  // Check two weeks.
  // day view
  switchToView(controller, "day");
  let path = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

  goToDate(controller, 2009, 1, 5);
  controller.waitForElementNotPresent(path);

  viewForward(controller, 1);
  let tuesPath = `
        ${DAY_VIEW}/{"class":"mainbox"}/{"class":"scrollbox"}/
        {"class":"daybox"}/[0]/anon({"class":"multiday-column-box-stack"})/
        anon({"class":"multiday-column-top-box"})/{"flex":"1"}/{"flex":"1"}/[eventIndex]
    `;

  // Assert exactly two.
  controller.waitForElement(lookup(tuesPath.replace("eventIndex", "0") + EVENTPATH));
  controller.assertNode(lookup(tuesPath.replace("eventIndex", "1") + EVENTPATH));
  controller.assertNodeNotExist(lookup(tuesPath.replace("eventIndex", "2") + EVENTPATH));

  viewForward(controller, 1);
  controller.waitForElement(path);
  viewForward(controller, 1);
  controller.waitForElementNotPresent(path);
  viewForward(controller, 1);
  controller.waitForElement(path);
  viewForward(controller, 1);
  controller.waitForElementNotPresent(path);
  viewForward(controller, 1);
  controller.waitForElementNotPresent(path);

  // next week
  viewForward(controller, 1);
  controller.waitForElement(path);
  viewForward(controller, 1);
  controller.waitForElement(path);
  viewForward(controller, 1);
  controller.waitForElement(path);
  viewForward(controller, 1);
  controller.waitForElementNotPresent(path);
  viewForward(controller, 1);
  controller.waitForElement(path);
  viewForward(controller, 1);
  controller.waitForElementNotPresent(path);

  // week view
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 5);

  tuesPath = `
        ${WEEK_VIEW}/{"class":"mainbox"}/{"class":"scrollbox"}/
        {"class":"daybox"}/[2]/anon({"class":"multiday-column-box-stack"})/
        anon({"class":"multiday-column-top-box"})/{"flex":"1"}/{"flex":"1"}/[eventIndex]
    `;

  // Assert exactly two.
  controller.waitForElement(lookup(tuesPath.replace("eventIndex", "0") + EVENTPATH));
  controller.assertNode(lookup(tuesPath.replace("eventIndex", "1") + EVENTPATH));
  controller.assertNodeNotExist(lookup(tuesPath.replace("eventIndex", "2") + EVENTPATH));

  // Wait for the last occurrence because this appears last.
  controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 6, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 1, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 2, null));
  controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 4, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 5, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, null));

  viewForward(controller, 1);
  controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 6, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 1, null));
  controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 2, null));
  controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 3, null));
  controller.assertNode(lookupEventBox("week", EVENT_BOX, null, 4, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 5, null));
  controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, null));

  // multiweek view
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 5);
  checkMultiWeekView("multiweek");

  // month view
  switchToView(controller, "month");
  checkMultiWeekView("month");

  // delete event
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 12);
  path = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  controller.click(path);
  handleOccurrencePrompt(controller, path, "delete", true);
  controller.waitForElementNotPresent(path);
}

function setRecurrence(recurrence) {
  let { lookup: reclookup, eid: recid } = helpersForController(recurrence);

  // weekly
  menulistSelect(recid("period-list"), "1", recurrence);

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let fri = cal.l10n.getDateFmtString("day.6.Mmm");

  // Starting from Monday so it should be checked. We have to wait a little,
  // because the checkedstate is set in background by JS.
  recurrence.waitFor(() => {
    return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
  }, 10000);
  // Check Wednesday and Friday too.
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
  recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));
  recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));

  // Close dialog.
  recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function changeRecurrence(recurrence) {
  let { lookup: reclookup, eid: recid } = helpersForController(recurrence);

  // weekly
  menulistSelect(recid("period-list"), "1", recurrence);

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let tue = cal.l10n.getDateFmtString("day.3.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let fri = cal.l10n.getDateFmtString("day.6.Mmm");

  // Check old rule.
  // Starting from Monday so it should be checked. We have to wait a little,
  // because the checkedstate is set in background by JS.
  recurrence.waitFor(() => {
    return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
  }, 10000);
  recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
  recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));

  // Check Tuesday.
  recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));
  recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${tue}"}`));

  // Close dialog.
  recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
  let startWeek = view == "multiweek" ? 1 : 2;
  let assertNodeLookup = (...args) => {
    return controller.assertNode(lookupEventBox(...args));
  };
  let assertNodeNotExistLookup = (...args) => {
    return controller.assertNodeNotExist(lookupEventBox(...args));
  };

  // Wait for the first items, then check the ones not to be present.
  // ASssert exactly two.
  controller.waitForElement(lookupEventBox(view, EVENT_BOX, startWeek, 3, null, "/[0]"));
  assertNodeLookup(view, EVENT_BOX, startWeek, 3, null, "/[1]");
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 3, null, "/[2]");
  // Then check no item on the 5th.
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 2, null, EVENTPATH);
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 3, null, "/[2]");
  assertNodeLookup(view, CANVAS_BOX, startWeek, 4, null, EVENTPATH);
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 5, null, EVENTPATH);
  assertNodeLookup(view, CANVAS_BOX, startWeek, 6, null, EVENTPATH);
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek, 7, null, EVENTPATH);

  assertNodeNotExistLookup(view, EVENT_BOX, startWeek + 1, 1, null, EVENTPATH);
  assertNodeLookup(view, CANVAS_BOX, startWeek + 1, 2, null, EVENTPATH);
  assertNodeLookup(view, CANVAS_BOX, startWeek + 1, 3, null, EVENTPATH);
  assertNodeLookup(view, CANVAS_BOX, startWeek + 1, 4, null, EVENTPATH);
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek + 1, 5, null, EVENTPATH);
  assertNodeLookup(view, CANVAS_BOX, startWeek + 1, 6, null, EVENTPATH);
  assertNodeNotExistLookup(view, EVENT_BOX, startWeek + 1, 7, null, EVENTPATH);
}

function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
}
