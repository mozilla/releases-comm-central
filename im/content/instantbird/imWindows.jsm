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
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
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

const CONVERSATION_WINDOW_URI = "chrome://instantbird/content/instantbird.xul";
var EXPORTED_SYMBOLS = ["Conversations"];

var Conversations = {
#ifdef XP_MACOSX
  _badgeTimeout: null,
  _showDockBadgePrefName: "messenger.options.showUnreadCountInDock",
  get dockBadgeService() {
    let badgeService =
      Components.classes["@instantbird.org/purple/nsdockbadgeservice;1"]
                .getService(Components.interfaces.nsIDockBadgeService);
    delete this.dockBadgeService;
    return this.dockBadgeService = badgeService;
  },
  _showUnreadCount: function c_showUnreadCount() {
    let text = Conversations._unreadCount || "";
    Conversations.dockBadgeService.badgeText = text;
  },
  _displayUnreadCountInDockBadge: function c_displayUnreadCountInDockBadge() {
    if (!this._prefBranch.getBoolPref(this._showDockBadgePrefName))
      return;

    if (this._unreadCount == 1 &&
        this._prefBranch.getBoolPref(this._getAttentionPrefName))
      // We use a timeout because it looks better to add the dock
      // badge only after the dock item has stopped jumping.
      this._badgeTimeout =
        this._windows[0].setTimeout(function () {
          Conversations._badgeTimeout = null;
          Conversations._showUnreadCount();
        }, 1000);
    else
      if (!this._badgeTimeout)
        this._showUnreadCount();
  },
  _hideUnreadCountDockBadge: function c_hideUnreadCountDockBadge() {
    if (this._badgeTimeout) {
      this._windows[0].clearTimeout(this._badgeTimeout);
      this._badgeTimeout = null;
    }
    else
      this.dockBadgeService.badgeText = "";
  },
#endif
  _unreadCount: 0,
  _incrementUnreadCount: function c_incrementUnreadCount() {
    this._unreadCount++;
#ifdef XP_MACOSX
    this._displayUnreadCountInDockBadge();
#endif
  },
  _clearUnreadCount: function c_clearUnreadCount() {
    if (!this._unreadCount)
      return;

    this._unreadCount = 0;
#ifdef XP_MACOSX
    this._hideUnreadCountDockBadge();
#endif
  },
  _windows: [],
  _getAttentionPrefName: "messenger.options.getAttentionOnNewMessages",
  _textboxAutoResizePrefName: "messenger.conversations.textbox.autoResize",
  get _prefBranch () {
    delete this._prefBranch;
    return this._prefBranch =
      Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefBranch2);
  },
  textboxAutoResize: function() {
    delete this.textboxAutoResize;
    return this.textboxAutoResize =
      this._prefBranch.getBoolPref(this._textboxAutoResizePrefName);
  },
  registerWindow: function(aWindow) {
    if (this._windows.indexOf(aWindow) == -1)
      this._windows.unshift(aWindow);

    if (this._pendingNotifications) {
      this._pendingNotifications.forEach(function(aNotif) {
        this.observe(aNotif.object, aNotif.topic, aNotif.msg);
      }, this);
      delete this._pendingNotifications;
    }
  },
  unregisterWindow: function(aWindow) {
    let index = this._windows.indexOf(aWindow);
    if (index != -1)
      this._windows.splice(index, 1);
  },

  _purpleConv: {},
  _conversations: [],
  registerConversation: function(aConversation) {
    if (this._conversations.indexOf(aConversation) == -1)
      this._conversations.push(aConversation);

    this._purpleConv[aConversation.conv.id] = aConversation;
  },
  unregisterConversation: function(aConversation) {
    let index = this._conversations.indexOf(aConversation);
    if (index != -1)
      this._conversations.splice(index, 1);

    if (this._purpleConv[aConversation.conv.id] == aConversation)
      delete this._purpleConv[aConversation.conv.id];
  },

  focusConversation: function(aConv) {
    let id = aConv.id;
    if (id in this._purpleConv) {
      let conv = this._purpleConv[id];
      let doc = conv.ownerDocument;
      doc.getElementById("conversations").selectedTab = conv.tab;
      conv.focus();
      doc.defaultView.focus();
    }
  },

  _onQuitRequest: function (aCancelQuit, aQuitType) {
    // The request has already been canceled somewhere else
    if ((aCancelQuit instanceof Components.interfaces.nsISupportsPRBool)
         && aCancelQuit.data)
      return;

    if (!this._prefBranch.getBoolPref("messenger.warnOnQuit"))
      return;

    let unreadConvsCount = this._conversations.filter(function(conv) {
      let tab = conv.tab;
      return tab.hasAttribute("unread") &&
             (!tab.hasAttribute("chat") || tab.hasAttribute("attention"));
    }).length;

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

    Components.utils.import("resource://gre/modules/PluralForm.jsm");
    promptMessage = PluralForm.get(unreadConvsCount, promptMessage)
                              .replace("#1", unreadConvsCount);

    let prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    let flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                prompts.BUTTON_POS_1_DEFAULT;
    let checkbox = {value: false};
    if (prompts.confirmEx(this._windows[0], promptTitle, promptMessage, flags,
                          button, null, null, promptCheckbox, checkbox)) {
      aCancelQuit.data = true;
      return;
    }

    if (checkbox.value)
      this._prefBranch.setBoolPref("messenger.warnOnQuit", false);
  },

  onWindowFocus: function (aWindow) {
    let position = this._windows.indexOf(aWindow);
    if (position != -1) {
      this._windows.splice(position, 1);
      this._windows.unshift(aWindow);
    }
    this._clearUnreadCount();
  },

  init: function() {
    let os = Components.classes["@mozilla.org/observer-service;1"]
                       .getService(Components.interfaces.nsIObserverService);
    ["new-text",
     "new-conversation",
     "purple-quit",
     "quit-application-requested"].forEach(function (aTopic) {
      os.addObserver(Conversations, aTopic, false);
    });
    this._prefBranch.addObserver(this._textboxAutoResizePrefName, this, false);
#ifdef XP_MACOSX
    this._prefBranch.addObserver(this._showDockBadgePrefName, this, false);
#endif
  },

  observe: function(aSubject, aTopic, aMsg) {
    if (aTopic == "quit-application-requested") {
      this._onQuitRequest(aSubject, aMsg);
      return;
    }

    if (aTopic == "purple-quit") {
      for (let id in this._purpleConv)
        this._purpleConv[id].unInit();
      this._prefBranch.removeObserver(Conversations._textboxAutoResizePrefName,
                                      Conversations);
#ifdef XP_MACOSX
      this._prefBranch.removeObserver(Conversations._showDockBadgePrefName,
                                      Conversations);
#endif
    }

    if (aTopic == "nsPref:changed") {
      if (aMsg == this._textboxAutoResizePrefName)
        this.textboxAutoResize = this._prefBranch.getBoolPref(aMsg);
#ifdef XP_MACOSX
      if (aMsg == this._showDockBadgePrefName) {
        if (this._prefBranch.getBoolPref(aMsg))
          this._showUnreadCount();
        else
          this._hideUnreadCountDockBadge();
      }
#endif
      return;
    }

    if (aTopic != "new-text" && aTopic != "new-conversation")
      return;

    if (!this._windows.length) {
      if (this._pendingNotifications) {
        this._pendingNotifications.push({object: aSubject, topic: aTopic,
                                         msg: aMsg});
        return;
      }

      var wwatch = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
                             .getService(Components.interfaces.nsIWindowWatcher);
      wwatch.openWindow(null, CONVERSATION_WINDOW_URI, "_blank",
                        "chrome,toolbar,resizable", null);
      this._pendingNotifications = [{object: aSubject, topic: aTopic, msg: aMsg}];
      return;
    }

    let conv = aTopic == "new-conversation" ? aSubject : aSubject.conversation;
    if (!(conv.id in this._purpleConv)) {
      this._windows[0].document.getElementById("conversations")
          .addConversation(conv);
    }

    if (aTopic == "new-text") {
      let conv = this._purpleConv[aSubject.conversation.id];
      if (!conv.loaded)
        conv.addMsg(aSubject);
      if (aSubject.incoming && !aSubject.system &&
          (!(aSubject.conversation instanceof Components.interfaces.purpleIConvChat) ||
           aSubject.containsNick)) {
        if (this._prefBranch.getBoolPref(this._getAttentionPrefName))
          conv.ownerDocument.defaultView.getAttention();
        if (!this._windows[0].document.hasFocus())
          this._incrementUnreadCount();
      }
    }
  }
};
