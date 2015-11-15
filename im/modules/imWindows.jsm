/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var CONVERSATION_WINDOW_URI = "chrome://instantbird/content/instantbird.xul";
this.EXPORTED_SYMBOLS = ["Conversations"];

Components.utils.import("resource:///modules/imServices.jsm");
Components.utils.import("resource:///modules/ibInterruptions.jsm");

var Conversations = {
  _unreadCount: 0,
  get unreadCount() { return this._unreadCount; },
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
      for (let conv of notifications)
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

    let uiConv = aConversation.conv;
    this._uiConv[uiConv.id] = aConversation;

    this.forgetHiddenConversation(uiConv);
  },
  unregisterConversation: function(aConversation, aShouldClose) {
    let index = this._conversations.indexOf(aConversation);
    if (index != -1)
      this._conversations.splice(index, 1);

    let uiConv = aConversation.conv;
    if (this._uiConv[uiConv.id] == aConversation) {
      delete this._uiConv[uiConv.id];
      if (aShouldClose === true) {
        this.forgetHiddenConversation(uiConv);
        uiConv.close();
      }
      else if (aShouldClose === false || !uiConv.checkClose())
        this.hideConversation(uiConv);
    }
  },

  isConversationWindowFocused: function() {
    return this._windows.length > 0 && this._windows[0].document.hasFocus();
  },
  isUIConversationDisplayed: function(aUIConv) { return aUIConv.id in this._uiConv; },
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
            this._requestShowConversation(aTopic, aSubject))
          this.showConversation(uiConv);
      }
      return;
    }

    if (aTopic != "new-ui-conversation")
      return;

    if (!this._isConversationHidden(aSubject) &&
        this._requestShowConversation(aTopic, aSubject))
      this.showConversation(aSubject);
    else
      this.hideConversation(aSubject);
  },

  _hiddenConversationsPref: "messenger.conversations.hiddenConversations",
  get _hiddenConversations() {
    let hiddenConvs = {};
    try {
      hiddenConvs =
        JSON.parse(Services.prefs.getCharPref(this._hiddenConversationsPref));
    } catch(e) {}
    delete this._hiddenConversations;
    return (this._hiddenConversations = hiddenConvs);
  },

  forgetHiddenConversation: function(aConv) {
    if (this._isConversationHidden(aConv)) {
      let accountId = aConv.account.id;
      delete this._hiddenConversations[accountId][aConv.normalizedName];
      if (Object.keys(this._hiddenConversations[accountId]).length == 0)
        delete this._hiddenConversations[accountId];
      this._saveHiddenConversations();
    }
  },

  _saveHiddenConversations: function() {
    Services.prefs.setCharPref(this._hiddenConversationsPref,
                               JSON.stringify(this._hiddenConversations));
  },

  hideConversation: function(aConv) {
    Services.obs.notifyObservers(aConv, "ui-conversation-hidden", null);
    if (!aConv.isChat)
      return;
    let accountId = aConv.account.id;
    if (!(accountId in this._hiddenConversations))
      this._hiddenConversations[accountId] = {};
    this._hiddenConversations[accountId][aConv.normalizedName] = true;
    this._saveHiddenConversations();
  },

  _isConversationHidden: function(aConv) {
    let accountId = aConv.account.id;
    return aConv.isChat && accountId in this._hiddenConversations &&
           Object.prototype.hasOwnProperty.call(this._hiddenConversations[accountId],
                                                aConv.normalizedName);
  },

  _requestShowConversation: (aTopic, aSubject) =>
    Interruptions.requestInterrupt(aTopic, aSubject, "show-conversation"),

  showConversation: function(aConv) {
    if (this.isUIConversationDisplayed(aConv) ||
        (this._pendingConversations &&
        this._pendingConversations.indexOf(aConv) != -1))
      return;

    Services.obs.notifyObservers(aConv, "showing-ui-conversation", null);
    // The conversation is not displayed anywhere yet.
    // First, check if an existing conversation window can accept it.
    for (let win of this._windows)
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
  },

  showNewTab: function() {
    let win = Services.wm.getMostRecentWindow("Messenger:convs");
    let addNewTab = function(aWindow) {
      if (!aWindow)
        return false;
      let newtab = aWindow.document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "newtab");
      if (!aWindow.getTabBrowser().addPanel(newtab))
        return false;
      aWindow.getTabBrowser().selectPanel(newtab);
      newtab.ownerDocument.defaultView.focus();
      newtab.init();
      return true;
    }
    if (!addNewTab(win)) {
      win = Services.ww.openWindow(null, CONVERSATION_WINDOW_URI, "_blank",
                                   "chrome,toolbar,resizable", null);
      win.addEventListener("load", addNewTab.bind(null, win));
    }
  }
};
