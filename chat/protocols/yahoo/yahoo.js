/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");
Cu.import("resource:///modules/yahoo-session.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/yahoo.properties")
);

// These timeouts are in milliseconds.
var kKeepAliveTimeout = 60 * 1000; // One minute.
var kPingTimeout = 3600 * 1000; // One hour.

function YahooConversation(aAccount, aName)
{
  this._buddyUserName = aName;
  this._account = aAccount;
  this.buddy = aAccount.getBuddy(aName);
  this._init(aAccount);
}
YahooConversation.prototype = {
  __proto__: GenericConvIMPrototype,
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
    this.writeMessage(this._account.cleanUsername, aMsg,
                      {outgoing: true, _alias: this._account.imAccount.alias});
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

  get name() { return this._buddyUserName; }
};

function YahooConference(aAccount, aRoom, aOwner)
{
  this._account = aAccount;
  this._roomName = aRoom;
  this._owner = aOwner;
  this._init(aAccount, aRoom, aAccount.cleanUsername);
}
YahooConference.prototype = {
  __proto__: GenericConvChatPrototype,
  _account: null,
  _roomName: null,
  _owner: null,

  close: function() {
    this.reportLogoff();
    this._account.deleteConference(this._roomName);
    GenericConvChatPrototype.close.call(this);
  },

  reportLogoff: function() {
    if (this.left)
      return;
    this._account._session.sendConferenceLogoff(this._account.cleanUsername,
                                                this.getParticipantNames(),
                                                this._roomName);
    this.left = true;
  },

  sendMsg: function(aMsg) {
    this._account._session.sendConferenceMessage(this.getParticipantNames(),
                                                 this._roomName,
                                                 this._account.encodeMessage(aMsg));
  },

  addParticipant: function(aName) {
    // In case we receive multiple conference logon packets, prevent adding
    // duplicate buddies.
    if (this._participants.get(aName))
      return;
    let buddy = new YahooConferenceBuddy(aName, this);
    this._participants.set(aName, buddy);
    this.notifyObservers(new nsSimpleEnumerator([buddy]), "chat-buddy-add");
    this.writeMessage(this._roomName,
                      _("system.message.conferenceLogon", aName),
                      {system: true});
  },

  getParticipantNames: function() { return [for (p of this._participants.values()) p.name]; }
};

function YahooConferenceBuddy(aName, aConference)
{
  this._name = aName;
  this._conference = aConference;
}
YahooConferenceBuddy.prototype = {
  __proto__: GenericConvChatBuddyPrototype,
  _conference: null,

  get founder() { return this._conference._owner == this._name; }
};

function YahooAccountBuddy(aAccount, aBuddy, aTag, aUserName)
{
  this._init(aAccount, aBuddy, aTag, aUserName);
}
YahooAccountBuddy.prototype = {
  __proto__: GenericAccountBuddyPrototype,
  iconChecksum: null,

  // This removes the buddy locally, and from the Yahoo! servers.
  remove: function() { return this._account.removeBuddy(this, true); },
  // This removes the buddy locally, but keeps him on the servers.
  removeLocal: function() { return this._account.removeBuddy(this, false); },
  createConversation: function() { return this._account.createConversation(this.userName); }
}

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
  __proto__: GenericAccountPrototype,
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
  // The timers used to send keepalive and ping packets to the server to ensrue
  // the server that the user is still connected.
  _keepAliveTimer: null,
  _pingTimer: null,

  connect: function() {
    this._session = new YahooSession(this);
    this._session.login(this.imAccount.name, this.imAccount.password);
  },

  disconnect: function(aSilent) {
    // Log out of all of the conferences the user is in.
    for (let conf of this._conferences)
      conf[1].reportLogoff();

    if (this.connected) {
      this.reportDisconnecting(Ci.prplIAccount.NO_ERROR, "");
      if (this._session.isConnected)
        this._session.disconnect();
      this.reportDisconnected();
    }
    // buddy[1] is the actual object.
    for (let buddy of this._buddies)
      buddy[1].setStatus(Ci.imIStatusInfo.STATUS_UNKNOWN, "");

    // Clear and delete the timers to avoid memory leaks.
    if (this._keepAliveTimer) {
      this._keepAliveTimer.cancel();
      delete this._keepAliveTimer;
    }

    if (this._pingTimer) {
      this._pingTimer.cancel();
      delete this._pingTimer;
    }
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "status-changed")
      this._session.setStatus(aSubject.statusType, aData);
    else if (aTopic == "user-icon-changed")
      this._session.setProfileIcon(aData);
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

    // Add ourselves to the conference room as well.
    conf.addParticipant(this.imAccount.name);

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
    conf.writeMessage(this._roomName,
                      _("system.message.conferenceLogoff", aName),
                      {system: true});
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

    // Request the buddy's picture.
    this._session.requestBuddyIcon(aName);
  },

  // Called when a user removes a contact from within Instantbird.
  removeBuddy: function(aBuddy, aRemoveFromServer) {
    if (aRemoveFromServer) {
      // We will remove the buddy locally when we get a server ack packet.
      this._session.removeBuddyFromServer(aBuddy);
      return;
    }

    this._buddies.delete(aBuddy.userName);
    Services.contacts.accountBuddyRemoved(aBuddy);
  },

  loadBuddy: function(aBuddy, aTag) {
    let buddy = new YahooAccountBuddy(this, aBuddy, aTag);
    this._buddies.set(buddy.userName, buddy);

    return buddy;
  },

  // Both the status and message can be defined, or only one can be defined.
  // When defining just the message, set aStatus to undefined.
  setBuddyStatus: function(aName, aStatus, aMessage) {
    if (!this._buddies.has(aName))
      return;
    let buddy = this._buddies.get(aName);
    // If the message is set as undefined, use the existing message.
    if (aMessage === undefined)
      aMessage = buddy.statusText;
    // If the status is undefined, use the existing status.
    if (aStatus === undefined)
      aStatus = buddy.statusType;
    buddy.setStatus(aStatus, aMessage);
  },

  getBuddy: function(aName) {
    if (this._buddies.has(aName))
      return this._buddies.get(aName);
    return null;
  },

  getOnlineBuddies: function() {
    let onlineBuddies = [];
    for (let buddy of this._buddies) {
      if (buddy[1].statusType != Ci.imIStatusInfo.STATUS_OFFLINE)
        onlineBuddies.push(buddy[1]);
    }
    return onlineBuddies;
  },

  receiveMessage: function(aName, aMessage) {
    let conv;
    // Check if we have an existing converstaion open with this user. If not,
    // create one and add it to the list.
    if (!this._conversations.has(aName))
      conv = this.createConversation(aName);
    else
      conv = this._conversations.get(aName);

    // Certain Yahoo clients, such as the official web client, sends formatted
    // messages, but the size value is the actual pt size, not the 1 - 7 size
    // expected from the HTML <font> tag. We replace it with the correct size.
    let message = this.decodeMessage(aMessage)
                      .replace(/(<font[^>]+)size=\"(\d+)\"/g, this._fixFontSize);

    conv.writeMessage(aName, message, {incoming: true});
    conv.updateTyping(Ci.prplIConvIM.NOT_TYPING, conv.name);
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

    let conv = this._conversations.get(aName);
    if (aIsTyping)
      conv.updateTyping(Ci.prplIConvIM.TYPING, conv.name);
    else
      conv.updateTyping(Ci.prplIConvIM.NOT_TYPING, conv.name);
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

  get canJoinChat() { return true; },
  chatRoomFields: {},
  joinChat: function(aComponents) {
    // Use _roomsCreated to append a unique number to the room name.
    let roomName = this.cleanUsername + "-" + ++this._roomsCreated;
    let conf = new YahooConference(this, roomName, this.cleanUsername);
    this._conferences.set(roomName, conf);
    this._session.createConference(roomName);
  },

  // Callbacks.
  onLoginComplete: function() {
    // Now that we are connected, get ready to start to sending pings and
    // keepalive packets.
    this._keepAliveTimer = Cc["@mozilla.org/timer;1"]
                             .createInstance(Ci.nsITimer);
    this._pingTimer = Cc["@mozilla.org/timer;1"]
                        .createInstance(Ci.nsITimer);

    // We use slack timers since we don't need millisecond precision when
    // sending the keepalive and ping packets.
    let s = this._session;
    this._keepAliveTimer
        .initWithCallback(s.sendKeepAlive.bind(s), kKeepAliveTimeout,
                          this._keepAliveTimer.TYPE_REPEATING_SLACK);

    this._pingTimer
        .initWithCallback(s.sendPing.bind(s), kPingTimeout,
                          this._pingTimer.TYPE_REPEATING_SLACK);

  },

  // Private methods.

  // This method is used to fix font sizes given by formatted messages. This
  // method is designed to be used as a method for a string replace() call.
  _fixFontSize: function(aMatch, aTagAttributes, aFontSize, aOffset, aString) {
    // Approximate the font size.
    let newSize;
    if (aFontSize <= 8)
      newSize = "1";
    else if (aFontSize <= 10)
      newSize = "2";
    else if (aFontSize <= 12)
      newSize = "3";
    else if (aFontSize <= 14)
      newSize = "4";
    else if (aFontSize <= 20)
      newSize = "5";
    else if (aFontSize <= 30)
      newSize = "6";
    else if (aFontSize <= 40)
      newSize = "7";
    else // If we get some gigantic size, just default to the standard 3 size.
      newSize = "3";

    let sizeAttribute = "size=\"" + newSize + "\"";
    // We keep any preceding attributes, but replace the size attribute.
    return aTagAttributes + sizeAttribute;
  }
};

function YahooProtocol() {
  this.registerCommands();
}
YahooProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  // Protocol specific connection parameters.
  pagerRequestUrl: "http://scsa.msg.yahoo.com/capacity",
  loginTokenGetUrl: "https://login.yahoo.com/config/pwtoken_get",
  loginTokenLoginUrl: "https://login.yahoo.com/config/pwtoken_login",
  buildId: "4194239",

  get id() { return "prpl-yahoo"; },
  get name() { return "Yahoo"; },
  get iconBaseURI() { return "chrome://prpl-yahoo/skin/"; },
  options: {
    port: {get label() { return _("options.pagerPort"); }, default: 5050},
    local_charset: {get label() { return _("options.chatEncoding"); }, default: "UTF-8"},
    ignore_invites: {get label() { return _("options.ignoreInvites"); }, default: false}
  },
  commands: [
    {
      name: "invite",
      get helpString() { return _("command.help.invite2", "invite"); },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
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
        conf.writeMessage(conf._roomName,
                          _("command.feedback.invite", invitees.join(", ")),
                          {system: true, noLog: true});
        conf._account.LOG("Sending conference invite to " + invitees);
        return true;
      },
    },

    {
      name: "conference",
      get helpString() { return _("command.help.conference", "conference"); },
      usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
      run: function(aMsg, aConv) {
        aConv.account.joinChat(null);
        return true;
      }
    }
  ],
  getAccount: function(aImAccount) { return new YahooAccount(this, aImAccount); },
  classID: Components.ID("{50ea817e-5d79-4657-91ae-aa0a52bdb98c}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([YahooProtocol]);
