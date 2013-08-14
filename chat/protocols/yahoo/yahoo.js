/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");
Cu.import("resource:///modules/yahoo-session.jsm");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://chat/locale/yahoo.properties")
);

function YahooConversation(aAccount, aName)
{
  this._buddyUserName = aName;
  this._account = aAccount;
  this.buddy = aAccount.getBuddy(aName);
  this._init(aAccount);
}
YahooConversation.prototype = {
  _account: null,
  _buddyUserName: null,
  _typingTimer: null,

  close: function() {
    this._account.deleteConversation(this._buddyUserName);
    GenericConvChatPrototype.close.call(this);
  },

  sendMsg: function (aMsg) {
    // Deliver the message, then write it to the window.
    this._account._session.sendChatMessage(this._buddyUserName,
                                           this._account.encodeMessage(aMsg));
    this.finishedComposing();
    this.writeMessage(this._account.imAccount.alias, aMsg, {outgoing: true});
  },

  sendTyping: function(aString) {
    if (aString.length) {
      if (!this._typingTimer)
        this._account._session.sendTypingStatus(this._buddyUserName, true);
      this._refreshTypingTimer();
    }
    return Ci.prplIConversation.NO_TYPING_LIMIT;
  },

  finishedComposing: function() {
    this._account._session.sendTypingStatus(this._buddyUserName, false);
    this._cancelTypingTimer();
  },

  _refreshTypingTimer: function() {
    this._cancelTypingTimer();
    this._typingTimer = setTimeout(this.finishedComposing.bind(this), 10000);
  },

  _cancelTypingTimer: function() {
    if (!this._typingTimer)
      return;
    clearTimeout(this._typingTimer);
    delete this._typingTimer
    this._typingTimer = null;
  },

  get name() this._buddyUserName
};
YahooConversation.prototype.__proto__ = GenericConvIMPrototype;

function YahooConference(aAccount, aRoom, aOwner)
{
  this._account = aAccount;
  this._roomName = aRoom;
  this._owner = aOwner;
  this._init(aAccount, aRoom, aAccount.cleanUsername);
}
YahooConference.prototype = {
  _account: null,
  _roomName: null,
  _owner: null,

  close: function() {
    this._account._session.sendConferenceLogoff(this._account.cleanUsername,
                                                this.getParticipantNames(),
                                                this._roomName);
    this._account.deleteConference(this._roomName);
    GenericConvChatPrototype.close.call(this);
  },

  sendMsg: function(aMsg) {
    this._account._session.sendConferenceMessage(this.getParticipantNames(),
                                                 this._roomName,
                                                 this._account.encodeMessage(aMsg));
  },

  addParticipant: function(aName) {
    let buddy = new YahooConferenceBuddy(aName, this);
    this._participants[aName] = buddy;
    this.notifyObservers(new nsSimpleEnumerator([buddy]), "chat-buddy-add");
    this.writeMessage(this._roomName,
                      _("system.message.conferenceLogon", aName),
                      {system: true});
  },

  removeParticipant: function(aName) {
    // In case we receive two logoff packets, make sure that the user is
    // actually here before continuing.
    if (!this._participants[aName])
      return;

    let stringNickname = Cc["@mozilla.org/supports-string;1"]
                           .createInstance(Ci.nsISupportsString);
    stringNickname.data = aName;
    this.notifyObservers(new nsSimpleEnumerator([stringNickname]),
                         "chat-buddy-remove");
    delete this._participants[aName];
    this.writeMessage(this._roomName,
                      _("system.message.conferenceLogoff", aName),
                      {system: true});
  },

  getParticipantNames: function()
    [this._participants[i].name for (i in this._participants)],
};
YahooConference.prototype.__proto__ = GenericConvChatPrototype;

function YahooConferenceBuddy(aName, aConference)
{
  this._name = aName;
  this._conference = aConference;
}
YahooConferenceBuddy.prototype = {
  _conference: null,

  get founder() this._conference._owner == this._name
}
YahooConferenceBuddy.prototype.__proto__ = GenericConvChatBuddyPrototype;

function YahooAccountBuddy(aAccount, aBuddy, aTag, aUserName)
{
  this._init(aAccount, aBuddy, aTag, aUserName);
}
YahooAccountBuddy.prototype = {
  // This removes the buddy locally, and from the Yahoo! servers.
  remove: function() this._account.removeBuddy(this, true),
  // This removes the buddy locally, but keeps him on the servers.
  removeLocal: function() this._account.removeBuddy(this, false),
  createConversation: function() this._account.createConversation(this.userName)
}
YahooAccountBuddy.prototype.__proto__ = GenericAccountBuddyPrototype;

function YahooAccount(aProtoInstance, aImAccount)
{
  this._init(aProtoInstance, aImAccount);
  this._buddies = new Map();
  this._conversations = new Map();
  this._conferences = new Map();
  this._protocol = aProtoInstance;
  this._converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Ci.nsIScriptableUnicodeConverter);
  this._converter.charset = this.getString("local_charset") || "UTF-8";

  // The username stripped of any @yahoo.* domain.
  this.cleanUsername = this.name.replace(/@yahoo\..+$/, "");
}
YahooAccount.prototype = {
  // YahooSession object passed in constructor.
  _session: null,
  // A Map holding the list of buddies associated with their usernames.
  _buddies: null,
  // A Map holding the list of open buddy conversations associated with the
  // username of the buddy.
  _conversations: null,
  // A Map holding the list of open conference rooms associated with the room
  // name.
  _conferences: null,
  // YahooProtocol object passed in the constructor.
  _protocol: null,
  // An nsIScriptableUnicodeConverter used to convert incoming/outgoing chat
  // messages to the correct charset.
  _converter: null,
  // This is simply incremented by one everytime a new conference room is
  // created. It is appened to the end of the room name when a new room is
  // created, ensuring name uniqueness.
  _roomsCreated: 0,
  // The username stripped of any @yahoo.* domain.
  cleanUsername: null,

  connect: function() {
    this._session = new YahooSession(this);
    this._session.login(this.imAccount.name, this.imAccount.password);
  },

  disconnect: function(aSilent) {
    if (this.connected) {
      this.reportDisconnecting(Ci.prplIAccount.NO_ERROR, "");
      if (this._session.isConnected)
        this._session.disconnect();
      this.reportDisconnected();
    }
    // buddy[1] is the actual object.
    for (let buddy of this._buddies)
      buddy[1].setStatus(Ci.imIStatusInfo.STATUS_UNKNOWN, "");
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic != "status-changed")
      return;

    this._session.setStatus(aSubject.statusType, aData);
  },

  remove: function() {
    for each(let conv in this._conversations)
      conv.close();
    delete this._conversations;
    for (let buddy of this._buddies)
      buddy[1].removeLocal(); // buddy[1] is the actual object.
  },

  unInit: function() {
    this.disconnect(true);
    delete this.imAccount;
  },

  createConversation: function(aName) {
    let conv = new YahooConversation(this, aName);
    this._conversations.set(aName, conv);
    return conv;
  },

  deleteConversation: function(aName) {
    if (this._conversations.has(aName))
      this._conversations.delete(aName);
  },

  receiveConferenceInvite: function(aOwner, aRoom, aParticipants, aMessage) {
    // Do nothing if we wish to ignore invites.
    if (!Services.prefs.getIntPref("messenger.conversations.autoAcceptChatInvitations") ||
        this.getBool("ignore_invites"))
      return;

    let conf = new YahooConference(this, aRoom, aOwner);
    this._conferences.set(aRoom, conf);

    for each (let participant in aParticipants)
      conf.addParticipant(participant);

    this._session.acceptConferenceInvite(aOwner, aRoom,
                                         conf.getParticipantNames());
  },

  receiveConferenceLogon: function(aRoom, aUsername) {
    if (!this._conferences.has(aRoom))
      return;
    let conf = this._conferences.get(aRoom);
    conf.addParticipant(aUsername);
  },

  receiveConferenceLogoff: function(aRoom, aUsername) {
    if (!this._conferences.has(aRoom))
      return;
    let conf = this._conferences.get(aRoom);
    conf.removeParticipant(aUsername);
  },

  deleteConference: function(aName) {
    if (this._conferences.has(aName))
      this._conferences.delete(aName);
  },

  // Called when the user adds or authorizes a new contact.
  addBuddy: function(aTag, aName) {
    let buddy = new YahooAccountBuddy(this, null, aTag, aName);
    this._buddies.set(buddy.userName, buddy);
    this._session.addBuddyToServer(buddy);
    Services.contacts.accountBuddyAdded(buddy);
  },

  hasBuddy: function(aName) {
    return this._buddies.has(aName);
  },

  // Called for each buddy that is sent in a list packet from Yahoo! on login.
  addBuddyFromServer: function(aTag, aName) {
    let buddy;
    if (this._buddies.has(aName))
      buddy = this._buddies.get(aName);
    else {
      buddy = new YahooAccountBuddy(this, null, aTag, aName);
      Services.contacts.accountBuddyAdded(buddy);
      this._buddies.set(aName, buddy);
    }

    // Set all new buddies as offline because a following status packet will
    // tell their status if they are online.
    buddy.setStatus(Ci.imIStatusInfo.STATUS_OFFLINE, "");
  },

  // Called when a user removes a contact from within Instantbird.
  removeBuddy: function(aBuddy, aRemoveFromServer) {
    if (aRemoveFromServer)
      this._session.removeBuddyFromServer(aBuddy);
    this._buddies.delete(aBuddy.userName);
    Services.contacts.accountBuddyRemoved(aBuddy);
  },

  loadBuddy: function(aBuddy, aTag) {
    let buddy = new YahooAccountBuddy(this, aBuddy, aTag);
    this._buddies.set(buddy.userName, buddy);

    return buddy;
  },

  setBuddyStatus: function(aName, aStatus, aMessage) {
    if (!this._buddies.has(aName))
      return;
    this._buddies.get(aName).setStatus(aStatus, aMessage);
  },

  getBuddy: function(aName) {
    if (this._buddies.has(aName))
      return this._buddies.get(aName);
    return null;
  },

  receiveMessage: function(aName, aMessage) {
    let conv;
    // Check if we have an existing converstaion open with this user. If not,
    // create one and add it to the list.
    if (!this._conversations.has(aName))
      conv = this.createConversation(aName);
    else
      conv = this._conversations.get(aName);

    conv.writeMessage(aName, this.decodeMessage(aMessage), {incoming: true});
  },

  receiveConferenceMessage: function(aName, aRoom, aMessage) {
    if (!this._conferences.has(aRoom))
      return;

    this._conferences.get(aRoom).writeMessage(aName,
                                              this.decodeMessage(aMessage),
                                              {incoming: true});
  },

  receiveTypingNotification: function(aName, aIsTyping) {
    if (!this._conversations.has(aName))
      return;

    if (aIsTyping)
      this._conversations.get(aName).updateTyping(Ci.prplIConvIM.TYPING);
    else
      this._conversations.get(aName).updateTyping(Ci.prplIConvIM.NOT_TYPING);
  },

  encodeMessage: function(aMessage) {
    // Try to perform a convertion from JavaScript UTF-16 into the charset
    // specified in the options. If the conversion fails, just leave
    // the message as it is.
    let encodedMsg;
    try {
      encodedMsg = this._converter.ConvertFromUnicode(aMessage);
    } catch (e) {
      encodedMsg = aMessage;
      this.WARN("Could not encode UTF-16 message into " +
                this._converter.charset + ". Message: " + aMessage);
    }
    return encodedMsg;
  },

  decodeMessage: function(aMessage) {
    // Try to perform a convertion from the charset specified in the options
    // to JavaScript UTF-16. If the conversion fails, just leave the message
    // as it is.
    let decodedMsg;
    try {
      decodedMsg = this._converter.ConvertToUnicode(aMessage);
    } catch (e) {
      decodedMsg = aMessage;
      this.WARN("Could not decode " + this._converter.charset +
                " message into UTF-16. Message: " + aMessage);
    }
    return decodedMsg;
  },

  get canJoinChat() true,
  chatRoomFields: {},
  joinChat: function(aComponents) {
    // Use _roomsCreated to append a unique number to the room name. We add 1
    // so that we can start the room numbers from 1 instead of 0.
    let roomName = this.cleanUsername + "-" + (++this._roomsCreated);
    let conf = new YahooConference(this, roomName, this.cleanUsername);
    this._conferences.set(roomName, conf);
    this._session.createConference(roomName);
    this._roomsCreated++;
  }
};
YahooAccount.prototype.__proto__ = GenericAccountPrototype;

function YahooProtocol() {
  this.registerCommands();
}
YahooProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  // Protocol specific connection parameters.
  pagerRequestUrl: "http://vcs1.msg.yahoo.com/capacity",
  loginTokenGetUrl: "https://login.yahoo.com/config/pwtoken_get",
  loginTokenLoginUrl: "https://login.yahoo.com/config/pwtoken_login",
  buildId: "4194239",

  get id() "prpl-yahoo",
  get name() "Yahoo",
  get iconBaseURI() "chrome://prpl-yahoo/skin/",
  options: {
    port: {get label() _("options.pagerPort"), default: 5050},
    //xfer_host: {get label() _("options.transferHost"), default: "filetransfer.msg.yahoo.com"},
    //xfer_port: {get label() _("options.transferPort"), default: 80},
    //room_list_locale: {get label() _("options.chatLocale"), default: "us"},
    local_charset: {get label() _("options.chatEncoding"), default: "UTF-8"},
    ignore_invites: {get label() _("options.ignoreInvites"), default: false}
    //proxy_ssl: {get label() _("options.proxySSL"), default: false}
  },
  commands: [
    {
      name: "invite",
      get helpString() _("command.help.invite"),
      run: function(aMsg, aConv) {
        if (aMsg.trim().length == 0)
          return false;

        let splitPosition = aMsg.indexOf(" "); // Split at first space.
        let invitees;
        let message;

        // If we have an invite message.
        if (splitPosition > 0) {
          invitees = aMsg.substring(0, splitPosition).split(",");
          message = aMsg.substring(splitPosition);
        } else {
          invitees = aMsg.split(",");
          message = _("conference.invite.message"); // Use default message.
        }

        let conf = aConv.wrappedJSObject;
        conf._account._session.inviteToConference(invitees, conf._roomName,
                                                  conf.getParticipantNames(),
                                                  message);
        return true;
      }
    }
  ],
  getAccount: function(aImAccount) new YahooAccount(this, aImAccount),
  classID: Components.ID("{50ea817e-5d79-4657-91ae-aa0a52bdb98c}")
};

function YahooJapanProtocol() {
  this.registerCommands();
}
YahooJapanProtocol.prototype = {
  __proto__: YahooProtocol.prototype,
  // Protocol specific connection parameters.
  pagerRequestUrl: "http://cs1.yahoo.co.jp/capacity",
  loginTokenGetUrl: "https://login.yahoo.co.jp/config/pwtoken_get",
  loginTokenLoginUrl: "https://login.yahoo.co.jp/config/pwtoken_login",
  buildId: "4186047",

  get id() "prpl-yahoojp",
  get name() "Yahoo JAPAN",
  get iconBaseURI() "chrome://prpl-yahoojp/skin/",
  options: {
    port: {get label() _("options.pagerPort"), default: 5050},
    //xfer_host: {get label() _("options.transferHost"), default: "filetransfer.msg.yahoo.com"},
    //xfer_port: {get label() _("options.transferPort"), default: 80},
    //room_list_locale: {get label() _("options.chatLocale"), default: "jp"},
    local_charset: {get label() _("options.chatEncoding"), default: "UTF-8"},
    ignore_invites: {get label() _("options.ignoreInvites"), default: false}
    //proxy_ssl: {get label() _("options.proxySSL"), default: false}
  },
  classID: Components.ID("{5f6dc733-ec0d-4de8-8adc-e4967064ed38}")
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([YahooProtocol, YahooJapanProtocol]);
