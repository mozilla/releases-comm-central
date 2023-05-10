/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals TodayPane, switchToView, gLastShownCalendarView, ensureUnifinderLoaded */

/* exported calSwitchToCalendarMode, calSwitchToMode, calSwitchToTaskMode,
 *          changeMode
 */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * The current mode defining the current mode we're in. Allowed values are:
 *  - 'mail'
 *  - 'calendar'
 *  - 'task'
 *  - 'chat'
 *  - 'calendarEvent'
 *  - 'calendarTask'
 *  - 'special' - For special tabs like preferences, add-ons manager, about:xyz, etc.
 *
 * @global
 */
var gCurrentMode = "mail";

/**
 * Changes the mode (gCurrentMode) and adapts the UI to the new mode.
 *
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
}

/**
 * For switching to modes like "mail", "chat", "calendarEvent", "calendarTask", or "special".
 * (For "calendar" and "task" modes use calSwitchToCalendarMode and calSwitchToTaskMode.)
 *
 * @param {string} mode - The mode to switch to.
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
    document.getElementById("calendar-view-box").collapsed = false;
    document.getElementById("calendar-task-box").collapsed = true;
    document.getElementById("sidePanelNewEvent").hidden = false;
    document.getElementById("sidePanelNewTask").hidden = true;

    // show the last displayed type of calendar view
    switchToView(gLastShownCalendarView.get());
    document.getElementById("calMinimonth").setAttribute("freebusy", "true");

    document.commandDispatcher.updateCommands("calendar_commands");
    window.setCursor("auto");

    // make sure the view is sized correctly
    window.dispatchEvent(new CustomEvent("viewresize"));

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
    document.getElementById("calendar-view-box").collapsed = true;
    document.getElementById("calendar-task-box").collapsed = false;
    document.getElementById("sidePanelNewEvent").hidden = true;
    document.getElementById("sidePanelNewTask").hidden = false;

    document.getElementById("calMinimonth").setAttribute("freebusy", "true");

    let tree = document.getElementById("calendar-task-tree");
    if (!tree.hasBeenVisible) {
      tree.hasBeenVisible = true;
      tree.refresh();
    }

    document.commandDispatcher.updateCommands("calendar_commands");
    window.setCursor("auto");
  }
}
