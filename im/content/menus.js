/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var addBuddyWindow = "chrome://instantbird/content/addbuddy.xul";
var joinChatWindow = "chrome://instantbird/content/joinchat.xul";
var aboutWindow = "chrome://instantbird/content/aboutDialog.xul";
var errorConsoleWindow = "chrome://global/content/console.xul";
var preferencesWindow = "chrome://instantbird/content/preferences/preferences.xul";

if (!("Services" in window))
  Components.utils.import("resource:///modules/imServices.jsm");
if (!("Core" in window))
  Components.utils.import("resource:///modules/ibCore.jsm");

var menus = {
  supportsCommand: aCmd =>
    aCmd == "cmd_addbuddy" || aCmd == "cmd_joinchat" || aCmd == "cmd_newtab",
  isCommandEnabled: function(aCmd) {
    let enumerator = Services.accounts.getAccounts();
    while (enumerator.hasMoreElements()) {
      let acc = enumerator.getNext();
      if (acc.connected &&
          (aCmd == "cmd_addbuddy" || aCmd == "cmd_newtab" || acc.canJoinChat))
        return true;
    }
    return false;
  },
  doCommand: function(aCmd) {
    if (aCmd == "cmd_joinchat")
      this.joinChat();
    else if (aCmd == "cmd_addbuddy")
      this.addBuddy();
    else if (aCmd == "cmd_newtab") {
      if (!("Conversations" in window))
        Components.utils.import("resource:///modules/imWindows.jsm");
      Conversations.showNewTab();
    }
  },
  onEvent: function(aEventName) {},

  about: function menu_about() {
    Core.showWindow("Messenger:About", aboutWindow, "About",
                    "chrome,resizable=no,minimizable=no,centerscreen");
  },

  accounts: function menu_accounts() {
    Core.showAccounts();
  },

  preferences: function menu_preferences() {
    Core.showPreferences();
  },

  addons: function menu_addons() {
    Core.showAddons();
  },

  errors: function debug_errors() {
    Core.showWindow("global:console", errorConsoleWindow, "Errors",
                    "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar");
  },

  updates: function menu_updates() {
    Core.showUpdates();
  },

  displayUpdateStatus: function menu_displayUpdateStatus() {
    // copied from buildHelpMenu in mozilla/browser/base/content/utilityOverlay.js
    var updates =
      Components.classes["@mozilla.org/updates/update-service;1"]
                .getService(Components.interfaces.nsIApplicationUpdateService);
    var um =
      Components.classes["@mozilla.org/updates/update-manager;1"]
                .getService(Components.interfaces.nsIUpdateManager);

    // Disable the UI if the update enabled pref has been locked by the
    // administrator or if we cannot update for some other reason
    var checkForUpdates = document.getElementById("updatesMenuItem");
    var canCheckForUpdates = updates.canCheckForUpdates;
    checkForUpdates.setAttribute("disabled", !canCheckForUpdates);
    if (!canCheckForUpdates)
      return;

    var strings =
      Services.strings
              .createBundle("chrome://instantbird/locale/updates.properties");
    var activeUpdate = um.activeUpdate;

    // If there's an active update, substitute its name into the label
    // we show for this item, otherwise display a generic label.
    function getStringWithUpdateName(key) {
      if (activeUpdate && activeUpdate.name)
        return strings.formatStringFromName(key, [activeUpdate.name], 1);
      return strings.GetStringFromName(key + "Fallback");
    }

    // By default, show "Check for Updates..."
    var key = "default";
    if (activeUpdate) {
      switch (activeUpdate.state) {
      case "downloading":
        // If we're downloading an update at present, show the text:
        // "Downloading Instantbird x.x..." otherwise we're paused, and show
        // "Resume Downloading Instantbird x.x..."
        key = updates.isDownloading ? "downloading" : "resume";
        break;
      case "pending":
        // If we're waiting for the user to restart, show: "Apply Downloaded
        // Updates Now..."
        key = "pending";
        break;
      }
    }
    checkForUpdates.label = getStringWithUpdateName("updatesItem_" + key);
    checkForUpdates.accessKey =
      strings.GetStringFromName("updatesItem_" + key + ".accesskey");
    if (um.activeUpdate && updates.isDownloading)
      checkForUpdates.setAttribute("loading", "true");
    else
      checkForUpdates.removeAttribute("loading");
  },

  updateFileMenuitems: function menu_updateFileMenuitems() {
    goUpdateCommand("cmd_joinchat");
    goUpdateCommand("cmd_addbuddy");
    goUpdateCommand("cmd_newtab");
  },

  openDialog: function menu_openDialog(aWindowType, aURL) {
    let features = "chrome,modal,titlebar,centerscreen";
#ifdef XP_MACOSX
    let hiddenWindowUrl =
      Services.prefs.getCharPref("browser.hiddenWindowChromeURL");
    if (window.location.href == hiddenWindowUrl) {
      Core.showWindow(aWindowType, aURL, "", features);
      return;
    }
#endif
    window.openDialog(aURL, "", features);
  },
  addBuddy: function menu_addBuddy() {
    this.openDialog("Messenger:Addbuddy", addBuddyWindow);
  },

  joinChat: function menu_joinChat() {
    this.openDialog("Messenger:JoinChat", joinChatWindow);
  },

  checkCurrentStatusType: function menu_checkCurrentStatusType(aItems) {
    if (!("Status" in window))
      Components.utils.import("resource:///modules/imStatusUtils.jsm");
    let status = Status.toAttribute(Services.core.globalUserStatus.statusType);
    if (status == "away")
      status = "unavailable";

    aItems.forEach(function (aId) {
      let elt = document.getElementById(aId);
      if (elt.getAttribute("status") == status)
        elt.setAttribute("checked", "true");
      else
        elt.removeAttribute("checked");
    });
  },

  onStatusPopupShowing: function menu_onStatusPopupShowing() {
    this.checkCurrentStatusType(["statusAvailable",
                                 "statusUnavailable",
                                 "statusOffline"]);
  },

  setStatus: function menu_setStatus(aEvent) {
    let status = aEvent.originalTarget.getAttribute("status");
    if (!status)
      return; // is this really possible?

    let blist = Services.wm.getMostRecentWindow("Messenger:blist");
    if (blist) {
      blist.focus();
      blist.buddyList.startEditStatus(status);
    }
    else {
      let us = Services.core.globalUserStatus;
      us.setStatus(Status.toFlag(status), us.statusText);
    }
  }
};

window.addEventListener("load", function() { this.controllers.insertControllerAt(0, menus); });
