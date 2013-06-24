/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const CONVERSATION_WINDOW_URI = "chrome://instantbird/content/instantbird.xul";
const EXPORTED_SYMBOLS = ["Conversations"];

Components.utils.import("resource:///modules/imServices.jsm");
Components.utils.import("resource:///modules/ibInterruptions.jsm");

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
        this.showConversation(conv);
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
  unregisterConversation: function(aConversation, aShouldClose) {
    let index = this._conversations.indexOf(aConversation);
    if (index != -1)
      this._conversations.splice(index, 1);

    let uiConv = aConversation.conv;
    if (this._uiConv[uiConv.id] == aConversation) {
      delete this._uiConv[uiConv.id];
      if (aShouldClose === true)
        uiConv.close();
      else if (aShouldClose === false || !uiConv.checkClose())
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
      doc.getElementById("conversations").selectPanel(conv);
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
        if (!this.isUIConversationDisplayed(uiConv) &&
            Interruptions.requestInterrupt(aTopic, aSubject, "show-conversation"))
          this.showConversation(uiConv);
      }
      return;
    }

    if (aTopic != "new-ui-conversation")
      return;

    if (Interruptions.requestInterrupt(aTopic, aSubject, "show-conversation"))
      this.showConversation(aSubject);
    else
      Services.obs.notifyObservers(aSubject, "ui-conversation-hidden", null);
  },

  showConversation: function(aConv) {
    if (this.isUIConversationDisplayed(aConv) ||
        (this._pendingConversations &&
        this._pendingConversations.indexOf(aConv) != -1))
      return;

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
