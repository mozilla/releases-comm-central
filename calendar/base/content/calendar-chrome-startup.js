/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../lightning/content/messenger-overlay-sidebar.js */
/* import-globals-from calendar-common-sets.js */
/* import-globals-from calendar-management.js */
/* import-globals-from calendar-unifinder-todo.js */
/* import-globals-from calendar-ui-utils.js */
/* import-globals-from calendar-views-utils.js */
/* globals PanelUI */

var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

/* exported commonInitCalendar, commonFinishCalendar */

/**
 * Common initialization steps for calendar chrome windows.
 */
async function commonInitCalendar() {
    // load locale specific default values for preferences
    setLocaleDefaultPreferences();

    // Move around toolbarbuttons and whatever is needed in the UI.
    migrateCalendarUI();

    // Load the Calendar Manager
    await loadCalendarManager();

    // set up the unifinder
    prepareCalendarToDoUnifinder();

    // Make sure we update ourselves if the program stays open over midnight
    scheduleMidnightUpdate(refreshUIBits);

    // Set up the command controller from calendar-common-sets.js
    injectCalendarCommandController();

    // Set up appmenus.
    setUpCalendarAppMenus();

    // Set up item and day selection listeners
    getViewDeck().addEventListener("dayselect", observeViewDaySelect);
    getViewDeck().addEventListener("itemselect", calendarController.onSelectionChanged, true);

    // Start alarm service
    Cc["@mozilla.org/calendar/alarm-service;1"].getService(Ci.calIAlarmService).startup();
    document.getElementById("calsidebar_splitter").addEventListener("command", onCalendarViewResize);
    window.addEventListener("resize", onCalendarViewResize, true);

    // Set up the category colors
    categoryManagement.initCategories();

    // Set calendar color CSS on this window
    cal.view.colorTracker.registerWindow(window);

    // Set up window pref observers
    calendarWindowPrefs.init();

    // Set up the available modifiers for each platform.
    let keys = document.querySelectorAll("#calendar-keys > key");
    let platform = AppConstants.platform;
    for (let key of keys) {
        if (key.hasAttribute("modifiers-" + platform)) {
            key.setAttribute("modifiers", key.getAttribute("modifiers-" + platform));
        }
    }

    /* Ensure the new items commands state can be setup properly even when no
     * calendar support refreshes (i.e. the "onLoad" notification) or when none
     * are active. In specific cases such as for file-based ICS calendars can
     * happen, the initial "onLoad" will already have been triggered at this
     * point (see bug 714431 comment 29). We thus inconditionnally invoke
     * calendarUpdateNewItemsCommand until somebody writes code that enables the
     * checking of the calendar readiness (getProperty("ready") ?).
     */
    calendarUpdateNewItemsCommand();
}

/**
 * Common unload steps for calendar chrome windows.
 */
function commonFinishCalendar() {
    // Unload the calendar manager
    unloadCalendarManager();

    // clean up the unifinder
    finishCalendarToDoUnifinder();

    // Remove the command controller
    removeCalendarCommandController();

    // Tear down calendar appmenus.
    tearDownCalendarAppMenus();

    document.getElementById("calsidebar_splitter").removeEventListener("command", onCalendarViewResize);
    window.removeEventListener("resize", onCalendarViewResize, true);

    // Clean up the category colors
    categoryManagement.cleanupCategories();

    // Clean up window pref observers
    calendarWindowPrefs.cleanup();
}

/**
 * Handler function to create |viewtype + "viewresized"| events that are
 * dispatched through the calendarviewBroadcaster.
 *
 * XXX this has nothing to do with startup, needs to go somewhere else.
 */
function onCalendarViewResize(aEvent) {
    let event = document.createEvent("Events");
    event.initEvent(currentView().type + "viewresized", true, false);
    document.getElementById("calendarviewBroadcaster").dispatchEvent(event);
}

/**
 * TODO: The systemcolors pref observer really only needs to be set up once, so
 * ideally this code should go into a component. This should be taken care of when
 * there are more prefs that need to be observed on a global basis that don't fit
 * into the calendar manager.
 */
var calendarWindowPrefs = {

    /** nsISupports QueryInterface */
    QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

    /** Initialize the preference observers */
    init: function() {
        Services.prefs.addObserver("calendar.view.useSystemColors", this);
        Services.ww.registerNotification(this);

        // Trigger setting pref on all open windows
        this.observe(null, "nsPref:changed", "calendar.view.useSystemColors");
    },

    /**  Cleanup the preference observers */
    cleanup: function() {
        Services.prefs.removeObserver("calendar.view.useSystemColors", this);
        Services.ww.unregisterNotification(this);
    },

    /**
     * Observer function called when a pref has changed
     *
     * @see nsIObserver
     */
    observe: function(aSubject, aTopic, aData) {
        if (aTopic == "nsPref:changed") {
            switch (aData) {
                case "calendar.view.useSystemColors": {
                    let attributeValue = Services.prefs.getBoolPref("calendar.view.useSystemColors", false) && "true";
                    for (let win of fixIterator(Services.ww.getWindowEnumerator())) {
                        setElementValue(win.document.documentElement, attributeValue, "systemcolors");
                    }
                    break;
                }
            }
        } else if (aTopic == "domwindowopened") {
            let win = aSubject.QueryInterface(Ci.nsIDOMWindow);
            win.addEventListener("load", () => {
                let attributeValue = Services.prefs.getBoolPref("calendar.view.useSystemColors", false) && "true";
                setElementValue(win.document.documentElement, attributeValue, "systemcolors");
            });
        }
    }
};

/**
 * Set up calendar appmenus by adding event listeners to the appmenu buttons.
 * Also used to tear down the appmenus by removing the event listeners.
 *
 * @param {boolean} [remove]  Whether to remove event listeners instead of adding them.
 */
function setUpCalendarAppMenus(remove) {
    const addOrRemoveListener = remove ? "removeEventListener" : "addEventListener";
    [
        "calendar-appmenu-button",
        "task-appmenu-button",
        "calendar-item-appmenu-button"
    ]
    .forEach(id => {
        const button = document.getElementById(id);
        button[addOrRemoveListener]("mousedown", PanelUI);
        button[addOrRemoveListener]("keypress", PanelUI);
    });
}

/**
 * Tear down calendar appmenus by removing event listeners from the appmenu button.
 */
function tearDownCalendarAppMenus() {
    setUpCalendarAppMenus(true);
}

/**
 * Migrate calendar UI. This function is called at each startup and can be used
 * to change UI items that require js code intervention
 */
function migrateCalendarUI() {
    const UI_VERSION = 3;
    let currentUIVersion = Services.prefs.getIntPref("calendar.ui.version", 0);
    if (currentUIVersion >= UI_VERSION) {
        return;
    }

    try {
        if (currentUIVersion < 1) {
            let calbar = document.getElementById("calendar-toolbar2");
            calbar.insertItem("calendar-appmenu-button");
            let taskbar = document.getElementById("task-toolbar2");
            taskbar.insertItem("task-appmenu-button");
        }
        if (currentUIVersion < 2) {
            // If the user has customized the event/task window dialog toolbar,
            // we copy that custom set of toolbar items to the event/task tab
            // toolbar and add the app menu button and a spring for alignment.
            let xulStore = Services.xulStore;
            let uri = "chrome://calendar/content/calendar-event-dialog.xul";

            if (xulStore.hasValue(uri, "event-toolbar", "currentset")) {
                let windowSet = xulStore.getValue(uri, "event-toolbar", "currentset");
                let items = "calendar-item-appmenu-button";
                if (!windowSet.includes("spring")) {
                    items = "spring," + items;
                }
                let previousSet = windowSet == "__empty" ? "" : windowSet + ",";
                let tabSet = previousSet + items;
                let tabBar = document.getElementById("event-tab-toolbar");

                tabBar.currentSet = tabSet;
                // For some reason we also have to do the following,
                // presumably because the toolbar has already been
                // loaded into the DOM so the toolbar's currentset
                // attribute does not yet match the new currentSet.
                tabBar.setAttribute("currentset", tabSet);
            }
        }
        if (currentUIVersion < 3) {
            // Rename toolbar button id "button-save" to
            // "button-saveandclose" in customized toolbars
            let xulStore = Services.xulStore;
            let windowUri = "chrome://calendar/content/calendar-event-dialog.xul";
            let tabUri = "chrome://messenger/content/messenger.xul";

            if (xulStore.hasValue(windowUri, "event-toolbar", "currentset")) {
                let windowSet = xulStore.getValue(windowUri, "event-toolbar", "currentset");
                let newSet = windowSet.replace("button-save", "button-saveandclose");
                xulStore.setValue(windowUri, "event-toolbar", "currentset", newSet);
            }
            if (xulStore.hasValue(tabUri, "event-tab-toolbar", "currentset")) {
                let tabSet = xulStore.getValue(tabUri, "event-tab-toolbar", "currentset");
                let newSet = tabSet.replace("button-save", "button-saveandclose");
                xulStore.setValue(tabUri, "event-tab-toolbar", "currentset", newSet);

                let tabBar = document.getElementById("event-tab-toolbar");
                tabBar.currentSet = newSet;
                tabBar.setAttribute("currentset", newSet);
            }
        }
        Services.prefs.setIntPref("calendar.ui.version", UI_VERSION);
    } catch (e) {
        cal.ERROR("Error upgrading UI from " + currentUIVersion + " to " +
                  UI_VERSION + ": " + e);
    }
}

function setLocaleDefaultPreferences() {
    function setDefaultLocaleValue(aName) {
        let startDefault = calendarInfo.firstDayOfWeek - 1;
        if (aName == "calendar.categories.names" &&
            defaultBranch.getStringPref(aName) == "") {
            defaultBranch.setStringPref(aName, cal.l10n.getString("categories", "categories2"));
        } else if (aName == "calendar.week.start" &&
                   defaultBranch.getIntPref(aName) != startDefault) {
            defaultBranch.setIntPref(aName, startDefault);
        } else if (aName.startsWith("calendar.week.d")) {
            let weStart = calendarInfo.weekendStart - 1;
            let weEnd = calendarInfo.weekendEnd - 1;
            if (weStart > weEnd) {
                weEnd += 7;
            }
            let weekend = [];
            for (let i = weStart; i <= weEnd; i++) {
                weekend.push(i > 6 ? i - 7 : i);
            }
            if (defaultBranch.getBoolPref(aName) === weekend.includes(aName[15])) {
                defaultBranch.setBoolPref(aName, weekend.includes(aName[15]));
            }
        }
    }

    cal.LOG("Start loading of locale dependent preference default values...");

    let defaultBranch = Services.prefs.getDefaultBranch("");
    let calendarInfo = cal.l10n.calendarInfo();

    let prefDefaults = [
        "calendar.week.start",
        "calendar.week.d0sundaysoff",
        "calendar.week.d1mondaysoff",
        "calendar.week.d2tuesdaysoff",
        "calendar.week.d3wednesdaysoff",
        "calendar.week.d4thursdaysoff",
        "calendar.week.d5fridaysoff",
        "calendar.week.d6saturdaysoff",
        "calendar.categories.names"
    ];
    for (let prefDefault of prefDefaults) {
        setDefaultLocaleValue(prefDefault);
    }

    cal.LOG("Loading of locale sensitive preference default values completed.");
}
