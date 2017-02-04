/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "calendar-utils";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["window-helpers", "folder-display-helpers", "pref-window-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
var os = {};
Cu.import("resource://mozmill/stdlib/os.js", os);
var frame = {};
Cu.import("resource://mozmill/modules/frame.js", frame);

var SHORT_SLEEP = 100;
var MID_SLEEP = 500;
var TIMEOUT_MODAL_DIALOG = 30000;
var CALENDARNAME = "Mozmill";

// these are used in EventBox lookup.
var EVENT_BOX = 0; // Use when you need an event box
var CANVAS_BOX = 1; // Use when you need a calendar canvas box
var ALLDAY = 2; // Use when you need an allday canvas or event box

// Lookup paths and path-snippets
var EVENTPATH = `/{"tooltip":"itemTooltip","calendar":"${CALENDARNAME.toLowerCase()}"}`;
var REC_DLG_ACCEPT = `
        /id("calendar-event-dialog-recurrence")
        /anon({"anonid":"buttons"})/{"dlgtype":"accept"}
`;
var REC_DLG_DAYS = `
        /id("calendar-event-dialog-recurrence")
        /id("recurrence-pattern-groupbox")/id("recurrence-pattern-grid")
        /id("recurrence-pattern-rows")/id("recurrence-pattern-period-row")
        /id("period-deck")/id("period-deck-weekly-box")/[1]/id("daypicker-weekday")
        /anon({"anonid":"mainbox"})
`;
var REC_DLG_UNTIL_INPUT = `
        /id("calendar-event-dialog-recurrence")/id("recurrence-range-groupbox")/[1]/
        id("recurrence-duration")/id("recurrence-range-until-box")/
        id("repeat-until-date")/anon({"class":"datepicker-box-class"})/
        {"class":"datepicker-text-class"}/
        anon({"class":"menulist-editable-box textbox-input-box"})/
        anon({"anonid":"input"})
`;

var plan_for_modal_dialog, wait_for_modal_dialog, open_pref_window;

function setupModule() {
    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));

    // this setup is needed for pref-win-helpers. For some reason, the automatic
    // loading of modules in shared modules does not setup the module correctly.
    collector.getModule("folder-display-helpers").setupModule();

    ({ open_pref_window } = collector.getModule("pref-window-helpers"));
    collector.getModule("pref-window-helpers").setupModule();
}

function installInto(module) {
    // copy constants into module
    module.SHORT_SLEEP = SHORT_SLEEP;
    module.MID_SLEEP = MID_SLEEP;
    module.TIMEOUT_MODAL_DIALOG = TIMEOUT_MODAL_DIALOG;
    module.CALENDARNAME = CALENDARNAME;
    module.EVENTPATH = EVENTPATH;
    module.EVENT_BOX = EVENT_BOX;
    module.CANVAS_BOX = CANVAS_BOX;
    module.ALLDAY = ALLDAY;
    module.REC_DLG_ACCEPT = REC_DLG_ACCEPT;
    module.REC_DLG_DAYS = REC_DLG_DAYS;
    module.REC_DLG_UNTIL_INPUT = REC_DLG_UNTIL_INPUT;
    // Now copy helper functions
    module.helpersForController = helpersForController;
    module.acceptSendingNotificationMail = acceptSendingNotificationMail;
    module.handleAddingAttachment = handleAddingAttachment;
    module.handleOccurrencePrompt = handleOccurrencePrompt;
    module.switchToView = switchToView;
    module.goToDate = goToDate;
    module.invokeEventDialog = invokeEventDialog;
    module.getEventBoxPath = getEventBoxPath;
    module.viewForward = viewForward;
    module.viewBack = viewBack;
    module.deleteCalendars = deleteCalendars;
    module.createCalendar = createCalendar;
    module.handleNewCalendarWizard = handleNewCalendarWizard;
    module.findEventsInNode = findEventsInNode;
    module.setData = setData;
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
        }
    };
}

/**
 * make sure, the current view has finished loading
 *
 * @param controller        Mozmill window controller
 */
function ensureViewLoaded(controller) {
    let { sleep } = helpersForController(controller);
    controller.waitFor(() =>
        controller.window.getViewDeck().selectedPanel.mPendingRefreshJobs.size == 0
    );
    // after the queue is empty the view needs a moment to settle.
    sleep(200);
}

/**
 * Accept to send notification email with event to attendees
 *
 * @param controller        Mozmill window controller
 */
function acceptSendingNotificationMail(controller) {
    plan_for_modal_dialog("commonDialog", (dialog) => {
        let { lookup: cdlglookup } = helpersForController(dialog);
        dialog.waitThenClick(cdlglookup(`
            /id("commonDialog")/anon({"anonid":"buttons"})/{"dlgtype":"accept"}
        `));
    });

    wait_for_modal_dialog("commonDialog");
}

/**
 * Add an attachment with url
 *
 * @param controller        Mozmill window controller
 */
function handleAddingAttachment(controller, url) {
    plan_for_modal_dialog("commonDialog", (attachment) => {
        let { lookup: cdlglookup, eid: cdlgid } = helpersForController(attachment);
        attachment.waitForElement(cdlgid("loginTextbox"));
        cdlgid("loginTextbox").getNode().value = url;
        attachment.click(cdlglookup(`
            /id("commonDialog")/anon({"anonid":"buttons"})/{"dlgtype":"accept"}
        `));
    });

    wait_for_modal_dialog("commonDialog");
}

/**
 * open and click the appropriate button on the recurrence-Prompt Dialog
 *
 * @param controller      Mozmill window controller
 * @param element         Mozmill element which will open the dialog
 * @param mode            action to exec on element (delete OR modify)
 * @param selectParent    true if all occurrences should be deleted
 * @param attendees       Whether there are attendees that can be notified or not
 */
function handleOccurrencePrompt(controller, element, mode, selectParent, attendees) {
    controller.waitForElement(element);
    plan_for_modal_dialog("Calendar:OccurrencePrompt", (dialog) => {
        let { eid: dlgid } = helpersForController(dialog);
        if (attendees) {
            acceptSendingNotificationMail();
        }
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
 * Switch to a view and make sure it's displayed
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
 * Go to a specific date using minimonth
 *
 * @param controller    Main window controller
 * @param year          Four-digit year
 * @param month         1-based index of a month
 * @param day           1-based index of a day
 */
function goToDate(controller, year, month, day) {
    let { lookup, sleep } = helpersForController(controller);

    let miniMonth = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("ltnSidebar")/id("minimonth-pane")/{"align":"center"}/
        id("calMinimonthBox")/id("calMinimonth")
    `;

    let activeYear = lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/
        anon({"anonid":"yearcell"})
    `).getNode().getAttribute("label");

    let activeMonth = lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-header"})/anon({"anonid":"monthheader"})
    `).getNode().getAttribute("selectedIndex");

    let yearDifference = activeYear - year;
    let monthDifference = activeMonth - (month - 1);

    if (yearDifference != 0) {
        let direction = yearDifference > 0 ? "up" : "down";
        let scrollArrow = lookup(`
            ${miniMonth}/anon({"anonid":"minimonth-header"})/
            anon({"anonid":"minmonth-popupset"})/anon({"anonid":"years-popup"})/
            [0]/{"class":"autorepeatbutton-${direction}"}`);

        // pick year
        controller.click(lookup(`
            ${miniMonth}/anon({"anonid":"minimonth-header"})/
            anon({"anonid":"yearcell"})
        `));

        controller.waitForElement(scrollArrow);
        scrollArrow = scrollArrow.getNode();

        for (let i = 0; i < Math.abs(yearDifference); i++) {
            scrollArrow.doCommand();
            sleep(SHORT_SLEEP);
        }

        controller.click(lookup(`
            ${miniMonth}/anon({"anonid":"minimonth-header"})/
            anon({"anonid":"minmonth-popupset"})/anon({"anonid":"years-popup"})/
            [0]/{"value":"${year}"}
        `));
        sleep();
    }

    if (monthDifference != 0) {
        // pick month
        controller.click(lookup(`
            ${miniMonth}/anon({"anonid":"minimonth-header"})/
            anon({"anonid":"monthheader"})/[${activeMonth}]
        `));
        controller.waitThenClick(lookup(`
            ${miniMonth}/anon({"anonid":"minimonth-header"})/
            anon({"anonid":"minmonth-popupset"})/anon({"anonid":"months-popup"})/
            [0]/{"index":"${month - 1}"}
        `));
        sleep();
    }

    let lastDayInFirstRow = lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-calendar"})/[1]/[7]
    `).getNode().getAttribute("value");

    let positionOfFirst = 7 - lastDayInFirstRow;
    let dateColumn = (positionOfFirst + day - 1) % 7;
    let dateRow = Math.floor((positionOfFirst + day - 1) / 7);

    // pick day
    controller.click(lookup(`
        ${miniMonth}/anon({"anonid":"minimonth-calendar"})/[${dateRow + 1}]/
        [${dateColumn + 1}]
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
    }, MID_SLEEP);

    let eventWindow = mozmill.utils.getWindows("Calendar:EventDialog")[0];
    let eventController = new mozmill.controller.MozMillController(eventWindow);
    let iframe = eventController.window.document.getElementById("lightning-item-panel-iframe");

    eventController.waitFor(() => {
        return iframe.contentWindow.onLoad &&
               iframe.contentWindow.onLoad.hasLoaded == true;
    });

    // We can't use a full mozmill controller on an iframe, but we need
    // something for helpersForController.
    let mockIframeController = { window: iframe.contentWindow };

    body(eventController, mockIframeController);

    // Wait for close
    controller.waitFor(() => mozmill.utils.getWindows("Calendar:EventDialog").length == 0);
}

/**
 * Gets the path for an event box
 *
 * @param controller    main window controller
 * @param view          day, week, multiweek or month
 * @param option        CANVAS_BOX or ALLDAY for creating event, EVENT_BOX for existing event
 * @param row           only used in multiweek and month view, 1-based index of a row
 * @param column        1-based index of a column
 * @param hour          index of hour box
 * @returns             path string
 */
function getEventBoxPath(controller, view, option, row, column, hour) {
    let viewDeck = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")
    `;

    let path = `${viewDeck}/id("${view}-view")`;


    if ((view == "day" || view == "week") && option == ALLDAY) {
        return path + `
            /anon({"anonid":"mainbox"})/anon({"anonid":"headerbox"})/
            anon({"anonid":"headerdaybox"})/
            [${column - 1}]
        `;
    } else if (view == "day" || view == "week") {
        path += `
            /anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
            anon({"anonid":"daybox"})/[${column - 1}]/
            anon({"anonid":"boxstack"})
        `;

        if (option == CANVAS_BOX) {
            path += `/anon({"anonid":"bgbox"})/[${hour}]`;
        } else {
            path += '/anon({"anonid":"topbox"})/{"flex":"1"}/{"flex":"1"}/{"flex":"1"}';
        }

        return path;
    } else {
        path += `
            /anon({"anonid":"mainbox"})/anon({"anonid":"monthgrid"})/
            anon({"anonid":"monthgridrows"})/[${row - 1}]/
            [${column - 1}]
        `;

        if (option == CANVAS_BOX) {
            path += '/anon({"anonid":"day-items"})';
        }

        return path;
    }
}

/**
 * Moves the view n times forward
 *
 * @param controller    Mozmill window controller
 * @param n             how many times next button in view is clicked
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
 * Moves the view n times back
 *
 * @param controller    Mozmill window controller
 * @param n             how many times previous button in view is clicked
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
 * Deletes all calendars with given name
 *
 * @param controller    Mozmill window controller
 * @param name          calendar name
 */
function deleteCalendars(controller, name) {
    let { eid } = helpersForController(controller);

    let defaultView = eid("messengerWindow").getNode().ownerDocument.defaultView;
    let manager = defaultView.getCalendarManager();

    for (let calendar of manager.getCalendars({})) {
        if (calendar.name == name) {
            manager.removeCalendar(calendar);
        }
    }
}

/**
 * Creates local calendar with given name and select it in calendars list
 *
 * @param controller    Mozmill window controller
 * @param name          calendar name
 */
function createCalendar(controller, name) {
    let { lookup, eid } = helpersForController(controller);

    let defaultView = eid("messengerWindow").getNode().ownerDocument.defaultView;
    let manager = defaultView.getCalendarManager();

    let url = defaultView.makeURL("moz-storage-calendar://");
    let calendar = manager.createCalendar("storage", url);
    calendar.name = name;
    manager.registerCalendar(calendar);

    let calendarTree = lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
        id("calendar-listtree-pane")/id("calendar-list-tree-widget")
    `).getNode();

    for (let i = 0; i < calendarTree.mCalendarList.length; i++) {
        if (calendarTree.mCalendarList[i].id == calendar.id) {
            calendarTree.tree.view.selection.select(i);
        }
    }
}

/**
 * Handles the "Create New Calendar" Wizard
 *
 * @param wizard            wizard dialog controller
 * @param name              calendar name
 * @param data              (optional) dataset object
 *                              showReminders - false to disable reminders
 *                              eMail - id of eMail account
 *                              network.format - ics/caldav/wcap
 *                              network.location - URI (undefined for local ICS)
 *                              network.offline - false to disable cache
 */
function handleNewCalendarWizard(wizard, name, data = undefined) {
    let { lookup: wizardlookup, eid: wizardId } = helpersForController(wizard);
    let dlgButton = (btn) => wizard.window.document.documentElement.getButton(btn);
    if (data == undefined) {
        data = {};
    }

    // choose network calendar if any network data is set.
    if (data.network) {
        let remoteOption = wizardlookup(`
            /id("calendar-wizard")/{"pageid":"initialPage"}/
            id("calendar-type")/{"value":"remote"}
        `);
        wizard.waitForElement(remoteOption);
        wizard.radio(remoteOption);
        dlgButton("next").doCommand();

        // choose format
        if (data.network.format == undefined) {
            data.network.format = "ics";
        }
        let formatOption = wizardlookup(`
            /id("calendar-wizard")/{"pageid":"locationPage"}/[1]/[1]/[0]/
            id("calendar-format")/{"value":"${data.network.format}"}
        `);
        wizard.waitForElement(formatOption);
        wizard.radio(formatOption);

        // enter location
        if (data.network.location == undefined) {
            let calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
            calendarFile.append(name + ".ics");
            let fileURI = Services.io.newFileURI(calendarFile);
            data.network.location = fileURI.prePath + fileURI.path;
        }
        wizard.type(wizardlookup(`
            /id("calendar-wizard")/{"pageid":"locationPage"}/[1]/[1]/
            {"align":"center"}/id("calendar-uri")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `), data.network.location);

        // choose offline support
        if (data.network.offline == undefined) {
            data.network.offline = true;
        }
        wizard.check(wizardId("cache"), data.network.offline);
        wizard.waitFor(() => dlgButton("next").disabled == false);
        dlgButton("next").doCommand();
    } else {
        // local calendar is default
        dlgButton("next").doCommand();
    }
    // set calendar Name
    wizard.waitForElement(wizardId("calendar-name"));
    // not on all platforms setting the value activates the next button
    // so we need to type in case the field is empty
    if (wizardId("calendar-name").getNode().value == "") {
        wizard.type(wizardId("calendar-name"), name);
    } // else the name is already filled in from URI

    // set reminder Option
    if (data.showReminders == undefined) {
        data.showReminders = true;
    }
    wizard.check(wizardId("fire-alarms"), data.showReminders);

    // set eMail Account
    if (data.eMail == undefined) {
        data.eMail = "none";
    }
    menulistSelect(wizardId("email-identity-menulist"), data.eMail, wizard);
    wizard.waitFor(() => dlgButton("next").disabled == false);
    dlgButton("next").doCommand();

    // finish
    dlgButton("finish").doCommand();
}

/**
 * Retrieves array of all calendar-event-box elements in node
 *
 * @param node          node to be searched
 * @param eventNodes    array where to put resultíng nodes
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

/**
 * Helper function to enter event/task dialog data
 *
 * @param dialog        event/task dialog controller
 * @param iframe        event/task dialog iframe controller
 * @param data          dataset object
 *                          title - event/task title
 *                          location - event/task location
 *                          description - event/task description
 *                          category - category label
 *                          calendar - calendar the item should be in
 *                          allday - boolean value
 *                          startdate - Date object
 *                          starttime - Date object
 *                          enddate - Date object
 *                          endtime - Date object
 *                          timezone - false for local, true for set timezone
 *                          repeat - reccurrence value, one of none/daily/weekly/
 *                                   every.weekday/bi.weekly/
 *                                   monthly/yearly
 *                                   (custom is not supported)
 *                          reminder - reminder option index (custom not supp.)
 *                          priority - none/low/normal/high
 *                          privacy - public/confidential/private
 *                          status - none/tentative/confirmed/canceled for events
 *                                   none/needs-action/in-process/completed/cancelled for tasks
 *                          completed - Date object for tasks
 *                          percent - percent complete for tasks
 *                          freebusy - free/busy
 *                          attachment.add - url to add
 *                          attachment.remove - label of url to remove (without http://)
 */
function setData(dialog, iframe, data) {
    let { eid, sleep } = helpersForController(dialog);
    let { lookup: iframeLookup, eid: iframeId } = helpersForController(iframe);

    let eventIframe = '/id("calendar-event-dialog-inner")/id("event-grid")/id("event-grid-rows")/';
    let taskIframe = '/id("calendar-task-dialog-inner")/id("event-grid")/id("event-grid-rows")/';
    let innerFrame;
    let isEvent = true;

    // see if it's an event dialog
    try {
        iframeLookup(eventIframe).getNode();
        innerFrame = eventIframe;
    } catch (error) {
        innerFrame = taskIframe;
        isEvent = false;
    }

    let dateInput = `
        anon({"class":"datepicker-box-class"})/{"class":"datepicker-text-class"}/
        anon({"class":"menulist-editable-box textbox-input-box"})/
        anon({"anonid":"input"})
    `;
    let timeInput = `
        anon({"anonid":"hbox"})/anon({"anonid":"time-picker"})/
        anon({"class":"timepicker-box-class"})/
        anon({"class":"timepicker-text-class"})/anon({"flex":"1"})/
        anon({"anonid":"input"})
    `;
    let startId = isEvent ? "event-starttime" : "todo-entrydate";
    let startDateInput = iframeLookup(`
        ${innerFrame}/id("event-grid-startdate-row")/
        id("event-grid-startdate-picker-box")/id("${startId}")/
        anon({"anonid":"hbox"})/anon({"anonid":"date-picker"})/${dateInput}
    `);
    let endId = isEvent ? "event-endtime" : "todo-duedate";
    let endDateInput = iframeLookup(`
        ${innerFrame}id("event-grid-enddate-row")/[1]/
        id("event-grid-enddate-picker-box")/id("${endId}")/
        anon({"anonid":"hbox"})/anon({"anonid":"date-picker"})/${dateInput}
    `);
    let startTimeInput = iframeLookup(`
        ${innerFrame}/id("event-grid-startdate-row")/
        id("event-grid-startdate-picker-box")/id("${startId}")/${timeInput}
    `);
    let endTimeInput = iframeLookup(`
        ${innerFrame}/id("event-grid-enddate-row")/[1]/
        id("event-grid-enddate-picker-box")/id("${endId}")/${timeInput}
    `);
    let completedDateInput = iframeLookup(`
        ${innerFrame}/id("event-grid-todo-status-row")/
        id("event-grid-todo-status-picker-box")/id("completed-date-picker")/${dateInput}
    `);
    let percentCompleteInput = iframeLookup(`
        ${innerFrame}/id("event-grid-todo-status-row")/
        id("event-grid-todo-status-picker-box")/id("percent-complete-textbox")/
        anon({"class":"textbox-input-box numberbox-input-box"})/
        anon({"anonid":"input"})
    `);
    let dateService = Cc["@mozilla.org/intl/scriptabledateformat;1"]
                        .getService(Components.interfaces.nsIScriptableDateFormat);
    // wait for input elements' values to be populated
    sleep();

    // title
    if (data.title != undefined) {
        // we need to set directly here in case there is already a title.
        // accelKey+a won't work in all OS
        iframeId("item-title").getNode().value = data.title;
    }

    // location
    if (data.location != undefined) {
        // see comment above
        iframeId("item-location").getNode().value = data.location;
    }

    // category
    // TODO: needs adjustment for the menulist-panel now used for categories.
    // will be fixed with Bug 984044
    if (data.category != undefined) {
        menulistSelect(iframeId("item-categories"), data.category, dialog);
    }

    // calendar
    if (data.calendar != undefined) {
        menulistSelect(iframeId("item-calendar"), data.calendar, dialog);
    }

    // all-day
    if (data.allday != undefined && isEvent) {
        dialog.check(iframeId("event-all-day"), data.allday);
    }

    // timezone
    if (data.timezone != undefined) {
        let menuitem = iframeId("options-timezones-menuitem");
        menuitem.getNode().setAttribute("checked", data.timezone);
        dialog.click(menuitem);
    }

    // startdate
    if (data.startdate != undefined && data.startdate.constructor.name == "Date") {
        let ymd = [
            data.startdate.getFullYear(),
            data.startdate.getMonth() + 1,
            data.startdate.getDate()
        ];
        let startdate = dateService.FormatDate("", dateService.dateFormatShort, ...ymd);

        if (!isEvent) {
            dialog.check(iframeId("todo-has-entrydate"), true);
        }
        dialog.keypress(startDateInput, "a", { accelKey: true });
        dialog.type(startDateInput, startdate);
    }

    // starttime
    if (data.starttime != undefined && data.starttime.constructor.name == "Date") {
        let hms = [data.starttime.getHours(), data.starttime.getMinutes(), 0];
        let starttime = dateService.FormatTime("", dateService.timeFormatNoSeconds, ...hms);
        startTimeInput.getNode().value = starttime;
        sleep();
    }

    // enddate
    if (data.enddate != undefined && data.enddate.constructor.name == "Date") {
        let ymd = [
            data.enddate.getFullYear(),
            data.enddate.getMonth() + 1,
            data.enddate.getDate()
        ];
        let enddate = dateService.FormatDate("", dateService.dateFormatShort, ...ymd);
        if (!isEvent) {
            dialog.check(iframeId("todo-has-duedate"), true);
        }
        dialog.keypress(endDateInput, "a", { accelKey: true });
        dialog.type(endDateInput, enddate);
    }

    // endtime
    if (data.endtime != undefined && data.endtime.constructor.name == "Date") {
        let hms = [data.endtime.getHours(), data.endtime.getMinutes(), 0];
        let endtime = dateService.FormatTime("", dateService.timeFormatNoSeconds, ...hms);
        endTimeInput.getNode().value = endtime;
    }

    // recurrence
    if (data.repeat != undefined) {
        menulistSelect(iframeId("item-repeat"), data.repeat, dialog);
    }

    // reminder
    // TODO: menulistSelect does not work here, because menuitems have no value.
    // will be fixed with Bug 984044
    if (data.reminder != undefined) {
        menulistSelect(iframeId("item-alarm"), data.reminder, dialog);
    }

    // description
    if (data.description != undefined) {
        let descField = iframeLookup(`
            ${innerFrame}/id("event-grid-description-row")/id("item-description")/
            anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
        `);
        descField.getNode().value = data.description;
    }

    // priority
    if (data.priority != undefined) {
        dialog.mainMenu.click(`#options-priority-${data.priority}-label`);
    }

    // privacy
    if (data.privacy != undefined) {
        dialog.mainMenu.click(`#options-privacy-${data.privacy}-menuitem`);
    }

    // status
    if (data.status != undefined) {
        if (isEvent) {
            dialog.mainMenu.click(`#options-status-${data.status}-menuitem`);
        } else {
            menulistSelect(iframeId("todo-status"), data.status.toUpperCase(), dialog);
        }
    }

    let currentStatus = iframeId("todo-status").getNode().value;

    // completed on
    if (data.completed != undefined && data.completed.constructor.name == "Date" && !isEvent) {
        let ymd = [
            data.completed.getFullYear(),
            data.completed.getMonth() + 1,
            data.completed.getDate()
        ];
        let completeddate = dateService.FormatDate("", dateService.dateFormatShort, ...ymd);

        if (currentStatus == "COMPLETED") {
            completedDateInput.getNode().value = completeddate;
        }
    }

    // percent complete
    if (data.percent != undefined &&
        (currentStatus == "NEEDS-ACTION" ||
         currentStatus == "IN-PROCESS" ||
         currentStatus == "COMPLETED")) {
        percentCompleteInput.getNode().value = data.percent;
    }

    // free/busy
    if (data.freebusy != undefined) {
        dialog.mainMenu.click(`#options-freebusy-${data.freebusy}-menuitem`);
    }

    // attachment
    // TODO: Needs fixing,
    // will be fixed with Bug 984044
    if (data.attachment != undefined) {
        if (data.attachment.add != undefined) {
            handleAddingAttachment(dialog, data.attachment.add);
            dialog.click(eid("button-url"));
        }
        if (data.attachment.delete != undefined) {
            dialog.click(iframeLookup(`
                ${innerFrame}/id("event-grid-attachment-row")/id("attachment-link")/
                {"label":"${data.attachment.delete}"}
            `));
            dialog.keypress(iframeId("attachment-link"), "VK_DELETE", {});
        }
    }
    sleep();
}

function openLightningPrefs(aCallback, aParentController) {
    open_pref_window("paneLightning", aCallback);

    aParentController.waitFor(() => mozmill.utils.getWindows("Mail:Preferences").length == 0, "Error closing preferences window", 2000);
}

/**
 * Helper to work around a mac bug in Thunderbird's mozmill version. This can
 * likely be removed with Mozmill 2.0's new Element Object.
 *
 * @param aMenuList     The XUL menulist to select in
 * @param aValue        The value assigned to the desired menuitem
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
