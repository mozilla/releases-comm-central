/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported calendarOnToolbarsPopupShowing, customizeMailToolbarForTabType,
 *          initViewCalendarPaneMenu, loadCalendarComponent,
 */

/* import-globals-from ../../../mail/base/content/mailCore.js */
/* import-globals-from ../../../mail/base/content/mailWindowOverlay.js */
/* import-globals-from calendar-command-controller.js */
/* import-globals-from calendar-invitations-manager.js */
/* import-globals-from calendar-management.js */
/* import-globals-from calendar-modes.js */
/* import-globals-from calendar-task-tree-utils.js */
/* import-globals-from calendar-task-view.js */
/* import-globals-from calendar-ui-utils.js */
/* import-globals-from calendar-unifinder.js */
/* import-globals-from calendar-views-utils.js */
/* import-globals-from today-pane.js */

/* globals PanelUI, taskEdit */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { calendarDeactivator } = ChromeUtils.import(
  "resource:///modules/calendar/calCalendarDeactivator.jsm"
);

/**
 * Does calendar initialization steps for a given chrome window. Called at
 * startup as the application window is loaded, before tabs are restored.
 */
async function loadCalendarComponent() {
  if (loadCalendarComponent.hasBeenCalled) {
    cal.ERROR("loadCalendarComponent was called more than once for a single window");
    return;
  }
  loadCalendarComponent.hasBeenCalled = true;

  if (cal.getCalendarManager().wrappedJSObject.mCache) {
    cal.ASSERT(
      [...Services.wm.getEnumerator("mail:3pane")].length > 1,
      "Calendar manager initialised calendars before loadCalendarComponent ran on the first " +
        "3pane window. This should not happen."
    );
  }

  await uninstallLightningAddon();

  // load locale specific default values for preferences
  setLocaleDefaultPreferences();

  // Move around toolbarbuttons and whatever is needed in the UI.
  migrateCalendarUI();

  // Load the Calendar Manager
  await loadCalendarManager();

  // Make sure we update ourselves if the program stays open over midnight
  scheduleMidnightUpdate(doMidnightUpdate);

  // Set up the command controller from calendar-command-controller.js
  injectCalendarCommandController();

  // Set up calendar appmenu buttons.
  setUpCalendarAppMenuButtons();

  // Set up calendar menu items in the appmenu.
  setUpCalendarAppMenuItems();

  // Set up calendar deactivation for this window.
  calendarDeactivator.registerWindow(window);

  // Set up item and day selection listeners
  getViewBox().addEventListener("dayselect", observeViewDaySelect);
  getViewBox().addEventListener("itemselect", calendarController.onSelectionChanged, true);

  // Start alarm service
  Cc["@mozilla.org/calendar/alarm-service;1"].getService(Ci.calIAlarmService).startup();
  document.getElementById("calsidebar_splitter").addEventListener("command", () => {
    window.dispatchEvent(new CustomEvent("viewresize"));
  });
  document.getElementById("calendar-view-splitter").addEventListener("command", () => {
    window.dispatchEvent(new CustomEvent("viewresize"));
  });
  window.addEventListener("resize", () => {
    window.dispatchEvent(new CustomEvent("viewresize"));
  });

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
   * point (see bug 714431 comment 29). We thus unconditionally invoke
   * calendarUpdateNewItemsCommand until somebody writes code that enables the
   * checking of the calendar readiness (getProperty("ready") ?).
   */
  calendarUpdateNewItemsCommand();

  // Prepare the Today Pane, and if it is ready, display it.
  await TodayPane.onLoad();

  // Add an unload function to the window so we don't leak any listeners.
  window.addEventListener("unload", unloadCalendarComponent);

  setUpInvitationsManager();

  let filter = document.getElementById("task-tree-filtergroup");
  filter.value = filter.value || "all";

  // Set up mode-switching menu items and mode[v]box elements for the initial mode.
  // At this point no tabs have been restored, so the only reason we wouldn't be
  // in "mail" mode is if a content tab has opened to display the account set-up.
  let tabmail = document.getElementById("tabmail");
  if (tabmail.currentTabInfo.mode.name == "contentTab") {
    changeMode("special");
  } else {
    changeMode("mail");
  }

  // Set up customizeDone handlers for our toolbars.
  let toolbox = document.getElementById("calendar-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeCalendarToolbar");
  };
  toolbox = document.getElementById("task-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeTaskToolbar");
  };

  updateTodayPaneButton();

  prepareCalendarUnifinder();

  taskViewOnLoad();
  taskEdit.onLoad();

  Services.obs.notifyObservers(window, "calendar-startup-done");
}

/**
 * Does unload steps for a given calendar chrome window.
 */
function unloadCalendarComponent() {
  tearDownInvitationsManager();

  // Unload the calendar manager
  unloadCalendarManager();

  // Remove the command controller
  removeCalendarCommandController();

  // Clean up window pref observers
  calendarWindowPrefs.cleanup();

  finishCalendarUnifinder();

  taskEdit.onUnload();
}

/**
 * Uninstall the Lightning calendar addon, now that calendar is in Thunderbird.
 */
async function uninstallLightningAddon() {
  try {
    let addon = await AddonManager.getAddonByID("{e2fda1a4-762b-4020-b5ad-a41df1933103}");
    if (addon) {
      await addon.uninstall();
    }
  } catch (err) {
    console.error("Error while attempting to uninstall Lightning addon:", err);
  }
}

/**
 * TODO: The systemcolors pref observer really only needs to be set up once, so
 * ideally this code should go into a component. This should be taken care of when
 * there are more prefs that need to be observed on a global basis that don't fit
 * into the calendar manager.
 */
var calendarWindowPrefs = {
  /** nsISupports QueryInterface */
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  /** Initialize the preference observers */
  init() {
    Services.prefs.addObserver("calendar.view.useSystemColors", this);
    Services.ww.registerNotification(this);

    // Trigger setting pref on all open windows
    this.observe(null, "nsPref:changed", "calendar.view.useSystemColors");
  },

  /**  Cleanup the preference observers */
  cleanup() {
    Services.prefs.removeObserver("calendar.view.useSystemColors", this);
    Services.ww.unregisterNotification(this);
  },

  /**
   * Observer function called when a pref has changed
   *
   * @see nsIObserver
   */
  observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      switch (aData) {
        case "calendar.view.useSystemColors": {
          let useSystemColors =
            Services.prefs.getBoolPref("calendar.view.useSystemColors", false) && "true";
          for (let win of Services.ww.getWindowEnumerator()) {
            win.document.documentElement.toggleAttribute("systemcolors", useSystemColors);
          }
          break;
        }
      }
    } else if (aTopic == "domwindowopened") {
      let win = aSubject;
      win.addEventListener("load", () => {
        let useSystemColors =
          Services.prefs.getBoolPref("calendar.view.useSystemColors", false) && "true";
        win.document.documentElement.toggleAttribute("systemcolors", useSystemColors);
      });
    }
  },
};

/**
 * Set up calendar appmenu buttons by adding event listeners to the buttons.
 */
function setUpCalendarAppMenuButtons() {
  PanelUI.initAppMenuButton("calendar-appmenu-button", "calendar-toolbox");
  PanelUI.initAppMenuButton("task-appmenu-button", "task-toolbox");
  PanelUI.initAppMenuButton("calendar-item-appmenu-button", "event-toolbox");
}

/**
 * Event listener used to refresh the "Events and Tasks" menu/view in the appmenu.
 */
function refreshEventsAndTasksMenu(event) {
  changeMenuForTask(event);
  setupDeleteMenuitem("appmenu_calDeleteSelectedCalendar");

  // Refresh the "disabled" property of the Progress and Priority menu items. Needed because if
  // the menu items (toolbarbuttons) are given a "command" or "observes" attribute that is set to
  // their respective commands, then their "oncommand" attribute is automatically overwritten
  // (because the commands have an oncommand attribute).  And then the sub-menus will not open.
  document.getElementById(
    "appmenu_calTaskActionsPriorityMenuitem"
  ).disabled = document
    .getElementById("calendar_general-priority_command")
    .hasAttribute("disabled");

  document.getElementById(
    "appmenu_calTaskActionsProgressMenuitem"
  ).disabled = document
    .getElementById("calendar_general-progress_command")
    .hasAttribute("disabled");
}

/**
 * Set up calendar menu items that are in the appmenu. (Needed because there is no "onpopupshowing"
 * event for appmenu menus/views.)
 */
function setUpCalendarAppMenuItems() {
  // Refresh the "Events and Tasks" menu when it is shown.
  document
    .getElementById("appmenu_Event_Task_View")
    .addEventListener("ViewShowing", refreshEventsAndTasksMenu);

  // Refresh the "View" / "Calendar" / "Calendar Pane" menu when it is shown.
  document
    .getElementById("appmenu_calCalendarPaneView")
    .addEventListener("ViewShowing", initViewCalendarPaneMenu);
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
      let uri = "chrome://calendar/content/calendar-event-dialog.xhtml";

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
      let windowUri = "chrome://calendar/content/calendar-event-dialog.xhtml";
      let tabUri = "chrome://messenger/content/messenger.xhtml";

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
    cal.ERROR("Error upgrading UI from " + currentUIVersion + " to " + UI_VERSION + ": " + e);
  }
}

function setLocaleDefaultPreferences() {
  function setDefaultLocaleValue(aName) {
    let startDefault = calendarInfo.firstDayOfWeek - 1;
    if (aName == "calendar.categories.names" && defaultBranch.getStringPref(aName) == "") {
      cal.category.setupDefaultCategories();
    } else if (aName == "calendar.week.start" && defaultBranch.getIntPref(aName) != startDefault) {
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
    "calendar.categories.names",
  ];
  for (let prefDefault of prefDefaults) {
    setDefaultLocaleValue(prefDefault);
  }

  cal.LOG("Loading of locale sensitive preference default values completed.");
}

/**
 * Called at midnight to tell us to redraw date-specific widgets.  Do NOT call
 * this for normal refresh, since it also calls scheduleMidnightUpdate.
 */
function doMidnightUpdate() {
  try {
    getMinimonth().refreshDisplay();

    // Refresh the current view and just allow the refresh for the others
    // views when will be displayed.
    let currView = currentView();
    currView.goToDay();
    let views = ["day-view", "week-view", "multiweek-view", "month-view"];
    for (let view of views) {
      if (view != currView.id) {
        document.getElementById(view).mToggleStatus = -1;
      }
    }

    if (!TodayPane.showsToday()) {
      TodayPane.setDay(cal.dtz.now());
    }

    // Update the unifinder.
    refreshEventTree();

    // Update today's date on todaypane button.
    updateTodayPaneButtonDate();
  } catch (exc) {
    cal.ASSERT(false, exc);
  }

  // Schedule the next update.
  scheduleMidnightUpdate(doMidnightUpdate);
}

/**
 * Updates button structure to enable images on both sides of the label.
 */
function updateTodayPaneButton() {
  let todaypane = document.getElementById("calendar-status-todaypane-button");

  let iconStack = document.createXULElement("stack");
  iconStack.setAttribute("pack", "center");
  iconStack.setAttribute("align", "end");

  let iconBegin = document.createElement("img");
  iconBegin.setAttribute("alt", "");
  iconBegin.setAttribute("src", "chrome://calendar/skin/shared/icons/pane.svg");
  iconBegin.classList.add("toolbarbutton-icon-begin");

  let iconLabel = document.createXULElement("label");
  iconLabel.classList.add("toolbarbutton-day-text");

  let dayNumber = cal.l10n.getDateFmtString(`day.${cal.dtz.now().day}.number`);
  iconLabel.textContent = dayNumber;

  iconStack.appendChild(iconBegin);
  iconStack.appendChild(iconLabel);

  let iconEnd = document.createElement("img");
  iconEnd.setAttribute("alt", "");
  iconEnd.setAttribute("src", "chrome://calendar/skin/shared/todayButton-arrow.svg");
  iconEnd.classList.add("toolbarbutton-icon-end");

  let oldImage = todaypane.querySelector(".toolbarbutton-icon");
  todaypane.replaceChild(iconStack, oldImage);
  todaypane.appendChild(iconEnd);

  let calSidebar = document.getElementById("calSidebar");
  todaypane.setAttribute("checked", !calSidebar.collapsed);
}

/**
 * Updates the date number in the calendar icon of the todaypane button.
 */
function updateTodayPaneButtonDate() {
  let todaypane = document.getElementById("calendar-status-todaypane-button");

  let dayNumber = cal.l10n.getDateFmtString(`day.${cal.dtz.now().day}.number`);
  todaypane.querySelector(".toolbarbutton-day-text").textContent = dayNumber;
}

// Overwrite the InitMessageMenu function, since we never know in which order
// the popupshowing event will be processed. This function takes care of
// disabling the message menu when in calendar or task mode.
function calInitMessageMenu() {
  calInitMessageMenu.origFunc();

  document.getElementById("markMenu").disabled = gCurrentMode != "mail";
}
calInitMessageMenu.origFunc = InitMessageMenu;
InitMessageMenu = calInitMessageMenu;

/**
 * Get the toolbox id for the current tab type.
 *
 * @return {string}  A toolbox id.
 */
function getToolboxIdForCurrentTabType() {
  // A mapping from calendar tab types to toolbox ids.
  const calendarToolboxIds = {
    calendar: "calendar-toolbox",
    tasks: "task-toolbox",
    calendarEvent: "event-toolbox",
    calendarTask: "event-toolbox",
  };
  let tabmail = document.getElementById("tabmail");
  if (!tabmail) {
    return "mail-toolbox"; // Standalone message window.
  }
  let tabType = tabmail.currentTabInfo.mode.type;

  return calendarToolboxIds[tabType] || "mail-toolbox";
}

/**
 * Modify the contents of the "Toolbars" context menu for the current
 * tab type.  Menu items are inserted before (appear above) aInsertPoint.
 *
 * @param {MouseEvent} aEvent              The popupshowing event
 * @param {nsIDOMXULElement} aInsertPoint  (optional) menuitem node
 */
function calendarOnToolbarsPopupShowing(aEvent, aInsertPoint) {
  if (onViewToolbarsPopupShowing.length < 3) {
    // SeaMonkey
    onViewToolbarsPopupShowing(aEvent);
    return;
  }

  let toolboxes = [];
  let toolboxId = getToolboxIdForCurrentTabType();

  // We add navigation-toolbox ("Menu Bar") for all tab types except
  // mail tabs because mail-toolbox already includes navigation-toolbox,
  // so we do not need to add it separately in that case.
  if (toolboxId != "mail-toolbox") {
    toolboxes.push("navigation-toolbox");
  }
  toolboxes.push(toolboxId);

  onViewToolbarsPopupShowing(aEvent, toolboxes, aInsertPoint);
}

/**
 * Open the customize dialog for the toolbar for the current tab type.
 */
function customizeMailToolbarForTabType() {
  let toolboxId = getToolboxIdForCurrentTabType();
  if (toolboxId == "event-toolbox") {
    onCommandCustomize();
  } else {
    CustomizeMailToolbar(toolboxId, "CustomizeMailToolbar");
  }
}

/**
 * Initialize the calendar sidebar menu state.
 */
function initViewCalendarPaneMenu() {
  let calSidebar = document.getElementById("calSidebar");

  document.getElementById("calViewCalendarPane").setAttribute("checked", !calSidebar.collapsed);

  if (document.getElementById("appmenu_calViewCalendarPane")) {
    document.getElementById("appmenu_calViewCalendarPane").checked = !calSidebar.collapsed;
  }
}
