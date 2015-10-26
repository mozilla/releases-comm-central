/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [
  "GenericAccountPrototype",
  "GenericAccountBuddyPrototype",
  "GenericConvIMPrototype",
  "GenericConvChatPrototype",
  "GenericConvChatBuddyPrototype",
  "GenericConversationPrototype",
  "GenericMessagePrototype",
  "GenericProtocolPrototype",
  "Message",
  "TooltipInfo"
];

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/conversations.properties")
);

var GenericAccountPrototype = {
  __proto__: ClassInfo("prplIAccount", "generic account object"),
  get wrappedJSObject() { return this; },
  _init: function _init(aProtocol, aImAccount) {
    this.protocol = aProtocol;
    this.imAccount = aImAccount;
    initLogModule(aProtocol.id, this);
  },
  observe: function(aSubject, aTopic, aData) {},
  remove: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  unInit: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  connect: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  disconnect: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  createConversation: function(aName) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  joinChat: function(aComponents) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  setBool: function(aName, aVal) {},
  setInt: function(aName, aVal) {},
  setString: function(aName, aVal) {},

  get name() { return this.imAccount.name; },
  get connected() { return this.imAccount.connected; },
  get connecting() { return this.imAccount.connecting; },
  get disconnected() { return this.imAccount.disconnected; },
  get disconnecting() { return this.imAccount.disconnecting; },
  _connectionErrorReason: Ci.prplIAccount.NO_ERROR,
  get connectionErrorReason() { return this._connectionErrorReason; },

  /*
   * Convert a socket's nsISSLStatus into a prplIAccount connection error. Store
   * the nsISSLStatus and the connection location on the account so the
   * certificate exception dialog can access the information.
   */
  handleBadCertificate: function(aSocket, aIsSslError) {
    this._connectionTarget = aSocket.host + ":" + aSocket.port;

    if (aIsSslError)
      return Ci.prplIAccount.ERROR_ENCRYPTION_ERROR;

    let sslStatus = this._sslStatus = aSocket.sslStatus;
    if (!sslStatus)
      return Ci.prplIAccount.ERROR_CERT_NOT_PROVIDED;

    if (sslStatus.isUntrusted) {
      if (sslStatus.serverCert &&
          sslStatus.serverCert.isSelfSigned)
        return Ci.prplIAccount.ERROR_CERT_SELF_SIGNED;
      return Ci.prplIAccount.ERROR_CERT_UNTRUSTED;
    }

    if (sslStatus.isNotValidAtThisTime) {
      if (sslStatus.serverCert &&
          sslStatus.serverCert.validity.notBefore < Date.now() * 1000)
        return Ci.prplIAccount.ERROR_CERT_NOT_ACTIVATED;
      return Ci.prplIAccount.ERROR_CERT_EXPIRED;
    }

    if (sslStatus.isDomainMismatch)
      return Ci.prplIAccount.ERROR_CERT_HOSTNAME_MISMATCH;

    // XXX ERROR_CERT_FINGERPRINT_MISMATCH

    return Ci.prplIAccount.ERROR_CERT_OTHER_ERROR;
  },
  _connectionTarget: "",
  get connectionTarget() { return this._connectionTarget; },
  _sslStatus: null,
  get sslStatus() { return this._sslStatus; },

  reportConnected: function() {
    this.imAccount.observe(this, "account-connected", null);
  },
  reportConnecting: function(aConnectionStateMsg) {
    // Delete any leftover errors from the previous connection.
    delete this._connectionTarget;
    delete this._sslStatus;

    if (!this.connecting)
      this.imAccount.observe(this, "account-connecting", null);
    if (aConnectionStateMsg)
      this.imAccount.observe(this, "account-connect-progress", aConnectionStateMsg);
  },
  reportDisconnected: function() {
    this.imAccount.observe(this, "account-disconnected", null);
  },
  reportDisconnecting: function(aConnectionErrorReason, aConnectionErrorMessage) {
    this._connectionErrorReason = aConnectionErrorReason;
    this.imAccount.observe(this, "account-disconnecting", aConnectionErrorMessage);
    this.cancelPendingBuddyRequests();
  },

  // Called when the user adds a new buddy from the UI.
  addBuddy: function(aTag, aName) {
    Services.contacts
            .accountBuddyAdded(new AccountBuddy(this, null, aTag, aName));
  },
  // Called during startup for each of the buddies in the local buddy list.
  loadBuddy: function(aBuddy, aTag) {
   try {
     return new AccountBuddy(this, aBuddy, aTag);
   } catch (x) {
     dump(x + "\n");
     return null;
   }
  },

  _pendingBuddyRequests: null,
  addBuddyRequest: function(aUserName, aGrantCallback, aDenyCallback) {
    if (!this._pendingBuddyRequests)
      this._pendingBuddyRequests = [];
    let buddyRequest = {
      get account() { return this._account.imAccount; },
      get userName() { return aUserName; },
      _account: this,
      // Grant and deny callbacks both receive the auth request object as an
      // argument for further use.
      grant: function() {
        aGrantCallback(this);
        this._remove();
      },
      deny: function() {
        aDenyCallback(this);
        this._remove();
      },
      cancel: function() {
        Services.obs.notifyObservers(this,
                                     "buddy-authorization-request-canceled",
                                     null);
        this._remove();
      },
      _remove: function() {
        this._account.removeBuddyRequest(this);
      },
      QueryInterface: XPCOMUtils.generateQI([Ci.prplIBuddyRequest])
    };
    this._pendingBuddyRequests.push(buddyRequest);
    Services.obs.notifyObservers(buddyRequest, "buddy-authorization-request",
                                 null);
  },
  removeBuddyRequest: function(aRequest) {
    if (!this._pendingBuddyRequests)
      return;

    this._pendingBuddyRequests =
      this._pendingBuddyRequests.filter(r => r !== aRequest);
  },
  cancelPendingBuddyRequests: function() {
    if (!this._pendingBuddyRequests)
      return;

    for each (let request in this._pendingBuddyRequests)
      request.cancel();
    delete this._pendingBuddyRequests;
  },

  requestBuddyInfo: function(aBuddyName) {},

  get canJoinChat() { return false; },
  getChatRoomFields: function() {
    if (!this.chatRoomFields)
      return EmptyEnumerator;

    let fields = [];
    for (let fieldName in this.chatRoomFields)
      fields.push(new ChatRoomField(fieldName, this.chatRoomFields[fieldName]));
    return new nsSimpleEnumerator(fields);
  },
  getChatRoomDefaultFieldValues: function(aDefaultChatName) {
    if (!this.chatRoomFields)
      return EmptyEnumerator;

    let defaultFieldValues = [];
    for (let fieldName in this.chatRoomFields)
      defaultFieldValues[fieldName] = this.chatRoomFields[fieldName].default;

    if (aDefaultChatName && "parseDefaultChatName" in this) {
      let parsedDefaultChatName = this.parseDefaultChatName(aDefaultChatName);
      for (let field in parsedDefaultChatName)
        defaultFieldValues[field] = parsedDefaultChatName[field];
    }

    return new ChatRoomFieldValues(defaultFieldValues);
  },
  requestRoomInfo: function(aCallback) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get isRoomInfoStale() { return false; },

  getPref: function (aName, aType) {
    return this.prefs.prefHasUserValue(aName) ?
           this.prefs["get" + aType + "Pref"](aName) :
           this.protocol._getOptionDefault(aName);
  },
  getInt: function(aName) { return this.getPref(aName, "Int"); },
  getBool: function(aName) { return this.getPref(aName, "Bool"); },
  getString: function(aName) {
    return this.prefs.prefHasUserValue(aName) ?
             this.prefs.getComplexValue(aName, Ci.nsISupportsString).data :
             this.protocol._getOptionDefault(aName);
  },

  get prefs() {
    return this._prefs ||
           (this._prefs = Services.prefs.getBranch("messenger.account." +
                                                   this.imAccount.id + ".options."));
  },

  get normalizedName() { return this.normalize(this.name); },
  normalize: function(aName) { return aName.toLowerCase(); },

  get proxyInfo() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  set proxyInfo(val) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },

  get HTMLEnabled() { return false; },
  get HTMLEscapePlainText() { return false; },
  get noBackgroundColors() { return true; },
  get autoResponses() { return false; },
  get singleFormatting() { return false; },
  get noFontSizes() { return false; },
  get noUrlDesc() { return false; },
  get noImages() { return true; }
};


var GenericAccountBuddyPrototype = {
  __proto__: ClassInfo("prplIAccountBuddy", "generic account buddy object"),
  get DEBUG() { return this._account.DEBUG; },
  get LOG() { return this._account.LOG; },
  get WARN() { return this._account.WARN; },
  get ERROR() { return this._account.ERROR; },

  _init: function(aAccount, aBuddy, aTag, aUserName) {
    if (!aBuddy && !aUserName)
      throw "aUserName is required when aBuddy is null";

    this._tag = aTag;
    this._account = aAccount;
    this._buddy = aBuddy;
    if (aBuddy) {
      let displayName = aBuddy.displayName;
      if (displayName != aUserName)
        this._serverAlias = displayName;
    }
    this._userName = aUserName;
  },
  unInit: function() {
    delete this._tag;
    delete this._account;
    delete this._buddy;
  },

  get account() { return this._account.imAccount; },
  set buddy(aBuddy) {
    if (this._buddy)
      throw Cr.NS_ERROR_ALREADY_INITIALIZED;
    this._buddy = aBuddy;
  },
  get buddy() { return this._buddy; },
  get tag() { return this._tag; },
  set tag(aNewTag) {
    let oldTag = this._tag;
    this._tag = aNewTag;
    Services.contacts.accountBuddyMoved(this, oldTag, aNewTag);
  },

  _notifyObservers: function(aTopic, aData) {
    try {
      this._buddy.observe(this, "account-buddy-" + aTopic, aData);
    } catch(e) {
      this.ERROR(e);
    }
  },

  _userName: "",
  get userName() { return this._userName || this._buddy.userName; },
  get normalizedName() { return this._account.normalize(this.userName); },
  _serverAlias: "",
  get serverAlias() { return this._serverAlias; },
  set serverAlias(aNewAlias) {
    let old = this.displayName;
    this._serverAlias = aNewAlias;
    if (old != this.displayName)
      this._notifyObservers("display-name-changed", old);
  },

  remove: function() {
    Services.contacts.accountBuddyRemoved(this);
  },

  // imIStatusInfo implementation
  get displayName() { return this.serverAlias || this.userName; },
  _buddyIconFileName: "",
  get buddyIconFilename() { return this._buddyIconFileName; },
  set buddyIconFilename(aNewFileName) {
    this._buddyIconFileName = aNewFileName;
    this._notifyObservers("icon-changed");
  },
  _statusType: 0,
  get statusType() { return this._statusType; },
  get online() { return this._statusType > Ci.imIStatusInfo.STATUS_OFFLINE; },
  get available() { return this._statusType == Ci.imIStatusInfo.STATUS_AVAILABLE; },
  get idle() { return this._statusType == Ci.imIStatusInfo.STATUS_IDLE; },
  get mobile() { return this._statusType == Ci.imIStatusInfo.STATUS_MOBILE; },
  _statusText: "",
  get statusText() { return this._statusText; },

  // This is for use by the protocol plugin, it's not exposed in the
  // imIStatusInfo interface.
  // All parameters are optional and will be ignored if they are null
  // or undefined.
  setStatus: function(aStatusType, aStatusText, aAvailabilityDetails) {
    // Ignore omitted parameters.
    if (aStatusType === undefined || aStatusType === null)
      aStatusType = this._statusType;
    if (aStatusText === undefined || aStatusText === null)
      aStatusText = this._statusText;
    if (aAvailabilityDetails === undefined || aAvailabilityDetails === null)
      aAvailabilityDetails = this._availabilityDetails;

    // Decide which notifications should be fired.
    let notifications = [];
    if (this._statusType != aStatusType ||
        this._availabilityDetails != aAvailabilityDetails)
      notifications.push("availability-changed");
    if (this._statusType != aStatusType ||
        this._statusText != aStatusText) {
      notifications.push("status-changed");
      if (this.online && aStatusType <= Ci.imIStatusInfo.STATUS_OFFLINE)
        notifications.push("signed-off");
      if (!this.online && aStatusType > Ci.imIStatusInfo.STATUS_OFFLINE)
        notifications.push("signed-on");
    }

    // Actually change the stored status.
    [this._statusType, this._statusText, this._availabilityDetails] =
      [aStatusType, aStatusText, aAvailabilityDetails];

    // Fire the notifications.
    notifications.forEach(function(aTopic) {
      this._notifyObservers(aTopic);
    }, this);
  },

  _availabilityDetails: 0,
  get availabilityDetails() { return this._availabilityDetails; },

  get canSendMessage() { return this.online /*|| this.account.canSendOfflineMessage(this) */; },

  getTooltipInfo: () => EmptyEnumerator,
  createConversation: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; }
};

// aUserName is required only if aBuddy is null, i.e., we are adding a buddy.
function AccountBuddy(aAccount, aBuddy, aTag, aUserName) {
  this._init(aAccount, aBuddy, aTag, aUserName);
}
AccountBuddy.prototype = GenericAccountBuddyPrototype;

var GenericMessagePrototype = {
  __proto__: ClassInfo("prplIMessage", "generic message object"),

  _lastId: 0,
  _init: function (aWho, aMessage, aObject) {
    this.id = ++GenericMessagePrototype._lastId;
    this.time = Math.round(new Date() / 1000);
    this.who = aWho;
    this.message = aMessage;
    this.originalMessage = aMessage;

    if (aObject)
      for (let i in aObject)
        this[i] = aObject[i];
  },
  _alias: "",
  get alias() { return this._alias || this.who; },
  _iconURL: "",
  get iconURL() {
    // If the protocol plugin has explicitly set an icon for the message, use it.
    if (this._iconURL)
      return this._iconURL;

    // Otherwise, attempt to find a buddy for incoming messages, and forward the call.
    if (this.incoming && this._conversation && !this._conversation.isChat) {
      let buddy = this._conversation.buddy;
      if (buddy)
        return buddy.buddyIconFilename;
    }
    return "";
  },
  _conversation: null,
  get conversation() { return this._conversation; },
  set conversation(aConv) {
    this._conversation = aConv;
    aConv.notifyObservers(this, "new-text", null);
  },

  outgoing: false,
  incoming: false,
  system: false,
  autoResponse: false,
  containsNick: false,
  noLog: false,
  error: false,
  delayed: false,
  noFormat: false,
  containsImages: false,
  notification: false,
  noLinkification: false,

  getActions: function(aCount) {
    if (aCount)
      aCount.value = 0;
    return [];
  }
};

function Message(aWho, aMessage, aObject) {
  this._init(aWho, aMessage, aObject);
}
Message.prototype = GenericMessagePrototype;


var GenericConversationPrototype = {
  __proto__: ClassInfo("prplIConversation", "generic conversation object"),
  get wrappedJSObject() { return this; },

  get DEBUG() { return this._account.DEBUG; },
  get LOG() { return this._account.LOG; },
  get WARN() { return this._account.WARN; },
  get ERROR() { return this._account.ERROR; },

  _init: function(aAccount, aName) {
    this._account = aAccount;
    this._name = aName;
    this._observers = [];
    this._date = new Date() * 1000;
    Services.conversations.addConversation(this);
  },

  _id: 0,
  get id() { return this._id; },
  set id(aId) {
    if (this._id)
      throw Cr.NS_ERROR_ALREADY_INITIALIZED;
    this._id = aId;
  },

  addObserver: function(aObserver) {
    if (this._observers.indexOf(aObserver) == -1)
      this._observers.push(aObserver);
  },
  removeObserver: function(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  notifyObservers: function(aSubject, aTopic, aData) {
    for each (let observer in this._observers) {
      try {
        observer.observe(aSubject, aTopic, aData);
      } catch(e) {
        this.ERROR(e);
      }
    }
  },

  prepareForSending: (aOutgoingMessage, aCount) => null,
  prepareForDisplaying: function(aImMessage) {
    if (aImMessage.displayMessage !== aImMessage.message) {
      this.DEBUG("Preparing:\n" + aImMessage.message + "\nDisplaying:\n" +
                 aImMessage.displayMessage);
    }
  },
  sendMsg: function(aMsg) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  sendTyping: aString => Ci.prplIConversation.NO_TYPING_LIMIT,

  close: function() {
    Services.obs.notifyObservers(this, "closing-conversation", null);
    Services.conversations.removeConversation(this);
  },
  unInit: function() {
    delete this._account;
    delete this._observers;
  },

  writeMessage: function(aWho, aText, aProperties) {
    (new Message(aWho, aText, aProperties)).conversation = this;
  },

  get account() { return this._account.imAccount; },
  get name() { return this._name; },
  get normalizedName() { return this._account.normalize(this.name); },
  get title() { return this.name; },
  get startDate() { return this._date; }
};

var GenericConvIMPrototype = {
  __proto__: GenericConversationPrototype,
  _interfaces: [Ci.prplIConversation, Ci.prplIConvIM],
  classDescription: "generic ConvIM object",

  updateTyping: function(aState, aName) {
    if (aState == this.typingState)
      return;

    if (aState == Ci.prplIConvIM.NOT_TYPING)
      delete this.typingState;
    else
      this.typingState = aState;
    this.notifyObservers(null, "update-typing", aName);
  },

  get isChat() { return false; },
  buddy: null,
  typingState: Ci.prplIConvIM.NOT_TYPING
};

var GenericConvChatPrototype = {
  __proto__: GenericConversationPrototype,
  _interfaces: [Ci.prplIConversation, Ci.prplIConvChat],
  classDescription: "generic ConvChat object",

  _init: function(aAccount, aName, aNick) {
    this._participants = new Map();
    this.nick = aNick;
    GenericConversationPrototype._init.call(this, aAccount, aName);
  },

  get isChat() { return true; },

  // Stores the prplIChatRoomFieldValues required to join this channel
  // to enable later reconnections. If null, the MUC will not be reconnected
  // automatically after disconnections.
  chatRoomFields: null,

  _topic: "",
  _topicSetter: null,
  get topic() { return this._topic; },
  get topicSettable() { return false; },
  get topicSetter() { return this._topicSetter; },
  setTopic: function(aTopic, aTopicSetter, aQuiet) {
    // Only change the topic if the topic and/or topic setter has changed.
    if (this._topic == aTopic &&
        (!this._topicSetter || this._topicSetter == aTopicSetter))
      return;

    this._topic = aTopic;
    this._topicSetter = aTopicSetter;

    this.notifyObservers(null, "chat-update-topic");

    if (aQuiet)
      return;

    // Send the topic as a message.
    let message;
    if (aTopicSetter) {
      if (aTopic)
        message = _("topicChanged", aTopicSetter, aTopic);
      else
        message = _("topicCleared", aTopicSetter);
    }
    else {
      aTopicSetter = null;
      if (aTopic)
        message = _("topicSet", this.name, aTopic);
      else
        message = _("topicNotSet", this.name);
    }
    this.writeMessage(aTopicSetter, message, {system: true});
  },

  get nick() { return this._nick; },
  set nick(aNick) {
    this._nick = aNick;
    let escapedNick = this._nick.replace(/[[\]{}()*+?.\\^$|]/g, "\\$&");
    this._pingRegexp = new RegExp("(?:^|\\W)" + escapedNick + "(?:\\W|$)", "i");
  },

  _left: false,
  get left() { return this._left; },
  set left(aLeft) {
    if (aLeft == this._left)
      return;
    this._left = aLeft;
    this.notifyObservers(null, "update-conv-chatleft");
  },

  _joining: false,
  get joining() { return this._joining; },
  set joining(aJoining) {
    if (aJoining == this._joining)
      return;
    this._joining = aJoining;
    this.notifyObservers(null, "update-conv-chatjoining");
  },

  getParticipant: function(aName) {
    return this._participants.has(aName) ? this._participants.get(aName) : null;
  },
  getParticipants: function() {
    // Convert the values of the Map into a nsSimpleEnumerator.
    return new nsSimpleEnumerator(
      [participant for (participant of this._participants.values())]
    );
  },
  getNormalizedChatBuddyName: aChatBuddyName => aChatBuddyName,

  // Updates the nick of a participant in conversation to a new one.
  updateNick: function(aOldNick, aNewNick, isOwnNick) {
    let message;
    let isParticipant = this._participants.has(aOldNick);
    if (isOwnNick) {
      // If this is the user's nick, change it.
      this.nick = aNewNick;
      message = _("nickSet.you", aNewNick);

      // If the account was disconnected, it's OK the user is not a participant.
      if (!isParticipant)
        return;
    }
    else if (!isParticipant) {
      this.ERROR("Trying to rename nick that doesn't exist! " + aOldNick +
                 " to " + aNewNick);
      return;
    }
    else
      message = _("nickSet", aOldNick, aNewNick);

    // Get the original participant and then remove it.
    let participant = this._participants.get(aOldNick);
    this._participants.delete(aOldNick);

    // Update the nickname and add it under the new nick.
    participant.name = aNewNick;
    this._participants.set(aNewNick, participant);

    this.notifyObservers(participant, "chat-buddy-update", aOldNick);
    this.writeMessage(aOldNick, message, {system: true});
  },

  // Removes a participant from conversation.
  removeParticipant: function(aNick) {
    if (!this._participants.has(aNick))
      return;

    let stringNickname = Cc["@mozilla.org/supports-string;1"]
                           .createInstance(Ci.nsISupportsString);
    stringNickname.data = aNick;
    this.notifyObservers(new nsSimpleEnumerator([stringNickname]),
                         "chat-buddy-remove");
    this._participants.delete(aNick);
  },

  // Removes all participant in conversation.
  removeAllParticipants: function() {
    let stringNicknames = [];
    this._participants.forEach(function(aParticipant) {
      let stringNickname = Cc["@mozilla.org/supports-string;1"]
                              .createInstance(Ci.nsISupportsString);
      stringNickname.data = aParticipant.name;
      stringNicknames.push(stringNickname);
    });
    this.notifyObservers(new nsSimpleEnumerator(stringNicknames),
                         "chat-buddy-remove");
    this._participants.clear();
  },

  writeMessage: function (aWho, aText, aProperties) {
    aProperties.containsNick =
      "incoming" in aProperties && this._pingRegexp.test(aText);
    GenericConversationPrototype.writeMessage.apply(this, arguments);
  }
};

var GenericConvChatBuddyPrototype = {
  __proto__: ClassInfo("prplIConvChatBuddy", "generic ConvChatBuddy object"),

  _name: "",
  get name() { return this._name; },
  set name(aName) { this._name = aName; },
  alias: "",
  buddy: false,
  buddyIconFilename: "",

  get noFlags() {
    return !(this.voiced || this.halfOp || this.op ||
             this.founder || this.typing);
  },
  voiced: false,
  halfOp: false,
  op: false,
  founder: false,
  typing: false
};

function TooltipInfo(aLabel, aValue, aType = Ci.prplITooltipInfo.pair) {
  this.type = aType;
  if (aType == Ci.prplITooltipInfo.status) {
    this.label = aLabel.toString();
    this.value = aValue || "";
  }
  else if (aType == Ci.prplITooltipInfo.icon)
    this.value = aValue;
  else if (aLabel === undefined || aType == Ci.prplITooltipInfo.sectionBreak)
    this.type = Ci.prplITooltipInfo.sectionBreak;
  else {
    this.label = aLabel;
    if (aValue === undefined)
      this.type = Ci.prplITooltipInfo.sectionHeader;
    else
      this.value = aValue;
  }
}
TooltipInfo.prototype = ClassInfo("prplITooltipInfo", "generic tooltip info");

/* aOption is an object containing:
 *  - label: localized text to display (recommended: use a getter with _)
 *  - default: the default value for this option. The type of the
 *      option will be determined based on the type of the default value.
 *      If the default value is a string, the option will be of type
 *      list if listValues has been provided. In that case the default
 *      value should be one of the listed values.
 *  - [optional] listValues: only if this option can only take a list of
 *      predefined values. This is an object of the form:
 *        {value1: localizedLabel, value2: ...}.
 *  - [optional] masked: boolean, if true the UI shouldn't display the value.
 *      This could typically be used for password field.
 *      Warning: The UI currently doesn't support this.
 */
function purplePref(aName, aOption) {
  this.name = aName; // Preference name
  this.label = aOption.label; // Text to display

  if (aOption.default === undefined || aOption.default === null)
    throw "A default value for the option is required to determine its type.";
  this._defaultValue = aOption.default;

  const kTypes = {boolean: "Bool", string: "String", number: "Int"};
  let type = kTypes[typeof aOption.default];
  if (!type)
    throw "Invalid option type";

  if (type == "String" && ("listValues" in aOption)) {
    type = "List";
    this._listValues = aOption.listValues;
  }
  this.type = Ci.prplIPref["type" + type];

  if ("masked" in aOption && aOption.masked)
    this.masked = true;
}
purplePref.prototype = {
  __proto__: ClassInfo("prplIPref", "generic account option preference"),

  masked: false,

  // Default value
  getBool: function() { return this._defaultValue; },
  getInt: function() { return this._defaultValue; },
  getString: function() { return this._defaultValue; },
  getList: function() {
    // Convert a JavaScript object map {"value 1": "label 1", ...}
    let keys = Object.keys(this._listValues);
    if (!keys.length)
      return EmptyEnumerator;

    return new nsSimpleEnumerator(
      keys.map(key => new purpleKeyValuePair(this._listValues[key], key))
    );
  },
  getListDefault: function() { return this._defaultValue; }
};

function purpleKeyValuePair(aName, aValue) {
  this.name = aName;
  this.value = aValue;
}
purpleKeyValuePair.prototype =
  ClassInfo("prplIKeyValuePair", "generic Key Value Pair");

function UsernameSplit(aValues) {
  this._values = aValues;
}
UsernameSplit.prototype = {
  __proto__: ClassInfo("prplIUsernameSplit", "username split object"),

  get label() { return this._values.label; },
  get separator() { return this._values.separator; },
  get defaultValue() { return this._values.defaultValue; },
  get reverse() { return !!this._values.reverse; } // Ensure boolean
};

function ChatRoomField(aIdentifier, aField) {
  this.identifier = aIdentifier;
  this.label = aField.label;
  this.required = !!aField.required;

  let type = "TEXT";
  if ((typeof aField.default) == "number") {
    type = "INT";
    this.min = aField.min;
    this.max = aField.max;
  }
  else if (aField.isPassword)
    type = "PASSWORD";
  this.type = Ci.prplIChatRoomField["TYPE_" + type];
}
ChatRoomField.prototype =
  ClassInfo("prplIChatRoomField", "ChatRoomField object");

function ChatRoomFieldValues(aMap) {
  this.values = aMap;
}
ChatRoomFieldValues.prototype = {
  __proto__: ClassInfo("prplIChatRoomFieldValues", "ChatRoomFieldValues"),

  getValue: function(aIdentifier) {
    return this.values.hasOwnProperty(aIdentifier) ? this.values[aIdentifier] : null;
  },
  setValue: function(aIdentifier, aValue) {
    this.values[aIdentifier] = aValue;
  }
};

// the name getter and the getAccount method need to be implemented by
// protocol plugins.
var GenericProtocolPrototype = {
  __proto__: ClassInfo("prplIProtocol", "Generic protocol object"),

  init: function(aId) {
    if (aId != this.id)
      throw "Creating an instance of " + aId + " but this object implements " + this.id;
  },
  get id() { return "prpl-" + this.normalizedName; },
  // This is more aggressive than the account normalization of just
  // toLowerCase() since prpl names must be only letters/numbers.
  get normalizedName() { return this.name.replace(/[^a-z0-9]/gi, "").toLowerCase(); },
  get iconBaseURI() { return "chrome://chat/skin/prpl-generic/"; },

  getAccount: function(aImAccount) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },

  _getOptionDefault: function(aName) {
    if (this.options && this.options.hasOwnProperty(aName))
      return this.options[aName].default;
    throw aName + " has no default value in " + this.id + ".";
  },
  getOptions: function() {
    if (!this.options)
      return EmptyEnumerator;

    let purplePrefs = [];
    for (let [name, option] in Iterator(this.options))
      purplePrefs.push(new purplePref(name, option));
    return new nsSimpleEnumerator(purplePrefs);
  },
  getUsernameSplit: function() {
    if (!this.usernameSplits || !this.usernameSplits.length)
      return EmptyEnumerator;

    return new nsSimpleEnumerator(
      this.usernameSplits.map(split => new UsernameSplit(split)));
  },

  registerCommands: function() {
    if (!this.commands)
      return;

    this.commands.forEach(function(command) {
      if (!command.hasOwnProperty("name") || !command.hasOwnProperty("run"))
        throw "Every command must have a name and a run function.";
      if (!("QueryInterface" in command))
        command.QueryInterface = XPCOMUtils.generateQI([Ci.imICommand]);
      if (!command.hasOwnProperty("usageContext"))
        command.usageContext = Ci.imICommand.CMD_CONTEXT_ALL;
      if (!command.hasOwnProperty("priority"))
        command.priority = Ci.imICommand.CMD_PRIORITY_PRPL;
      Services.cmd.registerCommand(command, this.id);
    }, this);
  },

  // NS_ERROR_XPC_JSOBJECT_HAS_NO_FUNCTION_NAMED errors are too noisy
  get usernameEmptyText() { return ""; },
  accountExists: () => false, //FIXME

  get uniqueChatName() { return false; },
  get chatHasTopic() { return false; },
  get noPassword() { return false; },
  get newMailNotification() { return false; },
  get imagesInIM() { return false; },
  get passwordOptional() { return false; },
  get usePointSize() { return true; },
  get registerNoScreenName() { return false; },
  get slashCommandsNative() { return false; },
  get usePurpleProxy() { return false; },

  get classDescription() { return this.name + " Protocol"; },
  get contractID() { return "@mozilla.org/chat/" + this.normalizedName + ";1"; }
};
