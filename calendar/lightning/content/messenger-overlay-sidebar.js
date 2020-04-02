/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported calendarOnToolbarsPopupShowing, customizeMailToolbarForTabType,
 *          gCurrentMode, InitViewCalendarPaneMenu, loadCalendarComponent,
 *          onToolbarsPopupShowingWithMode, openInvitationsDialog, refreshUIBits,
 *          switchCalendarView,
 */

/* import-globals-from ../../base/content/calendar-command-controller.js */
/* import-globals-from ../../base/content/calendar-invitations-manager.js */
/* import-globals-from ../../base/content/today-pane.js */
/* import-globals-from lightning-item-panel.js */

/* globals calSwitchToMode, changeMode, setUpInvitationsManager,
 *         tearDownInvitationsManager,
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

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

var gCalSetupMailContext = {
  popup() {
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
