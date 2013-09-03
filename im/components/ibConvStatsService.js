/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {interfaces: Ci, utils: Cu, results: Cr} = Components;
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

const kNotificationsToObserve =
  ["contact-added", "contact-removed","contact-status-changed",
   "contact-display-name-changed", "contact-no-longer-dummy",
   "contact-preferred-buddy-changed", "contact-moved",
   "account-disconnected"];

XPCOMUtils.defineLazyGetter(this, "_newtab", function()
  l10nHelper("chrome://instantbird/locale/newtab.properties")
);

XPCOMUtils.defineLazyGetter(this, "_instantbird", function()
  l10nHelper("chrome://instantbird/locale/instantbird.properties")
);

function ConvStatsService() {
  this._observers = [];
}
ConvStatsService.prototype = {
  // Sorted list of contacts, stored as PossibleConvFromContacts.
  _contacts: [],
  // PossibleConvFromContacts stored by id.
  _contactsById: new Map(),
  // Sorted list of chat rooms, stored as PossibleChats.
  _chats: [],
  // Keys are account ids. Values are Maps of chat names to PossibleChats.
  _chatsByAccountIdAndName: new Map(),

  _init: function() {
    let contacts = Services.contacts.getContacts();
    for (let contact of contacts)
      this._addContact(contact);
    for (let notification of kNotificationsToObserve)
      Services.obs.addObserver(this, notification, false);
  },

  _addContact: function(aContact) {
    if (this._contactsById.has(aContact.id)) // Already added.
      return;
    let possibleConv = new PossibleConvFromContact(aContact);
    let pos = this._getPositionToInsert(possibleConv, this._contacts);
    this._contacts.splice(pos, 0, possibleConv);
    this._contactsById.set(aContact.id, possibleConv);
  },

  _removeContact: function(aId) {
    if (!this._contactsById.has(aId))
      return;
    this._contacts.splice(
      this._contacts.indexOf(this._contactsById.get(aId)), 1);
    this._contactsById.delete(aId);
  },

  _addChat: function(aRoomInfo) {
    let accountId = aRoomInfo.accountId;
    let chatList = this._chatsByAccountIdAndName.get(accountId);
    if (!chatList) {
      chatList = new Map();
      this._chatsByAccountIdAndName.set(accountId, chatList);
    }
    // If a chat is already added, we remove it and re-add to refresh.
    else if (chatList.has(aRoomInfo.name)) {
      this._chats.splice(
        this._chats.indexOf(chatList.get(aRoomInfo.name)), 1);
    }
    let possibleConv = new PossibleChat(aRoomInfo);
    let pos = this._getPositionToInsert(possibleConv, this._chats);
    this._chats.splice(pos, 0, possibleConv);
    chatList.set(aRoomInfo.name, possibleConv);
  },

  _removeChatsForAccount: function(aAccId) {
    if (!this._chatsByAccountIdAndName.has(aAccId))
      return;
    this._chats = this._chats.filter(function(c) c._accountId != aAccId);
    this._chatsByAccountIdAndName.delete(aAccId);
  },

  _getPositionToInsert: function(aPossibleConversation, aArrayToInsert) {
    let end = aArrayToInsert.length;
    // Avoid the binary search loop if aArrayToInsert was already sorted.
    if (end == 0 ||
        this._sortComparator(aPossibleConversation, aArrayToInsert[end - 1]) >= 0)
      return end;
    let start = 0;
    while (start < end) {
      let middle = Math.floor((start + end) / 2);
      if (this._sortComparator(aPossibleConversation, aArrayToInsert[middle]) < 0)
        end = middle;
      else
        start = middle + 1;
    }
    return end;
  },

  _sortComparator: function(aPossibleConvA, aPossibleConvB) {
    return (aPossibleConvB.statusType - aPossibleConvA.statusType) ||
      aPossibleConvA.lowerCaseName.localeCompare(aPossibleConvB.lowerCaseName);
  },

  getFilteredConvs: function(aFilterStr) {
    let filteredConvs = this._contacts.concat(this._chats);
    let existingConvs = Services.conversations.getUIConversations().map(
                          function(uiConv) new ExistingConversation(uiConv));
    for (let existingConv of existingConvs) {
      let pos = this._getPositionToInsert(existingConv, filteredConvs);
      filteredConvs.splice(pos, 0, existingConv);
      // Remove any duplicate contact or chat.
      let uiConv = existingConv.uiConv;
      if (existingConv.isChat) {
        let chatList = this._chatsByAccountIdAndName.get(uiConv.account.id);
        if (chatList) {
          let chat = chatList.get(uiConv.name);
          if (chat)
            filteredConvs.splice(filteredConvs.indexOf(chat), 1);
        }
      }
      else {
        let contact = uiConv.contact;
        if (contact && this._contactsById.has(contact.id)) {
          filteredConvs.splice(
            filteredConvs.indexOf(this._contactsById.get(contact.id)), 1);
        }
      }
    }
    if (aFilterStr) {
      aFilterStr = aFilterStr.toLowerCase();
      filteredConvs = filteredConvs.filter(function(c) {
        return c.lowerCaseName.startsWith(aFilterStr) ||
          c.lowerCaseName.split(/\s+/).some(function(s) s.startsWith(aFilterStr));
      });
    }
    return new nsSimpleEnumerator(filteredConvs);
  },

  // The last time an update notification was sent to observers.
  _lastUpdateNotification: 0,
  addObserver: function(aObserver) {
    if (this._observers.indexOf(aObserver) != -1)
      return;
    this._observers.push(aObserver);
    let accounts = Services.accounts.getAccounts();
    // We request chat lists from accounts when adding new observers.
    while (accounts.hasMoreElements()) {
      let acc = accounts.getNext();
      let id = acc.id;
      if (acc.connected && acc.canJoinChat && (!this._chatsByAccountIdAndName.has(id) ||
          acc.prplAccount.isRoomInfoStale)) {
        // Discard any chat room data we already have.
        this._removeChatsForAccount(id);
        try {
          acc.prplAccount.requestRoomInfo(function(aRoomInfo, aPrplAccount, aCompleted) {
            aRoomInfo.forEach(this._addChat, this);
            let now = Date.now();
            if ((now - this._lastUpdateNotification > 100) || aCompleted) {
              this._notifyObservers("updated");
              this._lastUpdateNotification = now;
            }
          }.bind(this));
        } catch(e) {
          if (e.result != Cr.NS_ERROR_NOT_IMPLEMENTED)
            Cu.reportError(e);
          continue;
        }
      }
    }
  },

  removeObserver: function(aObserver) {
    this._observers = this._observers.filter(function(o) o !== aObserver);
  },

  _notifyObservers: function(aTopic) {
    for each (let observer in this._observers) {
      if ("observe" in observer) // Avoid failing on destructed XBL bindings.
        observer.observe(this, "stats-service-" + aTopic);
    }
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "profile-after-change")
      Services.obs.addObserver(this, "prpl-init", false);
    else if (aTopic == "prpl-init") {
      executeSoon(this._init.bind(this));
      Services.obs.removeObserver(this, "prpl-init");
    }
    if (!aTopic.startsWith("contact-") && !aTopic.startsWith("account"))
      return;
    if (aTopic == "contact-no-longer-dummy") {
      // Contact ID changed. aData is the old ID.
      let id = aSubject.id;
      let oldId = parseInt(aData, 10);
      this._contactsById.set(id, this._contactsById.get(oldId));
      this._contactsById.delete(oldId);
      this._contactsById.get(id)._id = id;
      return;
    }
    else if (aTopic == "contact-added")
      this._addContact(aSubject);
    else if (aTopic == "contact-removed")
      this._removeContact(aSubject.id);
    else if (aTopic.startsWith("contact")) {
      // A change in the contact's status or display name may cause the
      // order to change, so we simply remove and re-add it.
      this._removeContact(aSubject.id);
      this._addContact(aSubject);
    }
    else if (aTopic == "account-disconnected")
      this._removeChatsForAccount(aSubject.id);
    this._notifyObservers("updated");
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.ibIConvStatsService]),
  classDescription: "ConvStatsService",
  classID: Components.ID("{1d9be575-87a4-4f2f-b414-c67a560f29fd}"),
  contractID: "@instantbird.org/conv-stats-service;1"
};

let PossibleConversation = {
  get displayName() this._displayName,
  get lowerCaseName() {
    if (!this._lowerCaseName)
      this._lowerCaseName = this._displayName.toLowerCase();
    return this._lowerCaseName;
  },
  _isChat: false, // False by default. Extensions should override this.
  get isChat() this._isChat,
  get statusType() this._statusType,
  get statusText() this._statusText,
  get infoText() this._infoText,
  get buddyIconFilename() this._buddyIconFilename,
  QueryInterface: XPCOMUtils.generateQI([Ci.ibIPossibleConversation])
};

function PossibleConvFromContact(aContact) {
  this._displayName = aContact.displayName;
  this._statusType = aContact.statusType;
  this._statusText = aContact.statusText;
  this._buddyIconFilename = aContact.preferredBuddy.buddyIconFilename;
  this._id = aContact.id;
}
PossibleConvFromContact.prototype = {
  __proto__: PossibleConversation,
  get source() "contact",
  get infoText() {
    let tagNames = this.contact.getTags().map(function(aTag) aTag.name);
    tagNames.sort(function(a, b) a.toLowerCase().localeCompare(b.toLowerCase()));
    return tagNames.join(", ");
  },
  get contact() Services.contacts.getContactById(this._id),
  get account() this.contact.preferredBuddy.preferredAccountBuddy.account,
  createConversation: function() this.contact.createConversation()
};

function PossibleChat(aRoomInfo) {
  this._accountId = aRoomInfo.accountId;
  this._displayName = aRoomInfo.name;
  this._statusText = "(" + aRoomInfo.participantCount + ") " +
    (aRoomInfo.topic || _instantbird("noTopic"));
  this._chatRoomFieldValues = aRoomInfo.chatRoomFieldValues;
}
PossibleChat.prototype = {
  __proto__: PossibleConversation,
  _isChat: true,
  _statusType: Ci.imIStatusInfo.STATUS_UNKNOWN,
  _buddyIconFilename: "",
  get infoText() this.account.normalizedName,
  get source() "chat",
  get account() Services.accounts.getAccountById(this._accountId),
  createConversation: function() this.account.joinChat(this._chatRoomFieldValues)
};

function ExistingConversation(aUIConv) {
  this._id = aUIConv.target.id;
  this._displayName = aUIConv.title;
  this._isChat = aUIConv.isChat;
  if (aUIConv.isChat) {
    this._statusText = aUIConv.topic || _instantbird("noTopic");
    this._statusType = Ci.imIStatusInfo.STATUS_UNKNOWN;
    this._buddyIconFilename = "";
  }
  else {
    let buddy = aUIConv.buddy;
    if (buddy) {
      this._statusType = buddy.statusType;
      this._statusText = buddy.statusText;
      this._buddyIconFilename = buddy.buddyIconFilename;
    }
    else {
      this._statusType = Ci.imIStatusInfo.STATUS_UNKNOWN;
      this._statusText = "";
      this._buddyIconFilename = "";
    }
  }
  this._infoText = _newtab("existingConv.infoText");
}
ExistingConversation.prototype = {
  __proto__: PossibleConversation,
  get source() "existing",
  get uiConv() {
    return Services.conversations.getUIConversation(Services.conversations
                   .getConversationById(this._id));
  },
  get account() this.uiConv.account,
  createConversation: function() this.uiConv.target
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([ConvStatsService]);
