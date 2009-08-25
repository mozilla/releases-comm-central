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

Components.utils.import("resource://gre/modules/DownloadUtils.jsm");

// This is the list of notifications that the account manager window observes
const events = [
  "purple-quit",
  "account-added",
  "account-updated",
  "account-removed",
  "account-connected",
  "account-connecting",
  "account-disconnected",
  "account-disconnecting",
  "account-connect-progress",
  "account-connect-error",
  "autologin-processed",
  "network:offline-status-changed"
];

var gAccountManager = {
  // Sets the delay after connect() or disconnect() during which
  // it is impossible to perform disconnect() and connect()
  _disabledDelay: 500,
  disableTimerID: 0,
  load: function am_load() {
    this.accountList = document.getElementById("accountlist");
    let defaultID;
    for (let acc in this.getAccounts()) {
      var elt = document.createElement("richlistitem");
      this.accountList.appendChild(elt);
      elt.build(acc);
      if (!defaultID && acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED)
        defaultID = acc.id;
    }
    addObservers(this, events);
    if (!this.accountList.getRowCount())
      // This is horrible, but it works. Otherwise (at least on mac)
      // the wizard is not centered relatively to the account manager
      setTimeout(function() { gAccountManager.new(); }, 0);
    else if (!defaultID)
      this.accountList.selectedIndex = 0;
    else
      this.selectAccount(defaultID);

    this.setAutoLoginNotification();

    this.accountList.addEventListener("keypress", this.onKeyPress, true);
    window.addEventListener("unload", this.unload, false);
  },
  unload: function am_unload() {
    removeObservers(gAccountManager, events);
  },
  observe: function am_observe(aObject, aTopic, aData) {
    if (aTopic == "purple-quit") {
      // libpurple is being uninitialized. We don't need the account
      // manager window anymore, close it.
      this.close();
      return;
    }
    else if (aTopic == "autologin-processed") {
      var notification = document.getElementById("accountsNotificationBox")
                                 .getNotificationWithValue("autoLoginStatus");
      if (notification)
        notification.close();
      return;
    }
    else if (aTopic == "network:offline-status-changed") {
      this.setOffline(aData == "offline");
      return;
    }

    if (!(aObject instanceof Ci.purpleIAccount))
      throw "Bad notification.";

    if (aTopic == "account-added") {
      var elt = document.createElement("richlistitem");
      this.accountList.appendChild(elt);
      elt.build(aObject);
      if (this.accountList.getRowCount() == 1)
        this.accountList.selectedIndex = 0;
    }
    else if (aTopic == "account-removed") {
      var elt = document.getElementById(aObject.id);
      if (!elt.selected) {
        this.accountList.removeChild(elt);
        return;
      }
      // The currently selected element is removed,
      // ensure another element gets selected (if the list is not empty)
      var selectedIndex = this.accountList.selectedIndex;
      // Prevent errors if the timer is active and the account deleted
      clearTimeout(this.disableTimerID);
      delete this.disableTimerID;
      this.accountList.removeChild(elt);
      var count = this.accountList.getRowCount();
      if (!count)
        return;
      if (selectedIndex == count)
        --selectedIndex;
      this.accountList.selectedIndex = selectedIndex;
    }
    else if (aTopic == "account-updated")
      document.getElementById(aObject.id).build(aObject);
    else if (aTopic == "account-connect-progress")
      document.getElementById(aObject.id).updateConnectionState();
    else if (aTopic == "account-connect-error")
      document.getElementById(aObject.id).updateConnectionError();
    else {
      const stateEvents = {
        "account-connected": "connected",
        "account-connecting": "connecting",
        "account-disconnected": "disconnected",
        "account-disconnecting": "disconnecting"
      };
      if (aTopic in stateEvents) {
        let elt = document.getElementById(aObject.id);
        if (aTopic == "account-connecting") {
          elt.icon.animate();
          elt.removeAttribute("error");
          elt.updateConnectionState();
        }
        else
          elt.icon.stop();

        elt.setAttribute("state", stateEvents[aTopic]);
      }
    }
  },
  cancelReconnection: function am_cancelReconnection() {
    this.accountList.selectedItem.cancelReconnection();
  },
  connect: function am_connect() {
    let account = this.accountList.selectedItem.account;
    if (account.disconnected) {
      let disconnect = document.getElementById("cmd_disconnect");
      disconnect.setAttribute("disabled", "true");
      this.restoreButtonTimer();
      account.connect();
    }
  },
  disconnect: function am_disconnect() {
    let account = this.accountList.selectedItem.account;
    if (account.connected || account.connecting) {
      let connect = document.getElementById("cmd_connect");
      connect.setAttribute("disabled", "true");
      this.restoreButtonTimer();
      account.disconnect();
    }
  },
  /* This function restores the disabled attribute of the currently visible
     button (and context menu item) after `this._disabledDelay` ms */
  restoreButtonTimer: function am_restoreButtonTimer() {
    clearTimeout(this.disableTimerID);
    this.accountList.focus();
    this.disableTimerID = setTimeout(function(aItem) {
      delete gAccountManager.disableTimerID;
      gAccountManager.disableCommandItems();
      aItem.buttons.setFocus();
    }, this._disabledDelay, this.accountList.selectedItem);
  },

  delete: function am_delete() {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                          .getService(Components.interfaces.nsIPrefBranch);

    var showPrompt = prefs.getBoolPref("messenger.accounts.promptOnDelete");
    if (showPrompt) {
      var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                              .getService(Components.interfaces.nsIPromptService);

      var bundle = document.getElementById("accountsBundle");
      var promptTitle    = bundle.getString("account.deletePrompt.title");
      var promptMessage  = bundle.getString("account.deletePrompt.message");
      var promptCheckbox = bundle.getString("account.deletePrompt.checkbox");
      var deleteButton   = bundle.getString("account.deletePrompt.button");

      var checkbox = {};
      var flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                  prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                  prompts.BUTTON_POS_1_DEFAULT;
      if (prompts.confirmEx(window, promptTitle, promptMessage, flags,
                            deleteButton, null, null, promptCheckbox, checkbox))
        return;

      if (checkbox.value)
        prefs.setBoolPref("messenger.accounts.promptOnDelete", false);
    }

    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    pcs.deleteAccount(this.accountList.selectedItem.id);
  },
  new: function am_new() {
    this.openDialog("chrome://instantbird/content/accountWizard.xul");
  },
  edit: function am_edit() {
    this.openDialog("chrome://instantbird/content/account.xul",
                    this.accountList.selectedItem.account);
  },
  autologin: function am_autologin() {
    var elt = this.accountList.selectedItem;
    elt.autoLogin = !elt.autoLogin;
  },
  close: function am_close() {
    // If a modal dialog is opened, we can't close this window now
    if (this.modalDialog)
      setTimeout(function() { window.close();}, 0);
    else
      window.close();
  },

  /* This function disables or enables the currently selected button and
     the corresponding context menu item */
  disableCommandItems: function am_disableCommandItems() {
    let selectedItem = this.accountList.selectedItem;
    // When opening the account manager, if accounts have errors, we
    // can be called during build(), before any item is selected.
    // In this case, just return early.
    if (!selectedItem)
      return;

    // If the timer that disables the button (for a short time) already exists,
    // we don't want to interfere and set the button as enabled.
    if (this.disableTimerID)
      return;

    let account = selectedItem.account;
    let activeCommandName = account.disconnected ? "connect" : "disconnect";
    let activeCommandElt = document.getElementById("cmd_" + activeCommandName);
    if (this.isOffline ||
        (account.disconnected &&
         account.connectionErrorReason == Ci.purpleIAccount.ERROR_UNKNOWN_PRPL))
      activeCommandElt.setAttribute("disabled", "true");
    else
      activeCommandElt.removeAttribute("disabled");
  },
  onContextMenuShowing: function am_onContextMenuShowing() {
    let targetElt = document.popupNode;
    let isAccount = targetElt instanceof Ci.nsIDOMXULSelectControlItemElement;
    document.getElementById("contextAccountsItems").hidden = !isAccount;
    if (isAccount) {
       /* we want to hide either "connect" or "disconnect" depending on the
          context and we can't use the broadcast of the command element here
          because the item already observes "contextAccountsItems" */
      let itemNameToHide, itemNameToShow;
      if (targetElt.account.disconnected)
        [itemNameToHide, itemNameToShow] = ["disconnect",  "connect"];
      else
        [itemNameToHide, itemNameToShow] = ["connect", "disconnect"];
      document.getElementById("context_" + itemNameToHide).hidden = true;
      document.getElementById("context_" + itemNameToShow).hidden = false;

      document.getElementById("context_cancelReconnection").hidden =
        !targetElt.hasAttribute("reconnectPending");
    }
  },

  selectAccount: function am_selectAccount(aAccountId) {
    this.accountList.selectedItem = document.getElementById(aAccountId);
    this.accountList.ensureSelectedElementIsVisible();
  },
  onAccountSelect: function am_onAccountSelect() {
    clearTimeout(this.disableTimerID);
    delete this.disableTimerID;
    this.disableCommandItems();
    // Horrible hack here too, see Bug 177
    setTimeout(function(aThis) {
      try {
        aThis.accountList.selectedItem.buttons.setFocus();
      } catch (e) {
        /* Sometimes if the user goes too fast with VK_UP or VK_DOWN, the
           selectedItem doesn't have the expected binding attached */
      }
    }, 0, this);
  },

  onKeyPress: function am_onKeyPress(event) {
    // As we stop propagation, the default action applies to the richlistbox
    // so that the selected account is changed with this default action
    if (event.keyCode == event.DOM_VK_DOWN) {
      if (this.selectedIndex < this.itemCount - 1)
        this.ensureIndexIsVisible(this.selectedIndex + 1);
      event.stopPropagation();
      return;
    }

    if (event.keyCode == event.DOM_VK_UP) {
      if (this.selectedIndex > 0)
        this.ensureIndexIsVisible(this.selectedIndex - 1);
      event.stopPropagation();
      return;
    }

    if (event.keyCode == event.DOM_VK_RETURN) {
      let target = event.originalTarget;
      if (target.localName != "checkbox" &&
          (target.localName != "button" ||
           /^(dis)?connect$/.test(target.getAttribute("anonid"))))
        this.selectedItem.buttons.proceedDefaultAction();
      return;
    }

    if (event.keyCode == event.DOM_VK_DELETE)
       document.getElementById("cmd_delete").doCommand();
  },

  getAccounts: function am_getAccounts() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    return getIter(pcs.getAccounts());
  },

  openDialog: function am_openDialog(aUrl, aArgs) {
    this.modalDialog = true;
    window.openDialog(aUrl, "", "chrome,modal,titlebar,centerscreen", aArgs);
    this.modalDialog = false;
  },
  setAutoLoginNotification: function am_setAutoLoginNotification() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    var autoLoginStatus = pcs.autoLoginStatus;
    let isOffline = false;
    let crashCount = 0;
    for (let acc in this.getAccounts())
      if (acc.autoLogin && acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED)
        ++crashCount;

    if (autoLoginStatus == pcs.AUTOLOGIN_ENABLED && crashCount == 0) {
      this.setOffline(isOffline);
      return;
    }

    var bundle = document.getElementById("accountsBundle");
    var box = document.getElementById("accountsNotificationBox");
    var priority = box.PRIORITY_INFO_HIGH;
    var connectNowButton = {
      accessKey: bundle.getString("accountsManager.notification.button.accessKey"),
      callback: this.processAutoLogin,
      label: bundle.getString("accountsManager.notification.button.label")
    };
    var label;

    switch (autoLoginStatus) {
      case pcs.AUTOLOGIN_USER_DISABLED:
        label = bundle.getString("accountsManager.notification.userDisabled.label");
        break;

      case pcs.AUTOLOGIN_SAFE_MODE:
        label = bundle.getString("accountsManager.notification.safeMode.label");
        break;

      case pcs.AUTOLOGIN_START_OFFLINE:
        label = bundle.getString("accountsManager.notification.startOffline.label");
        isOffline = true;
        break;

      case pcs.AUTOLOGIN_CRASH:
        label = bundle.getString("accountsManager.notification.crash.label");
        priority = box.PRIORITY_WARNING_MEDIUM;
        break;

      /* One or more accounts made the application crash during their connection.
         If none, this function has already returned */
      case pcs.AUTOLOGIN_ENABLED:
        if (!("PluralForm" in window))
          Components.utils.import("resource://gre/modules/PluralForm.jsm");
        label = bundle.getString("accountsManager.notification.singleCrash.label");
        label = PluralForm.get(crashCount, label).replace("#1", crashCount);
        priority = box.PRIORITY_WARNING_MEDIUM;
        connectNowButton.callback = this.processCrashedAccountsLogin;
        break;

      default:
        label = bundle.getString("accountsManager.notification.other.label");
    }
    this.setOffline(isOffline);

    box.appendNotification(label, "autologinStatus", null, priority, [connectNowButton]);
  },
  processAutoLogin: function am_processAutoLogin() {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService2);
    if (ioService.offline) {
      ioService.manageOfflineStatus = false;
      ioService.offline = false;
    }

    Components.classes["@instantbird.org/purple/core;1"]
              .getService(Ci.purpleICoreService)
              .processAutoLogin();

    gAccountManager.accountList.selectedItem.buttons.setFocus();
  },
  processCrashedAccountsLogin: function am_processCrashedAccountsLogin() {
    for (let acc in gAccountManager.getAccounts())
      if (acc.disconnected && acc.autoLogin &&
          acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED)
        acc.connect();

    let notification = document.getElementById("accountsNotificationBox")
                               .getNotificationWithValue("autoLoginStatus");
    if (notification)
      notification.close();

    gAccountManager.accountList.selectedItem.buttons.setFocus();
  },
  setOffline: function am_setOffline(aState) {
    this.isOffline = aState;
    if (aState)
      this.accountList.setAttribute("offline", "true");
    else
      this.accountList.removeAttribute("offline");
    this.disableCommandItems();
  }
};
