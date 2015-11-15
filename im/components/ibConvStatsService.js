/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource://gre/modules/osfile.jsm");

var kNotificationsToObserve =
  ["contact-added", "contact-removed","contact-status-changed",
   "contact-display-name-changed", "contact-no-longer-dummy",
   "contact-preferred-buddy-changed", "contact-moved",
   "account-connected", "account-disconnected", "new-conversation",
   "new-text", "conversation-closed", "prpl-quit"];

// This is incremented when changes to the log sweeping code warrant rebuilding
// the stats cache file.
var gStatsCacheVersion = 2;

XPCOMUtils.defineLazyGetter(this, "_newtab", () =>
  l10nHelper("chrome://instantbird/locale/newtab.properties")
);

XPCOMUtils.defineLazyGetter(this, "_instantbird", () =>
  l10nHelper("chrome://instantbird/locale/instantbird.properties")
);

// ConversationStats stored by id.
// A PossibleConversation's id is its protocol, account, and name joined by "/", suffixed
// with ".chat" for MUCs (identical to the log folder path for the conversation).
var gStatsByConvId = {};

// The message counts of a contact are the sums of the message counts of the
// linked buddies.
// This object serves as a cache for the total stats of contacts.
// Initialized when gStatsByConvId is ready (i.e. all log files have been parsed
// or it was loaded from the JSON cache file).
var gStatsByContactId;

// Recursively sweeps log folders and parses log files for conversation statistics.
var gLogParser = {
  _statsService: null,
  _accountMap: null,
  inProgress: false,
  error: false,

  // The general path of a log is logs/prpl/account/conv/date.json.
  // First, sweep the logs folder for prpl folders.
  sweep: function(aStatsService) {
    initLogModule("stats-service-log-sweeper", this);
    this.inProgress = true;
    delete this.error;
    this._accounts = [];
    this._logFolders = [];
    this._statsService = aStatsService;
    this._statsService._notifyObservers("log-sweeping", "ongoing");

    this._accountMap = new Map();
    let accounts = Services.accounts.getAccounts();
    while (accounts.hasMoreElements()) {
      let account = accounts.getNext();
      this._accountMap.set(account.normalizedName, account);
    }

    let decoder = new TextDecoder();

    Services.logs.forEach(aLog => {
      return OS.File.read(aLog).then(
        aArray => {
          // Try to parse the log file. If anything goes wrong here, the log file
          // has likely been tampered with so we ignore it.
          try {
            let lines = decoder.decode(aArray).split("\n");
            // The first line is the header which identifies the conversation.
            let header = JSON.parse(lines.shift());
            let accountName = header.account;
            let name = header.normalizedName;
            if (!name) {
              // normalizedName was added for IB 1.5, so we normalize
              // manually if it is not found for backwards compatibility.
              name = header.name;
              let account = this._accountMap.get(accountName);
              if (account)
                name = account.normalize(name);
            }
            let id = getConversationId(header.protocol, accountName,
                                       name, header.isChat);
            if (!(id in gStatsByConvId))
              gStatsByConvId[id] = new ConversationStats(id);
            let stats = gStatsByConvId[id];
            lines.pop(); // Ignore the final line break.
            for (let line of lines) {
              line = JSON.parse(line);
              if (line.flags[0] == "system") // Ignore system messages.
                continue;
              line.flags[0] == "incoming" ?
                ++stats.incomingCount : ++stats.outgoingCount;
            }
            let date = Date.parse(header.date);
            if (date > stats.lastDate)
              stats.lastDate = date;
            delete stats._computedScore;
          }
          catch(e) {
            this.WARN("Error parsing log file: " + aLog + "\n" + e);
          }
        },
        aError => {
          Cu.reportError("Error reading log file: " + aLog + "\n" + aError);
          this.error = true;
        }
      );
    }).catch(aError => {
      this.error = true;
    }).then(() => {
      delete this.inProgress;
      delete this._accountMap;
      let statsService = this._statsService;
      statsService._cacheAllStats(); // Flush stats to JSON cache.
      statsService._convs.sort(statsService._sortComparator);
      statsService._notifyObservers("log-sweeping", "done");
      gStatsByContactId = {}; // Initialize stats cache for contacts.
    });
  },
};

function ConvStatsService() {
  this._observers = [];
}
ConvStatsService.prototype = {
  // Sorted list of conversations, stored as PossibleConversations.
  _convs: [],
  // PossibleConvFromContacts stored by id.
  _contactsById: new Map(),
  // Keys are account ids. Values are Maps of chat names to PossibleChats.
  _chatsByAccountIdAndName: new Map(),
  // Timer to update the stats cache.
  // The cache is updated every 10 minutes, and on quitting.
  _statsCacheUpdateTimer: null,
  _statsCacheFilePath: null,

  _init: function() {
    let contacts = Services.contacts.getContacts();
    for (let contact of contacts)
      this._addContact(contact);
    for (let notification of kNotificationsToObserve)
      Services.obs.addObserver(this, notification, false);

    // Read all our conversation stats from the cache.
    this._statsCacheFilePath =
      OS.Path.join(OS.Constants.Path.profileDir, "statsservicecache.json");
    OS.File.read(this._statsCacheFilePath).then(function(aArray) {
      try {
        let {version: version, stats: allStats} =
          JSON.parse((new TextDecoder()).decode(aArray));
        if (version !== gStatsCacheVersion) {
          gLogParser.sweep(this);
          return;
        }
        for (let key in allStats) {
          let stats = allStats[key];
          gStatsByConvId[stats.id] =
            new ConversationStats(stats.id, stats.lastDate,
                                  stats.incomingCount, stats.outgoingCount);
        }
        gStatsByContactId = {};
      }
      catch (e) {
        // Something unexpected was encountered in the file.
        // (Maybe it was tampered with?) Rebuild the cache from logs.
        Cu.reportError("Error while parsing conversation stats cache.\n" + e);
        if (Services.prefs.getBoolPref("statsService.parseLogsForStats"))
          gLogParser.sweep(this);
      }
    }.bind(this), function(aError) {
      if (!aError.becauseNoSuchFile)
        Cu.reportError("Error while reading conversation stats cache.\n" + aError);
      if (Services.prefs.getBoolPref("statsService.parseLogsForStats"))
        gLogParser.sweep(this);
    }.bind(this));
  },

  _addContact: function(aContact) {
    if (this._contactsById.has(aContact.id)) // Already added.
      return;
    let possibleConv = new PossibleConvFromContact(aContact);
    let pos = this._getPositionToInsert(possibleConv, this._convs);
    this._convs.splice(pos, 0, possibleConv);
    this._contactsById.set(aContact.id, possibleConv);
  },

  _removeContact: function(aId) {
    if (!this._contactsById.has(aId))
      return;
    this._convs.splice(
      this._convs.indexOf(this._contactsById.get(aId)), 1);
    this._contactsById.delete(aId);
  },

  // Queue of RoomInfo to be added.
  _pendingChats: [],
  // The last time an update notification was sent to observers.
  _lastUpdateNotification: 0,
  // Account ids from which chat room info has been requested.
  // We send an update notification if this is empty after adding chat rooms.
  _accountsRequestingRoomInfo: new Set(),
  _addPendingChats: function() {
    let begin = Date.now();
    for (let time = 0; time < 15 && this._pendingChats.length;
         time = Date.now() - begin) {
      let chat = this._pendingChats.pop();
      let accountId = chat.accountId;
      let chatList = this._chatsByAccountIdAndName.get(accountId);
      if (!chatList) {
        chatList = new Map();
        this._chatsByAccountIdAndName.set(accountId, chatList);
      }
      // If a chat is already added, we remove it and re-add to refresh.
      else if (chatList.has(chat.name)) {
        this._convs.splice(
          this._convs.indexOf(chatList.get(chat.name)), 1);
      }
      let possibleConv = new PossibleChat(chat);
      let pos = this._getPositionToInsert(possibleConv, this._convs);
      this._convs.splice(pos, 0, possibleConv);
      chatList.set(chat.name, possibleConv);
    }
    if (this._pendingChats.length)
      executeSoon(this._addPendingChats.bind(this));
    else
      delete this._addingPendingChats;
    let now = Date.now();
    if ((!this._accountsRequestingRoomInfo.size && !this._pendingChats.length) ||
        now - this._lastUpdateNotification > 500) {
      this._notifyObservers("updated");
      this._lastUpdateNotification = now;
    }
  },

  _removeChatsForAccount: function(aAccId) {
    if (!this._chatsByAccountIdAndName.has(aAccId))
      return;
    // Keep only convs that either aren't chats or have a different account id.
    this._convs = this._convs.filter(c =>
      c.source != "chat" || c.accountId != aAccId);
    this._chatsByAccountIdAndName.delete(aAccId);
    this._pendingChats = this._pendingChats.filter(c => c.accountId != aAccId);
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
    let scoreA = aPossibleConvA.computedScore;
    let scoreB = aPossibleConvB.computedScore;
    // We want conversations with stats (both contacts and chats) to appear first,
    // followed by contacts with no stats, and finally chats with no stats.
    // Conversations with stats have a positive score.
    // Contacts with no stats get a 0, and chats get -1.
    let sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;
    return sign(scoreB) - sign(scoreA) ||
      scoreB - scoreA ||
      aPossibleConvB.statusType - aPossibleConvA.statusType ||
      aPossibleConvA.lowerCaseName.localeCompare(aPossibleConvB.lowerCaseName);
  },

  _repositionConvsWithUpdatedStats: function() {
    for (let conv of this._convsWithUpdatedStats) {
      let currentPos = this._convs.indexOf(conv);
      // If the conv is no longer in the list (perhaps the contact was removed),
      // don't try to reposition it.
      if (currentPos == -1)
        continue;
      this._convs.splice(currentPos, 1);
      let newPos = this._getPositionToInsert(conv, this._convs);
      this._convs.splice(newPos, 0, conv);
    }
    this._convsWithUpdatedStats.clear();
  },

  getFilteredConvs: function(aFilterStr) {
    this._repositionConvsWithUpdatedStats();

    // Duplicate this._convs to avoid modifying it while adding existing convs.
    let filteredConvs = this._convs.slice(0);
    let existingConvs = Services.conversations.getUIConversations().map(
                          uiConv => new ExistingConversation(uiConv));
    for (let existingConv of existingConvs) {
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
      let pos = this._getPositionToInsert(existingConv, filteredConvs);
      filteredConvs.splice(pos, 0, existingConv);
    }
    if (aFilterStr) {
      let searchWords = aFilterStr.toLowerCase().split(/\s+/);
      filteredConvs = filteredConvs.filter(function(c) {
        let words = c.lowerCaseName.split(/\s+/);
        return searchWords.every(function(s) {
          return words.some(function(word) {
            if (word.startsWith(s))
              return true;
            // Ignore channel prefix characters.
            while (word.length && "#&+!@_*".indexOf(word[0]) != -1) {
              word = word.substr(1);
              if (word.startsWith(s))
                return true;
            }
            return false;
          });
        });
      });
    }
    return new nsSimpleEnumerator(filteredConvs);
  },

  _cacheAllStats: function() {
    // Don't save anything to the JSON file until log sweeping is done. This is to
    // ensure that a re-sweep is triggered on next startup if log sweeping could
    // not complete.
    if (gLogParser.inProgress)
      return;
    // Don't cache anything if we encountered an error during log sweeping, so
    // a fresh log sweep is triggered on next startup.
    if (gLogParser.error)
      return;
    // Don't save stats to disk if the user has disabled conversation logging.
    if (!Services.prefs.getBoolPref("purple.logging.log_ims"))
      return;
    let encoder = new TextEncoder();
    let objToWrite = {version: gStatsCacheVersion, stats: gStatsByConvId};
    OS.File.writeAtomic(this._statsCacheFilePath,
                        encoder.encode(JSON.stringify(objToWrite)),
                        {tmpPath: this._statsCacheFilePath + ".tmp"});
    if (this._statsCacheUpdateTimer) {
      clearTimeout(this._statsCacheUpdateTimer);
      delete this._statsCacheUpdateTimer;
    }
  },

  _requestRoomInfo: function() {
    let accounts = Services.accounts.getAccounts();
    while (accounts.hasMoreElements()) {
      let acc = accounts.getNext();
      let id = acc.id;
      if (acc.connected && acc.canJoinChat && (!this._chatsByAccountIdAndName.has(id) ||
          acc.prplAccount.isRoomInfoStale)) {
        // Discard any chat room data we already have.
        this._removeChatsForAccount(id);
        try {
          acc.prplAccount.requestRoomInfo(function(aRoomInfo, aPrplAccount, aCompleted) {
            if (aCompleted)
              this._accountsRequestingRoomInfo.delete(acc.id);
            this._pendingChats = this._pendingChats.concat(aRoomInfo);
            if (this._addingPendingChats)
              return;
            this._addingPendingChats = true;
            executeSoon(this._addPendingChats.bind(this));
          }.bind(this));
          this._accountsRequestingRoomInfo.add(acc.id);
        } catch(e) {
          if (e.result != Cr.NS_ERROR_NOT_IMPLEMENTED)
            Cu.reportError(e);
          continue;
        }
      }
    }
  },

  addObserver: function(aObserver) {
    if (this._observers.indexOf(aObserver) != -1)
      return;
    this._observers.push(aObserver);

    if (gLogParser.inProgress)
      aObserver.observe(this, "stats-service-log-sweeping", "ongoing");

    this._repositionConvsWithUpdatedStats();

    // We request chat lists from accounts when adding new observers.
    this._requestRoomInfo();
  },

  removeObserver: function(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },

  _notifyObservers: function(aTopic, aData) {
    for (let observer of this._observers) {
      if ("observe" in observer) // Avoid failing on destructed XBL bindings.
        observer.observe(this, "stats-service-" + aTopic, aData);
    }
  },

  // Maps prplConversation ids to their ConversationStats objects.
  _statsByPrplConvId: new Map(),
  // Maps prplConversation ids to the corresponding PossibleConversations.
  _convsByPrplConvId: new Map(),
  // These will be repositioned to reflect their new scores when a newtab is opened.
  _convsWithUpdatedStats: new Set(),
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "profile-after-change")
      Services.obs.addObserver(this, "prpl-init", false);
    else if (aTopic == "prpl-init") {
      executeSoon(this._init.bind(this));
      Services.obs.removeObserver(this, "prpl-init");
    }
    else if (aTopic == "prpl-quit") {
      // Update the stats cache only if there was already an update scheduled.
      if (this._statsCacheUpdateTimer)
        this._cacheAllStats();
    }
    else if (aTopic == "new-text") {
      if (aSubject.system) // We don't care about system messages.
        return;

      let conv = aSubject.conversation;
      let stats = this._statsByPrplConvId.get(conv.id);
      aSubject.outgoing ? ++stats.outgoingCount : ++stats.incomingCount;
      stats.lastDate = Date.now();
      // Ensure the score is recomputed next time it's used.
      delete stats._computedScore;

      let possibleConv = this._convsByPrplConvId.get(conv.id);
      if (possibleConv) {
        if (possibleConv.source == "contact" && gStatsByContactId)
          delete gStatsByContactId[possibleConv._contactId];
        this._convsWithUpdatedStats.add(possibleConv);
      }

      // Schedule a cache update in 10 minutes.
      if (!this._statsCacheUpdateTimer) {
        this._statsCacheUpdateTimer =
          setTimeout(this._cacheAllStats.bind(this), 600000);
      }
    }
    else if (aTopic == "new-conversation") {
      let conv = aSubject;
      let id = getConversationId(conv.account.protocol.normalizedName,
                                 conv.account.normalizedName,
                                 conv.normalizedName, conv.isChat);
      if (!(id in gStatsByConvId))
        gStatsByConvId[id] = new ConversationStats(id);
      this._statsByPrplConvId.set(conv.id, gStatsByConvId[id]);

      let possibleConv = null;
      if (conv.buddy) {
        // First .buddy is a prplIAccountBuddy, second one is an imIBuddy.
        let contact = conv.buddy.buddy.contact;
        if (contact)
          possibleConv = this._contactsById.get(contact.id);
      }
      else if (conv.isChat) {
        let chatList = this._chatsByAccountIdAndName.get(conv.account.id);
        if (chatList && chatList.has(conv.normalizedName))
          possibleConv = chatList.get(conv.name);
      }
      this._convsByPrplConvId.set(conv.id, possibleConv);
    }
    else if (aTopic == "conversation-closed")
      this._statsByPrplConvId.delete(aSubject.id);
    else if (aTopic == "contact-no-longer-dummy") {
      // Contact ID changed. aData is the old ID.
      let id = aSubject.id;
      let oldId = parseInt(aData, 10);
      this._contactsById.set(id, this._contactsById.get(oldId));
      this._contactsById.delete(oldId);
      this._contactsById.get(id)._contactId = id;
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
    else if (aTopic == "account-connected" &&
             this._observers.length) {
      // Ensure the existing newtabs have roomInfo for this account.
      this._requestRoomInfo();
    }
    else if (aTopic == "account-disconnected") {
      let id = aSubject.id;
      this._accountsRequestingRoomInfo.delete(id);
      this._removeChatsForAccount(id);
    }
    this._notifyObservers("updated");
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.ibIConvStatsService]),
  classDescription: "ConvStatsService",
  classID: Components.ID("{1d9be575-87a4-4f2f-b414-c67a560f29fd}"),
  contractID: "@instantbird.org/conv-stats-service;1"
};

function getConversationId(aProtocol, aAccount, aConversation, aIsChat) {
  // aProtocol, aAccount, aConversation must be normalizedNames.
  let id = [aProtocol, aAccount, aConversation].join("/");
  if (aIsChat)
    id += ".chat";
  return id;
}

function ConversationStats(aConvId = "", aLastDate = 0,
                           aIncomingCount = 0, aOutgoingCount = 0) {
  this.id = aConvId;
  this.lastDate = aLastDate;
  this.incomingCount = aIncomingCount;
  this.outgoingCount = aOutgoingCount;
}
ConversationStats.prototype = {
  id: "",
  lastDate: 0,
  ONE_DAY: 24 * 60 * 60 * 1000,
  get daysBefore() { return (Date.now() - this.lastDate) / this.ONE_DAY; },
  get msgCount() { return this.incomingCount + this.outgoingCount; },
  incomingCount: 0,
  outgoingCount: 0,
  get frequencyMultiplier() {
    return this.outgoingCount / (this.incomingCount || 1);
  },
  get recencyMultiplier() {
    let daysBefore = this.daysBefore;
    if (daysBefore < 4)
      return 1;
    if (daysBefore < 14)
      return 0.7;
    if (daysBefore < 31)
      return 0.5;
    if (daysBefore < 90)
      return 0.3;
    return 0.1;
  },
  get computedScore() {
    return this._computedScore || (this._computedScore =
      this.msgCount * this.frequencyMultiplier * this.recencyMultiplier);
  },
  mergeWith: function(aOtherStats) {
    let stats = new ConversationStats();
    stats.lastDate = Math.max(this.lastDate, aOtherStats.lastDate);
    stats.incomingCount = this.incomingCount + aOtherStats.incomingCount;
    stats.outgoingCount = this.outgoingCount + aOtherStats.outgoingCount;
    return stats;
  }
}

var PossibleConversation = {
  get displayName() { return this._displayName; },
  get lowerCaseName() {
    return this._lowerCaseName || (this._lowerCaseName = this._displayName.toLowerCase());
  },
  _isChat: false, // False by default. Extensions should override this.
  get isChat() { return this._isChat; },
  get statusType() { return this._statusType; },
  get statusText() { return this._statusText; },
  get infoText() { return this._infoText; },
  get buddyIconFilename() { return this._buddyIconFilename; },
  QueryInterface: XPCOMUtils.generateQI([Ci.ibIPossibleConversation])
};

function PossibleConvFromContact(aContact) {
  this._displayName = aContact.displayName;
  this._statusType = aContact.statusType;
  this._statusText = aContact.statusText;
  this._contactId = aContact.id;
}
PossibleConvFromContact.prototype = {
  __proto__: PossibleConversation,
  get statusText() { return this._statusText; },
  get source() { return "contact"; },
  get id() {
    let buddy = this.contact.preferredBuddy;
    return getConversationId(buddy.protocol.normalizedName,
                             buddy.preferredAccountBuddy.account.normalizedName,
                             buddy.normalizedName, false);
  },
  get buddyIds() {
    let buddies = this.contact.getBuddies();
    let ids = [];
    for (let buddy of buddies) {
      let accountbuddies = buddy.getAccountBuddies();
      for (let accountbuddy of accountbuddies) {
        ids.push(getConversationId(buddy.protocol.normalizedName,
                                   accountbuddy.account.normalizedName,
                                   accountbuddy.normalizedName, false));
      }
    }
    return ids;
  },
  get lowerCaseName() {
    if (!this._lowerCaseName) {
      let buddies = this.contact.getBuddies();
      let names = [b.displayName for (b of buddies)].join(" ");
      this._lowerCaseName = names.toLowerCase();
    }
    return this._lowerCaseName;
  },
  get buddyIconFilename() { return this.contact.buddyIconFilename; },
  get infoText() {
    let tagNames = this.contact.getTags().map(aTag => aTag.name);
    tagNames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return tagNames.join(", ");
  },
  get contact() { return Services.contacts.getContactById(this._contactId); },
  get account() { return this.contact.preferredBuddy.preferredAccountBuddy.account; },
  get computedScore() {
    let contactId = this._contactId;
    if (gStatsByContactId && gStatsByContactId[contactId])
      return gStatsByContactId[contactId].computedScore;
    // Contacts may have multiple buddies attached to them, so we sum their
    // individual message counts before arriving at the final score.
    let stats = new ConversationStats();
    for (let id of this.buddyIds) {
      let buddyStats = gStatsByConvId[id];
      if (buddyStats)
        stats = stats.mergeWith(buddyStats);
    }
    if (gStatsByContactId)
      gStatsByContactId[contactId] = stats;
    let score = stats.computedScore;
    // We apply a negative bias if statusType / STATUS_AVAILABLE is less than 0.5
    // (i.e. our status is less than or equal to STATUS_MOBILE), and a positive
    // one otherwise.
    score *= 0.5 + this.statusType / Ci.imIStatusInfo.STATUS_AVAILABLE;
    if (!this.contact.canSendMessage)
      score *= 0.75;
    return score;
  },
  createConversation: function() { return this.contact.createConversation(); }
};

function PossibleChat(aRoomInfo) {
  this._roomInfo = aRoomInfo;
  let account = this.account;
  this.id = getConversationId(account.protocol.normalizedName,
                              account.normalizedName,
                              account.normalize(aRoomInfo.name), true);
}
PossibleChat.prototype = {
  get isChat() { return true; },
  get statusType() { return Ci.imIStatusInfo.STATUS_AVAILABLE; },
  get buddyIconFilename() { return ""; },
  get displayName() { return this._roomInfo.name; },
  get lowerCaseName() {
    return this._lowerCaseName || (this._lowerCaseName = this.displayName.toLowerCase());
  },
  get statusText() {
    return "(" + this._roomInfo.participantCount + ") " + this._roomInfo.topic;
  },
  get infoText() { return this.account.normalizedName; },
  get source() { return "chat"; },
  get accountId() { return this._roomInfo.accountId; },
  get account() { return Services.accounts.getAccountById(this.accountId); },
  createConversation: function() {
    this.account.joinChat(this._roomInfo.chatRoomFieldValues);
    // Work around the fact that joinChat doesn't return the conv.
    return Services.conversations
                   .getConversationByNameAndAccount(this._roomInfo.name,
                                                    this.account, true);
  },
  get computedScore() {
    let stats = gStatsByConvId[this.id];
    if (stats && stats.computedScore)
      return stats.computedScore;
    // Force chats without a score to the end of the list.
    return -1;
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.ibIPossibleConversation])
};

function ExistingConversation(aUIConv) {
  this._convId = aUIConv.target.id;
  let account = aUIConv.account;
  this.id = getConversationId(account.protocol.normalizedName,
                              account.normalizedName,
                              aUIConv.normalizedName,
                              aUIConv.isChat);
  this._displayName = aUIConv.title;
  this._isChat = aUIConv.isChat;
  if (aUIConv.isChat) {
    this._statusText = aUIConv.topic;
    this._statusType = PossibleChat.prototype.statusType;
    this._buddyIconFilename = "";
  }
  else {
    let buddy = aUIConv.buddy;
    if (buddy) {
      this._statusType = buddy.statusType;
      this._statusText = buddy.statusText;
      this._buddyIconFilename = buddy.buddyIconFilename;
      this._lowerCaseName = aUIConv.contact.getBuddies()
                                   .map(b => b.displayName)
                                   .join(" ").toLowerCase();
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
  get source() { return "existing"; },
  get uiConv() {
    return Services.conversations.getUIConversation(Services.conversations
                   .getConversationById(this._convId));
  },
  get account() { return this.uiConv.account; },
  get computedScore() {
    let stats = gStatsByConvId[this.id];
    if (!stats) {
      // Force chats without a score to the end of the list.
      return this.isChat ? -1 : 0;
    }
    let score = stats.computedScore;
    // Give existing chats a negative bias. It's unlikely the user wants to
    // reopen them.
    if (this.isChat)
      score *= 0.8;
    // We don't apply the status biasing that PossibleConvFromContact does because
    // existing conversations are not as likely to be reopened as an available
    // contact, but are more likely to be reopened than an offline contact.
    // Averaging this out eliminates the status bias.
    return score;
  },
  createConversation: function() { return this.uiConv.target; }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ConvStatsService]);
