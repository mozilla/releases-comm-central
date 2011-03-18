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

Components.utils.import("resource:///modules/imServices.jsm");

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
    if (!Services.prefs.getBoolPref(this._showDockBadgePrefName))
      return;

    if (this._unreadCount == 1 &&
        Services.prefs.getBoolPref(this._getAttentionPrefName))
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
  registerWindow: function(aWindow) {
    if (this._windows.indexOf(aWindow) == -1)
      this._windows.unshift(aWindow);

    if (this._pendingNotifications) {
      // Cache in a variable and delete the existing notification array
      // before redispatching the notifications so that the observe
      // method can recreate it.
      let notifications = this._pendingNotifications;
      delete this._pendingNotifications;
      notifications.forEach(function(aNotif) {
        this.observe(aNotif.object, aNotif.topic, aNotif.msg);
      }, this);
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

  isConversationWindowFocused: function()
    this._windows.length > 0 && this._windows[0].document.hasFocus(),
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

  get unreadConvsCount() {
    return this._conversations.filter(function(conv) {
      let tab = conv.tab;
      return tab.hasAttribute("unread") &&
             (!tab.hasAttribute("chat") || tab.hasAttribute("attention"));
    }).length;
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
    let os = Services.obs;
    ["new-text",
     "new-conversation",
     "purple-quit"].forEach(function (aTopic) {
      os.addObserver(Conversations, aTopic, false);
    });
#ifdef XP_MACOSX
    Services.prefs.addObserver(this._showDockBadgePrefName, this, false);
#endif
  },

  observe: function(aSubject, aTopic, aMsg) {
    if (aTopic == "purple-quit") {
      for (let id in this._purpleConv)
        this._purpleConv[id].unInit();
#ifdef XP_MACOSX
      Services.prefs.removeObserver(Conversations._showDockBadgePrefName,
                                    Conversations);
#endif
    }

#ifdef XP_MACOSX
    if (aTopic == "nsPref:changed") {
      if (aMsg == this._showDockBadgePrefName) {
        if (Services.prefs.getBoolPref(aMsg))
          this._showUnreadCount();
        else
          this._hideUnreadCountDockBadge();
      }
      return;
    }
#endif

    if (aTopic != "new-text" && aTopic != "new-conversation")
      return;

    let conv = aTopic == "new-conversation" ? aSubject : aSubject.conversation;
    if (!(conv.id in this._purpleConv)) {
      // The conversation is not displayed anywhere yet.
      // First, check if an existing conversation window can accept it.
      for each (let win in this._windows)
        if (win.document.getElementById("conversations").addConversation(conv))
          return;

      // At this point, no existing registered window can accept the conversation.
      // If we are already creating a window, append the notification.
      if (this._pendingNotifications) {
        this._pendingNotifications.push({object: aSubject, topic: aTopic,
                                         msg: aMsg});
        return;
      }

      // We need to create a new window.
      Services.ww.openWindow(null, CONVERSATION_WINDOW_URI, "_blank",
                             "chrome,toolbar,resizable", null);
      this._pendingNotifications = [{object: aSubject, topic: aTopic, msg: aMsg}];
      return;
    }

    if (aTopic == "new-text") {
      let conv = this._purpleConv[aSubject.conversation.id];
      if (!conv.loaded)
        conv.addMsg(aSubject);
      if (aSubject.incoming && !aSubject.system &&
          (!aSubject.conversation.isChat || aSubject.containsNick)) {
        if (Services.prefs.getBoolPref(this._getAttentionPrefName))
          conv.ownerDocument.defaultView.getAttention();
        if (!this.isConversationWindowFocused())
          this._incrementUnreadCount();
      }
    }
  }
};
