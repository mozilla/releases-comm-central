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

Components.utils.import("resource:///modules/imStatusUtils.jsm");

const events = ["contact-availability-changed",
                "contact-added",
                "contact-moved",
                "account-disconnected",
                "status-changed",
                "purple-quit"];

const showOfflineBuddiesPref = "messenger.buddies.showOffline";

var gBuddyListContextMenu = null;

function buddyListContextMenu(aXulMenu) {
  this.target  = document.popupNode;
  this.menu    = aXulMenu;
  let localName = this.target.localName;
  this.onContact = localName == "contact";
  this.onBuddy = localName == "buddy";
  this.onGroup = localName == "group";
  this.shouldDisplay = true;

  let hide = !(this.onContact || this.onBuddy);
  [ "context-openconversation",
    "context-showlogs",
    "context-edit-buddy-separator",
    "context-alias",
    "context-delete",
    "context-moveto",
    "context-moveto-popup",
    "context-create-tag-separator",
    "context-create-tag",
    "context-show-offline-buddies-separator"
  ].forEach(function (aId) {
    document.getElementById(aId).hidden = hide;
  }, this);

  let detach = document.getElementById("context-detach");
  detach.hidden = !this.onBuddy;
  if (this.onBuddy)
    detach.disabled = this.target.buddy.contact.getBuddies().length == 1;

  document.getElementById("context-openconversation").disabled =
    !hide && !this.target.canOpenConversation();
}

// Prototype for buddyListContextMenu "class."
buddyListContextMenu.prototype = {
  openConversation: function blcm_openConversation() {
    if (this.onContact || this.onBuddy)
      this.target.openConversation();
  },
  alias: function blcm_alias() {
    if (this.onContact)
      this.target.startAliasing();
    else if (this.onBuddy)
      this.target.contact.startAliasing();
  },
  detach: function blcm_detach() {
    if (!this.onBuddy)
      return;

    let buddy = this.target.buddy;
    buddy.contact.detachBuddy(buddy);
  },
  delete: function blcm_delete() {
    let buddy;
    if (this.onContact)
      buddy = this.target.contact.preferredBuddy;
    else if (this.onBuddy)
      buddy = this.target.buddy;
    else
      return;

    let bundle =
      Services.strings.createBundle("chrome://instantbird/locale/instantbird.properties");
    let displayName = this.target.displayName;
    let promptTitle = bundle.formatStringFromName("buddy.deletePrompt.title",
                                                  [displayName], 1);
    let userName = buddy.userName;
    if (displayName != userName)
      displayName += " (" + userName + ")";
    let proto = buddy.protocol.name; // FIXME build a list
    let promptMessage = bundle.formatStringFromName("buddy.deletePrompt.message",
                                                    [displayName, proto], 2);
    let deleteButton = bundle.GetStringFromName("buddy.deletePrompt.button");
    let prompts = Services.prompt;
    let flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                prompts.BUTTON_POS_1_DEFAULT;
    if (prompts.confirmEx(window, promptTitle, promptMessage, flags,
                          deleteButton, null, null, null, {}))
      return;

    this.target.remove();
  },
  moveToPopupShowing: function blcm_moveToPopupShowing() {
    if (!this.onContact && !this.onBuddy)
      return;

    let popup = document.getElementById("context-moveto-popup");
    let item;
    while ((item = popup.firstChild) && item.localName != "menuseparator")
      popup.removeChild(item);

    let groupId =
      (this.onBuddy ? this.target.contact : this.target).group.groupId;
    let sortFunction = function (a, b) {
      let [a, b] = [a.name.toLowerCase(), b.name.toLowerCase()];
      return a < b ? 1 : a > b ? -1 : 0;
    };
    Services.tags.getTags()
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
    let bundle =
      Services.strings.createBundle("chrome://instantbird/locale/instantbird.properties");
    let title = bundle.GetStringFromName("newGroupPromptTitle");
    let message = bundle.GetStringFromName("newGroupPromptMessage");
    let name = {};
    if (!Services.prompt.prompt(window, title, message, name, null,
                                {value: false}) || !name.value)
      return; // the user canceled

    // If the tag already exists, createTag will return it.
    this.target.moveTo(Services.tags.createTag(name.value).id);
  },
  showLogs: function blcm_showLogs() {
    let enumerator;
    if (this.onContact)
      enumerator = Services.logs.getLogsForContact(this.target.contact);
    else if (this.onBuddy)
      enumerator = Services.logs.getLogsForBuddy(this.target.buddy);
    else
      return;

    var logs = [];
    for (let log in getIter(enumerator))
      logs.push(log);
    window.openDialog("chrome://instantbird/content/viewlog.xul",
                      "Logs", "chrome,resizable", {logs: logs},
                      this.target.displayName);
  },
  toggleShowOfflineBuddies: function blcm_toggleShowOfflineBuddies() {
    let newValue =
      !!document.getElementById("context-show-offline-buddies")
                .getAttribute("checked");
    Services.prefs.setBoolPref(showOfflineBuddiesPref, newValue);
  }
};

var buddyList = {
  observe: function bl_observe(aSubject, aTopic, aMsg) {
    if (aTopic == "purple-quit") {
      window.close();
      return;
    }

    if (aTopic == "nsPref:changed" && aMsg == showOfflineBuddiesPref) {
      let showOffline = Services.prefs.getBoolPref(showOfflineBuddiesPref);
      this._showOffline = showOffline;
      let item = document.getElementById("context-show-offline-buddies");
      if (showOffline)
        item.setAttribute("checked", "true");
      else
        item.removeAttribute("checked");

      let blistBox = document.getElementById("buddylistbox");
      Services.tags.getTags().forEach(function (aTag) {
        let elt = document.getElementById("group" + aTag.id);
        if (elt)
          elt.showOffline = showOffline;
        else if (showOffline) {
          elt = document.createElement("group");
          blistBox.appendChild(elt);
          elt._showOffline = true;
          if (!elt.build(aTag))
            blistBox.removeChild(elt);
        }
      });
      return;
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

    // aSubject is an imIContact
    if (aSubject.online || this._showOffline) {
      aSubject.getTags().forEach(function (aTag) {
        if (!document.getElementById("group" + aTag.id)) {
          let groupElt = document.createElement("group");
          let blistBox = document.getElementById("buddylistbox");
          blistBox.appendChild(groupElt);
          if (this._showOffline)
            groupElt._showOffline = true;
          if (!groupElt.build(aTag)) {
            // Broken group or notification?
            // This should never happen as there will always be at least
            // one contact shown.
            // (We test the aSubject.online || this._showOffline to ensure it.)
            blistBox.removeChild(groupElt);
          }
        }
      }, this);
    }
  },

  displayStatusType: function bl_displayStatusType(aStatusType) {
    document.getElementById("statusMessage")
            .setAttribute("statusType", aStatusType);
    let statusString = Status.toLabel(aStatusType);
    let statusTypeIcon = document.getElementById("statusTypeIcon");
    statusTypeIcon.setAttribute("status", aStatusType);
    statusTypeIcon.setAttribute("tooltiptext", statusString);
    return statusString;
  },

  displayCurrentStatus: function bl_displayCurrentStatus() {
    let pcs = Services.core;
    let status = Status.toAttribute(pcs.currentStatusType);
    let message = status == "offline" ? "" : pcs.currentStatusMessage;
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

  editStatus: function bl_editStatus(aEvent) {
    let status = aEvent.originalTarget.getAttribute("status");
    if (status == "offline")
      Services.core.setStatus(Ci.imIStatusInfo.STATUS_OFFLINE, "");
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
            this._statusTypeBeforeEditing == "offline")
          elt.setAttribute("value", Services.core.currentStatusMessage);
        else
          elt.removeAttribute("value");
      }
      if (!("TextboxSpellChecker" in window))
        Components.utils.import("resource:///modules/imTextboxUtils.jsm");
      TextboxSpellChecker.registerTextbox(elt);
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
      let newStatus = Ci.imIStatusInfo.STATUS_UNKNOWN;
      if ("_statusTypeEditing" in this) {
        let statusType = this._statusTypeEditing;
        if (statusType == "available")
          newStatus = Ci.imIStatusInfo.STATUS_AVAILABLE;
        else if (statusType == "unavailable")
          newStatus = Ci.imIStatusInfo.STATUS_UNAVAILABLE;
        else if (statusType == "offline")
          newStatus = Ci.imIStatusInfo.STATUS_OFFLINE;
        delete this._statusTypeBeforeEditing;
        delete this._statusTypeEditing;
      }
      // apply the new status only if it is different from the current one
      if (newStatus != Ci.imIStatusInfo.STATUS_UNKNOWN ||
          elt.value != elt.getAttribute("value"))
        Services.core.setStatus(newStatus, elt.value);
    }
    else if ("_statusTypeBeforeEditing" in this) {
      this.displayStatusType(this._statusTypeBeforeEditing);
      delete this._statusTypeBeforeEditing;
      delete this._statusTypeEditing;
    }

    if (elt.hasAttribute("usingDefault"))
      elt.setAttribute("value", elt.getAttribute("usingDefault"));
    TextboxSpellChecker.unregisterTextbox(elt);
    elt.removeAttribute("editing");
    elt.removeEventListener("keypress", this.statusMessageKeyPress, false);
    elt.removeEventListener("blur", this.statusMessageBlur, false);
  },

  getAccounts: function bl_getAccounts() getIter(Services.core.getAccounts()),

  /* This function pops up the account manager is no account is
   * connected or connecting.
   * When called during startup (aIsStarting == true), it will also
   * look for crashed accounts.
   */
  showAccountManagerIfNeeded: function bl_showAccountManagerIfNeeded(aIsStarting) {
    // If the current status is offline, we don't need the account manager
    let isOffline =
      Services.core.currentStatusType == Ci.imIStatusInfo.STATUS_OFFLINE;
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
    var blistWindows = Services.wm.getEnumerator("Messenger:blist");
    while (blistWindows.hasMoreElements()) {
      var win = blistWindows.getNext();
      if (win != window) {
        win.QueryInterface(Ci.nsIDOMWindowInternal).focus();
        window.close();
        return;
      }
    }

    try {
      // Set the Vendor for breakpad only
      if ("nsICrashReporter" in Ci) {
        Components.classes["@mozilla.org/xre/app-info;1"]
                  .getService(Ci.nsICrashReporter)
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

    let status = {
      back: "AVAILABLE",
      away: "AWAY",
      busy: "UNAVAILABLE",
      dnd: "UNAVAILABLE",
      offline: "OFFLINE"
    };
    for (let cmd in status) {
      let statusValue = Ci.imIStatusInfo["STATUS_" + status[cmd]];
      Services.cmd.registerCommand({
        name: cmd,
        priority: Ci.imICommand.PRIORITY_HIGH,
        run: function(aMsg) {
          Services.core.setStatus(statusValue, aMsg);
          return true;
        }
      });
    }

    // TODO remove this once we cleanup the way the menus are inserted
    let menubar = document.getElementById("blistMenubar");
    let statusArea = document.getElementById("statusArea");
    statusArea.parentNode.insertBefore(menubar, statusArea);

    buddyList.displayCurrentStatus();

    let prefBranch = Services.prefs;
    buddyList._showOffline = prefBranch.getBoolPref(showOfflineBuddiesPref);
    if (buddyList._showOffline) {
      document.getElementById("context-show-offline-buddies")
              .setAttribute("checked", "true");
    }

    let blistBox = document.getElementById("buddylistbox");
    Services.tags.getTags().forEach(function (aTag) {
      let groupElt = document.createElement("group");
      blistBox.appendChild(groupElt);
      if (buddyList._showOffline)
        groupElt._showOffline = true;
      if (!groupElt.build(aTag))
        blistBox.removeChild(groupElt);
    });
    blistBox.focus();

    prefBranch.addObserver(showOfflineBuddiesPref, buddyList, false);
    addObservers(buddyList, events);

    Components.utils.import("resource:///modules/imWindows.jsm");
    Conversations.init();

    buddyList.showAccountManagerIfNeeded(true);
    this.addEventListener("unload", buddyList.unload, false);
    this.addEventListener("close", buddyList.close, false);
  },
  unload: function bl_unload() {
    removeObservers(buddyList, events);
    Services.prefs.removeObserver(showOfflineBuddiesPref, buddyList);
    uninitPurpleCore();
   },

  close: function bl_close(event) {
    event.preventDefault();
    goQuitApplication();
  },

  // Handle key pressing
  keyPress: function bl_keyPress(aEvent) {
    var item = document.getElementById("buddylistbox").selectedItem;
    if (!item || !item.parentNode) // empty list or item no longer in the list
      return;
    item.keyPress(aEvent);
  }
};

this.addEventListener("load", buddyList.load, false);
