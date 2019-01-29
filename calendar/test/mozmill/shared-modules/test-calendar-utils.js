/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "calendar-utils";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["window-helpers", "folder-display-helpers", "pref-window-helpers"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var os = {};
ChromeUtils.import("chrome://mozmill/content/stdlib/os.js", os);
var frame = {};
ChromeUtils.import("chrome://mozmill/content/modules/frame.js", frame);
var utils = {};
ChromeUtils.import("chrome://mozmill/content/modules/utils.js", utils);

var SHORT_SLEEP = 100;
var MID_SLEEP = 500;
var TIMEOUT_MODAL_DIALOG = 30000;
var TIMEOUT_MONTHCHANGE = 10000;
var CALENDARNAME = "Mozmill";

// These are used in EventBox lookup.
var EVENT_BOX = 0; // Use when you need an event box.
var CANVAS_BOX = 1; // Use when you need a calendar canvas box.
var ALLDAY = 2; // Use when you need an allday canvas or event box.

// Lookup paths and path-snippets.
var CALENDAR_PANEL = `
    /id("messengerWindow")/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
    id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")
`;
var VIEWDECK = `
    ${CALENDAR_PANEL}/id("calendarDisplayDeck")/id("calendar-view-box")/
    id("view-deck")
`;
var DAY_VIEW = `${VIEWDECK}/id("day-view")`;
var WEEK_VIEW = `${VIEWDECK}/id("week-view")`;
// Multiday-view-day-box of day and week view.
var DAYBOX = `
    anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/anon({"anonid":"daybox"})
`;
// Multiday-view-label-day-box of day and week view.
var LABELDAYBOX = `
    anon({"anonid":"mainbox"})/anon({"anonid":"labelbox"})/anon({"anonid":"labeldaybox"})
`;
var MULTIWEEK_VIEW = `${VIEWDECK}/id("multiweek-view")`;
var MONTH_VIEW = `${VIEWDECK}/id("month-view")`;
var TASK_VIEW = `${CALENDAR_PANEL}/id("calendarDisplayDeck")/id("calendar-task-box")/`;

var MINIMONTH = `
    ${CALENDAR_PANEL}/id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
    id("calMinimonthBox")/id("calMinimonth")
`;
var TODAY_BUTTON = `
    ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"today-button"})
`;
var CALENDARLIST = `
    ${CALENDAR_PANEL}/id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
    id("calendar-listtree-pane")/id("calendar-list-tree-widget")/
    anon({"anonid":"tree"})/anon({"anonid":"treechildren"})
`;
var TODAY_PANE = `
    /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")
`;
var AGENDA_LISTBOX = `
    ${TODAY_PANE}/{"flex":"1"}/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")
`;

var EVENTPATH = `
    /{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}
`;
// Used after "${EVENTPATH}/${getEventDetails([view])}/".
var ALARM_ICON_PATH = `
    anon({"anonid":"category-box-stack"})/anon({"align":"center"})/
    anon({"anonid":"alarm-icons-box"})/anon({"class":"reminder-icon"})
`;

var plan_for_modal_dialog, wait_for_modal_dialog, close_window, open_pref_tab;

function setupModule(controller) {
    ({ plan_for_modal_dialog, wait_for_modal_dialog, close_window } =
        collector.getModule("window-helpers"));

    // This setup is needed for pref-win-helpers. For some reason, the automatic
    // loading of modules in shared modules does not setup the module correctly.
    collector.getModule("folder-display-helpers").setupModule();

    ({ open_pref_tab } = collector.getModule("pref-window-helpers"));
    collector.getModule("pref-window-helpers").setupModule();

    // For our tests, we assume that Sunday is start of week.
    Services.prefs.setIntPref("calendar.week.start", 0);

    // We are in calendarTests, so we make sure, calendar-tab with day-view is displayed.
    let { eid } = helpersForController(controller);
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
}

function installInto(module) {
    // Copy constants into module.
    module.SHORT_SLEEP = SHORT_SLEEP;
    module.MID_SLEEP = MID_SLEEP;
    module.TIMEOUT_MODAL_DIALOG = TIMEOUT_MODAL_DIALOG;
    module.CALENDARNAME = CALENDARNAME;
    module.CALENDAR_PANEL = CALENDAR_PANEL;
    module.VIEWDECK = VIEWDECK;
    module.DAY_VIEW = DAY_VIEW;
    module.WEEK_VIEW = WEEK_VIEW;
    module.DAYBOX = DAYBOX;
    module.LABELDAYBOX = LABELDAYBOX;
    module.MULTIWEEK_VIEW = MULTIWEEK_VIEW;
    module.MONTH_VIEW = MONTH_VIEW;
    module.TASK_VIEW = TASK_VIEW;
    module.MINIMONTH = MINIMONTH;
    module.TODAY_BUTTON = TODAY_BUTTON;
    module.CALENDARLIST = CALENDARLIST;
    module.TODAY_PANE = TODAY_PANE;
    module.AGENDA_LISTBOX = AGENDA_LISTBOX;
    module.EVENTPATH = EVENTPATH;
    module.ALARM_ICON_PATH = ALARM_ICON_PATH;
    module.EVENT_BOX = EVENT_BOX;
    module.CANVAS_BOX = CANVAS_BOX;
    module.ALLDAY = ALLDAY;

    // Now copy helper functions.
    module.helpersForController = helpersForController;
    module.setupLightning = setupLightning;
    module.handleOccurrencePrompt = handleOccurrencePrompt;
    module.switchToView = switchToView;
    module.goToDate = goToDate;
    module.invokeEventDialog = invokeEventDialog;
    module.getEventBoxPath = getEventBoxPath;
    module.getEventDetails = getEventDetails;
    module.checkAlarmIcon = checkAlarmIcon;
    module.viewForward = viewForward;
    module.viewBack = viewBack;
    module.closeAllEventDialogs = closeAllEventDialogs;
    module.deleteCalendars = deleteCalendars;
    module.createCalendar = createCalendar;
    module.handleNewCalendarWizard = handleNewCalendarWizard;
    module.findEventsInNode = findEventsInNode;
    module.openLightningPrefs = openLightningPrefs;
    module.menulistSelect = menulistSelect;
}

function helpersForController(controller) {
    function selector(sel) {
        return sel.trim().replace(/\n(\s*)/g, "");
    }

    return {
        lookup: (sel) => new elementslib.Lookup(controller.window.document, selector(sel)),
        eid: (id) => new elementslib.ID(controller.window.document, id),
        xpath: (path) => new elementslib.XPath(controller.window.document, selector(path)),
        sleep: (timeout = MID_SLEEP) => controller.sleep(timeout),
        getEventBoxPath: (...args) => getEventBoxPath(controller, ...args),
        lookupEventBox: (view, option, row, column, hour, extra = "/") => {
            let path = getEventBoxPath(controller, view, option, row, column, hour);
            return new elementslib.Lookup(controller.window.document, selector(path + extra));
        },
        replaceText: (textbox, text) => {
            controller.keypress(textbox, "a", { accelKey: true });
            controller.type(textbox, text);
        }
    };
}

/**
 * Make sure, the current view has finished loading.
 *
 * @param controller        Mozmill window controller
 */
function ensureViewLoaded(controller) {
    let { sleep } = helpersForController(controller);
    controller.waitFor(() =>
        controller.window.getViewDeck().selectedPanel.mPendingRefreshJobs.size == 0
    );
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
    plan_for_modal_dialog("Calendar:OccurrencePrompt", (dialog) => {
        let { eid: dlgid } = helpersForController(dialog);
        if (selectParent) {
            dialog.waitThenClick(dlgid("accept-parent-button"));
        } else {
            dialog.waitThenClick(dlgid("accept-occurrence-button"));
        }
    });
    if (mode == "delete") {
        controller.keypress(element, "VK_DELETE", {});
    } else if (mode == "modify") {
        controller.doubleClick(element);
    }
    wait_for_modal_dialog("Calendar:OccurrencePrompt", TIMEOUT_MODAL_DIALOG);
}

/**
 * Switch to a view and make sure it's displayed.
 *
 * @param controller        Mozmill window controller
 * @param view              day, week, multiweek or month
 */
function switchToView(controller, view) {
    let { eid } = helpersForController(controller);

    let button = `calendar-${view}-view-button`;

    controller.waitThenClick(eid(button));
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
    let { eid, lookup } = helpersForController(controller);

    let activeYear = lookup(`
        ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"yearcell"})
    `).getNode().getAttribute("label");

    let activeMonth = lookup(`
        ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"monthheader"})
    `).getNode().getAttribute("selectedIndex");

    let yearDifference = activeYear - year;
    let monthDifference = activeMonth - (month - 1);

    if (yearDifference != 0) {
        let direction = yearDifference > 0 ? "up" : "down";
        let scrollArrow = lookup(`
            ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"minmonth-popupset"})/
            anon({"anonid":"years-popup"})/{"class":"scrollbutton-${direction}"}`);

        // Pick year.
        controller.click(lookup(`
            ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"yearcell"})
        `));

        let getYearListitem = function(aYear) {
            return lookup(`
                ${MINIMONTH}/anon({"anonid":"minimonth-header"})/
                anon({"anonid":"minmonth-popupset"})/anon({"anonid":"years-popup"})/
                {"label":"${aYear}"}
            `);
        };

        controller.waitForElement(scrollArrow);
        scrollArrow = scrollArrow.getNode();

        for (let i = 0; i < Math.abs(yearDifference); i++) {
            scrollArrow.doCommand();
            controller.waitForElement(getYearListitem(
                activeYear - ((i+1)*(yearDifference/Math.abs(yearDifference)))
            ));
        }

        controller.waitForEvents.init(eid("calMinimonth"), ["monthchange"]);
        controller.click(getYearListitem(year));
        controller.waitForEvents.wait(TIMEOUT_MONTHCHANGE);
    }

    if (monthDifference != 0) {
        controller.waitForEvents.init(eid("calMinimonth"), ["monthchange"]);
        // Pick month.
        controller.click(lookup(`
            ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"monthheader"})/
            [${activeMonth}]
        `));
        controller.waitThenClick(lookup(`
            ${MINIMONTH}/anon({"anonid":"minimonth-header"})/anon({"anonid":"minmonth-popupset"})/
            anon({"anonid":"months-popup"})/{"index":"${month - 1}"}
        `));
        controller.waitForEvents.wait(TIMEOUT_MONTHCHANGE);
    }

    let lastDayInFirstRow = lookup(`
        ${MINIMONTH}/anon({"anonid":"minimonth-calendar"})/[3]/[15]
    `).getNode().innerHTML;

    let positionOfFirst = 7 - lastDayInFirstRow;
    let dateColumn = (positionOfFirst + day - 1) % 7;
    let dateRow = Math.floor((positionOfFirst + day - 1) / 7);

    // Pick day.
    controller.click(lookup(`
        ${MINIMONTH}/anon({"anonid":"minimonth-calendar"})/[${(dateRow + 1) * 2 + 1}]/
        [${(dateColumn + 1) * 2 + 1}]
    `));
    ensureViewLoaded(controller);
}

/**
 * Opens the event dialog by clicking on the (optional) box and executing the
 * body. The event dialog must be closed in the body function.
 *
 * @param controller    Main window controller
 * @param clickBox      The box to click on, or null if no box to click on.
 * @param body          The function to execute while the event dialog is open.
 */
function invokeEventDialog(controller, clickBox, body) {
    if (clickBox) {
        controller.waitForElement(clickBox);
        controller.doubleClick(clickBox, 1, 1);
    }

    controller.waitFor(() => {
        return mozmill.utils.getWindows("Calendar:EventDialog").length > 0;
    }, "event-dialog did not load in time", MID_SLEEP);

    let eventWindow = mozmill.utils.getWindows("Calendar:EventDialog")[0];
    let eventController = new mozmill.controller.MozMillController(eventWindow);
    let iframe = eventController.window.document.getElementById("lightning-item-panel-iframe");

    eventController.waitFor(() => {
        return iframe.contentWindow.onLoad && iframe.contentWindow.onLoad.hasLoaded;
    }, "event-dialog did not load in time", 10000);

    // We can't use a full mozmill controller on an iframe, but we need
    // something for helpersForController.
    let mockIframeController = { window: iframe.contentWindow };

    body(eventController, mockIframeController);

    // Wait for close.
    controller.waitFor(() => mozmill.utils.getWindows("Calendar:EventDialog").length == 0);
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
        return path + `
            /anon({"anonid":"mainbox"})/anon({"anonid":"headerbox"})/
            anon({"anonid":"headerdaybox"})/[${column - 1}]
        `;
    } else if (view == "day" || view == "week") {
        path += `
            /anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/anon({"anonid":"daybox"})/
            [${column - 1}]/anon({"anonid":"boxstack"})
        `;

        if (option == CANVAS_BOX) {
            path += `/anon({"anonid":"bgbox"})/[${hour}]`;
        } else {
            path += `
                /anon({"anonid":"topbox"})/{"flex":"1"}/{"flex":"1"}/{"flex":"1"}
            `;
        }

        return path;
    } else {
        path += `
            /anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
            anon({"anonid":"monthgridrows"})/[${row - 1}]/[${column - 1}]
        `;

        if (option == CANVAS_BOX) {
            path += `
                /anon({"anonid":"day-items"})
            `;
        }

        return path;
    }
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
            anon({"flex":"1"})/anon({"anonid":"event-container"})/
            {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
            {"class":"calendar-event-details"}
        `;
    } else {
        return `
            anon({"flex":"1"})/[0]/anon({"anonid":"event-container"})/
            {"class":"calendar-event-selection"}/anon({"anonid":"eventbox"})/
            {"class":"calendar-event-details"}
        `;
    }
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
    controller.assertNode(lookupEventBox(view, EVENT_BOX, row, column, null, `
        ${EVENTPATH}/${getEventDetails([view])}/${ALARM_ICON_PATH}
    `));
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
    for (let win of mozmill.utils.getWindows("Calendar:EventDialog")) {
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

    for (let calendar of manager.getCalendars({})) {
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

    let calendarTree = lookup(`
        ${CALENDAR_PANEL}/id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
        id("calendar-listtree-pane")/id("calendar-list-tree-widget")
    `).getNode();

    for (let i = 0; i < calendarTree.mCalendarList.length; i++) {
        if (calendarTree.mCalendarList[i].id == calendar.id) {
            calendarTree.tree.view.selection.select(i);
        }
    }
}

/**
 * Handles the "Create New Calendar" Wizard.
 *
 * @param wizard            wizard dialog controller
 * @param name              calendar name
 * @param data              (optional) dataset object
 *                              showReminders - False to disable reminders.
 *                              eMail - id of eMail account
 *                              network.format - ics/caldav/wcap
 *                              network.location - URI (undefined for local ICS)
 *                              network.offline - False to disable cache.
 */
function handleNewCalendarWizard(wizard, name, data = undefined) {
    let { lookup: wizardlookup, eid: wizardId } = helpersForController(wizard);
    let dlgButton = (btn) => wizard.window.document.documentElement.getButton(btn);
    if (data == undefined) {
        data = {};
    }

    // Choose network calendar if any network data is set.
    if (data.network) {
        let remoteOption = wizardlookup(`
            /id("calendar-wizard")/{"pageid":"initialPage"}/id("calendar-type")/{"value":"remote"}
        `);
        wizard.waitForElement(remoteOption);
        wizard.radio(remoteOption);
        dlgButton("next").doCommand();

        // Choose format.
        if (data.network.format == undefined) {
            data.network.format = "ics";
        }
        let formatOption = wizardlookup(`
            /id("calendar-wizard")/{"pageid":"locationPage"}/[1]/[1]/[0]/
            id("calendar-format")/{"value":"${data.network.format}"}
        `);
        wizard.waitForElement(formatOption);
        wizard.radio(formatOption);

        // Enter location.
        if (data.network.location == undefined) {
            let calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
            calendarFile.append(name + ".ics");
            let fileURI = Services.io.newFileURI(calendarFile);
            data.network.location = fileURI.prePath + fileURI.pathQueryRef;
        }
        wizard.type(wizardlookup(`
            /id("calendar-wizard")/{"pageid":"locationPage"}/[1]/[1]/{"align":"center"}/
            id("calendar-uri")/anon({"anonid":"moz-input-box"})/anon({"anonid":"input"})
        `), data.network.location);

        // Choose offline support.
        if (data.network.offline == undefined) {
            data.network.offline = true;
        }
        wizard.check(wizardId("cache"), data.network.offline);
        wizard.waitFor(() => !dlgButton("next").disabled);
        dlgButton("next").doCommand();
    } else {
        // Local calendar is default.
        dlgButton("next").doCommand();
    }
    // Set calendar Name.
    wizard.waitForElement(wizardId("calendar-name"));
    // Not on all platforms setting the value activates the next button,
    // so we need to type in case the field is empty.
    if (wizardId("calendar-name").getNode().value == "") {
        wizard.type(wizardId("calendar-name"), name);
    } // Else the name is already filled in from URI.

    // Set reminder Option.
    if (data.showReminders == undefined) {
        data.showReminders = true;
    }
    wizard.check(wizardId("fire-alarms"), data.showReminders);

    // Set eMail Account.
    if (data.eMail == undefined) {
        data.eMail = "none";
    }
    menulistSelect(wizardId("email-identity-menulist"), data.eMail, wizard);
    wizard.waitFor(() => !dlgButton("next").disabled);
    dlgButton("next").doCommand();

    // finish
    dlgButton("finish").doCommand();
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
    let categoryBox = tab.browser.contentDocument.getAnonymousElementByAttribute(
        tab.browser.contentDocument.documentElement, "id", "pref-category-box");
    categoryBox.querySelector('radio[pane="paneLightning"]').click();
    utils.waitFor(
        () => tab.browser.contentDocument.documentElement.currentPane.id == "paneLightning",
        "Timed out waiting for prefpane paneLightning to load."
    );
    aCallback(tab);
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
    aController.waitFor(() => { return menulist.value == aValue; });
}
