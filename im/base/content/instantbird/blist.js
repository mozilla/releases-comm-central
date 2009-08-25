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
                "buddy-signed-off",
                "buddy-removed",
                "buddy-away",
                "buddy-idle",
                "account-connected",
                "account-disconnected",
                "new-text",
                "new-conversation",
                "status-away",
                "status-back",
                "purple-quit",
                "quit-application-requested"];

const autoJoinPref = "autoJoin";

var buddyList = {
  observe: function bl_observe(aBuddy, aTopic, aMsg) {
    //dump("received signal: " + aTopic + "\n");

    if (aTopic == "quit-application-requested") {
      this._onQuitRequest(aBuddy, aMsg);
      return;
    }

    if (aTopic == "purple-quit") {
      window.close();
      return;
    }

    if (aTopic == "status-away") {
      // display the notification on the buddy list
      var nbox = document.getElementById("buddyListMsg");
      var notification = nbox.getNotificationWithValue("away-message");
      if (notification) {
        notification.label = aMsg;
        return;
      }
      var buttons = [{
        accessKey: "",
        label: document.getElementById("awayBundle").getString("away.back.button"),
        popup: null,
        callback: function() {
          Components.classes["@instantbird.org/purple/core;1"]
                    .getService(Components.interfaces.purpleICoreService)
                    .back(null);
        }
      }];
      notification = nbox.appendNotification(aMsg, "away-message",
                                             "chrome://instantbird/skin/away-16.png",
                                             nbox.PRIORITY_INFO_MEDIUM, buttons);
      notification.setAttribute("hideclose", "true");
      document.getElementById("getAwayMenuItem").disabled = true;
      return;
    }

    if (aTopic == "status-back") {
      var nbox = document.getElementById("buddyListMsg");
      var notification = nbox.getNotificationWithValue("away-message");
      if (notification)
        nbox.removeNotification(notification);

      document.getElementById("getAwayMenuItem").disabled = false;
      return;
    }

    if (aTopic == "new-text" || aTopic == "new-conversation") {
      if (!this.win) {
        this.win = window.open(convWindow, "Conversations", "chrome,resizable");
        this.win.pendingNotifications = [{object: aBuddy, topic: aTopic, msg: aMsg}];
        this.win.addEventListener("unload", function(aEvent) {
          if (aEvent.target.location.href == convWindow)
            buddyList.win = null;
        }, false);
      }
      else if ("pendingNotifications" in this.win)
        this.win.pendingNotifications.push({object: aBuddy, topic: aTopic, msg: aMsg});

      return;
    }

    if (aTopic == "account-connected" || aTopic == "account-disconnected") {
      var account = aBuddy.QueryInterface(Ci.purpleIAccount);
      if (account.protocol.id == "prpl-irc") {
        this.checkForIrcAccount();
        if (aTopic == "account-connected") {
          var branch = Components.classes["@mozilla.org/preferences-service;1"]
                                 .getService(Ci.nsIPrefService)
                                 .getBranch("messenger.account." +
                                            account.id + ".");
          if (branch.prefHasUserValue(autoJoinPref)) {
            var autojoin = branch.getCharPref(autoJoinPref);
            if (autojoin) {
              autojoin = autojoin.split(",");
              for (var i = 0; i < autojoin.length; ++i)
                account.joinChat(autojoin[i]);
            }
          }
        }
      }
      this.checkNotDisconnected();
      return;
    }

    var pab = aBuddy.QueryInterface(Ci.purpleIAccountBuddy);
    var group = pab.tag;
    var groupId = "group" + group.id;
    var groupElt = document.getElementById(groupId);
    if (aTopic == "buddy-signed-on") {
      if (!groupElt) {
        groupElt = document.createElement("group");
        var parent = document.getElementById("buddylistbox");
        parent.appendChild(groupElt);
        groupElt.build(group);
      }
      groupElt.addBuddy(pab);
      return;
    }

    if (!groupElt) {
      // Ignore weird signals from libpurple. These seem to come
      // mostly from the oscar prpl.
      return;
    }

    if (aTopic == "buddy-signed-off" || aTopic == "buddy-removed")
      groupElt.signedOff(pab);

    if (aTopic == "buddy-idle" || aTopic == "buddy-away")
      groupElt.updateBuddy(pab);
  },

  getAccounts: function bl_getAccounts() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    return getIter(pcs.getAccounts());
  },
  /* This function is called with aIsStarting = true when the application starts
     (in this case the crashed accounts are checked), and when an account is
     connected or disconnected (without parameter), so that it only checks if
     there is a connected account. */
  checkNotDisconnected: function bl_checkNotDisconnected(aIsStarting) {
    var addBuddyItem = document.getElementById("addBuddyMenuItem");

    let hasActiveAccount = false;
    let hasCrachedAccount = false;
    for (let acc in this.getAccounts()) {
      if (acc.connected || acc.connecting) {
        if (acc.connected)
          addBuddyItem.disabled = false;
        hasActiveAccount = true;
      }

      // We only check for crashed accounts on startup.
      if (aIsStarting && acc.autoLogin &&
          acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED)
        hasCrachedAccount = true;
    }

    /* We only display the account manager on startup if an account has crashed
       or if all accounts are disconnected
       In case of connection failure after an automatic reconnection attempt,
       we don't want to popup the account manager */
    if ((!addBuddyItem.disabled && !hasActiveAccount) ||
        (aIsStarting && hasCrachedAccount))
      menus.accounts();

    if (!hasActiveAccount)
      addBuddyItem.disabled = true;
  },
  checkForIrcAccount: function bl_checkForIrcAccount() {
    var joinChatItem = document.getElementById("joinChatMenuItem");

    for (let acc in this.getAccounts())
      if (acc.connected && acc.protocol.id == "prpl-irc") {
        joinChatItem.disabled = false;
        return;
      }

    joinChatItem.disabled = true;
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

    // add observers before we initialize libpurple, otherwise we may
    // miss some notifications (this happened at least with the nullprpl)
    addObservers(buddyList, events);

    if (!initPurpleCore()) {
      window.close();
      return;
    }

    buddyList.checkNotDisconnected(true);
    buddyList.checkForIrcAccount();
    this.addEventListener("unload", buddyList.unload, false);
    this.addEventListener("close", buddyList.close, false);
  },
  unload: function bl_unload() {
    removeObservers(buddyList, events);
    uninitPurpleCore();
   },

  close: function bl_close(event) {
    event.preventDefault();
    goQuitApplication();
  },

  getAway: function bl_getAway() {
    // prompt the user to enter an away message
    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                           .getService(Components.interfaces.nsIPromptService);
    var bundle = document.getElementById("awayBundle");
    var message = {value: bundle.getString("away.default.message")};
    if (!prompts.prompt(window, bundle.getString("away.prompt.title"),
                        bundle.getString("away.prompt.message"), message,
                        null, {value: false}))
      return; // the user canceled

    // actually get away
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Components.interfaces.purpleICoreService);
    pcs.away(message.value);
  },

  // Handle key pressing
  keyPress: function bl_keyPress(aEvent) {
    var item = document.getElementById("buddylistbox").selectedItem;
    if (!item) // the list is empty
      return;

    switch (aEvent.keyCode) {
      // If Enter or Return is pressed, open a new conversation
      case aEvent.DOM_VK_RETURN:
      case aEvent.DOM_VK_ENTER:
        if (item.localName == "buddy")
          item.openConversation();
        else if (item.localName == "group")
          item.close();
        break;

      case aEvent.DOM_VK_LEFT:
        if (item.localName == "group" && !item.hasAttribute("closed"))
          item.close();
        break;

      case aEvent.DOM_VK_RIGHT:
        if (item.localName == "group" && item.hasAttribute("closed"))
          item.close();
        break;
    }
  },

  _onQuitRequest: function (aCancelQuit, aQuitType) {
    // The request has already been canceled somewhere else
    if ((aCancelQuit instanceof Ci.nsISupportsPRBool) && aCancelQuit.data)
      return;

    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                          .getService(Components.interfaces.nsIPrefBranch);
    if (!prefs.getBoolPref("messenger.warnOnQuit"))
      return;

    let unreadConvsCount = 0;
    let attachedWindow;

    // We would like the windows to be sorted by Z-Order
    // See Bugs 156333 and 450576 on mozilla about getZOrderDOMWindowEnumerator
    let enumerator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                               .getService(Components.interfaces.nsIWindowMediator)
                               .getEnumerator("Messenger:convs");
    while (enumerator.hasMoreElements()) {
      let convWindow = enumerator.getNext();
      let tabs = convWindow.document.getElementById("tabs");
      let panels = convWindow.document.getElementById("panels");
      if (tabs) {
        for (let i = 0; i < tabs.itemCount; ++i) {
          let tab = tabs.getItemAtIndex(i);
          let panel = panels.children[i];
          // For chats: attention, for simple conversations: unread
          if (tab.hasAttribute("unread") &&
              (!panel.hasAttribute("chat") || tab.hasAttribute("attention"))) {
            ++unreadConvsCount;
            attachedWindow = convWindow;
          }
        }
      }
    }

    if (unreadConvsCount == 0)
      return;

    let bundle =
      Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService)
                .createBundle("chrome://instantbird/locale/quitDialog.properties");
    let promptTitle    = bundle.GetStringFromName("dialogTitle");
    let promptMessage  = bundle.GetStringFromName("message");
    let promptCheckbox = bundle.GetStringFromName("checkbox");
    let action         = aQuitType == "restart" ? "restart" : "quit";
    let button         = bundle.GetStringFromName(action + "Button");

    if (!("PluralForm" in window))
      Components.utils.import("resource://gre/modules/PluralForm.jsm");
    promptMessage = PluralForm.get(unreadConvsCount, promptMessage)
                              .replace("#1", unreadConvsCount);

    let prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    let flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                prompts.BUTTON_POS_1_DEFAULT;
    let checkbox = {value: false};
    if (prompts.confirmEx(attachedWindow, promptTitle, promptMessage, flags,
                          button, null, null, promptCheckbox, checkbox)) {
      aCancelQuit.data = true;
      return;
    }

    if (checkbox.value)
      prefs.setBoolPref("messenger.warnOnQuit", false);
  }
};

this.addEventListener("load", buddyList.load, false);
