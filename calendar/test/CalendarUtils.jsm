/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "SHORT_SLEEP",
  "MID_SLEEP",
  "TIMEOUT_MODAL_DIALOG",
  "CALENDARNAME",
  "handleOccurrencePrompt",
  "switchToView",
  "goToDate",
  "goToToday",
  "execEventDialogCallback",
  "ensureViewLoaded",
  "checkMonthAlarmIcon",
  "viewForward",
  "viewBack",
  "closeAllEventDialogs",
  "deleteCalendars",
  "createCalendar",
  "openCalendarPrefs",
  "closeCalendarPrefs",
  "controller",
];

var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
var { close_pref_tab, open_pref_tab } = ChromeUtils.import(
  "resource://testing-common/mozmill/PrefTabHelpers.jsm"
);
var EventUtils = ChromeUtils.import("resource://testing-common/mozmill/EventUtils.jsm");
var {
  close_window,
  plan_for_modal_dialog,
  wait_for_existing_window,
  wait_for_modal_dialog,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");
var { TestUtils } = ChromeUtils.import("resource://testing-common/TestUtils.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var SHORT_SLEEP = 100;
var MID_SLEEP = 500;
var TIMEOUT_MODAL_DIALOG = 30000;
var CALENDARNAME = "Mozmill";
var EVENT_DIALOG_NAME = "Calendar:EventDialog";
var EVENT_SUMMARY_DIALOG_NAME = "Calendar:EventSummaryDialog";

var controller;

function setupModule() {
  // For our tests, we assume that Sunday is start of week.
  Services.prefs.setIntPref("calendar.week.start", 0);

  // We are in calendarTests, so we make sure, calendar-tab with day-view is displayed.
  controller = wait_for_existing_window("mail:3pane");
  switchToView(controller, "day");
}
setupModule();

/**
 * Make sure, the current view has finished loading.
 *
 * @param controller        Mozmill window controller
 */
function ensureViewLoaded(controller) {
  controller.waitFor(() => controller.window.currentView().mPendingRefreshJobs.size == 0);
  // After the queue is empty the view needs a moment to settle.
  controller.sleep(200);
}

/**
 * Open and click the appropriate button on the recurrence-Prompt Dialog.
 *
 * @param controller      Mozmill window controller
 * @param element         Element which will open the dialog.
 * @param mode            Action to exec on element (delete OR modify).
 * @param selectParent    true if all occurrences should be deleted.
 */
function handleOccurrencePrompt(controller, element, mode, selectParent) {
  let handleOccurrenceDialog = dController => {
    let buttonId;
    if (selectParent) {
      buttonId = "accept-parent-button";
    } else {
      buttonId = "accept-occurrence-button";
    }
    let acceptButton = dController.window.document.getElementById(buttonId);
    dController.click(acceptButton);
  };
  let handleSummaryDialog = dController => {
    let dialog = dController.window.document.querySelector("dialog");
    let editButton = dialog.getButton("accept");
    plan_for_modal_dialog("Calendar:OccurrencePrompt", handleOccurrenceDialog);
    dController.click(editButton);
    wait_for_modal_dialog("Calendar:OccurrencePrompt", TIMEOUT_MODAL_DIALOG);
  };
  if (mode == "delete") {
    plan_for_modal_dialog("Calendar:OccurrencePrompt", handleOccurrenceDialog);

    EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
    wait_for_modal_dialog("Calendar:OccurrencePrompt", TIMEOUT_MODAL_DIALOG);
  } else if (mode == "modify") {
    plan_for_modal_dialog(EVENT_SUMMARY_DIALOG_NAME, handleSummaryDialog);
    controller.doubleClick(element);
    wait_for_modal_dialog(EVENT_SUMMARY_DIALOG_NAME, TIMEOUT_MODAL_DIALOG);
  }
}

/**
 * Switch to a view and make sure it's displayed.
 *
 * @param controller        Mozmill window controller
 * @param view              day, week, multiweek or month
 */
function switchToView(controller, view) {
  let tabButton = controller.window.document.getElementById("calendar-tab-button");
  controller.click(tabButton);

  let button = controller.window.document.getElementById(`calendar-${view}-view-button`);
  controller.click(button);

  ensureViewLoaded(controller);
}

/**
 * Go to a specific date using minimonth.
 *
 * @param controller    Main window controller
 * @param year          Four-digit year
 * @param month         1-based index of a month
 * @param day           1-based index of a day
 */
function goToDate(controller, year, month, day) {
  let miniMonth = controller.window.document.getElementById("calMinimonth");

  let activeYear = miniMonth.querySelector(".minimonth-year-name").value;

  let activeMonth = miniMonth.querySelector(".minimonth-month-name").getAttribute("monthIndex");

  function doScroll(name, difference, sleepTime) {
    if (difference === 0) {
      return;
    }
    let query = `.${name}s-${difference > 0 ? "back" : "forward"}-button`;
    let scrollArrow;
    controller.waitFor(() => {
      scrollArrow = miniMonth.querySelector(query);
      return scrollArrow;
    }, `Query for scroll: ${query}`);

    for (let i = 0; i < Math.abs(difference); i++) {
      scrollArrow.doCommand();
      controller.sleep(sleepTime);
    }
  }

  doScroll("year", activeYear - year, 10);
  doScroll("month", activeMonth - (month - 1), 25);

  function getMiniMonthDay(week, day) {
    return miniMonth.querySelector(
      `.minimonth-cal-box > tr.minimonth-row-body:nth-of-type(${week + 1}) > ` +
        `td.minimonth-day:nth-of-type(${day})`
    );
  }

  let positionOfFirst = 7 - getMiniMonthDay(1, 7).textContent;
  let weekDay = ((positionOfFirst + day - 1) % 7) + 1;
  let week = Math.floor((positionOfFirst + day - 1) / 7) + 1;

  // Pick day.
  controller.click(getMiniMonthDay(week, weekDay));
  ensureViewLoaded(controller);
}

/**
 * Go to today.
 *
 * @param controller    Main window controller
 */
function goToToday(controller) {
  controller.click(controller.window.document.getElementById("today-view-button"));
  ensureViewLoaded(controller);
}

async function execEventDialogCallback(callback) {
  let eventWindow = Services.wm.getMostRecentWindow(EVENT_DIALOG_NAME);

  if (!eventWindow) {
    eventWindow = await CalendarTestUtils.waitForEventDialog("edit");
  }

  let iframe = eventWindow.document.getElementById("calendar-item-panel-iframe");
  await TestUtils.waitForCondition(() => iframe.contentWindow.onLoad?.hasLoaded);

  await callback(eventWindow, iframe.contentWindow);
}

/**
 * Checks if Alarm-Icon is shown on a given Event-Box.
 *
 * @param week - Week to check between 1-6
 * @param day  - Day to check between 1-7
 */
function checkMonthAlarmIcon(controller, week, day) {
  let dayBox = CalendarTestUtils.monthView.getItemAt(controller.window, week, day, 1);
  Assert.ok(dayBox.querySelector(".alarm-icons-box > .reminder-icon"));
}

/**
 * Moves the view n times forward.
 *
 * @param controller    Mozmill window controller
 * @param n             How many times next button in view is clicked.
 */
function viewForward(controller, n) {
  for (let i = 0; i < n; i++) {
    controller.click(controller.window.document.getElementById("next-view-button"));
    controller.sleep(SHORT_SLEEP);
  }
  ensureViewLoaded(controller);
}

/**
 * Moves the view n times back.
 *
 * @param controller    Mozmill window controller
 * @param n             How many times previous button in view is clicked.
 */
function viewBack(controller, n) {
  for (let i = 0; i < n; i++) {
    controller.click(controller.window.document.getElementById("previous-view-button"));
    controller.sleep(SHORT_SLEEP);
  }
  ensureViewLoaded(controller);
}

/**
 * Closes all EventDialogs that may remain open after a failed test
 */
function closeAllEventDialogs() {
  for (let win of Services.wm.getEnumerator("Calendar:EventDialog")) {
    close_window(win);
  }
}

/**
 * Deletes all calendars with given name.
 *
 * @param controller    Mozmill window controller
 * @param name          calendar name
 */
function deleteCalendars(controller, name) {
  let manager = controller.window.cal.getCalendarManager();

  for (let calendar of manager.getCalendars()) {
    if (calendar.name == name) {
      manager.removeCalendar(calendar);
    }
  }
}

/**
 * Creates local calendar with given name and select it in calendars list.
 *
 * @param controller    Mozmill window controller
 * @param name          calendar name
 */
function createCalendar(controller, name) {
  let manager = controller.window.cal.getCalendarManager();

  let url = Services.io.newURI("moz-storage-calendar://");
  let calendar = manager.createCalendar("storage", url);
  calendar.name = name;
  manager.registerCalendar(calendar);

  controller.click(
    controller.window.document.querySelector(`#calendar-list > [calendar-id="${calendar.id}"]`)
  );
  return calendar.id;
}

function openCalendarPrefs(aCallback, aParentController) {
  aCallback(open_pref_tab("paneCalendar"));
}

function closeCalendarPrefs(tab) {
  close_pref_tab(tab);
}
