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
 *   Romain Bezut <romain@bezut.info>
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

const EXPORTED_SYMBOLS = ["Core"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imWindows.jsm");
Cu.import("resource:///modules/ibNotifications.jsm");
Cu.import("resource:///modules/ibSounds.jsm");

var Core = {
  _events: [
    "account-connected",
    "account-disconnected",
    "browser-request",
    "quit-application-requested"
  ],

  init: function() {
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

    if (!Ci.purpleICoreService) {
      this._promptError("startupFailure.purplexpcomFileError");
      return false;
    }

    if (!Components.classes["@instantbird.org/purple/core;1"]) {
      this._promptError("startupFailure.xpcomRegistrationError");
      return false;
    }

    try {
      var pcs = Services.core;
      pcs.init();
    }
    catch (e) {
      this._promptError("startupFailure.purplexpcomInitError", e);
      return false;
    }

    if (!pcs.version) {
      this._promptError("startupFailure.libpurpleError");
      return false;
    }

    if (!pcs.getProtocols().hasMoreElements()) {
      this._promptError("startupFailure.noProtocolLoaded");
      this.uninitPurpleCore();
      return false;
    }

    Services.conversations.initConversations();
    Conversations.init();
    Notifications.init();
    Sounds.init();
#ifdef XP_WIN
    // For windows seven, initialize the jump list module.
    const WINTASKBAR_CONTRACTID = "@mozilla.org/windows-taskbar;1";
    if (WINTASKBAR_CONTRACTID in Cc &&
        Cc[WINTASKBAR_CONTRACTID].getService(Ci.nsIWinTaskbar).available) {
      let temp = {};
      Cu.import("resource:///modules/ibWinJumpList.jsm", temp);
      temp.WinJumpList.init();
    }
#endif

    this._events.forEach(function (aTopic) {
      Services.obs.addObserver(Core, aTopic, false);
    });

    this._showAccountManagerIfNeeded(true);
    return true;
  },

  showWindow: function(aWindowType, aUrl, aName, aFeatures) {
    var win = Services.wm.getMostRecentWindow(aWindowType);
    if (win)
      win.focus();
    else
      win = Services.ww.openWindow(null, aUrl, aName, aFeatures, null);
    return win;
  },

  showAccounts: function() {
    this.showWindow("Messenger:Accounts",
                    "chrome://instantbird/content/accounts.xul", "Accounts",
                    "chrome,resizable,centerscreen");
  },
  showAddons: function() {
    this.showWindow("Addons:Manager",
                    "chrome://instantbird/content/extensions.xul", "Addons",
                    "chrome,menubar,extrachrome,toolbar,dialog=no,resizable,centerscreen");
  },
  showContacts: function() {
    this.showWindow("Messenger:blist",
                    "chrome://instantbird/content/blist.xul", "Contacts",
                    "chrome,dialog=no,all");
  },
  showPreferences: function() {
    this.showWindow("Messenger:Preferences",
                    "chrome://instantbird/content/preferences/preferences.xul",
                    "Preferences",
                    "chrome,titlebar,toolbar,centerscreen,dialog=no");
  },
  showUpdates: function() {
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

  getIter: function(aEnumerator) {
    while (aEnumerator.hasMoreElements())
      yield aEnumerator.getNext();
  },
  getAccounts: function() this.getIter(Services.core.getAccounts()),

  /* This function pops up the account manager if no account is
   * connected or connecting.
   * When called during startup (aIsStarting == true), it will also
   * look for crashed accounts.
   */
  _showAccountManagerIfNeeded: function (aIsStarting) {
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
      this.showAccounts();
  },

  observe: function(aSubject, aTopic, aMsg) {
    if (aTopic == "account-connected") {
      let account = aSubject.QueryInterface(Components.interfaces.purpleIAccount);
      if (!account.canJoinChat)
        return;

      let pref = "messenger.account." + account.id + ".autoJoin";
      if (Services.prefs.prefHasUserValue(pref)) {
        let autojoin = Services.prefs.getCharPref(pref);
        if (autojoin) {
          autojoin = autojoin.split(",");
          for (let i = 0; i < autojoin.length; ++i) {
            let values = account.getChatRoomDefaultFieldValues(autojoin[i]);
            account.joinChat(values);
          }
        }
      }
      return;
    }

    if (aTopic == "account-disconnected") {
      let account = aSubject.QueryInterface(Ci.purpleIAccount);
      if (account.reconnectAttempt <= 1)
        this._showAccountManagerIfNeeded(false);
      return;
    }

    if (aTopic == "browser-request") {
      Services.ww.openWindow(null,
                             "chrome://instantbird/content/browserRequest.xul",
                             null, "chrome", aSubject);
      return;
    }

    if (aTopic == "quit-application-requested") {
      this._onQuitRequest(aSubject, aMsg);
      return;
    }
  },

  uninit: function() {
    try {
      Services.core.quit();
    }
    catch (e) {
      Services.prompt.alert(null, "Shutdown Error",
                            "An error occurred while shutting down purplexpcom: " + e);
    }
  },

  _onQuitRequest: function (aCancelQuit, aQuitType) {
    // The request has already been canceled somewhere else
    if ((aCancelQuit instanceof Components.interfaces.nsISupportsPRBool)
         && aCancelQuit.data)
      return;

    if (!Services.prefs.getBoolPref("messenger.warnOnQuit"))
      return;

    let unreadConvsCount =
      Services.conversations.getUIConversations()
              .filter(function(c) c.unreadTargetedMessageCount)
              .length;
    if (unreadConvsCount == 0)
      return;

    let bundle =
      Services.strings.createBundle("chrome://instantbird/locale/quitDialog.properties");
    let promptTitle    = bundle.GetStringFromName("dialogTitle");
    let promptMessage  = bundle.GetStringFromName("message");
    let promptCheckbox = bundle.GetStringFromName("checkbox");
    let action         = aQuitType == "restart" ? "restart" : "quit";
    let button         = bundle.GetStringFromName(action + "Button");

    Components.utils.import("resource://gre/modules/PluralForm.jsm");
    promptMessage = PluralForm.get(unreadConvsCount, promptMessage)
                              .replace("#1", unreadConvsCount);

    let prompts = Services.prompt;
    let flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                prompts.BUTTON_POS_1_DEFAULT;
    let checkbox = {value: false};
    let convWindow = Services.wm.getMostRecentWindow("Messenger:convs");
    if (prompts.confirmEx(convWindow, promptTitle, promptMessage, flags,
                          button, null, null, promptCheckbox, checkbox)) {
      aCancelQuit.data = true;
      return;
    }

    if (checkbox.value)
      Services.prefs.setBoolPref("messenger.warnOnQuit", false);
  },

  _promptError: function(aKeyString, aMessage) {
    var bundle =
      Services.strings.createBundle("chrome://instantbird/locale/core.properties");

    var title = bundle.GetStringFromName("startupFailure.title");
    var message =
      bundle.GetStringFromName("startupFailure.apologize") + "\n\n" +
      (aMessage ? bundle.formatStringFromName(aKeyString, [aMessage], 1)
                : bundle.GetStringFromName(aKeyString)) + "\n\n" +
      bundle.GetStringFromName("startupFailure.update");
    const nsIPromptService = Components.interfaces.nsIPromptService;
    const flags =
      nsIPromptService.BUTTON_POS_1 * nsIPromptService.BUTTON_TITLE_IS_STRING +
      nsIPromptService.BUTTON_POS_0 * nsIPromptService.BUTTON_TITLE_IS_STRING;

    var prompts = Services.prompt;
    if (!prompts.confirmEx(null, title, message, flags,
                           bundle.GetStringFromName("startupFailure.buttonUpdate"),
                           bundle.GetStringFromName("startupFailure.buttonClose"),
                           null, null, {}))
      this.showUpdates();
  }
};
