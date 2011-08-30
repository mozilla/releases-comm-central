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
  _unreadCount: 0,
  get unreadCount() this._unreadCount,
  set unreadCount(val) {
    if (val == this._unreadCount)
      return val;
    Services.obs.notifyObservers(null, "unread-im-count-changed", val);
    return (this._unreadCount = val);
  },
  _windows: [],
  registerWindow: function(aWindow) {
    if (this._windows.indexOf(aWindow) == -1)
      this._windows.unshift(aWindow);

    if (this._pendingConversations) {
      // Cache in a variable and delete the existing notification array
      // before redispatching the notifications so that the observe
      // method can recreate it.
      let notifications = this._pendingConversations;
      this._pendingConversations = null;
      for each (let conv in notifications)
        this.observe(conv, "new-ui-conversation");
    }
  },
  unregisterWindow: function(aWindow) {
    let index = this._windows.indexOf(aWindow);
    if (index != -1)
      this._windows.splice(index, 1);
  },

  _uiConv: {},
  _conversations: [],
  registerConversation: function(aConversation) {
    if (this._conversations.indexOf(aConversation) == -1)
      this._conversations.push(aConversation);

    this._uiConv[aConversation.conv.id] = aConversation;
  },
  unregisterConversation: function(aConversation) {
    let index = this._conversations.indexOf(aConversation);
    if (index != -1)
      this._conversations.splice(index, 1);

    let uiConv = aConversation.conv;
    if (this._uiConv[uiConv.id] == aConversation) {
      delete this._uiConv[uiConv.id];
      if (!uiConv.checkClose())
        Services.obs.notifyObservers(uiConv, "ui-conversation-hidden", null);
    }
  },

  isConversationWindowFocused: function()
    this._windows.length > 0 && this._windows[0].document.hasFocus(),
  isUIConversationDisplayed: function(aUIConv) aUIConv.id in this._uiConv,
  focusConversation: function(aConv) {
    let uiConv = Services.conversations.getUIConversation(aConv);
    uiConv.target = aConv;
    if (!this.isUIConversationDisplayed(uiConv))
      this.showConversation(uiConv);
    // The conversation may still not be displayed if we are waiting
    // for a new window. In this case the conversation will be focused
    // automatically anyway.
    if (this.isUIConversationDisplayed(uiConv)) {
      let conv = this._uiConv[uiConv.id];
      let doc = conv.ownerDocument;
      doc.getElementById("conversations").selectedTab = conv.tab;
      conv.focus();
      doc.defaultView.focus();
#ifdef XP_MACOSX
      Components.classes["@mozilla.org/widget/macdocksupport;1"]
                .getService(Components.interfaces.nsIMacDockSupport)
                .activateApplication(true);
#endif
    }
    return uiConv;
  },

  onWindowFocus: function (aWindow) {
    let position = this._windows.indexOf(aWindow);
    if (position != -1) {
      this._windows.splice(position, 1);
      this._windows.unshift(aWindow);
    }
    this.unreadCount = 0;
  },

  init: function() {
    let os = Services.obs;
    ["new-text",
     "new-ui-conversation"].forEach(function (aTopic) {
      os.addObserver(this, aTopic, false);
    }, this);
  },

  _pendingConversations: null,
  observe: function(aSubject, aTopic, aMsg) {
    if (aTopic == "new-text") {
      if (aSubject.incoming && !aSubject.system &&
          (!aSubject.conversation.isChat || aSubject.containsNick)) {
        if (!this.isConversationWindowFocused())
          ++this.unreadCount;
        let uiConv =
          Services.conversations.getUIConversation(aSubject.conversation);
        if (!this.isUIConversationDisplayed(uiConv))
          this.showConversation(uiConv);
      }
      return;
    }

    if (aTopic != "new-ui-conversation")
      return;

    this.showConversation(aSubject);
  },

  showConversation: function(aConv) {
    if (this.isUIConversationDisplayed(aConv) ||
        (this._pendingConversations &&
        this._pendingConversations.indexOf(aConv) != -1))
      return;

    // TODO: let addons prevent some conversations from being shown.

    Services.obs.notifyObservers(aConv, "showing-ui-conversation", null);
    // The conversation is not displayed anywhere yet.
    // First, check if an existing conversation window can accept it.
    for each (let win in this._windows)
      if (win.document.getElementById("conversations").addConversation(aConv))
        return;

    // At this point, no existing registered window can accept the conversation.
    if (this._pendingConversations) {
      // If we are already creating a window, append the notification.
      this._pendingConversations.push(aConv);
    }
    else {
      // We need to create a new window.
      this._pendingConversations = [aConv];
      Services.ww.openWindow(null, CONVERSATION_WINDOW_URI, "_blank",
                             "chrome,toolbar,resizable", null);
    }
  }
};
