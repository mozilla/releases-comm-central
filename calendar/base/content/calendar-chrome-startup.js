/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported calendarOnToolbarsPopupShowing, customizeMailToolbarForTabType,
 *          initViewCalendarPaneMenu, loadCalendarComponent,
 */

/* globals loadCalendarManager, injectCalendarCommandController, getViewBox,
   observeViewDaySelect, getViewBox, calendarController, calendarUpdateNewItemsCommand,
   TodayPane, setUpInvitationsManager, changeMode,
   prepareCalendarUnifinder, taskViewOnLoad, taskEdit, tearDownInvitationsManager,
   unloadCalendarManager, removeCalendarCommandController, finishCalendarUnifinder,
   PanelUI, changeMenuForTask, setupDeleteMenuitem, getMinimonth, currentView,
   refreshUnifinderFilterInterval, gCurrentMode, InitMessageMenu, onViewToolbarsPopupShowing,
   onCommandCustomize, CustomizeMailToolbar */

var { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
var { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { calendarDeactivator } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calCalendarDeactivator.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  CalMetronome: "resource:///modules/CalMetronome.sys.mjs",
});

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

  if (cal.manager.wrappedJSObject.mCache) {
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

  CalMetronome.on("day", doMidnightUpdate);
  CalMetronome.on("minute", updateTimeIndicatorPosition);

  // Set up the command controller from calendar-command-controller.js
  injectCalendarCommandController();

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
  window.addEventListener("resize", event => {
    if (event.target == window) {
      window.dispatchEvent(new CustomEvent("viewresize"));
    }
  });

  // Set calendar color CSS on this window
  cal.view.colorTracker.registerWindow(window);

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

  const filter = document.getElementById("task-tree-filtergroup");
  filter.value = filter.value || "all";

  // Set up mode-switching menu items and mode[v]box elements for the initial mode.
  // At this point no tabs have been restored, so the only reason we wouldn't be
  // in "mail" mode is if a content tab has opened to display the account set-up.
  const tabmail = document.getElementById("tabmail");
  if (tabmail.currentTabInfo.mode.name == "contentTab") {
    changeMode("special");
  } else {
    changeMode("mail");
  }

  updateTodayPaneButton();

  await prepareCalendarUnifinder();

  taskViewOnLoad();
  taskEdit.onLoad();

  for (const [id, attribute] of [
    ["calSidebar", "width"],
    ["bottom-events-box", "height"],
    ["todo-tab-panel", "height"],
    ["calendar-task-details-container", "height"],
    ["unifinder-search-results-tree-col-title", "width"],
    ["unifinder-search-results-tree-col-startdate", "width"],
    ["unifinder-search-results-tree-col-enddate", "width"],
    ["unifinder-search-results-tree-col-categories", "width"],
    ["unifinder-search-results-tree-col-location", "width"],
    ["unifinder-search-results-tree-col-status", "width"],
    ["unifinder-search-results-tree-col-calendarname", "width"],
  ]) {
    // These values are correctly being restored to the elements' attributes
    // but XUL does not honour them any more. Convert to style rules.
    const element = document.getElementById(id);
    if (element) {
      element.style[attribute] = `${element.getAttribute(attribute)}px`;
    }
  }

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

  finishCalendarUnifinder();

  taskEdit.onUnload();

  CalMetronome.off("minute", updateTimeIndicatorPosition);
  CalMetronome.off("day", doMidnightUpdate);
}

/**
 * Uninstall the Lightning calendar addon, now that calendar is in Thunderbird.
 */
async function uninstallLightningAddon() {
  try {
    const addon = await AddonManager.getAddonByID("{e2fda1a4-762b-4020-b5ad-a41df1933103}");
    if (addon) {
      await addon.uninstall();
    }
  } catch (err) {
    console.error("Error while attempting to uninstall Lightning addon:", err);
  }
}
/**
 * Migrate calendar UI. This function is called at each startup and can be used
 * to change UI items that require js code intervention
 */
function migrateCalendarUI() {
  const UI_VERSION = 3;
  const currentUIVersion = Services.prefs.getIntPref("calendar.ui.version", 0);
  if (currentUIVersion >= UI_VERSION) {
    return;
  }

  try {
    if (currentUIVersion < 2) {
      // If the user has customized the event/task window dialog toolbar,
      // we copy that custom set of toolbar items to the event/task tab
      // toolbar and add the app menu button and a spring for alignment.
      const xulStore = Services.xulStore;
      const uri = "chrome://calendar/content/calendar-event-dialog.xhtml";

      if (xulStore.hasValue(uri, "event-toolbar", "currentset")) {
        const windowSet = xulStore.getValue(uri, "event-toolbar", "currentset");
        let items = "";
        if (!windowSet.includes("spring")) {
          items = "spring";
        }
        const previousSet = windowSet == "__empty" ? "" : windowSet + ",";
        const tabSet = previousSet + items;
        const tabBar = document.getElementById("event-tab-toolbar");

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
      const xulStore = Services.xulStore;
      const windowUri = "chrome://calendar/content/calendar-event-dialog.xhtml";
      const tabUri = "chrome://messenger/content/messenger.xhtml";

      if (xulStore.hasValue(windowUri, "event-toolbar", "currentset")) {
        const windowSet = xulStore.getValue(windowUri, "event-toolbar", "currentset");
        const newSet = windowSet.replace("button-save", "button-saveandclose");
        xulStore.setValue(windowUri, "event-toolbar", "currentset", newSet);
      }
      if (xulStore.hasValue(tabUri, "event-tab-toolbar", "currentset")) {
        const tabSet = xulStore.getValue(tabUri, "event-tab-toolbar", "currentset");
        const newSet = tabSet.replace("button-save", "button-saveandclose");
        xulStore.setValue(tabUri, "event-tab-toolbar", "currentset", newSet);

        const tabBar = document.getElementById("event-tab-toolbar");
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
    // Shift encoded days from 1=Monday ... 7=Sunday to 0=Sunday ... 6=Saturday
    const startDefault = calendarInfo.firstDayOfWeek % 7;

    if (aName == "calendar.categories.names" && defaultBranch.getStringPref(aName) == "") {
      cal.category.setupDefaultCategories();
    } else if (aName == "calendar.week.start" && defaultBranch.getIntPref(aName) != startDefault) {
      defaultBranch.setIntPref(aName, startDefault);
    } else if (aName.startsWith("calendar.week.d")) {
      let dayNumber = parseInt(aName[15], 10);
      if (dayNumber == 0) {
        dayNumber = 7;
      }
      defaultBranch.setBoolPref(aName, calendarInfo.weekend.includes(dayNumber));
    }
  }

  cal.LOG("Start loading of locale dependent preference default values...");

  const defaultBranch = Services.prefs.getDefaultBranch("");
  const calendarInfo = cal.l10n.calendarInfo();

  const prefDefaults = [
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
  for (const prefDefault of prefDefaults) {
    setDefaultLocaleValue(prefDefault);
  }

  cal.LOG("Loading of locale sensitive preference default values completed.");
}

/**
 * Called at midnight to tell us to redraw date-specific widgets.
 */
function doMidnightUpdate() {
  if (TodayPane.showsToday) {
    // Select today.
    TodayPane.setDay(cal.dtz.now());
  } else {
    // Just update the day displayed as today.
    const todayMinimonth = document.getElementById("today-minimonth");
    todayMinimonth.showMonth(todayMinimonth.value);
  }

  for (const view of getViewBox().children) {
    // Mark each view as invalid to ensure it gets redrawn next time it is shown.
    view.mToggleStatus = -1;
  }

  const minimonth = getMinimonth();
  if (minimonth.showsToday) {
    // Select today.
    minimonth.value = new Date();
  } else {
    // Just update the day displayed as today.
    minimonth.showMonth(minimonth.mEditorDate);
    const view = currentView();
    if (view.isInitialized) {
      view.goToDay();
    }
  }

  // The unifinder filter may be set relative to the current day, so we need
  // to ensure that it is up-to-date.
  refreshUnifinderFilterInterval();

  // Update today's date on todaypane button.
  updateTodayPaneButtonDate();
}

/**
 * Update the position of the current view's indicator of the current time, if
 * any.
 */
function updateTimeIndicatorPosition() {
  const view = currentView();
  if (!view?.isInitialized) {
    // Ensure that we don't attempt to update a view that isn't ready. Calendar
    // chrome is always loaded at startup, but the view isn't initialized until
    // the user switches to the calendar tab.
    return;
  }

  view.updateTimeIndicatorPosition();
}

/**
 * Updates button structure to enable images on both sides of the label.
 */
function updateTodayPaneButton() {
  const todaypane = document.getElementById("calendar-status-todaypane-button");

  const iconStack = document.createXULElement("stack");
  iconStack.setAttribute("pack", "center");
  iconStack.setAttribute("align", "end");

  const iconBegin = document.createElement("img");
  iconBegin.setAttribute("alt", "");
  iconBegin.setAttribute("src", "chrome://messenger/skin/icons/new/calendar-empty.svg");
  iconBegin.classList.add("toolbarbutton-icon-begin");

  const iconLabel = document.createXULElement("label");
  iconLabel.classList.add("toolbarbutton-day-text");

  // Only the number of the date is used here. `formatDateOnly` is avoided as
  // the extra characters in CJK languages won't fit.
  const dayNumber = new Date().getDate();
  iconLabel.textContent = dayNumber;

  iconStack.appendChild(iconBegin);
  iconStack.appendChild(iconLabel);

  const iconEnd = document.createElement("img");
  iconEnd.setAttribute("alt", "");
  iconEnd.setAttribute("src", "chrome://messenger/skin/icons/new/nav-up-sm.svg");
  iconEnd.classList.add("toolbarbutton-icon-end");

  const oldImage = todaypane.querySelector(".toolbarbutton-icon");
  todaypane.replaceChild(iconStack, oldImage);
  todaypane.appendChild(iconEnd);

  const calSidebar = document.getElementById("calSidebar");
  todaypane.setAttribute("checked", !calSidebar.collapsed);
}

/**
 * Updates the date number in the calendar icon of the todaypane button.
 */
function updateTodayPaneButtonDate() {
  const todaypane = document.getElementById("calendar-status-todaypane-button");

  // Only the number of the date is used here. `formatDateOnly` is avoided as
  // the extra characters in CJK languages won't fit.
  const dayNumber = new Date().getDate();
  todaypane.querySelector(".toolbarbutton-day-text").textContent = dayNumber;
}

/**
 * Get the toolbox id for the current tab type.
 *
 * @returns {string} A toolbox id.
 */
function getToolboxIdForCurrentTabType() {
  // A mapping from calendar tab types to toolbox ids.
  const calendarToolboxIds = {
    calendar: null,
    tasks: null,
    calendarEvent: "event-toolbox",
    calendarTask: "event-toolbox",
  };
  const tabmail = document.getElementById("tabmail");
  if (!tabmail) {
    return "mail-toolbox"; // Standalone message window.
  }
  const tabType = tabmail.currentTabInfo.mode.type;

  return calendarToolboxIds[tabType] || null;
}

/**
 * Modify the contents of the "Toolbars" context menu for the current
 * tab type.  Menu items are inserted before (appear above) aInsertPoint.
 *
 * @param {MouseEvent} aEvent - The popupshowing event
 * @param {nsIDOMXULElement} aInsertPoint - (optional) menuitem node
 */
function calendarOnToolbarsPopupShowing(aEvent, aInsertPoint) {
  if (onViewToolbarsPopupShowing.length < 3) {
    // SeaMonkey
    onViewToolbarsPopupShowing(aEvent);
    return;
  }

  const toolboxes = ["navigation-toolbox"];
  const toolboxId = getToolboxIdForCurrentTabType();

  if (toolboxId) {
    toolboxes.push(toolboxId);
  }

  onViewToolbarsPopupShowing(aEvent, toolboxes, aInsertPoint);
}

/**
 * Open the customize dialog for the toolbar for the current tab type.
 */
function customizeMailToolbarForTabType() {
  const toolboxId = getToolboxIdForCurrentTabType();
  if (!toolboxId) {
    return;
  }
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
  const calSidebar = document.getElementById("calSidebar");

  document.getElementById("calViewCalendarPane").setAttribute("checked", !calSidebar.collapsed);

  if (document.getElementById("appmenu_calViewCalendarPane")) {
    document.getElementById("appmenu_calViewCalendarPane").checked = !calSidebar.collapsed;
  }
}
