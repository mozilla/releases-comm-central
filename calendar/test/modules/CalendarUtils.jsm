/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "SHORT_SLEEP",
  "MID_SLEEP",
  "TIMEOUT_MODAL_DIALOG",
  "CALENDARNAME",
  "helpersForController",
  "handleOccurrencePrompt",
  "switchToView",
  "goToDate",
  "invokeNewEventDialog",
  "invokeNewTaskDialog",
  "invokeViewingEventDialog",
  "invokeEditingEventDialog",
  "invokeEditingRepeatEventDialog",
  "execEventDialogCallback",
  "checkMonthAlarmIcon",
  "viewForward",
  "viewBack",
  "closeAllEventDialogs",
  "deleteCalendars",
  "createCalendar",
  "openLightningPrefs",
  "closeLightningPrefs",
  "controller",
];

var elementslib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var { MozMillController } = ChromeUtils.import("resource://testing-common/mozmill/controller.jsm");
var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
var { BrowserTestUtils } = ChromeUtils.import("resource://testing-common/BrowserTestUtils.jsm");
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarTestUtils.jsm"
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

function helpersForController(controller) {
  return {
    eid: id => new elementslib.ID(controller.window.document, id),
    sleep: (timeout = MID_SLEEP) => controller.sleep(timeout),
    replaceText: (textbox, text) => {
      textbox.getNode().focus();
      EventUtils.synthesizeKey("a", { accelKey: true }, controller.window);
      controller.type(textbox, text);
    },
  };
}

/**
 * Make sure, the current view has finished loading.
 *
 * @param controller        Mozmill window controller
 */
function ensureViewLoaded(controller) {
  let { sleep } = helpersForController(controller);
  controller.waitFor(() => controller.window.currentView().mPendingRefreshJobs.size == 0);
  // After the queue is empty the view needs a moment to settle.
  sleep(200);
}

/**
 * Open and click the appropriate button on the recurrence-Prompt Dialog.
 *
 * @param controller      Mozmill window controller
 * @param element         Mozmill element which will open the dialog.
 * @param mode            Action to exec on element (delete OR modify).
 * @param selectParent    true if all occurrences should be deleted.
 */
function handleOccurrencePrompt(controller, element, mode, selectParent) {
  controller.waitForElement(element);
  let handleOccurrenceDialog = dController => {
    let { eid: dlgid } = helpersForController(dController);
    if (selectParent) {
      let acceptButton = dlgid("accept-parent-button");
      dController.waitForElement(acceptButton);
      dController.click(acceptButton);
    } else {
      let acceptButton = dlgid("accept-occurrence-button");
      dController.waitForElement(acceptButton);
      dController.click(acceptButton);
    }
  };
  let handleSummaryDialog = dController => {
    let dialog = dController.window.document.querySelector("dialog");
    let editButton = new elementslib.Elem(dialog.getButton("accept"));
    plan_for_modal_dialog("Calendar:OccurrencePrompt", handleOccurrenceDialog);
    dController.waitForElement(editButton);
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
  let { eid } = helpersForController(controller);

  let tabButton = eid("calendar-tab-button");
  controller.waitForElement(tabButton);
  controller.click(tabButton);

  let button = eid(`calendar-${view}-view-button`);
  controller.waitForElement(button);
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
  controller.click(new elementslib.Elem(getMiniMonthDay(week, weekDay)));
  ensureViewLoaded(controller);
}

/**
 * This callback should close the dialog when finished.
 * @callback EventDialogCallback
 * @param {Window} dialogWindow - Item dialog outer window.
 * @param {Window} iframeWindow - Item dialog inner iframe.
 * @returns {Promise}
 */

/**
 * Opens a new event dialog by clicking on the (optional) box and executing the
 * callback function.
 *
 * NOTE: This function will timeout if the "clickBox" opens an existing event,
 * use the other invoke*EventDialog() functions for existing events instead.
 *
 * @param {MozMillController}   mWController - The main window controller.
 * @param {Element|null} clickBox            - The optional box to click on.
 * @param {EventDialogCallback} callback     - The function to execute while
 *                                             the event dialog is open.
 */
async function invokeNewEventDialog(mWController, clickBox, callback) {
  let eventWindowPromise = CalendarTestUtils.waitForEventDialog("edit");
  if (clickBox) {
    doubleClickOptionalEventBox(mWController, clickBox);
  } else {
    mWController.mainMenu.click("#calendar-new-event-menuitem");
  }
  await eventWindowPromise;
  Assert.report(false, undefined, undefined, "New event dialog opened");
  await execEventDialogCallback(mWController, callback);
}

/**
 * Opens a new task dialog by clicking on the (optional) box and executing the
 * callback function.
 *
 * NOTE: This function will timeout if the "clickBox" opens an existing task,
 * use the other invoke*EventDialog() functions for existing tasks instead.
 *
 * @param {MozMillController}   mWController - The main window controller.
 * @param {Element|null} clickBox            - The optional box to click on.
 * @param {EventDialogCallback} callback     - The function to execute while
 *                                             the task dialog is open.
 */
async function invokeNewTaskDialog(mWController, clickBox, callback) {
  let taskWindowPromise = CalendarTestUtils.waitForEventDialog("edit");
  if (clickBox) {
    doubleClickOptionalEventBox(mWController, clickBox);
  } else {
    mWController.mainMenu.click("#calendar-new-task-menuitem");
  }
  await taskWindowPromise;
  Assert.report(false, undefined, undefined, "New task dialog opened");
  await execEventDialogCallback(mWController, callback);
}

/**
 * This callback should close the dialog when finished.
 * @callback EventSummaryDialogCallback
 * @param {MozMillController} eventController - The controller for the event
 *                                              window.
 * @returns {Promise}
 */

/**
 * Opens an existing event in the event summary dialog by clicking on the
 * (optional) box and executing the callback function.
 *
 * NOTE: This function will timeout if the "clickBox" opens a new event
 * instead of an existing one.
 *
 * @param {MozMillController} mWController      - The main window controller.
 * @param {Element|null} clickBox               - The optional box to click on.
 * @param {EventSummaryDialogCallback} callback - The function to execute while
 *                                                the event summary dialog is
 *                                                open.
 */
async function invokeViewingEventDialog(mWController, clickBox, callback) {
  let summaryWindowPromise = CalendarTestUtils.waitForEventDialog();
  doubleClickOptionalEventBox(mWController, clickBox);
  let summaryWindow = await summaryWindowPromise;
  Assert.report(false, undefined, undefined, "Summary dialog opened");
  let summaryController = new MozMillController(summaryWindow);
  summaryController.sleep(MID_SLEEP);

  await callback(summaryController);
  await BrowserTestUtils.windowClosed(summaryWindow);
  Assert.report(false, undefined, undefined, "Summary dialog closed");
}

/**
 * Opens an existing event for editing in the event dialog by clicking on the
 * (optional) box and executing the callback function.
 *
 * NOTE: This function will timeout if the "clickBox" opens a new event instead
 * of an existing one.
 *
 * @param {MozMillController} mWController - The main window controller.
 * @param {Element|null} clickBox          - The box to click on.
 * @param {EventDialogCallback} callback   - The function to execute while
 *                                           the event dialog is open.
 */
async function invokeEditingEventDialog(mWController, clickBox, callback) {
  let eventWindowPromise = CalendarTestUtils.waitForEventDialog();
  doubleClickOptionalEventBox(mWController, clickBox);
  let eventWindow = await eventWindowPromise;
  Assert.report(false, undefined, undefined, "Edit event dialog opened");
  let eventController = new MozMillController(eventWindow);
  eventController.sleep(MID_SLEEP);

  let dialog = eventController.window.document.querySelector("dialog");
  let editButton = new elementslib.Elem(dialog.getButton("accept"));
  eventController.click(editButton);
  await execEventDialogCallback(mWController, callback);
}

/**
 * Opens an existing, repeating event for editing in the event dialog by
 * clicking on the (optional) box and executing the callback function.
 *
 * NOTE: This function will timeout if the "clickBox" opens a new event instead
 * of an existing one.
 *
 * @param {MozMillController} mWController - The main window controller.
 * @param {Element|null} clickBox          - The box to click on.
 * @param {EventDialogCallback} callback   - The function to execute while
 *                                           the event dialog is open.
 * @param {boolean} [editAll=false]        - If true, will edit all
 *                                           occurrences of the event.
 */
async function invokeEditingRepeatEventDialog(mWController, clickBox, callback, editAll = false) {
  let eventWindowPromise = CalendarTestUtils.waitForEventDialog();
  doubleClickOptionalEventBox(mWController, clickBox);
  let eventWindow = await eventWindowPromise;
  Assert.report(false, undefined, undefined, "Repeating event dialog opened");
  let eventController = new MozMillController(eventWindow);
  eventController.sleep(MID_SLEEP);

  let target = editAll
    ? "edit-button-context-menu-all-occurrences"
    : "edit-button-context-menu-this-occurrence";
  let editButton = new elementslib.Elem(
    eventController.window.document.querySelector(`#${target}`)
  );

  eventController.click(editButton);
  await BrowserTestUtils.windowClosed(eventWindow);
  Assert.report(false, undefined, undefined, "Repeating event dialog closed");
  await execEventDialogCallback(mWController, callback);
}

function doubleClickOptionalEventBox(mWController, clickBox) {
  if (clickBox) {
    clickBox = new elementslib.Elem(clickBox);
    mWController.doubleClick(clickBox, 1, 1);
  }
}

async function execEventDialogCallback(mWController, callback) {
  let eventWindow = Services.wm.getMostRecentWindow(EVENT_DIALOG_NAME);

  if (!eventWindow) {
    eventWindow = await CalendarTestUtils.waitForEventDialog("edit");
  }

  let eventController = new MozMillController(eventWindow);
  let iframe = waitForItemPanelIframe(eventController);

  await callback(eventWindow, iframe.contentWindow);
  BrowserTestUtils.windowClosed(mWController.window);
  Assert.report(false, undefined, undefined, "Event dialog closed");
}

function waitForItemPanelIframe(eventController) {
  let { eid } = helpersForController(eventController);

  let iframeid = "lightning-item-panel-iframe";
  eventController.waitForElement(eid(iframeid));

  let iframe = eventController.window.document.getElementById(iframeid);
  eventController.waitFor(
    () => {
      return iframe.contentWindow.onLoad && iframe.contentWindow.onLoad.hasLoaded;
    },
    "lightning-item-panel-iframe did not load in time",
    10000
  );
  return iframe;
}

/**
 * Checks if Alarm-Icon is shown on a given Event-Box.
 *
 * @param week - Week to check between 1-6
 * @param day  - Day to check between 1-7
 */
function checkMonthAlarmIcon(controller, week, day) {
  let dayBox = CalendarTestUtils.monthView.getItemAt(controller.window, week, day);
  Assert.ok(dayBox.querySelector(".alarm-icons-box > .reminder-icon"));
}

/**
 * Moves the view n times forward.
 *
 * @param controller    Mozmill window controller
 * @param n             How many times next button in view is clicked.
 */
function viewForward(controller, n) {
  let { eid, sleep } = helpersForController(controller);

  for (let i = 0; i < n; i++) {
    controller.click(eid("next-view-button"));
    sleep(SHORT_SLEEP);
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
  let { eid, sleep } = helpersForController(controller);

  for (let i = 0; i < n; i++) {
    controller.click(eid("previous-view-button"));
    sleep(SHORT_SLEEP);
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
  let { eid } = helpersForController(controller);

  let win = eid("messengerWindow").getNode().ownerGlobal;
  let manager = win.cal.getCalendarManager();

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
    new elementslib.Elem(
      controller.window.document.querySelector(`#calendar-list > [calendar-id="${calendar.id}"]`)
    )
  );
  return calendar.id;
}

function openLightningPrefs(aCallback, aParentController) {
  // Since the Lightning pane is added after load, asking for it with open_pref_tab won't work.
  // Cheat instead.
  let tab = open_pref_tab("paneGeneral");
  let categoryBox = tab.browser.contentDocument.getElementById("pref-category-box");
  categoryBox.querySelector('radio[pane="paneCalendar"]').click();
  utils.waitFor(
    () => tab.browser.contentWindow.gLastCategory.category == "paneCalendar",
    "Timed out waiting for paneCalendar to load."
  );
  aCallback(tab);
}

function closeLightningPrefs(tab) {
  close_pref_tab(tab);
}
