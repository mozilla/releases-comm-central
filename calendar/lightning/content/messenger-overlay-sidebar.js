/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported calendarOnToolbarsPopupShowing, customizeMailToolbarForTabType,
 *          gCurrentMode, InitViewCalendarPaneMenu, loadCalendarComponent,
 *          onToolbarsPopupShowingWithMode, openInvitationsDialog, refreshUIBits,
 *          rescheduleInvitationsUpdate, switchCalendarView
 */

/* import-globals-from ../../base/content/calendar-command-controller.js */
/* import-globals-from ../../base/content/calendar-invitations-manager.js */
/* import-globals-from ../../base/content/today-pane.js */
/* import-globals-from lightning-item-panel.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var gLastShownCalendarView = null;

var calendarTabMonitor = {
  monitorName: "lightning",

  // Unused, but needed functions
  onTabTitleChanged: function() {},
  onTabOpened: function() {},
  onTabClosing: function() {},
  onTabPersist: function() {},
  onTabRestored: function() {},

  onTabSwitched: function(aNewTab, aOldTab) {
    // Unfortunately, tabmail doesn't provide a hideTab function on the tab
    // type definitions. To make sure the commands are correctly disabled,
    // we want to update calendar/task commands when switching away from
    // those tabs.
    if (aOldTab.mode.name == "calendar" || aOldTab.mode.name == "task") {
      calendarController.updateCommands();
      calendarController2.updateCommands();
    }
    // we reset the save menu controls when moving away (includes closing)
    // from an event or task editor tab
    if (aNewTab.mode.name == "calendarEvent" || aNewTab.mode.name == "calendarTask") {
      sendMessage({ command: "triggerUpdateSaveControls" });
    } else if (window.calItemSaveControls) {
      // we need to reset the labels of the menu controls for saving if we
      // are not switching to an item tab and displayed an item tab before
      let saveMenu = document.getElementById("ltnSave");
      let saveandcloseMenu = document.getElementById("ltnSaveAndClose");
      saveMenu.label = window.calItemSaveControls.saveMenu.label;
      saveandcloseMenu.label = window.calItemSaveControls.saveandcloseMenu.label;
    }

    // Change the mode (gCurrentMode) to match the new tab.
    switch (aNewTab.mode.name) {
      case "calendar":
        calSwitchToCalendarMode();
        break;
      case "tasks":
        calSwitchToTaskMode();
        break;
      case "chat":
      case "calendarEvent":
      case "calendarTask":
        calSwitchToMode(aNewTab.mode.name);
        break;
      case "preferencesTab":
      case "contentTab":
        calSwitchToMode("special");
        break;
      default:
        calSwitchToMode("mail");
        break;
    }
  },
};

var calendarTabType = {
  name: "calendar",
  panelId: "calendarTabPanel",
  modes: {
    calendar: {
      type: "calendar",
      maxTabs: 1,
      openTab: function(aTab, aArgs) {
        gLastShownCalendarView = getLastCalendarView();
        aTab.title = aArgs.title;
      },
      showTab: function(tab) {},
      closeTab: function(tab) {},

      persistTab: function(aTab) {
        let tabmail = document.getElementById("tabmail");
        return {
          // Since we do strange tab switching logic in calSwitchToCalendarMode,
          // we should store the current tab state ourselves.
          background: aTab != tabmail.currentTabInfo,
        };
      },

      restoreTab: function(aTabmail, aState) {
        aState.title = cal.l10n.getLtnString("tabTitleCalendar");
        aTabmail.openTab("calendar", aState);
      },

      onTitleChanged: function(aTab) {
        aTab.title = cal.l10n.getLtnString("tabTitleCalendar");
      },

      supportsCommand: (aCommand, aTab) => calendarController2.supportsCommand(aCommand),
      isCommandEnabled: (aCommand, aTab) => calendarController2.isCommandEnabled(aCommand),
      doCommand: (aCommand, aTab) => calendarController2.doCommand(aCommand),
      onEvent: (aEvent, aTab) => calendarController2.onEvent(aEvent),
    },

    tasks: {
      type: "tasks",
      maxTabs: 1,
      openTab: function(aTab, aArgs) {
        aTab.title = aArgs.title;
      },
      showTab: function(tab) {},
      closeTab: function(tab) {},

      persistTab: function(aTab) {
        let tabmail = document.getElementById("tabmail");
        return {
          // Since we do strange tab switching logic in calSwitchToTaskMode,
          // we should store the current tab state ourselves.
          background: aTab != tabmail.currentTabInfo,
        };
      },

      restoreTab: function(aTabmail, aState) {
        aState.title = cal.l10n.getLtnString("tabTitleTasks");
        aTabmail.openTab("tasks", aState);
      },

      onTitleChanged: function(aTab) {
        aTab.title = cal.l10n.getLtnString("tabTitleTasks");
      },

      supportsCommand: (aCommand, aTab) => calendarController2.supportsCommand(aCommand),
      isCommandEnabled: (aCommand, aTab) => calendarController2.isCommandEnabled(aCommand),
      doCommand: (aCommand, aTab) => calendarController2.doCommand(aCommand),
      onEvent: (aEvent, aTab) => calendarController2.onEvent(aEvent),
    },
  },

  saveTabState: function(tab) {},
};

/**
 * For details about tab info objects and the tabmail interface see:
 * comm/mail/base/content/mailTabs.js
 * comm/mail/base/content/tabmail.js
 */
var calendarItemTabType = {
  name: "calendarItem",
  perTabPanel: "vbox",
  idNumber: 0,
  modes: {
    calendarEvent: { type: "calendarEvent" },
    calendarTask: { type: "calendarTask" },
  },
  /**
   * Opens an event tab or a task tab.
   *
   * @param {Object} aTab   A tab info object
   * @param {Object} aArgs  Contains data about the event/task
   */
  openTab: function(aTab, aArgs) {
    // Create a clone to use for this tab. Remove the cloned toolbox
    // and move the original toolbox into its place. There is only
    // one toolbox/toolbar so its settings are the same for all item tabs.
    let original = document.getElementById("lightningItemPanel").firstElementChild;
    let clone = original.cloneNode(true);

    clone.querySelector("toolbox").remove();
    moveEventToolbox(clone);
    clone.setAttribute("id", "calendarItemTab" + this.idNumber);

    if (aTab.mode.type == "calendarTask") {
      // For task tabs, css class hides event-specific toolbar buttons.
      clone.setAttribute("class", "calendar-task-dialog-tab");
    }

    aTab.panel.setAttribute("id", "calendarItemTabWrapper" + this.idNumber);
    aTab.panel.appendChild(clone);

    // Set up the iframe and store the iframe's id.  The iframe's
    // src is set in onLoadLightningItemPanel() that is called below.
    aTab.iframe = aTab.panel.querySelector("iframe");
    let iframeId = "calendarItemTabIframe" + this.idNumber;
    aTab.iframe.setAttribute("id", iframeId);
    gItemTabIds.push(iframeId);

    // Generate and set the tab title.
    let strName;
    if (aTab.mode.type == "calendarEvent") {
      strName = aArgs.calendarEvent.title ? "editEventDialog" : "newEventDialog";
    } else if (aTab.mode.type == "calendarTask") {
      strName = aArgs.calendarEvent.title ? "editTaskDialog" : "newTaskDialog";
    } else {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    }
    // name is "New Event", "Edit Task", etc.
    let name = cal.l10n.getCalString(strName);
    aTab.title = name + ": " + (aArgs.calendarEvent.title || name);

    // allowTabClose prevents the tab from being closed until we ask
    // the user if they want to save any unsaved changes.
    aTab.allowTabClose = false;

    // Put the arguments where they can be accessed easily
    // from the iframe. (window.arguments[0])
    aTab.iframe.contentWindow.arguments = [aArgs];

    // activate or de-activate 'Events and Tasks' menu items
    document.commandDispatcher.updateCommands("calendar_commands");

    onLoadLightningItemPanel(iframeId, aArgs.url);

    this.idNumber += 1;
  },
  /**
   * Saves a tab's state when it is deactivated / hidden.  The opposite of showTab.
   *
   * @param {Object} aTab  A tab info object
   */
  saveTabState: function(aTab) {
    // save state
    aTab.itemTabConfig = {};
    Object.assign(aTab.itemTabConfig, gConfig);

    // clear statusbar
    let statusbar = document.getElementById("status-bar");
    let items = statusbar.getElementsByClassName("event-dialog");
    for (let item of items) {
      item.setAttribute("collapsed", true);
    }
    // move toolbox to the place where it can be accessed later
    let to = document.getElementById("lightningItemPanel").firstElementChild;
    moveEventToolbox(to);
  },
  /**
   * Called when a tab is activated / shown.  The opposite of saveTabState.
   *
   * @param {Object} aTab  A tab info object
   */
  showTab: function(aTab) {
    // move toolbox into place then load state
    moveEventToolbox(aTab.panel.firstElementChild);
    Object.assign(gConfig, aTab.itemTabConfig);
    updateItemTabState(gConfig);

    // activate or de-activate 'Events and Tasks' menu items
    document.commandDispatcher.updateCommands("calendar_commands");
  },
  /**
   * Called when there is a request to close a tab.  Using aTab.allowTabClose
   * we first prevent the tab from closing so we can prompt the user
   * about saving changes, then we allow the tab to close.
   *
   * @param {Object} aTab  A tab info object
   */
  tryCloseTab: function(aTab) {
    if (aTab.allowTabClose) {
      return true;
    } else {
      onCancel(aTab.iframe.id);
      return false;
    }
  },
  /**
   * Closes a tab.
   *
   * @param {Object} aTab  A tab info object
   */
  closeTab: function(aTab) {
    // Remove the iframe id from the array where they are stored.
    let index = gItemTabIds.indexOf(aTab.iframe.id);
    if (index != -1) {
      gItemTabIds.splice(index, 1);
    }
    aTab.itemTabConfig = null;

    // If this is the last item tab that is closing, then delete
    // window.calItemSaveControls, so mochitests won't complain.
    let tabmail = document.getElementById("tabmail");
    let calendarItemTabCount =
      tabmail.tabModes.calendarEvent.tabs.length + tabmail.tabModes.calendarTask.tabs.length;
    if (calendarItemTabCount == 1) {
      delete window.calItemSaveControls;
    }
  },
  /**
   * Called when quitting the application (and/or closing the window).
   * Saves an open tab's state to be able to restore it later.
   *
   * @param {Object} aTab  A tab info object
   */
  persistTab: function(aTab) {
    let args = aTab.iframe.contentWindow.arguments[0];
    // Serialize args, with manual handling of some properties.
    // persistTab is called even for new events/tasks in tabs that
    // were closed and never saved (for 'undo close tab'
    // functionality), thus we confirm we have the expected values.
    if (
      !args ||
      !args.calendar ||
      !args.calendar.id ||
      !args.calendarEvent ||
      !args.calendarEvent.id
    ) {
      return {};
    }

    let calendarId = args.calendar.id;
    let itemId = args.calendarEvent.id;
    // Handle null args.initialStartDateValue, just for good measure.
    // Note that this is not the start date for the event or task.
    let hasDateValue = args.initialStartDateValue && args.initialStartDateValue.icalString;
    let initialStartDate = hasDateValue ? args.initialStartDateValue.icalString : null;

    args.calendar = null;
    args.calendarEvent = null;
    args.initialStartDateValue = null;

    return {
      calendarId: calendarId,
      itemId: itemId,
      initialStartDate: initialStartDate,
      args: args,
      tabType: aTab.mode.type,
    };
  },
  /**
   * Called when starting the application (and/or opening the window).
   * Restores a tab that was open when the application was quit previously.
   *
   * @param {Object} aTabmail  The tabmail interface
   * @param {Object} aState    The state of the tab to restore
   */
  restoreTab: function(aTabmail, aState) {
    // Sometimes restoreTab is called for tabs that were never saved
    // and never meant to be persisted or restored. See persistTab.
    if (aState.args && aState.calendarId && aState.itemId) {
      aState.args.initialStartDateValue = aState.initialStartDate
        ? cal.createDateTime(aState.initialStartDate)
        : cal.dtz.getDefaultStartDate();

      aState.args.onOk = doTransaction.bind(null, "modify");

      aState.args.calendar = cal.getCalendarManager().getCalendarById(aState.calendarId);
      if (aState.args.calendar) {
        // using wrappedJSObject is a hack that is needed to prevent a proxy error
        let pcal = cal.async.promisifyCalendar(aState.args.calendar.wrappedJSObject);
        pcal.getItem(aState.itemId).then(item => {
          if (item[0]) {
            aState.args.calendarEvent = item[0];
            aTabmail.openTab(aState.tabType, aState.args);
          }
        });
      }
    }
  },
};

window.addEventListener("load", e => {
  let tabmail = document.getElementById("tabmail");
  tabmail.registerTabType(calendarTabType);
  tabmail.registerTabType(calendarItemTabType);
  tabmail.registerTabMonitor(calendarTabMonitor);
});

/**
 * Loads the calendar component. Called once at startup as the application
 * window is loaded, before tabs are restored.
 */
async function loadCalendarComponent() {
  await uninstallLightningAddon();

  // Check if the binary component was loaded
  checkCalendarBinaryComponent();

  document
    .getElementById("calendarDisplayDeck")
    .addEventListener("select", LtnObserveDisplayDeckChange, true);

  // Take care of common initialization
  await commonInitCalendar();

  // Add an unload function to the window so we don't leak any listeners
  window.addEventListener("unload", ltnFinish);

  // Set up invitations manager
  scheduleInvitationsUpdate(FIRST_DELAY_STARTUP);
  cal.getCalendarManager().addObserver(gInvitationsCalendarManagerObserver);

  let filter = document.getElementById("task-tree-filtergroup");
  filter.value = filter.value || "all";
  changeMode();

  let mailContextPopup = document.getElementById("mailContext");
  if (mailContextPopup) {
    mailContextPopup.addEventListener("popupshowing", gCalSetupMailContext.popup);
  }

  // Setup customizeDone handlers for our toolbars
  let toolbox = document.getElementById("calendar-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeCalendarToolbar");
  };
  toolbox = document.getElementById("task-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeTaskToolbar");
  };

  updateTodayPaneButton();

  Services.obs.notifyObservers(window, "lightning-startup-done");
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

/* Called at midnight to tell us to redraw date-specific widgets.  Do NOT call
 * this for normal refresh, since it also calls scheduleMidnightRefresh.
 */
function refreshUIBits() {
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

    // update the unifinder
    refreshEventTree();

    // update today's date on todaypane button
    updateTodayPaneButtonDate();
  } catch (exc) {
    cal.ASSERT(false, exc);
  }

  // schedule our next update...
  scheduleMidnightUpdate(refreshUIBits);
}

/**
 * Updates button structure to enable a duble image to both sides of the label.
 */
function updateTodayPaneButton() {
  let todaypane = document.getElementById("calendar-status-todaypane-button");

  let iconStack = document.createXULElement("stack");
  iconStack.setAttribute("pack", "center");
  iconStack.setAttribute("align", "end");

  let iconBegin = document.createXULElement("image");
  iconBegin.classList.add("toolbarbutton-icon-begin");

  let iconLabel = document.createXULElement("label");
  iconLabel.classList.add("toolbarbutton-day-text");

  let dayNumber = cal.l10n.getDateFmtString(`day.${cal.dtz.now().day}.number`);
  iconLabel.textContent = dayNumber;

  iconStack.appendChild(iconBegin);
  iconStack.appendChild(iconLabel);

  let iconEnd = document.createXULElement("image");
  iconEnd.classList.add("toolbarbutton-icon-end");

  let oldImage = todaypane.querySelector(".toolbarbutton-icon");
  todaypane.replaceChild(iconStack, oldImage);
  todaypane.appendChild(iconEnd);

  let calSidebar = document.getElementById("ltnSidebar");
  todaypane.setAttribute("checked", !calSidebar.getAttribute("collapsed"));
}

/**
 * Updates the date number in the calendar icon of the todaypane button
 */
function updateTodayPaneButtonDate() {
  let todaypane = document.getElementById("calendar-status-todaypane-button");

  let dayNumber = cal.l10n.getDateFmtString(`day.${cal.dtz.now().day}.number`);
  todaypane.querySelector(".toolbarbutton-day-text").textContent = dayNumber;
}

/**
 * Switch the calendar view, and optionally switch to calendar mode.
 *
 * @param aType     The type of view to select.
 * @param aShow     If true, the mode will be switched to calendar if not
 *                    already there.
 */
function switchCalendarView(aType, aShow) {
  gLastShownCalendarView = aType;

  if (aShow && gCurrentMode != "calendar") {
    // This function in turn calls switchToView(), so return afterwards.
    calSwitchToCalendarMode();
    return;
  }

  switchToView(aType);
}

/**
 * This function has the sole responsibility to switch back to
 * mail mode (by calling calSwitchToMode("mail")) if we are getting
 * notifications from other panels (besides the calendar views)
 * but find out that we're not in mail mode. This situation can
 * for example happen if we're in calendar mode but the 'new mail'
 * slider gets clicked and wants to display the appropriate mail.
 * All necessary logic for switching between the different modes
 * should live inside of the corresponding functions like:
 * - calSwitchToCalendarMode()
 * - calSwitchToTaskMode()
 * - calSwitchToMode()
 */
function LtnObserveDisplayDeckChange(event) {
  let deck = event.target;

  // Bug 309505: The 'select' event also fires when we change the selected
  // panel of calendar-view-box.  Workaround with this check.
  if (deck.id != "calendarDisplayDeck") {
    return;
  }

  let id = deck.selectedPanel && deck.selectedPanel.id;

  // Switch back to mail mode in case we find that this
  // notification has been fired but we're still in calendar or task mode.
  // Specifically, switch back if we're *not* in mail mode but the notification
  // did *not* come from either the "calendar-view-box" or the "calendar-task-box".
  if (
    (gCurrentMode == "calendar" || gCurrentMode == "task") &&
    id != "calendar-view-box" &&
    id != "calendar-task-box"
  ) {
    calSwitchToMode("mail");
  }
}

function ltnFinish() {
  cal.getCalendarManager().removeObserver(gInvitationsCalendarManagerObserver);

  // Remove listener for mailContext.
  let mailContextPopup = document.getElementById("mailContext");
  if (mailContextPopup) {
    mailContextPopup.removeEventListener("popupshowing", gCalSetupMailContext.popup);
  }

  // Common finish steps
  commonFinishCalendar();
}

// == invitations link
var FIRST_DELAY_STARTUP = 100;
var FIRST_DELAY_RESCHEDULE = 100;
var FIRST_DELAY_REGISTER = 10000;
var FIRST_DELAY_UNREGISTER = 0;

var gInvitationsOperationListener = {
  mCount: 0,

  QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
  onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
    let invitationsBox = document.getElementById("calendar-invitations-panel");
    if (Components.isSuccessCode(aStatus)) {
      let value = cal.l10n.getLtnString("invitationsLink.label", [this.mCount]);
      document.getElementById("calendar-invitations-label").value = value;
      setElementValue(invitationsBox, this.mCount < 1 && "true", "hidden");
    } else {
      invitationsBox.setAttribute("hidden", "true");
    }
    this.mCount = 0;
  },

  onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aItems) {
    if (Components.isSuccessCode(aStatus)) {
      this.mCount += aItems.length;
    }
  },
};

var gInvitationsCalendarManagerObserver = {
  mSideBar: this,

  QueryInterface: ChromeUtils.generateQI([Ci.calICalendarManagerObserver]),

  onCalendarRegistered: function(aCalendar) {
    this.mSideBar.rescheduleInvitationsUpdate(FIRST_DELAY_REGISTER);
  },

  onCalendarUnregistering: function(aCalendar) {
    this.mSideBar.rescheduleInvitationsUpdate(FIRST_DELAY_UNREGISTER);
  },

  onCalendarDeleting: function(aCalendar) {},
};

function scheduleInvitationsUpdate(firstDelay) {
  gInvitationsOperationListener.mCount = 0;
  getInvitationsManager().scheduleInvitationsUpdate(firstDelay, gInvitationsOperationListener);
}

function rescheduleInvitationsUpdate(firstDelay) {
  getInvitationsManager().cancelInvitationsUpdate();
  scheduleInvitationsUpdate(firstDelay);
}

function openInvitationsDialog() {
  getInvitationsManager().cancelInvitationsUpdate();
  gInvitationsOperationListener.mCount = 0;
  getInvitationsManager().openInvitationsDialog(gInvitationsOperationListener, () =>
    scheduleInvitationsUpdate(FIRST_DELAY_RESCHEDULE)
  );
}

/**
 * The current mode defining the current mode we're in. Allowed values are:
 *  - 'mail'
 *  - 'calendar'
 *  - 'task'
 *  - 'chat'
 *  - 'calendarEvent'
 *  - 'calendarTask'
 *  - 'special' - For special tabs like preferences, add-ons manager, about:xyz, etc.
 * @global
 */
var gCurrentMode = "mail";

/**
 * Changes the mode (gCurrentMode) and adapts the UI to the new mode.
 * @param {string} [mode="mail"] - the new mode: 'mail', 'calendar', 'task', etc.
 */
function changeMode(mode = "mail") {
  gCurrentMode = mode; // eslint-disable-line no-global-assign

  document
    .querySelectorAll(
      `menuitem[command="switch2calendar"],menuitem[command="switch2task"],
       toolbarbutton[command="switch2calendar"],toolbarbutton[command="switch2task"]`
    )
    .forEach(elem => {
      elem.setAttribute("checked", elem.getAttribute("value") == gCurrentMode);
    });

  document.querySelectorAll("calendar-modebox,calendar-modevbox").forEach(elem => {
    elem.setAttribute("current", gCurrentMode);
  });

  TodayPane.onModeModified();
  if (gCurrentMode != "calendar") {
    timeIndicator.cancel();
  }
}

/**
 * For switching to modes like "mail", "chat", "calendarEvent", "calendarTask", or "special".
 * (For "calendar" and "task" modes use calSwitchToCalendarMode and calSwitchToTaskMode.)
 *
 * @param {string} mode  The mode to switch to.
 */
function calSwitchToMode(mode) {
  if (!["mail", "chat", "calendarEvent", "calendarTask", "special"].includes(mode)) {
    cal.WARN("Attempted to switch to unknown mode: " + mode);
    return;
  }
  if (gCurrentMode != mode) {
    const previousMode = gCurrentMode;
    changeMode(mode);

    if (previousMode == "calendar" || previousMode == "task") {
      document.commandDispatcher.updateCommands("calendar_commands");
    }
    window.setCursor("auto");
  }
}

/**
 * Switches to the calendar mode.
 */
function calSwitchToCalendarMode() {
  if (gCurrentMode != "calendar") {
    changeMode("calendar");

    // display the calendar panel on the display deck
    let deck = document.getElementById("calendarDisplayDeck");
    deck.selectedPanel = document.getElementById("calendar-view-box");

    // show the last displayed type of calendar view
    switchToView(gLastShownCalendarView);
    document.getElementById("calMinimonth").setAttribute("freebusy", "true");

    document.commandDispatcher.updateCommands("calendar_commands");
    window.setCursor("auto");

    // make sure the view is sized correctly
    document.dispatchEvent(new CustomEvent("viewresize", { bubbles: true }));

    // Load the unifinder if it isn't already loaded.
    ensureUnifinderLoaded();
  }
}

/**
 * Switches to the task mode.
 */
function calSwitchToTaskMode() {
  if (gCurrentMode != "task") {
    changeMode("task");

    // display the task panel on the display deck
    let deck = document.getElementById("calendarDisplayDeck");
    deck.selectedPanel = document.getElementById("calendar-task-box");

    document.getElementById("calMinimonth").setAttribute("freebusy", "true");

    document.commandDispatcher.updateCommands("calendar_commands");
    window.setCursor("auto");
  }
}

var gCalSetupMailContext = {
  popup: function() {
    let hasSelection = gFolderDisplay.selectedMessage != null;
    // Disable the convert menu altogether.
    setElementValue("mailContext-calendar-convert-menu", !hasSelection && "true", "hidden");
  },
};

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
 * @return {string}  A toolbox id or null
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

// Initialize the Calendar sidebar menu state
function InitViewCalendarPaneMenu() {
  let calSidebar = document.getElementById("ltnSidebar");

  setBooleanAttribute("ltnViewCalendarPane", "checked", !calSidebar.getAttribute("collapsed"));

  if (document.getElementById("appmenu_ltnViewCalendarPane")) {
    setBooleanAttribute(
      "appmenu_ltnViewCalendarPane",
      "checked",
      !calSidebar.getAttribute("collapsed")
    );
  }
}

/**
 * Move the event toolbox, containing the toolbar, into view for a tab
 * or back to its hiding place where it is accessed again for other tabs.
 *
 * @param {Node} aDestination  Destination where the toolbox will be moved
 */
function moveEventToolbox(aDestination) {
  let toolbox = document.getElementById("event-toolbox");
  // the <toolbarpalette> has to be copied manually
  let palette = toolbox.palette;
  let iframe = aDestination.querySelector("iframe");
  aDestination.insertBefore(toolbox, iframe);
  toolbox.palette = palette;
}

/**
 * Checks if Lightning's binary component was successfully loaded.
 */
function checkCalendarBinaryComponent() {
  // Don't even get started if we are running ical.js or the binary component
  // was successfully loaded.
  if (
    "@mozilla.org/calendar/datetime;1" in Cc ||
    Services.prefs.getBoolPref("calendar.icaljs", false)
  ) {
    return;
  }

  const THUNDERBIRD_GUID = "{3550f703-e582-4d05-9a08-453d09bdfdc6}";
  const SEAMONKEY_GUID = "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";
  const LIGHTNING_GUID = "{e2fda1a4-762b-4020-b5ad-a41df1933103}";

  AddonManager.getAddonByID(LIGHTNING_GUID, ext => {
    if (!ext) {
      return;
    }

    let version;
    let appversion = Services.appinfo.version;
    let versionparts = appversion.split(".");
    let extbrand = cal.l10n.getLtnString("brandShortName");

    switch (Services.appinfo.ID) {
      case THUNDERBIRD_GUID: // e.g. 31.4.0 -> 3.3
        version = ((parseInt(versionparts[0], 10) + 2) / 10).toFixed(1);
        break;
      case SEAMONKEY_GUID: // e.g. 2.28.4 -> 3.3
        version = ((parseInt(versionparts[1], 10) + 5) / 10).toFixed(1);
        break;
    }

    let text;
    if (version && version != ext.version) {
      let args = [extbrand, ext.version, version];
      text = cal.l10n.getLtnString("binaryComponentKnown", args);
    } else {
      let brand = cal.l10n.getAnyString("branding", "brand", "brandShortName");
      let args = [extbrand, brand, appversion, ext.version];
      text = cal.l10n.getLtnString("binaryComponentUnknown", args);
    }

    let title = cal.l10n.getLtnString("binaryComponentTitle", [extbrand]);
    openAddonsMgr("addons://detail/" + encodeURIComponent(LIGHTNING_GUID));
    Services.prompt.alert(window, title, text);
  });
}
