/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imStatusUtils.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

var gLastUIConvId = 0;
var gLastPrplConvId = 0;

XPCOMUtils.defineLazyGetter(this, "bundle", () =>
  Services.strings.createBundle("chrome://chat/locale/conversations.properties")
);

function OutgoingMessage(aMsg, aConversation) {
  this.message = aMsg;
  this.conversation = aConversation;
}
OutgoingMessage.prototype = {
  __proto__: ClassInfo("imIOutgoingMessage", "Outgoing Message"),
  cancelled: false,
  action: false
};

function imMessage(aPrplMessage) {
  this.prplMessage = aPrplMessage;
}
imMessage.prototype = {
  __proto__: ClassInfo(["imIMessage", "prplIMessage"], "IM Message"),
  cancelled: false,
  color: "",
  _displayMessage: null,

  get displayMessage() {
    // Explicitly test for null so that blank messages don't fall back to
    // the original. Especially problematic in encryption extensions like OTR.
    return this._displayMessage !== null ?
      this._displayMessage : this.prplMessage.originalMessage;
  },
  set displayMessage(aMsg) { this._displayMessage = aMsg; },

  get message() { return this.prplMessage.message; },
  set message(aMsg) { this.prplMessage.message = aMsg; },

  // from prplIMessage
  get who() { return this.prplMessage.who; },
  get time() { return this.prplMessage.time; },
  get id() { return this.prplMessage.id; },
  get alias() { return this.prplMessage.alias; },
  get iconURL() { return this.prplMessage.iconURL; },
  get conversation() { return this.prplMessage.conversation; },
  set conversation(aConv) { this.prplMessage.conversation = aConv; },
  get outgoing() { return this.prplMessage.outgoing; },
  get incoming() { return this.prplMessage.incoming; },
  get system() { return this.prplMessage.system; },
  get autoResponse() { return this.prplMessage.autoResponse; },
  get containsNick() { return this.prplMessage.containsNick; },
  get noLog() { return this.prplMessage.noLog; },
  get error() { return this.prplMessage.error; },
  get delayed() { return this.prplMessage.delayed; },
  get noFormat() { return this.prplMessage.noFormat; },
  get containsImages() { return this.prplMessage.containsImages; },
  get notification() { return this.prplMessage.notification; },
  get noLinkification() { return this.prplMessage.noLinkification; },
  get originalMessage() { return this.prplMessage.originalMessage; },
  getActions: function(aCount) { return this.prplMessage.getActions(aCount || {}); }
};

function UIConversation(aPrplConversation)
{
  this._prplConv = {};
  this.id = ++gLastUIConvId;
  this._observers = [];
  this._messages = [];
  this.changeTargetTo(aPrplConversation);
  let iface = Ci["prplIConv" + (aPrplConversation.isChat ? "Chat" : "IM")];
  this._interfaces = this._interfaces.concat(iface);
  // XPConnect will create a wrapper around 'this' after here,
  // so the list of exposed interfaces shouldn't change anymore.
  this.updateContactObserver();
  Services.obs.notifyObservers(this, "new-ui-conversation", null);
}

UIConversation.prototype = {
  __proto__: ClassInfo(["imIConversation", "prplIConversation", "nsIObserver"],
                       "UI conversation"),
  _observedContact: null,
  get contact() {
    let target = this.target;
    if (!target.isChat && target.buddy)
      return target.buddy.buddy.contact;
    return null;
  },
  updateContactObserver: function() {
    let contact = this.contact;
    if (contact && !this._observedContact) {
      contact.addObserver(this);
      this._observedContact = contact;
    }
    else if (!contact && this.observedContact) {
      this._observedContact.removeObserver(this);
      delete this._observedContact;
    }
  },
  get target() { return this._prplConv[this._currentTargetId]; },
  set target(aPrplConversation) {
    this.changeTargetTo(aPrplConversation);
  },
  get hasMultipleTargets() { return Object.keys(this._prplConv).length > 1; },
  getTargetByAccount: function(aAccount) {
    let accountId = aAccount.id;
    for (let id in this._prplConv) {
      let prplConv = this._prplConv[id];
      if (prplConv.account.id == accountId)
        return prplConv;
    }
    return null;
  },
  _currentTargetId: 0,
  changeTargetTo: function(aPrplConversation) {
    let id = aPrplConversation.id;
    if (this._currentTargetId == id)
      return;

    if (!(id in this._prplConv)) {
      this._prplConv[id] = aPrplConversation;
      aPrplConversation.addObserver(this.observeConv.bind(this, id));
    }

    let shouldNotify = this._currentTargetId;
    this._currentTargetId = id;
    if (!this.isChat) {
      let buddy = this.buddy;
      if (buddy)
        ({statusType: this.statusType, statusText: this.statusText} = buddy);
    }
    if (shouldNotify) {
      this.notifyObservers(this, "target-prpl-conversation-changed");
      let target = this.target;
      let params = [target.title, target.account.protocol.name];
      this.systemMessage(bundle.formatStringFromName("targetChanged",
                                                     params, params.length));
    }
  },
  // Returns a boolean indicating if the ui-conversation was closed.
  // If the conversation was closed, aContactId.value is set to the contact id
  // or 0 if no contact was associated with the conversation.
  removeTarget: function(aPrplConversation, aContactId) {
    let id = aPrplConversation.id;
    if (!(id in this._prplConv))
      throw "unknown prpl conversation";

    delete this._prplConv[id];
    if (this._currentTargetId != id)
      return false;

    for (let newId in this._prplConv) {
      this.changeTargetTo(this._prplConv[newId]);
      return false;
    }

    if (this._observedContact) {
      this._observedContact.removeObserver(this);
      aContactId.value = this._observedContact.id;
      delete this._observedContact;
    }
    else
      aContactId.value = 0;

    delete this._currentTargetId;
    this.notifyObservers(this, "ui-conversation-closed");
    return true;
  },

  _unreadMessageCount: 0,
  get unreadMessageCount() { return this._unreadMessageCount; },
  _unreadTargetedMessageCount: 0,
  get unreadTargetedMessageCount() { return this._unreadTargetedMessageCount; },
  _unreadIncomingMessageCount: 0,
  get unreadIncomingMessageCount() { return this._unreadIncomingMessageCount; },
  markAsRead: function() {
    delete this._unreadMessageCount;
    delete this._unreadTargetedMessageCount;
    delete this._unreadIncomingMessageCount;
    this._notifyUnreadCountChanged();
  },
  _lastNotifiedUnreadCount: 0,
  _notifyUnreadCountChanged: function() {
    if (this._unreadIncomingMessageCount == this._lastNotifiedUnreadCount)
      return;

    this._lastNotifiedUnreadCount = this._unreadIncomingMessageCount;
    for each (let observer in this._observers)
      observer.observe(this, "unread-message-count-changed",
                       this._unreadIncomingMessageCount.toString());
  },
  getMessages: function(aMessageCount) {
    if (aMessageCount)
      aMessageCount.value = this._messages.length;
    return this._messages;
  },
  checkClose: function() {
    if (!this._currentTargetId)
      return true; // already closed.

    if (!Services.prefs.getBoolPref("messenger.conversations.alwaysClose") &&
        (this.isChat && !this.left ||
         !this.isChat && (this.unreadIncomingMessageCount != 0 ||
                          Services.prefs.getBoolPref("messenger.conversations.holdByDefault"))))
      return false;

    this.close();
    return true;
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "contact-no-longer-dummy") {
      let oldId = parseInt(aData);
      // gConversationsService is ugly... :(
      delete gConversationsService._uiConvByContactId[oldId];
      gConversationsService._uiConvByContactId[aSubject.id] = this;
    }
    else if (aTopic == "account-buddy-status-changed") {
      if (!this._statusUpdatePending &&
          aSubject.account.id == this.account.id &&
          aSubject.buddy.id == this.buddy.buddy.id) {
        this._statusUpdatePending = true;
        Services.tm.mainThread.dispatch(this.updateBuddyStatus.bind(this),
                                        Ci.nsIEventTarget.DISPATCH_NORMAL);
      }
    }
    else if (aTopic == "account-buddy-icon-changed") {
      if (!this._statusUpdatePending &&
          aSubject.account.id == this.account.id &&
          aSubject.buddy.id == this.buddy.buddy.id) {
        this._iconUpdatePending = true;
        Services.tm.mainThread.dispatch(this.updateIcon.bind(this),
                                        Ci.nsIEventTarget.DISPATCH_NORMAL);
      }
    }
    else if (aTopic == "account-buddy-display-name-changed" &&
             aSubject.account.id == this.account.id &&
             aSubject.buddy.id == this.buddy.buddy.id)
      this.notifyObservers(this, "update-buddy-display-name");
  },

  _iconUpdatePending: false,
  updateIcon: function() {
    delete this._iconUpdatePending;
    this.notifyObservers(this, "update-buddy-icon");
  },

  _statusUpdatePending: false,
  updateBuddyStatus: function() {
    delete this._statusUpdatePending;
    let {statusType: statusType, statusText: statusText} = this.buddy;

    if (("statusType" in this) && this.statusType == statusType &&
        this.statusText == statusText)
      return;

    let wasUnknown = this.statusType == Ci.imIStatusInfo.STATUS_UNKNOWN;
    this.statusType = statusType;
    this.statusText = statusText;

    this.notifyObservers(this, "update-buddy-status");

    let msg;
    if (statusType == Ci.imIStatusInfo.STATUS_UNKNOWN)
      msg = bundle.formatStringFromName("statusUnknown", [this.title], 1);
    else {
      let status = Status.toLabel(statusType);
      let stringId = wasUnknown ? "statusChangedFromUnknown" : "statusChanged";
      if (this._justReconnected) {
        stringId = "statusKnown";
        delete this._justReconnected;
      }
      if (statusText) {
        msg = bundle.formatStringFromName(stringId + "WithStatusText",
                                          [this.title, status, statusText],
                                          3);
      }
      else
        msg = bundle.formatStringFromName(stringId, [this.title, status], 2);
    }
    this.systemMessage(msg);
  },

  _disconnected: false,
  disconnecting: function() {
    if (this._disconnected)
      return;

    this._disconnected = true;
    if (this.contact)
      return; // handled by the contact observer.

    if (this.isChat && this.left)
      this._wasLeft = true;
    else
      this.systemMessage(bundle.GetStringFromName("accountDisconnected"));
    this.notifyObservers(this, "update-buddy-status");
  },
  connected: function() {
    if (this._disconnected) {
      delete this._disconnected;
      let msg = bundle.GetStringFromName("accountReconnected");
      if (this.isChat) {
        if (!this._wasLeft) {
          this.systemMessage(msg);
          // Reconnect chat if possible.
          let chatRoomFields = this.target.chatRoomFields;
          if (chatRoomFields)
            this.account.joinChat(chatRoomFields);
        }
        delete this._wasLeft;
      }
      else {
        this._justReconnected = true;
        // Exclude convs with contacts, these receive presence info updates
        // (and therefore a reconnected message).
        if (!this.contact)
          this.systemMessage(msg);
      }
    }
    this.notifyObservers(this, "update-buddy-status");
  },

  observeConv: function(aTargetId, aSubject, aTopic, aData) {
    if (aTargetId != this._currentTargetId &&
        (aTopic == "new-text" ||
         (aTopic == "update-typing" &&
          this._prplConv[aTargetId].typingState == Ci.prplIConvIM.TYPING)))
      this.target = this._prplConv[aTargetId];

    this.notifyObservers(aSubject, aTopic, aData);
  },

  systemMessage: function(aText, aIsError) {
    let flags = {system: true, noLog: true, error: !!aIsError};
    (new Message("system", aText, flags)).conversation = this;
  },

  // prplIConversation
  get isChat() { return this.target.isChat; },
  get account() { return this.target.account; },
  get name() { return this.target.name; },
  get normalizedName() { return this.target.normalizedName; },
  get title() { return this.target.title; },
  get startDate() { return this.target.startDate; },
  sendMsg: function(aMsg) {
    // Add-ons (eg. pastebin) have an opportunity to cancel the message at this
    // point, or change the text content of the message.
    // If an add-on wants to split a message, it should truncate the first
    // message, and insert new messages using the conversation's sendMsg method.
    let om = new OutgoingMessage(aMsg, this);
    this.notifyObservers(om, "preparing-message");
    if (om.cancelled)
      return;

    // Protocols have an opportunity here to preprocess messages before they are
    // sent (eg. split long messages). If a message is split here, the split
    // will be visible in the UI.
    let messages = this.target.prepareForSending(om);

    // Protocols can return null if they don't need to make any changes.
    // (nb. passing null with retval array results in an empty array)
    if (!messages || !messages.length)
      messages = [om.message];

    for (let msg of messages) {
      // Add-ons (eg. OTR) have an opportunity to tweak or cancel the message
      // at this point.
      om = new OutgoingMessage(msg, this.target);
      this.notifyObservers(om, "sending-message");
      if (om.cancelled)
        continue;
      this.target.sendMsg(om.message);
    }
  },
  unInit: function() {
    for each (let conv in this._prplConv)
      gConversationsService.forgetConversation(conv);
    if (this._observedContact) {
      this._observedContact.removeObserver(this);
      delete this._observedContact;
    }
    this._prplConv = {}; // Prevent .close from failing.
    delete this._currentTargetId;
    this.notifyObservers(this, "ui-conversation-destroyed");
  },
  close: function() {
    for each (let conv in this._prplConv)
      conv.close();
    if (!this.hasOwnProperty("_currentTargetId"))
      return;
    delete this._currentTargetId;
    this.notifyObservers(this, "ui-conversation-closed");
    Services.obs.notifyObservers(this, "ui-conversation-closed", null);
  },
  addObserver: function(aObserver) {
    if (this._observers.indexOf(aObserver) == -1)
      this._observers.push(aObserver);
  },
  removeObserver: function(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  notifyObservers: function(aSubject, aTopic, aData) {
    if (aTopic == "new-text") {
      aSubject = new imMessage(aSubject);
      this.notifyObservers(aSubject, "received-message");
      if (aSubject.cancelled)
        return;
      aSubject.conversation.prepareForDisplaying(aSubject);

      this._messages.push(aSubject);
      ++this._unreadMessageCount;
      if (aSubject.incoming && !aSubject.system) {
        ++this._unreadIncomingMessageCount;
        if (!this.isChat || aSubject.containsNick)
          ++this._unreadTargetedMessageCount;
      }
    }

    for each (let observer in this._observers) {
      if (!observer.observe && this._observers.indexOf(observer) == -1)
        continue; // observer removed by a previous call to another observer.
      observer.observe(aSubject, aTopic, aData);
    }
    this._notifyUnreadCountChanged();

    if (aTopic == "new-text") {
      Services.obs.notifyObservers(aSubject, aTopic, aData);
      if (aSubject.incoming && !aSubject.system &&
          (!this.isChat || aSubject.containsNick)) {
        this.notifyObservers(aSubject, "new-directed-incoming-message", aData);
        Services.obs.notifyObservers(aSubject, "new-directed-incoming-message", aData);
      }
    }
  },

  // Used above when notifying of new-texts originating in the
  // UIConversation. This happens when this.systemMessage() is called. The
  // conversation for the message is set as the UIConversation.
  prepareForDisplaying: function(aMsg) {},

  // prplIConvIM
  get buddy() { return this.target.buddy; },
  get typingState() { return this.target.typingState; },
  sendTyping: function(aString) { return this.target.sendTyping(aString); },

  // Chat only
  getParticipants: function() { return this.target.getParticipants(); },
  get topic() { return this.target.topic; },
  set topic(aTopic) { this.target.topic = aTopic; },
  get topicSetter() { return this.target.topicSetter; },
  get topicSettable() { return this.target.topicSettable; },
  get noTopicString() { return bundle.GetStringFromName("noTopic"); },
  get nick() { return this.target.nick; },
  get left() { return this.target.left; },
  get joining() { return this.target.joining; }
};

var gConversationsService;
function ConversationsService() { gConversationsService = this; }
ConversationsService.prototype = {
  get wrappedJSObject() { return this; },

  initConversations: function() {
    this._uiConv = {};
    this._uiConvByContactId = {};
    this._prplConversations = [];
    Services.obs.addObserver(this, "account-disconnecting", false);
    Services.obs.addObserver(this, "account-connected", false);
    Services.obs.addObserver(this, "account-buddy-added", false);
    Services.obs.addObserver(this, "account-buddy-removed", false);
  },

  unInitConversations: function() {
    let UIConvs = this.getUIConversations();
    for (let UIConv of UIConvs)
      UIConv.unInit();
    delete this._uiConv;
    delete this._uiConvByContactId;
    // This should already be empty, but just to be sure...
    for each (let prplConv in this._prplConversations)
      prplConv.unInit();
    delete this._prplConversations;
    Services.obs.removeObserver(this, "account-disconnecting");
    Services.obs.removeObserver(this, "account-connected");
    Services.obs.removeObserver(this, "account-buddy-added");
    Services.obs.removeObserver(this, "account-buddy-removed");
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "account-connected") {
      for each (let conv in this._uiConv) {
        if (conv.account.id == aSubject.id)
          conv.connected();
      }
    }
    else if (aTopic == "account-disconnecting") {
      for each (let conv in this._uiConv) {
        if (conv.account.id == aSubject.id)
          conv.disconnecting();
      }
    }
    else if (aTopic == "account-buddy-added") {
      let accountBuddy = aSubject;
      let prplConversation =
        this.getConversationByNameAndAccount(accountBuddy.normalizedName,
                                             accountBuddy.account, false);
      if (!prplConversation)
        return;

      let uiConv = this.getUIConversation(prplConversation);
      let contactId = accountBuddy.buddy.contact.id;
      if (contactId in this._uiConvByContactId) {
        // Trouble! There is an existing uiConv for this contact.
        // We should avoid having two uiConvs with the same contact.
        // This is ugly UX, but at least can only happen if there is
        // already an accountBuddy with the same name for the same
        // protocol on a different account, which should be rare.
        this.removeConversation(prplConversation);
        return;
      }
      // Link the existing uiConv to the contact.
      this._uiConvByContactId[contactId] = uiConv;
      uiConv.updateContactObserver();
      uiConv.notifyObservers(uiConv, "update-conv-buddy");
    }
    else if (aTopic == "account-buddy-removed") {
      let accountBuddy = aSubject;
      let contactId = accountBuddy.buddy.contact.id;
      if (!(contactId in this._uiConvByContactId))
        return;
      let uiConv = this._uiConvByContactId[contactId];

      // If there is more than one target on the uiConv, close the
      // prplConv as we can't dissociate the uiConv from the contact.
      // The conversation with the contact will continue with a different
      // target.
      if (uiConv.hasMultipleTargets) {
        let prplConversation = uiConv.getTargetByAccount(accountBuddy.account);
        if (prplConversation)
          this.removeConversation(prplConversation);
        return;
      }

      delete this._uiConvByContactId[contactId];
      uiConv.updateContactObserver();
      uiConv.notifyObservers(uiConv, "update-conv-buddy");
    }
  },

  addConversation: function(aPrplConversation) {
    // Give an id to the new conversation.
    aPrplConversation.id = ++gLastPrplConvId;
    this._prplConversations.push(aPrplConversation);

    // Notify observers.
    Services.obs.notifyObservers(aPrplConversation, "new-conversation", null);

    // Update or create the corresponding UI conversation.
    let contactId;
    if (!aPrplConversation.isChat) {
      let accountBuddy = aPrplConversation.buddy;
      if (accountBuddy)
        contactId = accountBuddy.buddy.contact.id;
    }

    if (contactId) {
      if (contactId in this._uiConvByContactId) {
        let uiConv = this._uiConvByContactId[contactId];
        uiConv.target = aPrplConversation;
        this._uiConv[aPrplConversation.id] = uiConv;
        return;
      }
    }

    let newUIConv = new UIConversation(aPrplConversation);
    this._uiConv[aPrplConversation.id] = newUIConv;
    if (contactId)
      this._uiConvByContactId[contactId] = newUIConv;
  },
  removeConversation: function(aPrplConversation) {
    Services.obs.notifyObservers(aPrplConversation, "conversation-closed", null);

    let uiConv = this.getUIConversation(aPrplConversation);
    delete this._uiConv[aPrplConversation.id];
    let contactId = {};
    if (uiConv.removeTarget(aPrplConversation, contactId)) {
      if (contactId.value)
        delete this._uiConvByContactId[contactId.value];
      Services.obs.notifyObservers(uiConv, "ui-conversation-closed", null);
    }
    this.forgetConversation(aPrplConversation);
  },
  forgetConversation: function(aPrplConversation) {
    aPrplConversation.unInit();

    this._prplConversations =
      this._prplConversations.filter(c => c !== aPrplConversation);
  },

  getUIConversations: function(aConvCount) {
    let rv = [];
    if (this._uiConv) {
      for (let prplConvId in this._uiConv) {
        // Since an UIConversation may be linked to multiple prplConversations,
        // we must ensure we don't return the same UIConversation twice,
        // by checking the id matches that of the active prplConversation.
        let uiConv = this._uiConv[prplConvId];
        if (prplConvId == uiConv.target.id)
          rv.push(uiConv);
      }
    }
    if (aConvCount)
      aConvCount.value = rv.length;
    return rv;
  },
  getUIConversation: function(aPrplConversation) {
    let id = aPrplConversation.id;
    if (this._uiConv && id in this._uiConv)
      return this._uiConv[id];
    throw "Unknown conversation";
  },
  getUIConversationByContactId: function(aId) {
    return (aId in this._uiConvByContactId) ? this._uiConvByContactId[aId] : null;
  },

  getConversations: function() { return new nsSimpleEnumerator(this._prplConversations); },
  getConversationById: function(aId) {
    for each (let conv in this._prplConversations)
      if (conv.id == aId)
        return conv;
    return null;
  },
  getConversationByNameAndAccount: function(aName, aAccount, aIsChat) {
    let normalizedName = aAccount.normalize(aName);
    for (let conv of this._prplConversations) {
      if (aAccount.normalize(conv.name) == normalizedName &&
          aAccount.numericId == aAccount.numericId &&
          conv.isChat == aIsChat)
        return conv;
    }
    return null;
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.imIConversationsService]),
  classDescription: "Conversations",
  classID: Components.ID("{b2397cd5-c76d-4618-8410-f344c7c6443a}"),
  contractID: "@mozilla.org/chat/conversations-service;1"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ConversationsService]);
