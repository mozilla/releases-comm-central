/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

/**
 * Get this window's currently selected calendar.
 *
 * @return      The currently selected calendar.
 */
function getSelectedCalendar() {
    return getCompositeCalendar().defaultCalendar;
}

/**
 * Deletes the passed calendar, prompting the user if he really wants to do
 * this. If there is only one calendar left, no calendar is removed and the user
 * is not prompted.
 *
 * @param aCalendar     The calendar to delete.
 */
function promptDeleteCalendar(aCalendar) {
    const nIPS = Components.interfaces.nsIPromptService;
    const cICM = Components.interfaces.calICalendarManager;

    let calMgr = cal.getCalendarManager();
    let calendars = calMgr.getCalendars({});
    if (calendars.length <= 1) {
        // If this is the last calendar, don't delete it.
        return;
    }

    let modes = new Set(aCalendar.getProperty("capabilities.removeModes") || ["unsubscribe"]);
    let title = cal.calGetString("calendar", "removeCalendarTitle");

    let textKey, b0text, b2text;
    let removeFlags = 0;
    let promptFlags = (nIPS.BUTTON_POS_0 * nIPS.BUTTON_TITLE_IS_STRING) +
                      (nIPS.BUTTON_POS_1 * nIPS.BUTTON_TITLE_CANCEL);

    if (modes.has("delete") && !modes.has("unsubscribe")) {
        textKey = "removeCalendarMessageDelete";
        promptFlags += nIPS.BUTTON_DELAY_ENABLE;
        b0text = cal.calGetString("calendar", "removeCalendarButtonDelete");
    } else if (modes.has("delete")) {
        textKey = "removeCalendarMessageDeleteOrUnsubscribe";
        promptFlags += (nIPS.BUTTON_POS_2 * nIPS.BUTTON_TITLE_IS_STRING);
        b0text = cal.calGetString("calendar", "removeCalendarButtonUnsubscribe");
        b2text = cal.calGetString("calendar", "removeCalendarButtonDelete");
    } else if (modes.has("unsubscribe")) {
        textKey = "removeCalendarMessageUnsubscribe";
        removeFlags |= cICM.REMOVE_NO_DELETE;
        b0text = cal.calGetString("calendar", "removeCalendarButtonUnsubscribe");
    } else {
        return;
    }

    let text = cal.calGetString("calendar", textKey, [aCalendar.name]);
    let res = Services.prompt.confirmEx(window, title, text, promptFlags,
                                        b0text, null, b2text, null, {});

    if (res != 1) { // Not canceled
        if (textKey == "removeCalendarMessageDeleteOrUnsubscribe" && res == 0) {
            // Both unsubscribing and deleting is possible, but unsubscribing was
            // requested. Make sure no delete is executed.
            removeFlags |= cICM.REMOVE_NO_DELETE;
        }

        calMgr.removeCalendar(aCalendar, removeFlags);
    }
}

/**
 * Called to initialize the calendar manager for a window.
 */
function loadCalendarManager() {
    // Set up the composite calendar in the calendar list widget.
    let tree = document.getElementById("calendar-list-tree-widget");
    let compositeCalendar = getCompositeCalendar();
    tree.compositeCalendar = compositeCalendar;

    // Initialize our composite observer
    compositeCalendar.addObserver(compositeObserver);

    // Create the home calendar if no calendar exists.
    let calendars = cal.getCalendarManager().getCalendars({});
    if (!calendars.length) {
        initHomeCalendar();
    } else {
        // migration code to make sure calendars, which do not support caching have cache enabled
        // required to further clean up on top of bug 1182264
        for (let calendar of calendars) {
            if (calendar.getProperty("cache.supported") === false &&
                calendar.getProperty("cache.enabled") === true) {
                calendar.deleteProperty("cache.enabled");
            }
        }
    }
}

/**
 * Creates the initial "Home" calendar if no calendar exists.
 */
function initHomeCalendar() {
    let calMgr = cal.getCalendarManager();
    let composite = getCompositeCalendar();
    let url = cal.makeURL("moz-storage-calendar://");
    let homeCalendar = calMgr.createCalendar("storage", url);
    homeCalendar.name = calGetString("calendar", "homeCalendarName");
    calMgr.registerCalendar(homeCalendar);
    Preferences.set("calendar.list.sortOrder", homeCalendar.id);
    composite.addCalendar(homeCalendar);

    // Wrapping this in a try/catch block, as if any of the migration code
    // fails, the app may not load.
    if (Preferences.get("calendar.migrator.enabled", true)) {
        try {
            gDataMigrator.checkAndMigrate();
        } catch (e) {
            Components.utils.reportError("Migrator error: " + e);
        }
    }

    return homeCalendar;
}

/**
 * Called to clean up the calendar manager for a window.
 */
function unloadCalendarManager() {
    let compositeCalendar = getCompositeCalendar();
    compositeCalendar.setStatusObserver(null, null);
    compositeCalendar.removeObserver(compositeObserver);
}

/**
 * Updates the sort order preference based on the given event. The event is a
 * "SortOrderChanged" event, emitted from the calendar-list-tree binding. You
 * can also pass in an object like { sortOrder: "Space separated calendar ids" }
 *
 * @param event     The SortOrderChanged event described above.
 */
function updateSortOrderPref(event) {
    let sortOrderString = event.sortOrder.join(" ");
    Preferences.set("calendar.list.sortOrder", sortOrderString);
    try {
        Services.prefs.savePrefFile(null);
    } catch (e) {
        cal.ERROR(e);
    }
}

/**
 * Handler function to call when the tooltip is showing on the calendar list.
 *
 * @param event     The DOM event provoked by the tooltip showing.
 */
function calendarListTooltipShowing(event) {
    let tree = document.getElementById("calendar-list-tree-widget");
    let calendar = tree.getCalendarFromEvent(event);
    let tooltipText = false;
    if (calendar) {
        let currentStatus = calendar.getProperty("currentStatus");
        if (!Components.isSuccessCode(currentStatus)){
            tooltipText = calGetString("calendar", "tooltipCalendarDisabled", [calendar.name]);
        } else if (calendar.readOnly) {
            tooltipText = calGetString("calendar", "tooltipCalendarReadOnly", [calendar.name]);
        }
    }
    setElementValue("calendar-list-tooltip", tooltipText, "label");
    return (tooltipText != false);
}

/**
 * A handler called to set up the context menu on the calendar list.
 *
 * @param event         The DOM event that caused the context menu to open.
 * @return              Returns true if the context menu should be shown.
 */
function calendarListSetupContextMenu(event) {
    let col = {};
    let row = {};
    let calendar;
    let calendars = getCalendarManager().getCalendars({});
    let treeNode = document.getElementById("calendar-list-tree-widget");
    let composite = getCompositeCalendar();

    if (document.popupNode.localName == "tree") {
        // Using VK_APPS to open the context menu will target the tree
        // itself. In that case we won't have a client point even for
        // opening the context menu. The "target" element should then be the
        // selected calendar.
        row.value =  treeNode.tree.currentIndex;
        col.value = treeNode.getColumn("calendarname-treecol");
        calendar = treeNode.getCalendar(row.value);
    } else {
        // Using the mouse, the context menu will open on the treechildren
        // element. Here we can use client points.
        calendar = treeNode.getCalendarFromEvent(event, col, row);
    }

    if (col.value &&
        col.value.element.getAttribute("anonid") == "checkbox-treecol") {
        // Don't show the context menu if the checkbox was clicked.
        return false;
    }

    document.getElementById("list-calendars-context-menu").contextCalendar = calendar;

    // Only enable calendar search if there's actually the chance of finding something:
    let hasProviders = getCalendarSearchService().getProviders({}).length < 1 && "true";
    setElementValue("list-calendars-context-find", hasProviders, "collapsed");

    if (calendar) {
        enableElement("list-calendars-context-edit");
        enableElement("list-calendars-context-publish");

        enableElement("list-calendars-context-togglevisible");
        setElementValue("list-calendars-context-togglevisible", false, "collapsed");
        let stringName = composite.getCalendarById(calendar.id) ? "hideCalendar" : "showCalendar";
        setElementValue("list-calendars-context-togglevisible",
                        cal.calGetString("calendar", stringName, [calendar.name]),
                        "label");
        let accessKey = document.getElementById("list-calendars-context-togglevisible")
                                .getAttribute(composite.getCalendarById(calendar.id) ?
                                              "accesskeyhide" : "accesskeyshow");
        setElementValue("list-calendars-context-togglevisible", accessKey, "accesskey");

        enableElement("list-calendars-context-showonly");
        setElementValue("list-calendars-context-showonly", false, "collapsed");
        setElementValue("list-calendars-context-showonly",
                        cal.calGetString("calendar", "showOnlyCalendar", [calendar.name]),
                        "label");

        setupDeleteMenuitem("list-calendars-context-delete", calendar);
        // Only enable the delete calendars item if there is more than one
        // calendar. We don't want to have the last calendar deleted.
        setElementValue("list-calendars-context-delete", calendars.length < 2 && "true", "disabled");
    } else {
        disableElement("list-calendars-context-edit");
        disableElement("list-calendars-context-publish");
        disableElement("list-calendars-context-delete");
        disableElement("list-calendars-context-togglevisible");
        setElementValue("list-calendars-context-togglevisible", true, "collapsed");
        disableElement("list-calendars-context-showonly");
        setElementValue("list-calendars-context-showonly", true, "collapsed");
        setupDeleteMenuitem("list-calendars-context-delete", null);
    }
    return true;
}

/**
 * Changes the "delete calendar" menuitem to have the right label based on the
 * removeModes. The menuitem must have the attributes "labelremove",
 * "labeldelete" and "labelunsubscribe".
 *
 * @param aDeleteId     The id of the menuitem to delete the calendar
 */
function setupDeleteMenuitem(aDeleteId, aCalendar) {
    let calendar = (aCalendar === undefined ?  getSelectedCalendar() : aCalendar);
    let modes = new Set(calendar ? calendar.getProperty("capabilities.removeModes") || ["unsubscribe"] : []);

    let type = "remove";
    if (modes.has("delete") && !modes.has("unsubscribe")) {
        type = "delete";
    } else if (modes.has("unsubscribe") && !modes.has("delete")) {
        type = "unsubscribe";
    }

    let deleteItem = document.getElementById(aDeleteId);
    setElementValue(deleteItem, deleteItem.getAttribute("label" + type), "label");
    setElementValue(deleteItem, deleteItem.getAttribute("accesskey" + type), "accesskey");
    setElementValue(deleteItem, modes.size == 0 && "true", "disabled");
}

/**
 * Makes sure the passed calendar is visible to the user
 *
 * @param aCalendar   The calendar to make visible.
 */
function ensureCalendarVisible(aCalendar) {
    // We use the main window's calendar list to ensure that the calendar is visible
    document.getElementById("calendar-list-tree-widget").ensureCalendarVisible(aCalendar);
}

/**
 * Hides the specified calendar if it is visible, or shows it if it is hidden.
 *
 * @param aCalendar   The calendar to show or hide
 */
function toggleCalendarVisible(aCalendar) {
    let composite = getCompositeCalendar();
    if (composite.getCalendarById(aCalendar.id)) {
        composite.removeCalendar(aCalendar);
    } else {
        composite.addCalendar(aCalendar);
    }
}

/**
 * Shows all hidden calendars.
 */
function showAllCalendars() {
    let composite = getCompositeCalendar();
    let cals = cal.getCalendarManager().getCalendars({});

    composite.startBatch();
    for (let calendar of cals) {
        if (!composite.getCalendarById(calendar.id)) {
            composite.addCalendar(calendar);
        }
    }
    composite.endBatch();
}

/**
 * Shows only the specified calendar, and hides all others.
 *
 * @param aCalendar   The calendar to show as the only visible calendar
 */
function showOnlyCalendar(aCalendar) {
    let composite = getCompositeCalendar();
    let cals = composite.getCalendars({}) || [];

    composite.startBatch();
    for (let calendar of cals) {
        if (calendar.id != aCalendar.id) {
            composite.removeCalendar(calendar);
        }
    }
    composite.addCalendar(aCalendar);
    composite.endBatch();
}

var compositeObserver = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIObserver,
                                           Components.interfaces.calICompositeObserver]),

    onStartBatch: function() {},
    onEndBatch: function () {},
    onAddItem: function() {},
    onModifyItem: function() {},
    onDeleteItem: function() {},
    onError: function() {},
    onPropertyChanged: function() {},
    onPropertyDeleting: function() {},

    onLoad: function() {
        calendarUpdateNewItemsCommand();
        document.commandDispatcher.updateCommands("calendar_commands");
    },

    onCalendarAdded: function cO_onCalendarAdded(aCalendar) {
        // Update the calendar commands for number of remote calendars and for
        // more than one calendar
        document.commandDispatcher.updateCommands("calendar_commands");
    },

    onCalendarRemoved: function cO_onCalendarRemoved(aCalendar) {
        // Update commands to disallow deleting the last calendar and only
        // allowing reload remote calendars when there are remote calendars.
        document.commandDispatcher.updateCommands("calendar_commands");
    },

    onDefaultCalendarChanged: function cO_onDefaultCalendarChanged(aNewCalendar) {
        // A new default calendar may mean that the new calendar has different
        // ACLs. Make sure the commands are updated.
        calendarUpdateNewItemsCommand();
        document.commandDispatcher.updateCommands("calendar_commands");
    }
};

/**
 * Opens the subscriptions dialog modally.
 */
function openCalendarSubscriptionsDialog() {
    // the dialog will reset this to auto when it is done loading
    window.setCursor("wait");

    // open the dialog modally
    window.openDialog("chrome://calendar/content/calendar-subscriptions-dialog.xul",
                      "_blank",
                      "chrome,titlebar,modal,resizable");
}

/**
 * Calendar Offline Manager
 */
var calendarOfflineManager = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver]),

    init: function cOM_init() {
        if (this.initialized) {
            throw Components.results.NS_ERROR_ALREADY_INITIALIZED;
        }
        Services.obs.addObserver(this, "network:offline-status-changed", false);

        this.updateOfflineUI(!this.isOnline());
        this.initialized = true;
    },

    uninit: function cOM_uninit() {
        if (!this.initialized) {
            throw Components.results.NS_ERROR_NOT_INITIALIZED;
        }
        Services.obs.removeObserver(this, "network:offline-status-changed", false);
        this.initialized = false;
    },

    isOnline: function cOM_isOnline() {
        return (!Services.io.offline);

    },

    updateOfflineUI: function cOM_updateOfflineUI(aIsOffline) {
        // Refresh the current view
        currentView().goToDay(currentView().selectedDay);

        // Set up disabled locks for offline
        document.commandDispatcher.updateCommands("calendar_commands");
    },

    observe: function cOM_observe(aSubject, aTopic, aState) {
        if (aTopic == "network:offline-status-changed") {
            this.updateOfflineUI(aState == "offline");
        }
    }
};
