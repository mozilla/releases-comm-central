/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const addonManagerWindow = "chrome://mozapps/content/extensions/extensions.xul?type=extensions";
const accountManagerWindow = "chrome://instantbird/content/accounts.xul";
const blistWindow = "chrome://instantbird/content/blist.xul";
const addBuddyWindow = "chrome://instantbird/content/addbuddy.xul";
const joinChatWindow = "chrome://instantbird/content/joinchat.xul";
const aboutWindow = "chrome://instantbird/content/aboutDialog.xul";
const errorConsoleWindow = "chrome://global/content/console.xul";
const preferencesWindow = "chrome://instantbird/content/preferences/preferences.xul";

if (!("Services" in window))
  Components.utils.import("resource:///modules/imServices.jsm");

var menus = {
  focus: function menu_focus(aWindowType) {
    var win = Services.wm.getMostRecentWindow(aWindowType);
    if (win)
      win.focus();
    return win;
  },

  about: function menu_about() {
    if (!this.focus("Messenger:About"))
      window.open(aboutWindow, "About",
                  "chrome,resizable=no,minimizable=no,centerscreen");
  },

  accounts: function menu_accounts() {
    if (!this.focus("Messenger:Accounts"))
      window.open(accountManagerWindow, "Accounts",
                  "chrome,resizable");
  },

  preferences: function menu_preferences() {
    if (!this.focus("Messenger:Preferences"))
      window.open(preferencesWindow, "Preferences",
                  "chrome,titlebar,toolbar,centerscreen,dialog=no");
  },

  addons: function menu_addons() {
    if (!this.focus("Extension:Manager"))
      window.open(addonManagerWindow, "Addons",
                  "chrome,menubar,extra-chrome,toolbar,dialog=no,resizable");
  },

  errors: function debug_errors() {
    if (!menus.focus("global:console"))
      window.open(errorConsoleWindow, "Errors",
                  "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar");
  },

  updates: function menu_updates() {
    // copied from checkForUpdates in mozilla/browser/base/content/utilityOverlay.js
    var um =
      Components.classes["@mozilla.org/updates/update-manager;1"]
                .getService(Components.interfaces.nsIUpdateManager);
    var prompter =
      Components.classes["@mozilla.org/updates/update-prompt;1"]
                .createInstance(Components.interfaces.nsIUpdatePrompt);

    // If there's an update ready to be applied, show the "Update Downloaded"
    // UI instead and let the user know they have to restart the browser for
    // the changes to be applied.
    if (um.activeUpdate && um.activeUpdate.state == "pending")
      prompter.showUpdateDownloaded(um.activeUpdate);
    else
      prompter.checkForUpdates();
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

  getAccounts: function bl_getAccounts() {
    return getIter(Services.core.getAccounts());
  },
  updateFileMenuitems: function menu_updateFileMenuitems() {
    let hasConnectedAccount = false;
    let canJoinChat = false;
    for (let acc in this.getAccounts()) {
      if (acc.connected) {
        hasConnectedAccount = true;
        if (acc.canJoinChat)
          canJoinChat = true;
      }
    }

    document.getElementById("addBuddyMenuItem").disabled = !hasConnectedAccount;
    document.getElementById("joinChatMenuItem").disabled = !canJoinChat;
  },

  addBuddy: function menu_addBuddy() {
    window.openDialog(addBuddyWindow, "",
                      "chrome,modal,titlebar,centerscreen");
  },

  joinChat: function menu_joinChat() {
    window.openDialog(joinChatWindow, "",
                      "chrome,modal,titlebar,centerscreen");
  },

  checkCurrentStatusType: function menu_checkCurrentStatusType(aItems) {
    if (!("Status" in window))
      Components.utils.import("resource:///modules/imStatusUtils.jsm");
    let status = Status.toAttribute(Services.core.currentStatusType);
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

    let blist = this.focus("Messenger:blist");
    blist.buddyList.startEditStatus(status);
  }
};
