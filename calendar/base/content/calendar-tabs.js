/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from item-editing/calendar-item-panel.js */
/* import-globals-from calendar-command-controller.js */
/* import-globals-from calendar-modes.js */
/* import-globals-from calendar-views-utils.js */

/* globals MozElements */

/* eslint-enable valid-jsdoc */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var calendarTabMonitor = {
  monitorName: "calendarTabMonitor",

  // Unused, but needed functions
  onTabTitleChanged() {},
  onTabOpened() {},
  onTabClosing() {},
  onTabPersist() {},
  onTabRestored() {},

  onTabSwitched(aNewTab, aOldTab) {
    // Unfortunately, tabmail doesn't provide a hideTab function on the tab
    // type definitions. To make sure the commands are correctly disabled,
    // we want to update calendar/task commands when switching away from
    // those tabs.
    if (aOldTab?.mode.name == "calendar" || aOldTab?.mode.name == "task") {
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
      const saveMenu = document.getElementById("calendar-save-menuitem");
      const saveandcloseMenu = document.getElementById("calendar-save-and-close-menuitem");
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
      case "addressBookTab":
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
      openTab(tab) {
        tab.tabNode.setIcon("chrome://messenger/skin/icons/new/compact/calendar.svg");
        gLastShownCalendarView.get();
        tab.title = cal.l10n.getLtnString("tabTitleCalendar");
      },
      showTab(tab) {},
      closeTab(tab) {},

      persistTab(tab) {
        const tabmail = document.getElementById("tabmail");
        return {
          // Since we do strange tab switching logic in calSwitchToCalendarMode,
          // we should store the current tab state ourselves.
          background: tab != tabmail.currentTabInfo,
        };
      },

      restoreTab(tabmail, state) {
        tabmail.openTab("calendar", state);
      },

      onTitleChanged(tab) {
        tab.title = cal.l10n.getLtnString("tabTitleCalendar");
      },

      supportsCommand: (aCommand, aTab) => calendarController2.supportsCommand(aCommand),
      isCommandEnabled: (aCommand, aTab) => calendarController2.isCommandEnabled(aCommand),
      doCommand: (aCommand, aTab) => calendarController2.doCommand(aCommand),
      onEvent: (aEvent, aTab) => calendarController2.onEvent(aEvent),
    },

    tasks: {
      type: "tasks",
      maxTabs: 1,
      openTab(tab) {
        tab.tabNode.setIcon("chrome://messenger/skin/icons/new/compact/tasks.svg");
        tab.title = cal.l10n.getLtnString("tabTitleTasks");
      },
      showTab(tab) {},
      closeTab(tab) {},

      persistTab(tab) {
        const tabmail = document.getElementById("tabmail");
        return {
          // Since we do strange tab switching logic in calSwitchToTaskMode,
          // we should store the current tab state ourselves.
          background: tab != tabmail.currentTabInfo,
        };
      },

      restoreTab(tabmail, state) {
        tabmail.openTab("tasks", state);
      },

      onTitleChanged(tab) {
        tab.title = cal.l10n.getLtnString("tabTitleTasks");
      },

      supportsCommand: (aCommand, aTab) => calendarController2.supportsCommand(aCommand),
      isCommandEnabled: (aCommand, aTab) => calendarController2.isCommandEnabled(aCommand),
      doCommand: (aCommand, aTab) => calendarController2.doCommand(aCommand),
      onEvent: (aEvent, aTab) => calendarController2.onEvent(aEvent),
    },
  },

  saveTabState(tab) {},
};

ChromeUtils.defineLazyGetter(calendarTabType.modes.calendar, "notificationbox", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("calendar-deactivated-notification-location-events").append(element);
  });
});

ChromeUtils.defineLazyGetter(calendarTabType.modes.tasks, "notificationbox", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("calendar-deactivated-notification-location-tasks").append(element);
  });
});

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
   * @param {object} aTab - A tab info object
   * @param {object} aArgs - Contains data about the event/task
   */
  openTab(aTab, aArgs) {
    // Create a clone to use for this tab. Remove the cloned toolbox
    // and move the original toolbox into its place. There is only
    // one toolbox/toolbar so its settings are the same for all item tabs.
    const original = document.getElementById("calendarItemPanel").firstElementChild;
    const clone = original.cloneNode(true);

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
    // src is set in onLoadCalendarItemPanel() that is called below.
    aTab.iframe = aTab.panel.querySelector("iframe");
    const iframeId = "calendarItemTabIframe" + this.idNumber;
    aTab.iframe.setAttribute("id", iframeId);
    gItemTabIds.push(iframeId);

    // Generate and set the tab title.
    let strName;
    if (aTab.mode.type == "calendarEvent") {
      strName = aArgs.calendarEvent.title ? "editEventDialog" : "newEventDialog";
      aTab.tabNode.setIcon("chrome://messenger/skin/icons/new/compact/calendar.svg");
    } else if (aTab.mode.type == "calendarTask") {
      strName = aArgs.calendarEvent.title ? "editTaskDialog" : "newTaskDialog";
      aTab.tabNode.setIcon("chrome://messenger/skin/icons/new/compact/tasks.svg");
    } else {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
    // name is "New Event", "Edit Task", etc.
    const name = cal.l10n.getCalString(strName);
    aTab.title = name + ": " + (aArgs.calendarEvent.title || name);

    // allowTabClose prevents the tab from being closed until we ask
    // the user if they want to save any unsaved changes.
    aTab.allowTabClose = false;

    // Put the arguments where they can be accessed easily
    // from the iframe. (window.arguments[0])
    aTab.iframe.contentWindow.arguments = [aArgs];

    // activate or de-activate 'Events and Tasks' menu items
    document.commandDispatcher.updateCommands("calendar_commands");

    onLoadCalendarItemPanel(iframeId, aArgs.url);

    this.idNumber += 1;
  },
  /**
   * Saves a tab's state when it is deactivated / hidden.  The opposite of showTab.
   *
   * @param {object} aTab - A tab info object
   */
  saveTabState(aTab) {
    // save state
    aTab.itemTabConfig = {};
    Object.assign(aTab.itemTabConfig, gConfig);

    // clear statusbar
    const statusbar = document.getElementById("status-bar");
    const items = statusbar.getElementsByClassName("event-dialog");
    for (const item of items) {
      item.setAttribute("collapsed", true);
    }
    // move toolbox to the place where it can be accessed later
    const to = document.getElementById("calendarItemPanel").firstElementChild;
    moveEventToolbox(to);
  },
  /**
   * Called when a tab is activated / shown.  The opposite of saveTabState.
   *
   * @param {object} aTab - A tab info object
   */
  showTab(aTab) {
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
   * @param {object} aTab - A tab info object
   */
  tryCloseTab(aTab) {
    if (aTab.allowTabClose) {
      return true;
    }
    onCancel(aTab.iframe.id);
    return false;
  },
  /**
   * Closes a tab.
   *
   * @param {object} aTab - A tab info object
   */
  closeTab(aTab) {
    // Remove the iframe id from the array where they are stored.
    const index = gItemTabIds.indexOf(aTab.iframe.id);
    if (index != -1) {
      gItemTabIds.splice(index, 1);
    }
    aTab.itemTabConfig = null;

    // If this is the last item tab that is closing, then delete
    // window.calItemSaveControls, so mochitests won't complain.
    const tabmail = document.getElementById("tabmail");
    const calendarItemTabCount =
      tabmail.tabModes.calendarEvent.tabs.length + tabmail.tabModes.calendarTask.tabs.length;
    if (calendarItemTabCount == 1) {
      delete window.calItemSaveControls;
    }
  },
  /**
   * Called when quitting the application (and/or closing the window).
   * Saves an open tab's state to be able to restore it later.
   *
   * @param {object} aTab - A tab info object
   */
  persistTab(aTab) {
    const args = aTab.iframe.contentWindow.arguments[0];
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

    const calendarId = args.calendar.id;
    const itemId = args.calendarEvent.id;
    // Handle null args.initialStartDateValue, just for good measure.
    // Note that this is not the start date for the event or task.
    const hasDateValue = args.initialStartDateValue && args.initialStartDateValue.icalString;
    const initialStartDate = hasDateValue ? args.initialStartDateValue.icalString : null;

    args.calendar = null;
    args.calendarEvent = null;
    args.initialStartDateValue = null;

    return {
      calendarId,
      itemId,
      initialStartDate,
      args,
      tabType: aTab.mode.type,
    };
  },
  /**
   * Called when starting the application (and/or opening the window).
   * Restores a tab that was open when the application was quit previously.
   *
   * @param {object} aTabmail - The tabmail interface
   * @param {object} aState - The state of the tab to restore
   */
  restoreTab(aTabmail, aState) {
    // Sometimes restoreTab is called for tabs that were never saved
    // and never meant to be persisted or restored. See persistTab.
    if (aState.args && aState.calendarId && aState.itemId) {
      aState.args.initialStartDateValue = aState.initialStartDate
        ? cal.createDateTime(aState.initialStartDate)
        : cal.dtz.getDefaultStartDate();

      aState.args.onOk = doTransaction.bind(null, "modify");

      aState.args.calendar = cal.manager.getCalendarById(aState.calendarId);
      if (aState.args.calendar) {
        aState.args.calendar.getItem(aState.itemId).then(item => {
          if (item) {
            aState.args.calendarEvent = item;
            aTabmail.openTab(aState.tabType, aState.args);
          }
        });
      }
    }
  },
};

window.addEventListener("load", e => {
  const tabmail = document.getElementById("tabmail");
  tabmail.registerTabType(calendarTabType);
  tabmail.registerTabType(calendarItemTabType);
  tabmail.registerTabMonitor(calendarTabMonitor);
});

/**
 * Switch the calendar view, and optionally switch to calendar mode.
 *
 * @param {string} aType - The type of view to select.
 * @param {boolean} aShow - If true, the mode will be switched to calendar
 *   if notalready there.
 */
function switchCalendarView(aType, aShow) {
  gLastShownCalendarView.set(aType);

  if (aShow && gCurrentMode != "calendar") {
    // This function in turn calls switchToView(), so return afterwards.
    calSwitchToCalendarMode();
    return;
  }
  document
    .querySelector(`.calview-toggle-item[aria-selected="true"]`)
    ?.setAttribute("aria-selected", false);
  document
    .querySelector(`.calview-toggle-item[aria-controls="${aType}-view"]`)
    ?.setAttribute("aria-selected", true);
  switchToView(aType);
}

/**
 * Move the event toolbox, containing the toolbar, into view for a tab
 * or back to its hiding place where it is accessed again for other tabs.
 *
 * @param {Node} aDestination - Destination where the toolbox will be moved
 */
function moveEventToolbox(aDestination) {
  const toolbox = document.getElementById("event-toolbox");
  // the <toolbarpalette> has to be copied manually
  const palette = toolbox.palette;
  const iframe = aDestination.querySelector("iframe");
  aDestination.insertBefore(toolbox, iframe);
  toolbox.palette = palette;
}
