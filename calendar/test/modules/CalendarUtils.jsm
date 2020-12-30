/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "SHORT_SLEEP",
  "MID_SLEEP",
  "TIMEOUT_MODAL_DIALOG",
  "CALENDARNAME",
  "CALENDAR_PANEL",
  "VIEWDECK",
  "DAY_VIEW",
  "WEEK_VIEW",
  "DAYBOX",
  "LABELDAYBOX",
  "MULTIWEEK_VIEW",
  "MONTH_VIEW",
  "TASK_VIEW",
  "MINIMONTH",
  "TODAY_BUTTON",
  "CALENDARLIST",
  "TODAY_PANE",
  "AGENDA_LISTBOX",
  "EVENTPATH",
  "ALARM_ICON_PATH",
  "EVENT_BOX",
  "CANVAS_BOX",
  "ALLDAY",
  "helpersForController",
  "handleOccurrencePrompt",
  "switchToView",
  "goToDate",
  "invokeNewEventDialog",
  "invokeViewingEventDialog",
  "invokeEditingEventDialog",
  "invokeEditingRepeatEventDialog",
  "getEventBoxPath",
  "getEventDetails",
  "checkAlarmIcon",
  "viewForward",
  "viewBack",
  "closeAllEventDialogs",
  "deleteCalendars",
  "createCalendar",
  "findEventsInNode",
  "openLightningPrefs",
  "closeLightningPrefs",
  "menulistSelect",
  "controller",
];

var elementslib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var { MozMillController } = ChromeUtils.import("resource://testing-common/mozmill/controller.jsm");
var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
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

// These are used in EventBox lookup.
var EVENT_BOX = 0; // Use when you need an event box.
var CANVAS_BOX = 1; // Use when you need a calendar canvas box.
var ALLDAY = 2; // Use when you need an allday canvas or event box.

// Lookup paths and path-snippets.
var CALENDAR_PANEL = `
    /id("messengerWindow")/{"class":"body"}/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
    id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")
`;
var VIEWDECK = `
    ${CALENDAR_PANEL}/id("calendarDisplayBox")/id("calendar-view-box")/
    id("view-box")
`;
var DAY_VIEW = `${VIEWDECK}/id("day-view")`;
var WEEK_VIEW = `${VIEWDECK}/id("week-view")`;
// Multiday-view-day-box of day and week view.
var DAYBOX = `
    {"class":"mainbox"}/{"class":"scrollbox"}/{"class":"daybox"}
`;
// Multiday-view-label-day-box of day and week view.
var LABELDAYBOX = `
    {"class":"mainbox"}/{"class":"labelbox"}/{"class":"labeldaybox"}
`;
var MULTIWEEK_VIEW = `${VIEWDECK}/id("multiweek-view")`;
var MONTH_VIEW = `${VIEWDECK}/id("month-view")`;
var TASK_VIEW = `${CALENDAR_PANEL}/id("calendarDisplayBox")/id("calendar-task-box")/`;

var MINIMONTH = `
    ${CALENDAR_PANEL}/id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
    id("calMinimonthBox")/id("calMinimonth")
`;
var TODAY_BUTTON = `
    ${MINIMONTH}/{"class":"minimonth-header minimonth-month-box"}/
    {"class":"today-button minimonth-nav-btns"}
`;
var CALENDARLIST = `
    ${CALENDAR_PANEL}/id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
    id("calendar-list-inner-pane")/id("calendar-list")
`;
var TODAY_PANE = `
    /id("messengerWindow")/{"class":"body"}/id("tabmail-container")/id("today-pane-panel")
`;
var AGENDA_LISTBOX = `
    ${TODAY_PANE}/{"flex":"1"}/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")
`;

var EVENTPATH = `
    /{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}
`;
// Used after "${EVENTPATH}/${getEventDetails([view])}/".
var ALARM_ICON_PATH = `
    {"class":"category-container-box"}/{"align":"center"}/
    {"class":"alarm-icons-box"}/{"class":"reminder-icon"}
`;

var controller;

function setupModule() {
  // For our tests, we assume that Sunday is start of week.
  Services.prefs.setIntPref("calendar.week.start", 0);

  // We are in calendarTests, so we make sure, calendar-tab with day-view is displayed.
  controller = wait_for_existing_window("mail:3pane");
  let { eid } = helpersForController(controller);
  controller.click(eid("calendar-tab-button"));
  switchToView(controller, "day");
}
setupModule();

function helpersForController(controller) {
  function selector(sel) {
    return sel.trim().replace(/\n(\s*)/g, "");
  }

  return {
    lookup: sel => new elementslib.Lookup(controller.window.document, selector(sel)),
    eid: id => new elementslib.ID(controller.window.document, id),
    sleep: (timeout = MID_SLEEP) => controller.sleep(timeout),
    getEventBoxPath: (...args) => getEventBoxPath(controller, ...args),
    lookupEventBox: (view, option, row, column, hour, extra = "/") => {
      let path = getEventBoxPath(controller, view, option, row, column, hour);
      return new elementslib.Lookup(controller.window.document, selector(path + extra));
    },
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
  let { lookup } = helpersForController(controller);

  let activeYear = lookup(`
        ${MINIMONTH}/{"class":"minimonth-header minimonth-month-box"}/
        {"class":"yearcell minimonth-year-name"}
    `)
    .getNode()
    .getAttribute("value");

  let activeMonth = lookup(`
        ${MINIMONTH}/{"class":"minimonth-header minimonth-month-box"}/
        {"class":"minimonth-month-name"}
    `)
    .getNode()
    .getAttribute("monthIndex");

  let yearDifference = activeYear - year;
  let monthDifference = activeMonth - (month - 1);

  if (yearDifference != 0) {
    let scrollArrow =
      yearDifference > 0
        ? "years-back-button minimonth-nav-btns"
        : "years-forward-button minimonth-nav-btns";
    scrollArrow = lookup(
      `${MINIMONTH}/{"class":"minimonth-header minimonth-month-box"}/
            {"class":"${scrollArrow}"}`
    );

    controller.waitForElement(scrollArrow);
    scrollArrow = scrollArrow.getNode();

    for (let i = 0; i < Math.abs(yearDifference); i++) {
      scrollArrow.doCommand();
      controller.sleep(10);
    }
  }

  if (monthDifference != 0) {
    let scrollArrow =
      monthDifference > 0
        ? "months-back-button minimonth-nav-btns"
        : "months-forward-button minimonth-nav-btns";
    scrollArrow = lookup(
      `${MINIMONTH}/{"class":"minimonth-header minimonth-month-box"}/
            {"class":"${scrollArrow}"}`
    );

    controller.waitForElement(scrollArrow);
    scrollArrow = scrollArrow.getNode();

    for (let i = 0; i < Math.abs(monthDifference); i++) {
      scrollArrow.doCommand();
      controller.sleep(25);
    }
  }

  let lastDayInFirstRow = lookup(`
        ${MINIMONTH}/{"class":"minimonth-calendar minimonth-cal-box"}/[1]/[7]
    `).getNode().innerHTML;

  let positionOfFirst = 7 - lastDayInFirstRow;
  let dateColumn = (positionOfFirst + day - 1) % 7;
  let dateRow = Math.floor((positionOfFirst + day - 1) / 7);

  // Pick day.
  controller.click(
    lookup(`
        ${MINIMONTH}/{"class":"minimonth-calendar minimonth-cal-box"}/
        [${dateRow + 1}]/[${dateColumn + 1}]
    `)
  );
  ensureViewLoaded(controller);
}

/**
 * This callback should close the dialog when finished.
 * @callback EventDialogCallback
 * @param {MozMillController} eventController - The controller for the event
 *                                              window.
 * @param {Object} mockIframeController       - Used with helpersForControllers.
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
 * @param {MozMillElement|null} clickBox     - The optional box to click on.
 * @param {EventDialogCallback} callback     - The function to execute while
 *                                             the event dialog is open.
 */
async function invokeNewEventDialog(mWController, clickBox, callback) {
  doubleClickOptionalEventBox(mWController, clickBox);
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
 * @param {MozMillElement|null} clickBox        - The optional box to click on.
 * @param {EventSummaryDialogCallback} callback - The function to execute while
 *                                                the event summary dialog is
 *                                                open.
 */
async function invokeViewingEventDialog(mWController, clickBox, callback) {
  doubleClickOptionalEventBox(mWController, clickBox);
  let eventWindow = waitForEventDialogWindow(mWController, EVENT_SUMMARY_DIALOG_NAME);
  let eventController = new MozMillController(eventWindow);
  eventController.sleep(MID_SLEEP);

  await callback(eventController);
  waitUntilDialogClosed(mWController, EVENT_SUMMARY_DIALOG_NAME);
}

/**
 * Opens an existing event for editing in the event dialog by clicking on the
 * (optional) box and executing the callback function.
 *
 * NOTE: This function will timeout if the "clickBox" opens a new event instead
 * of an existing one.
 *
 * @param {MozMillController} mWController - The main window controller.
 * @param {MozMillElement|null} clickBox   - The box to click on.
 * @param {EventDialogCallback} callback   - The function to execute while
 *                                           the event dialog is open.
 */
async function invokeEditingEventDialog(mWController, clickBox, callback) {
  doubleClickOptionalEventBox(mWController, clickBox);
  let eventWindow = waitForEventDialogWindow(mWController, EVENT_SUMMARY_DIALOG_NAME);
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
 * @param {MozMillElement|null} clickBox   - The box to click on.
 * @param {EventDialogCallback} callback   - The function to execute while
 *                                           the event dialog is open.
 * @param {boolean} [editAll=false]        - If true, will edit all
 *                                           occurrences of the event.
 */
async function invokeEditingRepeatEventDialog(mWController, clickBox, callback, editAll = false) {
  doubleClickOptionalEventBox(mWController, clickBox);
  let eventWindow = waitForEventDialogWindow(mWController, EVENT_SUMMARY_DIALOG_NAME);
  let eventController = new MozMillController(eventWindow);
  eventController.sleep(MID_SLEEP);

  let target = editAll
    ? "edit-button-context-menu-all-occurrences"
    : "edit-button-context-menu-this-occurrence";
  let editButton = new elementslib.Elem(
    eventController.window.document.querySelector(`#${target}`)
  );

  eventController.click(editButton);
  await execEventDialogCallback(mWController, callback);
}

function doubleClickOptionalEventBox(mWController, clickBox) {
  if (clickBox) {
    mWController.waitForElement(clickBox);
    mWController.doubleClick(clickBox, 1, 1);
  }
}

async function execEventDialogCallback(mWController, callback) {
  let eventWindow = waitForEventDialogWindow(mWController, EVENT_DIALOG_NAME);
  let eventController = new MozMillController(eventWindow);
  let iframe = waitForItemPanelIframe(eventController);

  // We can't use a full mozmill controller on an iframe, but we need
  // something for helpersForController.
  let mockIframeController = { window: iframe.contentWindow };
  await callback(eventController, mockIframeController);
  waitUntilDialogClosed(mWController, EVENT_DIALOG_NAME);
}

function waitForEventDialogWindow(mWController, name) {
  mWController.waitFor(
    () => {
      return utils.getWindows(name).length > 0;
    },
    `${name} did not load in time`,
    MID_SLEEP
  );
  return utils.getWindows(name)[0];
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

function waitUntilDialogClosed(mWController, name) {
  mWController.waitFor(() => utils.getWindows(name).length == 0);
}

/**
 * Gets the path for an event box.
 *
 * @param controller    main window controller
 * @param view          day, week, multiweek or month
 * @param option        CANVAS_BOX or ALLDAY for creating event, EVENT_BOX for existing event
 * @param row           Only used in multiweek and month view, 1-based index of a row.
 * @param column        1-based index of a column
 * @param hour          Only used in day and week view, index of hour box.
 * @returns             path string
 */
function getEventBoxPath(controller, view, option, row, column, hour) {
  let path = `${VIEWDECK}/id("${view}-view")`;

  if ((view == "day" || view == "week") && option == ALLDAY) {
    return (
      path +
      `
            /{"class":"mainbox"}/{"class":"headerbox"}/{"class":"headerdaybox"}/[${column - 1}]
        `
    );
  } else if (view == "day" || view == "week") {
    path += `
            /{"class":"mainbox"}/{"class":"scrollbox"}/{"class":"daybox"}/
            [${column - 1}]/{"class":"multiday-column-box-stack"}
        `;

    if (option == CANVAS_BOX) {
      path += `/{"class":"multiday-column-bg-box"}/[${hour}]`;
    } else {
      path += `
                /{"class":"multiday-column-top-box"}/{"flex":"1"}/{"flex":"1"}/{"flex":"1"}
            `;
    }

    return path;
  }
  path += `
            /{"class":"mainbox"}/{"class":"monthgrid"}/
            [${row - 1}]/[${column - 1}]/[0]
        `;

  if (option == CANVAS_BOX) {
    path += `
                /{"class":"calendar-day-items"}
            `;
  }

  return path;
}

/**
 * Gets the path snippet for event-details. This is different for day/week and
 * multiweek/month view.
 *
 * @param view          day, week, multiweek or month
 */
function getEventDetails(view) {
  if (view == "day" || view == "week") {
    return `
            {"flex":"1"}/{"class":"calendar-color-box"}/
            {"class":"calendar-event-selection"}/{"class":"calendar-event-box-container"}/
            {"class":"calendar-event-details"}
        `;
  }
  return `
            {"flex":"1"}/[0]/{"class":"calendar-color-box"}/
            {"class":"calendar-event-selection"}/{"class":"calendar-event-box-container"}/
            {"class":"calendar-event-details"}
        `;
}

/**
 * Checks if Alarm-Icon is shown on a given Event-Box.
 *
 * @param view          day, week, multiweek or month
 * @param row           Only used in multiweek and month view, 1-based index of a row.
 * @param column        1-based index of a column
 */
function checkAlarmIcon(controller, view, row, column) {
  let { lookupEventBox } = helpersForController(controller);
  Assert.ok(
    lookupEventBox(
      view,
      CANVAS_BOX,
      row,
      column,
      null,
      `
        ${EVENTPATH}/${getEventDetails([view])}/${ALARM_ICON_PATH}
    `
    ).exists()
  );
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
  for (let win of utils.getWindows("Calendar:EventDialog")) {
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
  let { lookup, eid } = helpersForController(controller);

  let win = eid("messengerWindow").getNode().ownerGlobal;
  let manager = win.cal.getCalendarManager();

  let url = Services.io.newURI("moz-storage-calendar://");
  let calendar = manager.createCalendar("storage", url);
  calendar.name = name;
  manager.registerCalendar(calendar);

  controller.click(lookup(`${CALENDARLIST}/{"calendar-id":"${calendar.id}"}`));
  return calendar.id;
}

/**
 * Retrieves array of all calendar-event-box elements in node.
 *
 * @param node          Node to be searched.
 * @param eventNodes    Array where to put resulting nodes.
 */
function findEventsInNode(node, eventNodes) {
  if (node.tagName == "calendar-event-box") {
    eventNodes.push(node);
  } else if (node.children.length > 0) {
    for (let child of node.children) {
      findEventsInNode(child, eventNodes);
    }
  }
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

/**
 * Helper to work around a mac bug in Thunderbird's mozmill version. This can
 * likely be removed with Mozmill 2.0's new Element Object.
 *
 * @param aMenuList     The XUL menulist to select in.
 * @param aValue        The value assigned to the desired menuitem.
 * @param aController   The mozmill controller associated to the menulist.
 */
function menulistSelect(aMenuList, aValue, aController) {
  aController.waitForElement(aMenuList);
  let menulist = aMenuList.getNode();
  let menuitem = menulist.querySelector(`menupopup > menuitem[value='${aValue}']`);
  menulist.click();
  menuitem.click();
  aController.waitFor(() => {
    return menulist.value == aValue;
  });
}
