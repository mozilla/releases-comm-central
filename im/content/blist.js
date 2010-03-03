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

const events = ["buddy-signed-on",
                "buddy-added",
                "account-disconnected",
                "status-changed",
                "purple-quit"];

const showOfflineBuddiesPref = "messenger.buddies.showOffline";

var gBuddyListContextMenu = null;

function buddyListContextMenu(aXulMenu) {
  this.target  = document.popupNode;
  this.menu    = aXulMenu;
  this.onBuddy = this.target.localName == "buddy";
  this.onGroup = this.target.localName == "group";
  this.shouldDisplay = true;

  [ "context-openconversation",
    "context-alias",
    "context-delete",
    "context-moveto",
    "context-moveto-popup",
    "context-create-tag-separator",
    "context-create-tag",
    "context-showlogs",
    "context-show-offline-buddies-separator"
  ].forEach(function (aId) {
    document.getElementById(aId).hidden = !this.onBuddy;
  }, this);

  if (this.onBuddy) {
    document.getElementById("context-openconversation").disabled =
      !this.target.canOpenConversation();
  }
}

// Prototype for buddyListContextMenu "class."
buddyListContextMenu.prototype = {
  openConversation: function blcm_openConversation() {
    if (this.onBuddy)
      this.target.openConversation();
  },
  alias: function blcm_alias() {
    if (this.onBuddy)
      this.target.startAliasing();
  },
  delete: function blcm_delete() {
    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    let bundle =
      Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://instantbird/locale/instantbird.properties");
    let buddy = this.target.buddy;
    let displayName = buddy.alias || buddy.name;
    let promptTitle = bundle.formatStringFromName("buddy.deletePrompt.title",
                                                  [displayName], 1);
    if (displayName != buddy.name)
      displayName += " (" + buddy.name + ")";
    let proto = buddy.getAccount(0).protocol.name;
    let promptMessage = bundle.formatStringFromName("buddy.deletePrompt.message",
                                                    [displayName, proto], 2);
    let deleteButton = bundle.GetStringFromName("buddy.deletePrompt.button");
    let flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                prompts.BUTTON_POS_1_DEFAULT;
    if (prompts.confirmEx(window, promptTitle, promptMessage, flags,
                          deleteButton, null, null, null, {}))
      return;

    this.target.remove();
  },
  moveToPopupShowing: function blcm_moveToPopupShowing() {
    if (!this.onBuddy)
      return;

    let popup = document.getElementById("context-moveto-popup");
    let item;
    while ((item = popup.firstChild) && item.localName != "menuseparator")
      popup.removeChild(item);

    let groupId = this.target.group.groupId;
    let pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);

    let sortFunction = function (a, b) {
      let [a, b] = [a.name.toLowerCase(), b.name.toLowerCase()];
      return a < b ? 1 : a > b ? -1 : 0;
    };
    pcs.getTags()
       .sort(sortFunction)
       .forEach(function (aTag) {
      item = document.createElement("menuitem");
      item.setAttribute("label", aTag.name);
      item.setAttribute("type", "radio");
      let id = aTag.id;
      item.groupId = id;
      if (groupId == id)
        item.setAttribute("checked", "true");
      popup.insertBefore(item, popup.firstChild);
    });
  },
  moveTo: function blcm_moveTo(aEvent) {
    let item = aEvent.originalTarget;
    if (item.groupId)
      this.target.moveTo(item.groupId);
  },
  moveToNewTag: function blcm_moveToNewTag() {
    let prompts =
      Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                .getService(Components.interfaces.nsIPromptService);
    let bundle =
      Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://instantbird/locale/instantbird.properties");
    let title = bundle.GetStringFromName("newGroupPromptTitle");
    let message = bundle.GetStringFromName("newGroupPromptMessage");
    let name = {};
    if (!prompts.prompt(window, title, message, name, null,
                        {value: false}) || !name.value)
      return; // the user canceled

    let pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    let tag = pcs.getTagByName(name.value) || pcs.createTag(name.value);
    this.target.moveTo(tag.id);
  },
  showLogs: function blcm_showLogs() {
    if (!this.onBuddy)
      return;

    var logs = [];
    for (accountId in this.target.accounts) {
      let account = this.target.accounts[accountId];
      for (let log in getIter(account.getLogs()))
        logs.push(log);
    }
    logs.sort(function(log1, log2) log2.time - log1.time);
    window.openDialog("chrome://instantbird/content/viewlog.xul",
                      "Logs", "chrome,resizable", {logs: logs},
                      this.target.getAttribute("displayname"));
  },
  toggleShowOfflineBuddies: function blcm_toggleShowOfflineBuddies() {
    let newValue =
      !!document.getElementById("context-show-offline-buddies")
                .getAttribute("checked");
    Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch2)
              .setBoolPref(showOfflineBuddiesPref, newValue);
  }
};

var buddyList = {
  observe: function bl_observe(aSubject, aTopic, aMsg) {
    if (aTopic == "purple-quit") {
      window.close();
      return;
    }

    if (aTopic == "nsPref:changed" && aMsg == showOfflineBuddiesPref) {
      let prefBranch =
        Components.classes["@mozilla.org/preferences-service;1"]
                  .getService(Components.interfaces.nsIPrefBranch2);
      let showOffline = prefBranch.getBoolPref(showOfflineBuddiesPref);
      this._showOffline = showOffline;
      let item = document.getElementById("context-show-offline-buddies");
      if (showOffline)
        item.setAttribute("checked", "true");
      else
        item.removeAttribute("checked");

      var pcs = Components.classes["@instantbird.org/purple/core;1"]
                          .getService(Ci.purpleICoreService);
      let blistBox = document.getElementById("buddylistbox");
      pcs.getTags().forEach(function (aTag) {
        let elt = document.getElementById("group" + aTag.id);
        if (!elt && showOffline) {
          elt = document.createElement("group");
          blistBox.appendChild(elt);
          elt._showOffline = true;
          if (!elt.build(aTag))
            blistBox.removeChild(elt);
        }
        if (elt)
          elt.showOffline = showOffline;
      });
    }

    if (aTopic == "status-changed") {
      this.displayCurrentStatus();
      this.showAccountManagerIfNeeded(false);
      return;
    }

    if (aTopic == "account-disconnected") {
      let account = aSubject.QueryInterface(Ci.purpleIAccount);
      if (account.reconnectAttempt <= 1)
        this.showAccountManagerIfNeeded(false);
      return;
    }

    var pab = aSubject.QueryInterface(Ci.purpleIAccountBuddy);
    var group = pab.tag;
    var groupId = "group" + group.id;
    if ((aTopic == "buddy-signed-on" ||
        (aTopic == "buddy-added" && (this._showOffline || pab.online))) &&
        !document.getElementById(groupId)) {
      let groupElt = document.createElement("group");
      document.getElementById("buddylistbox").appendChild(groupElt);
      if (this._showOffline)
        groupElt._showOffline = true;
      groupElt.build(group);
    }
  },

  displayStatusType: function bl_displayStatusType(aStatusType) {
    document.getElementById("statusMessage")
            .setAttribute("statusType", aStatusType);

    let bundle =
      Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://instantbird/locale/instantbird.properties");
    let statusString;
    try {
      // In some odd cases, this function could be called for an
      // unknown status type.
      statusString = bundle.GetStringFromName(aStatusType + "StatusType");
    } catch (e) { }
    let statusTypeIcon = document.getElementById("statusTypeIcon");
    statusTypeIcon.setAttribute("status", aStatusType);
    statusTypeIcon.setAttribute("tooltiptext", statusString);
    return statusString;
  },

  displayCurrentStatus: function bl_displayCurrentStatus() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    let message = pcs.currentStatusMessage;
    let status = "unknown";
    let statusType = pcs.currentStatusType;
    if (statusType == Ci.purpleICoreService.STATUS_AVAILABLE)
      status = "available";
    else if (statusType == Ci.purpleICoreService.STATUS_UNAVAILABLE)
      status = "unavailable";
    else if (statusType == Ci.purpleICoreService.STATUS_IDLE)
      status = "idle";
    else if (statusType == Ci.purpleICoreService.STATUS_AWAY)
      status = "away";
    else if (statusType == Ci.purpleICoreService.STATUS_OFFLINE) {
      status = "offline";
      message = "";
    }
    else if (statusType == Ci.purpleICoreService.STATUS_INVISIBLE)
      status = "invisible";
    let statusString = this.displayStatusType(status);
    let statusMessage = document.getElementById("statusMessage");
    if (message)
      statusMessage.removeAttribute("usingDefault");
    else {
      statusMessage.setAttribute("usingDefault", statusString);
      message = statusString;
    }
    statusMessage.setAttribute("value", message);
    statusMessage.setAttribute("tooltiptext", message);
  },

  onStatusPopupShowing: function bl_onStatusPopupShowing() {
    menus.checkCurrentStatusType(["statusTypeAvailable",
                                  "statusTypeUnavailable",
                                  "statusTypeOffline"]);
  },

  editStatus: function bl_editStatus(aEvent) {
    let status = aEvent.originalTarget.getAttribute("status");
    if (status == "offline") {
      Components.classes["@instantbird.org/purple/core;1"]
                .getService(Ci.purpleICoreService)
                .setStatus(Ci.purpleICoreService.STATUS_OFFLINE, "");
    }
    else if (status)
      this.startEditStatus(status);
  },

  startEditStatus: function bl_startEditStatus(aStatusType) {
    let currentStatusType =
      document.getElementById("statusTypeIcon").getAttribute("status");
    if (aStatusType != currentStatusType) {
      this._statusTypeBeforeEditing = currentStatusType;
      this._statusTypeEditing = aStatusType;
      this.displayStatusType(aStatusType);
    }
    this.statusMessageClick();
  },

  statusMessageClick: function bl_statusMessageClick() {
    let statusType =
      document.getElementById("statusTypeIcon").getAttribute("status");
    if (statusType == "offline")
      return;

    let elt = document.getElementById("statusMessage");
    if (!elt.hasAttribute("editing")) {
      elt.setAttribute("editing", "true");
      elt.addEventListener("keypress", this.statusMessageKeyPress, false);
      elt.addEventListener("blur", this.statusMessageBlur, false);
      if (elt.hasAttribute("usingDefault")) {
        if ("_statusTypeBeforeEditing" in this &&
            this._statusTypeBeforeEditing == "offline") {
          let pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
          elt.setAttribute("value", pcs.currentStatusMessage);
        }
        else
          elt.removeAttribute("value");
      }
      // force binding attachmant by forcing layout
      elt.getBoundingClientRect();
      elt.select();
    }

    this.statusMessageRefreshTimer();
  },

  statusMessageRefreshTimer: function bl_statusMessageRefreshTimer() {
    const timeBeforeAutoValidate = 20 * 1000;
    clearTimeout(this._stopEditStatusTimeout);
    this._stopEditStatusTimeout = setTimeout(this.finishEditStatusMessage,
                                             timeBeforeAutoValidate, true);
  },

  statusMessageBlur: function bl_statusMessageBlur(aEvent) {
    if (aEvent.originalTarget == document.getElementById("statusMessage").inputField)
      buddyList.finishEditStatusMessage(true);
  },

  statusMessageKeyPress: function bl_statusMessageKeyPress(aEvent) {
    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_RETURN:
      case aEvent.DOM_VK_ENTER:
        buddyList.finishEditStatusMessage(true);
        break;

      case aEvent.DOM_VK_ESCAPE:
        buddyList.finishEditStatusMessage(false);
        break;

      default:
        buddyList.statusMessageRefreshTimer();
    }
  },

  finishEditStatusMessage: function bl_finishEditStatusMessage(aSave) {
    clearTimeout(this._stopEditStatusTimeout);
    let elt = document.getElementById("statusMessage");
    if (aSave) {
      var pcs = Components.classes["@instantbird.org/purple/core;1"]
                          .getService(Ci.purpleICoreService);
      let newStatus = Ci.purpleICoreService.STATUS_UNSET;
      if ("_statusTypeEditing" in this) {
        let statusType = this._statusTypeEditing;
        if (statusType == "available")
          newStatus = Ci.purpleICoreService.STATUS_AVAILABLE;
        else if (statusType == "unavailable")
          newStatus = Ci.purpleICoreService.STATUS_UNAVAILABLE;
        else if (statusType == "offline")
          newStatus = Ci.purpleICoreService.STATUS_OFFLINE;
        delete this._statusTypeBeforeEditing;
        delete this._statusTypeEditing;
      }
      // apply the new status only if it is different from the current one
      if (newStatus != Ci.purpleICoreService.STATUS_UNSET ||
          elt.value != elt.getAttribute("value"))
        pcs.setStatus(newStatus, elt.value);
    }
    else if ("_statusTypeBeforeEditing" in this) {
      this.displayStatusType(this._statusTypeBeforeEditing);
      delete this._statusTypeBeforeEditing;
      delete this._statusTypeEditing;
    }

    if (elt.hasAttribute("usingDefault"))
      elt.setAttribute("value", elt.getAttribute("usingDefault"));
    elt.removeAttribute("editing");
    elt.removeEventListener("keypress", this.statusMessageKeyPress, false);
    elt.removeEventListener("blur", this.statusMessageBlur, false);
  },

  getAccounts: function bl_getAccounts() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    return getIter(pcs.getAccounts());
  },

  /* This function pops up the account manager is no account is
   * connected or connecting.
   * When called during startup (aIsStarting == true), it will also
   * look for crashed accounts.
   */
  showAccountManagerIfNeeded: function bl_showAccountManagerIfNeeded(aIsStarting) {
    // If the current status is offline, we don't need the account manager
    let pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    let isOffline = pcs.currentStatusType == pcs.STATUS_OFFLINE;
    if (isOffline && !aIsStarting)
      return;

    let hasActiveAccount = false;
    let hasCrashedAccount = false;
    for (let acc in this.getAccounts()) {
      if (acc.connected || acc.connecting)
        hasActiveAccount = true;

      // We only check for crashed accounts on startup.
      if (aIsStarting && acc.autoLogin &&
          acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED)
        hasCrashedAccount = true;
    }

    /* We only display the account manager on startup if an account has crashed
       or if all accounts are disconnected
       In case of connection failure after an automatic reconnection attempt,
       we don't want to popup the account manager */
    if ((!hasActiveAccount && !isOffline) || (aIsStarting && hasCrashedAccount))
      menus.accounts();
  },

  load: function bl_load() {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var blistWindows = wm.getEnumerator("Messenger:blist");
    while (blistWindows.hasMoreElements()) {
      var win = blistWindows.getNext();
      if (win != window) {
        win.QueryInterface(Components.interfaces.nsIDOMWindowInternal).focus();
        window.close();
        return;
      }
    }

    try {
      // Set the Vendor for breakpad only
      if ("nsICrashReporter" in Components.interfaces) {
        Components.classes["@mozilla.org/xre/app-info;1"]
                  .getService(Components.interfaces.nsICrashReporter)
                  .annotateCrashReport("Vendor", "Instantbird");
      }
    } catch(e) {
      // This can fail if breakpad isn't enabled,
      // don't worry too much about this exception.
    }

    if (!initPurpleCore()) {
      window.close();
      return;
    }

    // TODO remove this once we cleanup the way the menus are inserted
    let menubar = document.getElementById("blistMenubar");
    let statusArea = document.getElementById("statusArea");
    statusArea.parentNode.insertBefore(menubar, statusArea);

    buddyList.displayCurrentStatus();

    let prefBranch =
      Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefBranch2);
    buddyList._showOffline = prefBranch.getBoolPref(showOfflineBuddiesPref);
    if (buddyList._showOffline) {
      document.getElementById("context-show-offline-buddies")
              .setAttribute("checked", "true");
    }

    let pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    let blistBox = document.getElementById("buddylistbox");
    pcs.getTags().forEach(function (aTag) {
      let groupElt = document.createElement("group");
      blistBox.appendChild(groupElt);
      if (buddyList._showOffline)
        groupElt._showOffline = true;
      if (!groupElt.build(aTag))
        blistBox.removeChild(groupElt);
    });

    prefBranch.addObserver(showOfflineBuddiesPref, buddyList, false);
    addObservers(buddyList, events);

    Components.utils.import("resource://app/modules/imWindows.jsm");
    Conversations.init();

    buddyList.showAccountManagerIfNeeded(true);
    this.addEventListener("unload", buddyList.unload, false);
    this.addEventListener("close", buddyList.close, false);
  },
  unload: function bl_unload() {
    removeObservers(buddyList, events);
    Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch2)
              .removeObserver(showOfflineBuddiesPref, buddyList);
    uninitPurpleCore();
   },

  close: function bl_close(event) {
    event.preventDefault();
    goQuitApplication();
  },

  // Handle key pressing
  keyPress: function bl_keyPress(aEvent) {
    var item = document.getElementById("buddylistbox").selectedItem;
    if (!item) // the list is empty
      return;
    item.keyPress(aEvent);
  }
};

this.addEventListener("load", buddyList.load, false);
