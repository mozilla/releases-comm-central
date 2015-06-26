/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "XMPPConversationPrototype",
  "XMPPMUCConversationPrototype",
  "XMPPAccountBuddyPrototype",
  "XMPPAccountPrototype"
];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imStatusUtils.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");
Cu.import("resource:///modules/NormalizedMap.jsm");
Cu.import("resource:///modules/socket.jsm");
Cu.import("resource:///modules/xmpp-xml.jsm");
Cu.import("resource:///modules/xmpp-session.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "DownloadUtils",
  "resource://gre/modules/DownloadUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "FileUtils",
  "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
  "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "imgTools",
                                   "@mozilla.org/image/tools;1",
                                   "imgITools");
XPCOMUtils.defineLazyServiceGetter(this, "UuidGenerator",
                                   "@mozilla.org/uuid-generator;1",
                                   "nsIUUIDGenerator");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

XPCOMUtils.defineLazyGetter(this, "TXTToHTML", function() {
  let cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(Ci.mozITXTToHTMLConv);
  return function(aTxt) cs.scanTXT(aTxt, cs.kEntities);
});

/* This is an ordered list, used to determine chat buddy flags:
 *  index < member    -> noFlags
 *  index = member    -> voiced
 *          moderator -> halfOp
 *          admin     -> op
 *          owner     -> founder
 */
const kRoles = ["outcast", "visitor", "participant", "member", "moderator",
                "admin", "owner"];

function MUCParticipant(aNick, aName, aStanza)
{
  this._jid = aName;
  this.name = aNick;
  this.stanza = aStanza;
}
MUCParticipant.prototype = {
  __proto__: ClassInfo("prplIConvChatBuddy", "XMPP ConvChatBuddy object"),

  buddy: false,
  get alias() this.name,

  role: 2, // "participant" by default
  set stanza(aStanza) {
    this._stanza = aStanza;

    let x =
      aStanza.getChildren("x").filter(function (c) c.uri == Stanza.NS.muc_user);
    if (x.length == 0)
      return;
    x = x[0];
    let item = x.getElement(["item"]);
    if (!item)
      return;

    this.role = Math.max(kRoles.indexOf(item.attributes["role"]),
                         kRoles.indexOf(item.attributes["affiliation"]));
  },

  get noFlags() this.role < kRoles.indexOf("member"),
  get voiced() this.role == kRoles.indexOf("member"),
  get halfOp() this.role == kRoles.indexOf("moderator"),
  get op() this.role == kRoles.indexOf("admin"),
  get founder() this.role == kRoles.indexOf("owner"),
  typing: false
};

// MUC (Multi-User Chat)
const XMPPMUCConversationPrototype = {
  __proto__: GenericConvChatPrototype,
  // By default users are not in a MUC.
  _left: true,

  // Tracks all received messages to avoid possible duplication if the server
  // sends us the last few messages again when we rejoin a room.
  _messageIds: new Set(),

  _init: function(aAccount, aJID, aNick) {
    this._messageIds = new Set();
    GenericConvChatPrototype._init.call(this, aAccount, aJID, aNick);
  },

  _targetResource: "",

  get topic() this._topic,
  set topic(aTopic) {
    let notAuthorized = (aError) => {
      // XEP-0045 (8.1): Unauthorized subject change.
      let message = _("conversation.error.changeTopicFailedNotAuthorized");
      this.writeMessage(this.name, message, {system: true, error: true});
      return true;
    };
    let errorHandler = this._account.handleErrors({forbidden: notAuthorized,
                                                   notAcceptable: notAuthorized,
                                                   itemNotFound: notAuthorized});

    // XEP-0045 (8.1): Modifying the room subject.
    let subject = Stanza.node("subject", null, null, aTopic.trim());
    let s = Stanza.message(this.name, null, null,{type: "groupchat"}, subject);
    this._account.sendStanza(s, errorHandler);
  },
  get topicSettable() true,

  /* Called when the user enters a chat message */
  sendMsg: function (aMsg) {
    let notInRoom = (aError) => {
      // If the sender is not in the room.
      let from = aError.stanza.attributes["from"];
      let message = _("conversation.error.sendFailedAsNotInRoom",
                      this._account.normalize(from), aMsg);
      this.writeMessage(from, message, {system: true, error: true});
      return true;
    };
    let errorHandler = this._account.handleErrors({itemNotFound: notInRoom,
                                                   notAcceptable: notInRoom});

    // XEP-0045 (7.4): Sending a message to all occupants in a room.
    let s = Stanza.message(this.name, aMsg, null, {type: "groupchat"});
    this._account.sendStanza(s, errorHandler);
  },

  /* Called by the account when a presence stanza is received for this muc */
  onPresenceStanza: function(aStanza) {
    let from = aStanza.attributes["from"];
    let nick = this._account._parseJID(from).resource;
    let jid = this._account.normalize(from);
    let x = aStanza.getElements(["x"]).find(e => e.uri == Stanza.NS.muc_user);

    // Check if the join failed.
    if (this.left && aStanza.attributes["type"] == "error") {
      let error = this._account.parseError(aStanza);
      let message;
      switch (error.condition) {
        case "not-authorized":
          message = _("conversation.error.joinFailedNotAuthorized");
          break;
        case "not-allowed":
          message = _("conversation.error.creationFailedNotAllowed");
          break;
        case "remote-server-not-found":
          message = _("conversation.error.joinFailedRemoteServerNotFound",
                      this.name);
          break;
        case "forbidden":
          // XEP-0045 (7.2.8): Banned users.
          message = _("conversation.error.joinForbidden", this.name);
          break;
        default:
          message = _("conversation.error.joinFailed", this.name);
          this.ERROR("Failed to join MUC: " + aStanza.convertToString());
          break;
      }
      this.writeMessage(this.name, message, {system: true, error: true});
      this.joining = false;
      return;
    }

    if (!x) {
      this.WARN("Received a MUC presence stanza without an x element or " +
                "with a namespace we don't handle.");
      return;
    }
    let codes = x.getElements(["status"]).map(elt => elt.attributes["code"]);
    let item = x.getElement(["item"]);

    if (aStanza.attributes["type"] == "unavailable") {
      if (!this._participants.has(nick)) {
        this.WARN("received unavailable presence for an unknown MUC participant: " +
                  from);
        return;
      }
      if (codes.indexOf("303") != -1) {
        // XEP-0045 (7.6): Changing Nickname.
        // Service Updates Nick for user.
        if (!item  || !item.attributes["nick"]) {
          this.WARN("Received a MUC presence code 303 stanza without an item " +
                    "element or a nick attribute.");
          return;
        }
        let participant = this._participants.get(nick);
        participant.name = item.attributes["nick"];
        return;
      }
      if (item && item.attributes["role"] == "none") {
        // XEP-0045: the user is no longer an occupant.
        this.removeParticipant(nick);
        if (codes.indexOf("110") != -1) {
          // XEP-0045 7.14: Self-presence.
          // This presence refers to this account.
          this.left = true;
        }

        // Bug 1146093: Add an appropriate system message telling the
        // user what happened (banned or removed or kicked from
        // MUC room) using codes.
      }
      else
        this.WARN("Unhandled type==unavailable MUC presence stanza.");
      return;
    }

    if (codes.indexOf("201") != -1) {
      // XEP-0045 (10.1): Creating room.
      // Service Acknowledges Room Creation
      // and Room is awaiting configuration.
      // XEP-0045 (10.1.2): Instant room.
      let query = Stanza.node("query", Stanza.NS.muc_owner, null,
                              Stanza.node("x", Stanza.NS.xdata,
                                          {type: "submit"}));
      let s = Stanza.iq("set", null, jid, query);
      this._account.sendStanza(s, aStanzaReceived => {
        if (aStanzaReceived.attributes["type"] != "result")
          return false;

        // XEP-0045: Service Informs New Room Owner of Success
        // for instant and reserved rooms.
        this.left = false;
        this.joining = false;
        return true;
      });
    }
    else if (codes.indexOf("110") != -1) {
      // XEP-0045: Room exists and joined successfully.
      this.left = false;
      this.joining = false;
      // TODO (Bug 1172350): Implement Service Discovery Extensions (XEP-0128) to obtain
      // configuration of this room.
    }

    if (!this._participants.get(nick)) {
      let participant = new MUCParticipant(nick, from, aStanza);
      this._participants.set(nick, participant);
      this.notifyObservers(new nsSimpleEnumerator([participant]),
                           "chat-buddy-add");
    }
    else {
      this._participants.get(nick).stanza = aStanza;
      this.notifyObservers(this._participants.get(nick), "chat-buddy-update");
    }
  },

  /* Called by the account when a messsage is received for this muc */
  incomingMessage: function(aMsg, aStanza, aDate) {
    let from = this._account._parseJID(aStanza.attributes["from"]).resource;
    let id = aStanza.attributes["id"];
    let flags = {};
    if (!from) {
      flags.system = true;
      from = this.name;
    }
    else if (aStanza.attributes["type"] == "error") {
      aMsg = _("conversation.error.notDelivered", aMsg);
      flags.system = true;
      flags.error = true;
    }
    else if (from == this._nick)
      flags.outgoing = true;
    else
      flags.incoming = true;
    if (aDate) {
      flags.time = aDate / 1000;
      flags.delayed = true;
    }
    if (id) {
      // Checks if a message exists in conversation to avoid duplication.
      if (this._messageIds.has(id))
        return;
      this._messageIds.add(id);
    }
    this.writeMessage(from, aMsg, flags);
  },

  getNormalizedChatBuddyName: function(aNick)
    this._account.normalizeFullJid(this.name + "/" + aNick),

  // Removes a participant from MUC conversation.
  removeParticipant: function(aNick) {
    if (!this._participants.has(aNick))
      return;

    this._participants.delete(aNick);
    let nickString = Cc["@mozilla.org/supports-string;1"]
                       .createInstance(Ci.nsISupportsString);
    nickString.data = aNick;
    this.notifyObservers(new nsSimpleEnumerator([nickString]),
                         "chat-buddy-remove");
  },

  // Removes all participant in MUC conversation.
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

  // Leaves MUC conversation.
  part: function(aMsg = null) {
    let s = Stanza.presence({to: this.name + "/" + this._nick, type: "unavailable"},
                            aMsg ? Stanza.node("status", null, null, aMsg.trim()) : null);
    this._account.sendStanza(s);
    delete this.chatRoomFields;
  },

  /* Called when the user closed the conversation */
  close: function() {
    if (!this.left)
      this.part();
    GenericConvChatPrototype.close.call(this);
  },
  unInit: function() {
    this._account.removeConversation(this.name);
    GenericConvChatPrototype.unInit.call(this);
  }
};
function XMPPMUCConversation(aAccount, aJID, aNick)
{
  this._init(aAccount, aJID, aNick);
}
XMPPMUCConversation.prototype = XMPPMUCConversationPrototype;

/* Helper class for buddy conversations */
const XMPPConversationPrototype = {
  __proto__: GenericConvIMPrototype,

  _typingTimer: null,
  supportChatStateNotifications: true,
  _typingState: "active",

  // Indicates that current conversation is with a MUC participant and the
  // recipient jid (stored in the userName) is of the form room@domain/nick.
  _isMucParticipant: false,

  get buddy() this._account._buddies.get(this.name),
  get title() this.contactDisplayName,
  get contactDisplayName() this.buddy ? this.buddy.contactDisplayName : this.name,
  get userName() this.buddy ? this.buddy.userName : this.name,

  // Returns jid (room@domain/nick) if it is with a MUC participant, and the
  // name of conversation otherwise.
  get normalizedName() {
    if (this._isMucParticipant)
      return this._account.normalizeFullJid(this.name);
    return this._account.normalize(this.name);
  },

  // Used to avoid showing full jids in typing notifications.
  get shortName() {
    if (this.buddy)
      return this.buddy.contactDisplayName;

    let jid = this._account._parseJID(this.name);
    if (!jid)
      return this.name;

    // Returns nick of the recipient if conversation is with a participant of
    // a MUC we are in as jid of the recipient is of the form room@domain/nick.
    if (this._isMucParticipant)
      return jid.resource;

    return jid.node;
  },

  get shouldSendTypingNotifications()
    this.supportChatStateNotifications &&
    Services.prefs.getBoolPref("purple.conversations.im.send_typing"),

  /* Called when the user is typing a message
   * aString - the currently typed message
   * Returns the number of characters that can still be typed */
  sendTyping: function(aString) {
    if (!this.shouldSendTypingNotifications)
      return Ci.prplIConversation.NO_TYPING_LIMIT;

    this._cancelTypingTimer();
    if (aString.length)
      this._typingTimer = setTimeout(this.finishedComposing.bind(this), 10000);

    this._setTypingState(aString.length ? "composing" : "active");

    return Ci.prplIConversation.NO_TYPING_LIMIT;
  },

  finishedComposing: function() {
    if (!this.shouldSendTypingNotifications)
      return;

    this._setTypingState("paused");
  },

  _setTypingState: function(aNewState) {
    if (this._typingState == aNewState)
      return;

    let s = Stanza.message(this.to, null, aNewState);

    // We don't care about errors in response to typing notifications
    // (e.g. because the user has left the room when talking to a MUC
    // participant).
    this._account.sendStanza(s, () => true);

    this._typingState = aNewState;
  },
  _cancelTypingTimer: function() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      delete this._typingTimer;
    }
  },

  // Holds the resource of user that you are currenty talking to, but if the
  // user is a participant of a MUC we are in, holds the nick of user you are
  // talking to.
  _targetResource: "",

  get to() {
    if (!this._targetResource || this._isMucParticipant)
      return this.userName;
    return this.userName + "/" + this._targetResource;
  },

  /* Called when the user enters a chat message */
  sendMsg: function(aMsg) {
    this._cancelTypingTimer();
    let cs = this.shouldSendTypingNotifications ? "active" : null;
    let s = Stanza.message(this.to, aMsg, cs);
    this._account.sendStanza(s);
    let who;
    if (this._account._connection)
      who = this._account._connection._jid.jid;
    if (!who)
      who = this._account.name;
    let alias = this.account.alias || this.account.statusInfo.displayName;
    this.writeMessage(who, aMsg, {outgoing: true, _alias: alias});
    delete this._typingState;
  },

  /* Perform entity escaping before displaying the message. We assume incoming
     messages have already been escaped, and will otherwise be filtered. */
  prepareForDisplaying: function(aMsg) {
    if (aMsg.outgoing && !aMsg.system)
      aMsg.displayMessage = TXTToHTML(aMsg.displayMessage);
    GenericConversationPrototype.prepareForDisplaying.apply(this, arguments);
  },

  /* Called by the account when a messsage is received from the buddy */
  incomingMessage: function(aMsg, aStanza, aDate) {
    let from = aStanza.attributes["from"];
    this._targetResource = this._account._parseJID(from).resource;
    let flags = {};
    let error = this._account.parseError(aStanza);
    if (error) {
      let norm = this._account.normalize(from);
      let muc = this._account._mucs.get(norm);

      if (!aMsg) {
        // Failed outgoing message unknown.
        if (error.condition == "remote-server-not-found")
          aMsg = _("conversation.error.remoteServerNotFound");
        else
          aMsg = _("conversation.error.unknownError");
      }
      else if (this._isMucParticipant && muc && !muc.left &&
               error.condition == "item-not-found") {
        // XEP-0045 (7.5): MUC private messages.
        // If we try to send to participant not in a room we are in.
        aMsg = _("conversation.error.sendFailedAsRecipientNotInRoom",
                 this._targetResource, aMsg);
      }
      else if (this._isMucParticipant &&
               (error.condition == "item-not-found" ||
                error.condition == "not-acceptable")) {
        // If we left a room and try to send to a participant in it or the
        // room is removed.
        aMsg = _("conversation.error.sendFailedAsNotInRoom",
                 this._account.normalize(from), aMsg);
      }
      else
        aMsg = _("conversation.error.notDelivered", aMsg);
      flags.system = true;
      flags.error = true;
    }
    else
      flags = {incoming: true, _alias: this.contactDisplayName};
    if (aDate) {
      flags.time = aDate / 1000;
      flags.delayed = true;
    }
    this.writeMessage(from, aMsg, flags);
  },

  /* Called when the user closed the conversation */
  close: function() {
    // TODO send the stanza indicating we have left the conversation?
    GenericConvIMPrototype.close.call(this);
  },
  unInit: function() {
    this._account.removeConversation(this.normalizedName);
    GenericConvIMPrototype.unInit.call(this);
  }
};

// Creates XMPP conversation.
function XMPPConversation(aAccount, aNormalizedName, aMucParticipant)
{
  this._init(aAccount, aNormalizedName);
  if (aMucParticipant)
    this._isMucParticipant = true;
}
XMPPConversation.prototype = XMPPConversationPrototype;

/* Helper class for buddies */
const XMPPAccountBuddyPrototype = {
  __proto__: GenericAccountBuddyPrototype,

  subscription: "none",
  // Returns a list of TooltipInfo objects to be displayed when the user
  // hovers over the buddy.
  getTooltipInfo: function() {
    if (!this._account.connected)
      return null;

    let tooltipInfo = [];
    if (this._resources) {
      for (let r in this._resources) {
        let status = this._resources[r];
        let statusString = Status.toLabel(status.statusType);
        if (status.statusType == Ci.imIStatusInfo.STATUS_IDLE &&
            status.idleSince) {
          let now = Math.floor(Date.now() / 1000);
          let valuesAndUnits =
            DownloadUtils.convertTimeUnits(now - status.idleSince);
          if (!valuesAndUnits[2])
            valuesAndUnits.splice(2, 2);
          statusString += " (" + valuesAndUnits.join(" ") + ")";
        }
        if (status.statusText)
          statusString += " - " + status.statusText;
        let label = r ? _("tooltip.status", r) : _("tooltip.statusNoResource");
        tooltipInfo.push(new TooltipInfo(label, statusString));
      }
    }

    // The subscription value is interesting to display only in unusual cases.
    if (this.subscription != "both") {
      tooltipInfo.push(new TooltipInfo(_("tooltip.subscription"),
                                       this.subscription));
    }

    return new nsSimpleEnumerator(tooltipInfo);
  },

  // _rosterAlias is the value stored in the roster on the XMPP
  // server. For most servers we will be read/write.
  _rosterAlias: "",
  set rosterAlias(aNewAlias) {
    let old = this.displayName;
    this._rosterAlias = aNewAlias;
    if (old != this.displayName)
      this._notifyObservers("display-name-changed", old);
  },
  // _vCardFormattedName is the display name the contact has set for
  // himself in his vCard. It's read-only from our point of view.
  _vCardFormattedName: "",
  set vCardFormattedName(aNewFormattedName) {
    let old = this.displayName;
    this._vCardFormattedName = aNewFormattedName;
    if (old != this.displayName)
      this._notifyObservers("display-name-changed", old);
  },

  // _serverAlias is set by jsProtoHelper to the value we cached in sqlite.
  // Use it only if we have neither of the other two values; usually because
  // we haven't connected to the server yet.
  get serverAlias() this._rosterAlias || this._vCardFormattedName || this._serverAlias,
  set serverAlias(aNewAlias) {
    if (!this._rosterItem) {
      this.ERROR("attempting to update the server alias of an account buddy " +
                 "for which we haven't received a roster item.");
      return;
    }

    let item = this._rosterItem;
    if (aNewAlias)
      item.attributes["name"] = aNewAlias;
    else if ("name" in item.attributes)
      delete item.attributes["name"];

    let s = Stanza.iq("set", null, null,
                      Stanza.node("query", Stanza.NS.roster, null, item));
    this._account.sendStanza(s);

    // If we are going to change the alias on the server, discard the cached
    // value that we got from our local sqlite storage at startup.
    delete this._serverAlias;
  },

  /* Display name of the buddy */
  get contactDisplayName() this.buddy.contact.displayName || this.displayName,

  get tag() this._tag,
  set tag(aNewTag) {
    let oldTag = this._tag;
    if (oldTag.name == aNewTag.name) {
      this.ERROR("attempting to set the tag to the same value");
      return;
    }

    this._tag = aNewTag;
    Services.contacts.accountBuddyMoved(this, oldTag, aNewTag);

    if (!this._rosterItem) {
      this.ERROR("attempting to change the tag of an account buddy without roster item");
      return;
    }

    let item = this._rosterItem;
    let oldXML = item.getXML();
    // Remove the old tag if it was listed in the roster item.
    item.children =
      item.children.filter(function (c) c.qName != "group" ||
                                        c.innerText != oldTag.name);
    // Ensure the new tag is listed.
    let newTagName = aNewTag.name;
    if (!item.getChildren("group").some(function (g) g.innerText == newTagName))
      item.addChild(Stanza.node("group", null, null, newTagName));
    // Avoid sending anything to the server if the roster item hasn't changed.
    // It's possible that the roster item hasn't changed if the roster
    // item had several groups and the user moved locally the contact
    // to another group where it already was on the server.
    if (item.getXML() == oldXML)
      return;

    let s = Stanza.iq("set", null, null,
                      Stanza.node("query", Stanza.NS.roster, null, item));
    this._account.sendStanza(s);
  },

  remove: function() {
    if (!this._account.connected)
      return;

    let s = Stanza.iq("set", null, null,
                      Stanza.node("query", Stanza.NS.roster, null,
                                  Stanza.node("item", null,
                                              {jid: this.normalizedName,
                                               subscription: "remove"})));
    this._account.sendStanza(s);
  },

  _photoHash: null,
  _saveIcon: function(aPhotoNode) {
    // Some servers seem to send a photo node without a type declared.
    let type = aPhotoNode.getElement(["TYPE"]);
    if (!type)
      return;
    type = type.innerText;
    const kExt = {"image/gif": "gif", "image/jpeg": "jpg", "image/png": "png"};
    if (!kExt.hasOwnProperty(type))
      return;

    let data = aPhotoNode.getElement(["BINVAL"]).innerText;
    let content = atob(data.replace(/[^A-Za-z0-9\+\/\=]/g, ""));

    // Store a sha1 hash of the photo we have just received.
    let ch = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
    ch.init(ch.SHA1);
    let dataArray = [content.charCodeAt(i) for (i in content)];
    ch.update(dataArray, dataArray.length);
    let hash = ch.finish(false);
    function toHexString(charCode) ("0" + charCode.toString(16)).slice(-2)
    this._photoHash = [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");

    let istream = Cc["@mozilla.org/io/string-input-stream;1"]
                  .createInstance(Ci.nsIStringInputStream);
    istream.setData(content, content.length);

    let fileName = this._photoHash + "." + kExt[type];
    let file = FileUtils.getFile("ProfD", ["icons",
                                           this.account.protocol.normalizedName,
                                           this.account.normalizedName,
                                           fileName]);
    let ostream = FileUtils.openSafeFileOutputStream(file);
    let buddy = this;
    NetUtil.asyncCopy(istream, ostream, function(rc) {
      if (Components.isSuccessCode(rc))
        buddy.buddyIconFilename = Services.io.newFileURI(file).spec;
    });
  },

  _preferredResource: undefined,
  _resources: null,
  onAccountDisconnected: function() {
    delete this._preferredResource;
    delete this._resources;
  },
  // Called by the account when a presence stanza is received for this buddy.
  onPresenceStanza: function(aStanza) {
    let preferred = this._preferredResource;

    // Facebook chat's XMPP server doesn't send resources, let's
    // replace undefined resources with empty resources.
    let resource =
      this._account._parseJID(aStanza.attributes["from"]).resource || "";

    let type = aStanza.attributes["type"];

    // Reset typing status if the buddy is in a conversation and becomes unavailable.
    let conv = this._account._conv.get(this.normalizedName);
    if (type == "unavailable" && conv)
      conv.updateTyping(Ci.prplIConvIM.NOT_TYPING, this.contactDisplayName);

    if (type == "unavailable" || type == "error") {
      if (!this._resources || !(resource in this._resources))
        return; // ignore for already offline resources.
      delete this._resources[resource];
      if (preferred == resource)
        preferred = undefined;
    }
    else {
      let statusType = Ci.imIStatusInfo.STATUS_AVAILABLE;
      let show = aStanza.getElement(["show"]);
      if (show) {
        show = show.innerText;
        if (show == "away")
          statusType = Ci.imIStatusInfo.STATUS_AWAY;
        else if (show == "chat")
          statusType = Ci.imIStatusInfo.STATUS_AVAILABLE; //FIXME
        else if (show == "dnd")
          statusType = Ci.imIStatusInfo.STATUS_UNAVAILABLE;
        else if (show == "xa")
          statusType = Ci.imIStatusInfo.STATUS_IDLE;
      }

      let idleSince = 0;
      let query = aStanza.getElement(["query"]);
      if (query && query.uri == Stanza.NS.last) {
        let now = Math.floor(Date.now() / 1000);
        idleSince = now - parseInt(query.attributes["seconds"], 10);
        statusType = Ci.imIStatusInfo.STATUS_IDLE;
      }

      // Mark official Android clients as mobile.
      const kAndroidNodeURI = "http://www.android.com/gtalk/client/caps";
      if (aStanza.getChildrenByNS(Stanza.NS.caps)
                 .some(function(s) s.localName == "c" &&
                                   s.attributes["node"] == kAndroidNodeURI))
        statusType = Ci.imIStatusInfo.STATUS_MOBILE;

      let status = aStanza.getElement(["status"]);
      status = status ? status.innerText : "";

      let priority = aStanza.getElement(["priority"]);
      priority = priority ? parseInt(priority.innerText, 10) : 0;

      if (!this._resources)
        this._resources = {};
      this._resources[resource] = {
        statusType: statusType,
        statusText: status,
        idleSince: idleSince,
        priority: priority,
        stanza: aStanza
      };
    }

    let photo = aStanza.getElement(["x", "photo"]);
    if (photo && photo.uri == Stanza.NS.vcard_update) {
      let hash = photo.innerText;
      if (hash && hash != this._photoHash)
        this._account._requestVCard(this.normalizedName);
      else if (!hash && this._photoHash) {
        delete this._photoHash;
        this.buddyIconFilename = "";
      }
    }

    for (let r in this._resources) {
      if (preferred === undefined ||
          this._resources[r].statusType > this._resources[preferred].statusType)
        // FIXME also compare priorities...
        preferred = r;
    }
    if (preferred != undefined && preferred == this._preferredResource &&
        resource != preferred) {
      // The presence information change is only for an unused resource,
      // only potential buddy tooltips need to be refreshed.
      this._notifyObservers("status-detail-changed");
      return;
    }

    // Presence info has changed enough that if we are having a
    // conversation with one resource of this buddy, we should send
    // the next message to all resources.
    // FIXME: the test here isn't exactly right...
    if (this._preferredResource != preferred &&
        this._account._conv.has(this.normalizedName))
      delete this._account._conv.get(this.normalizedName)._targetResource;

    this._preferredResource = preferred;
    if (preferred === undefined) {
      let statusType = Ci.imIStatusInfo.STATUS_UNKNOWN;
      if (type == "unavailable")
        statusType = Ci.imIStatusInfo.STATUS_OFFLINE;
      this.setStatus(statusType, "");
    }
    else {
      preferred = this._resources[preferred];
      this.setStatus(preferred.statusType, preferred.statusText);
    }
  },

  /* Can send messages to buddies who appear offline */
  get canSendMessage() this.account.connected,

  /* Called when the user wants to chat with the buddy */
  createConversation: function()
    this._account.createConversation(this.normalizedName)
};
function XMPPAccountBuddy(aAccount, aBuddy, aTag, aUserName)
{
  this._init(aAccount, aBuddy, aTag, aUserName);
}
XMPPAccountBuddy.prototype = XMPPAccountBuddyPrototype;

/* Helper class for account */
const XMPPAccountPrototype = {
  __proto__: GenericAccountPrototype,

  _jid: null, // parsed Jabber ID: node, domain, resource
  _connection: null, // XMPPSession socket
  authMechanisms: null, // hook to let prpls tweak the list of auth mechanisms

  // Contains the domain of MUC service which is obtained using service
  // discovery.
  _mucService: null,

  /* Generate unique id for a stanza. Using id and unique sid is defined in
   * RFC 6120 (Section 8.2.3, 4.7.3).
   */
  generateId: function() UuidGenerator.generateUUID().toString().slice(1, -1),

  _init: function(aProtoInstance, aImAccount) {
    GenericAccountPrototype._init.call(this, aProtoInstance, aImAccount);

    // Ongoing conversations.
    // The keys of this._conv are assumed to be normalized like account@domain
    // for normal conversations and like room@domain/nick for MUC participant
    // convs.
    this._conv = new NormalizedMap(this.normalizeFullJid.bind(this));

    this._buddies = new NormalizedMap(this.normalize.bind(this));
    this._mucs = new NormalizedMap(this.normalize.bind(this));
  },

  get canJoinChat() true,
  chatRoomFields: {
    room: {get label() _("chatRoomField.room"), required: true},
    server: {get label() _("chatRoomField.server"), required: true},
    nick: {get label() _("chatRoomField.nick"), required: true},
    password: {get label() _("chatRoomField.password"), isPassword: true}
  },
  parseDefaultChatName: function(aDefaultChatName) {
    if (!aDefaultChatName)
      return {nick: this._jid.node};

    let params = aDefaultChatName.trim().split(/\s+/);
    let jid = this._parseJID(params[0]);
    let chatFields = {
      room: jid.node,
      server: jid.domain,
      nick: jid.resource || this._jid.node
    };
    if (params.length > 1)
      chatFields.password = params[1];
    return chatFields;
  },
  getChatRoomDefaultFieldValues: function(aDefaultChatName) {
    let rv = GenericAccountPrototype.getChatRoomDefaultFieldValues
                                    .call(this, aDefaultChatName);
    if (!rv.values.nick)
      rv.values.nick = this._jid.node;
    if (!rv.values.server && this._mucService)
      rv.values.server = this._mucService;

    return rv;
  },

  // XEP-0045: Requests joining room if it exists or
  // creating room if it does not exist.
  joinChat: function(aComponents) {
    let jid =
      aComponents.getValue("room") + "@" + aComponents.getValue("server");
    let nick = aComponents.getValue("nick");

    let muc = this._mucs.get(jid);
    if (muc) {
      if (!muc.left)
        return muc; // We are already in this conversation.
    }
    else {
      muc = new this._MUCConversationConstructor(this, jid, nick);
      this._mucs.set(jid, muc);
    }

    // Store the prplIChatRoomFieldValues to enable later reconnections.
    muc.chatRoomFields = aComponents;
    muc.joining = true;
    muc.removeAllParticipants();

    let password = aComponents.getValue("password");
    let x = Stanza.node("x", Stanza.NS.muc, null,
                        password ? Stanza.node("password", null, null, password) : null);
    this.sendStanza(Stanza.presence({to: jid + "/" + nick}, x));
    return muc;
  },

  _idleSince: 0,
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "idle-time-changed") {
      let idleTime = parseInt(aData, 10);
      if (idleTime)
        this._idleSince = Math.floor(Date.now() / 1000) - idleTime;
      else
        delete this._idleSince;
      this._shouldSendPresenceForIdlenessChange = true;
      executeSoon((function() {
        if ("_shouldSendPresenceForIdlenessChange" in this)
          this._sendPresence();
      }).bind(this));
    }
    else if (aTopic == "status-changed")
      this._sendPresence();
    else if (aTopic == "user-icon-changed") {
      delete this._cachedUserIcon;
      this._forceUserIconUpdate = true;
      this._sendVCard();
    }
    else if (aTopic == "user-display-name-changed")
      this._forceUserDisplayNameUpdate = true;
      this._sendVCard();
  },

  /* GenericAccountPrototype events */
  /* Connect to the server */
  connect: function() {
    this._jid = this._parseJID(this.name);

    // For the resource, if the user has edited the option to a non
    // empty value, use that.
    if (this.prefs.prefHasUserValue("resource")) {
      let resource = this.getString("resource");
      if (resource)
        this._jid.resource = resource;
    }
    // Otherwise, if the username doesn't contain a resource, use the
    // value of the resource option (it will be the default value).
    // If we set an empty resource, XMPPSession will fallback to
    // XMPPDefaultResource (set to brandShortName).
    if (!this._jid.resource)
      this._jid.resource = this.getString("resource");

    //FIXME if we have changed this._jid.resource, then this._jid.jid
    // needs to be updated. This value is however never used because
    // while connected it's the jid of the session that's interesting.

    this._connection =
      new XMPPSession(this.getString("server") || this._jid.domain,
                      this.getInt("port") || 5222,
                      this.getString("connection_security"), this._jid,
                      this.imAccount.password, this);
  },

  remove: function() {
    this._conv.forEach(conv => conv.close());
    this._mucs.forEach(muc => muc.close());
    this._buddies.forEach((buddy, jid) => this._forgetRosterItem(jid));
  },

  unInit: function() {
    if (this._connection)
      this._disconnect(undefined, undefined, true);
    delete this._jid;
    delete this._conv;
    delete this._buddies;
    delete this._mucs;
  },

  /* Disconnect from the server */
  disconnect: function() {
    this._disconnect();
  },

  addBuddy: function(aTag, aName) {
    if (!this._connection)
      throw "The account isn't connected";

    let jid = this.normalize(aName);
    if (!jid || !jid.includes("@"))
      throw "Invalid username";

    if (this._buddies.has(jid)) {
      let subscription = this._buddies.get(jid).subscription;
      if (subscription && (subscription == "both" || subscription == "to")) {
        this.DEBUG("not re-adding an existing buddy");
        return;
      }
    }
    else {
      let s = Stanza.iq("set", null, null,
                        Stanza.node("query", Stanza.NS.roster, null,
                                    Stanza.node("item", null, {jid: jid},
                                                Stanza.node("group", null, null,
                                                            aTag.name))));
      this.sendStanza(s);
    }
    this.sendStanza(Stanza.presence({to: jid, type: "subscribe"}));
  },

  /* Loads a buddy from the local storage.
   * Called for each buddy locally stored before connecting
   * to the server. */
  loadBuddy: function(aBuddy, aTag) {
    let buddy = new this._accountBuddyConstructor(this, aBuddy, aTag);
    this._buddies.set(buddy.normalizedName, buddy);
    return buddy;
  },

  /* Replies to a buddy request in order to accept it or deny it. */
  replyToBuddyRequest: function(aReply, aRequest) {
    if (!this._connection)
      return;
    let s = Stanza.presence({to: aRequest.userName, type: aReply})
    this.sendStanza(s);
    this.removeBuddyRequest(aRequest);
  },

  // Returns undefined if not an error stanza, and an object
  // describing the error otherwise:
  parseError(aStanza) {
    if (aStanza.attributes["type"] != "error")
      return undefined;

    let retval = {stanza: aStanza};
    let error = aStanza.getElement(["error"]);

    // RFC 6120 Section 8.3.2: Type must be one of
    // auth -- retry after providing credentials
    // cancel -- do not retry (the error cannot be remedied)
    // continue -- proceed (the condition was only a warning)
    // modify -- retry after changing the data sent
    // wait -- retry after waiting (the error is temporary).
    retval.type = error.attributes["type"];

    // RFC 6120 Section 8.3.3.
    const kDefinedConditions = [
      "bad-request",
      "conflict",
      "feature-not-implemented",
      "forbidden",
      "gone",
      "internal-server-error",
      "item-not-found",
      "jid-malformed",
      "not-acceptable",
      "not-allowed",
      "not-authorized",
      "policy-violation",
      "recipient-unavailable",
      "redirect",
      "registration-required",
      "remote-server-not-found",
      "remote-server-timeout",
      "resource-constraint",
      "service-unavailable",
      "subscription-required",
      "undefined-condition",
      "unexpected-request"
    ];
    let condition = kDefinedConditions.find(c => error.getElement([c]));
    if (!condition) {
      // RFC 6120 Section 8.3.2.
      this.WARN("Nonstandard or missing defined-condition element in " +
        "error stanza.");
      condition = "undefined-condition";
    }
    retval.condition = condition;

    let errortext = error.getElement(["text"]);
    if (errortext)
      retval.text = errortext.innerText;

    return retval;
  },

  // Returns an error-handling callback for use with sendStanza generated
  // from aHandlers, an object containing the error handlers.
  // If the stanza passed to the callback is an error stanza, and
  // aHandlers contains a method with the name of the defined condition
  // of the error, that method is called. It should return true if the
  // error was handled.
  handleErrors(aHandlers, aThis) {
    return (aStanza) => {
      let error = this.parseError(aStanza);
      if (!error)
        return false;
      let toCamelCase = aStr => {
        // Turn defined condition string into a valid camelcase
        // JS property name.
        let capitalize = s => (s[0].toUpperCase() + s.slice(1));
        let uncapitalize = s => (s[0].toLowerCase() + s.slice(1));
        return uncapitalize(aStr.split("-").map(capitalize).join(""));
      }
      let condition = toCamelCase(error.condition);
      if (!(condition in aHandlers))
        return false;
      return aHandlers[condition].call(aThis, error);
    };
  },

  // Send an error stanza in response to the given stanza (rfc6120#8.3).
  // aCondition is the name of the defined-condition child, aText an
  // optional plain-text description.
  sendErrorStanza(aStanza, aCondition, aType, aText) {
    // TODO: Support the other stanza types (message, presence).
    let qName = aStanza.qName;
    if (qName != "iq") {
      this.ERROR(`Sending an error stanza for a ${qName} stanza is not ` +
                 `implemented yet.`);
      return;
    }

    let error = Stanza.node("error", null, {type: aType},
                            Stanza.node(aCondition, Stanza.NS.stanzas));
    if (aText)
      error.addChild(Stanza.node("text", Stanza.NS.stanzas, null, aText));
    return this.sendStanza(Stanza.iq("error", aStanza.attributes.id,
      aStanza.attributes.from, error));
  },


  /* XMPPSession events */

  /* Called when the XMPP session is started */
  onConnection: function() {
    // Request the roster. The account will be marked as connected when this is
    // complete.
    this.reportConnecting(_("connection.downloadingRoster"));
    let s = Stanza.iq("get", null, null, Stanza.node("query", Stanza.NS.roster));
    this.sendStanza(s, this.onRoster, this);

    // XEP-0030 and XEP-0045 (6): Service Discovery.
    // Queries Server for Associated Services.
    let iq = Stanza.iq("get", null, this._jid.domain,
                       Stanza.node("query", Stanza.NS.disco_items));
    this.sendStanza(iq, this.onServiceDiscovery, this);
  },

  /* Called whenever a stanza is received */
  onXmppStanza: function(aStanza) {
  },

  /* Called when a iq stanza is received */
  onIQStanza: function(aStanza) {
    let type = aStanza.attributes["type"];
    if (type == "set") {
      for each (let qe in aStanza.getChildren("query")) {
        if (qe.uri != Stanza.NS.roster)
          continue;

        for each (let item in qe.getChildren("item"))
          this._onRosterItem(item, true);
        return;
      }
    }
    else if (type == "get") {
      // XEP-0199: XMPP server-to-client ping (XEP-0199)
      let ping = aStanza.getElement(["ping"]);
      if (ping && ping.uri == Stanza.NS.ping) {
        if (aStanza.attributes["from"] == this._jid.domain) {
          this.sendStanza(Stanza.iq("result", aStanza.attributes["id"],
                          this._jid.domain));
        }
        return;
      }
    }
    this.WARN(`Unhandled IQ ${type} stanza.`);
  },

  /* Called when a presence stanza is received */
  onPresenceStanza: function(aStanza) {
    let from = aStanza.attributes["from"];
    this.DEBUG("Received presence stanza for " + from);

    let jid = this.normalize(from);
    let type = aStanza.attributes["type"];
    if (type == "subscribe") {
      this.addBuddyRequest(jid,
                           this.replyToBuddyRequest.bind(this, "subscribed"),
                           this.replyToBuddyRequest.bind(this, "unsubscribed"));
    }
    else if (type == "unsubscribe" || type == "unsubscribed" ||
             type == "subscribed") {
      // Nothing useful to do for these presence stanzas, as we will also
      // receive a roster push containing more or less the same information
      return;
    }
    else if (this._buddies.has(jid))
      this._buddies.get(jid).onPresenceStanza(aStanza);
    else if (this._mucs.has(jid))
      this._mucs.get(jid).onPresenceStanza(aStanza);
    else if (jid != this.normalize(this._connection._jid.jid))
      this.WARN("received presence stanza for unknown buddy " + from);
    else
      this.WARN("Unhandled presence stanza.");
  },

  // XEP-0030: Discovering services and their features that are supported by
  // the server.
  onServiceDiscovery: function(aStanza) {
    let query = aStanza.getElement(["query"]);
    if (aStanza.attributes["type"] != "result" || !query ||
        query.uri != Stanza.NS.disco_items) {
      this.WARN("Could not get services for this server: " + this._jid.domain);
      return true;
    }

    // Discovering the Features that are Supported by each service.
    query.getElements(["item"]).forEach(item => {
      let jid = item.attributes["jid"];
      if (!jid)
        return;
      let iq = Stanza.iq("get", null, jid,
                         Stanza.node("query", Stanza.NS.disco_info));
      this.sendStanza(iq, receivedStanza => {
        let query = receivedStanza.getElement(["query"]);
        let from = receivedStanza.attributes["from"];
        if (aStanza.attributes["type"] != "result" || !query ||
            query.uri != Stanza.NS.disco_info) {
          this.WARN("Could not get features for this service: " + from);
          return true;
        }
        let features = query.getElements(["feature"])
                            .map(elt => elt.attributes["var"]);
        if (features.indexOf(Stanza.NS.muc) != -1) {
          // XEP-0045 (6.2): this feature is for a MUC Service.
          this._mucService = from;
        }
        // TODO: Handle other services that are supported by XMPP through
        // their features.

        return true;
      });
    });
  },

  // Returns null if not an invitation stanza, and an object
  // describing the invitation otherwise.
  parseInvitation: function(aStanza) {
      let x = aStanza.getElement(["x"]);
      if (!x)
        return null;
      let retVal = {};

      // XEP-0045. Direct Invitation (7.8.1)
      // Described in XEP-0249.
      // jid (chatroom) is required.
      // Password, reason, continue and thread are optional.
      if (x.uri == Stanza.NS.conference) {
        if (!x.attributes["jid"]) {
          this.WARN("Received an invitation with missing MUC jid.");
          return null;
        }
        retVal.mucJid = this.normalize(x.attributes["jid"]);
        retVal.from = this.normalize(aStanza.attributes["from"]);
        retVal.password = x.attributes["password"];
        retVal.reason = x.attributes["reason"];
        retVal.continue = x.attributes["continue"];
        retVal.thread = x.attributes["thread"];
        return retVal;
      }

      // XEP-0045. Mediated Invitation (7.8.2)
      // Sent by the chatroom on behalf of someone in the chatroom.
      // jid (chatroom) and from (inviter) are required.
      // password and reason are optional.
      if (x.uri == Stanza.NS.muc_user) {
        let invite = x.getElement(["invite"]);
        if (!invite || !invite.attributes["from"]) {
          this.WARN("Received an invitation with missing MUC invite or from.");
          return null;
        }
        retVal.mucJid = this.normalize(aStanza.attributes["from"]);
        retVal.from = this.normalize(invite.attributes["from"]);
        let continueElement = invite.getElement(["continue"]);
        retVal.continue = !!continueElement;
        if (continueElement)
          retVal.thread = continueElement.attributes["thread"];
        if (x.getElement(["password"]))
          retVal.password = x.getElement(["password"]).innerText;
        if (invite.getElement(["reason"]))
          retVal.reason = invite.getElement(["reason"]).innerText;
        return retVal;
      }

      return null;
  },

  /* Called when a message stanza is received */
  onMessageStanza: function(aStanza) {
    let from = aStanza.attributes["from"];
    let norm = this.normalize(from);

    let type = aStanza.attributes["type"];
    let body;
    let b = aStanza.getElement(["body"]);
    if (b) {
      // If there's a <body> child we have more than just typing notifications.
      // Prefer HTML (in <html><body>) and use plain text (<body>) as fallback.
      let htmlBody = aStanza.getElement(["html", "body"]);
      if (htmlBody)
        body = htmlBody.innerXML;
      else {
        // Even if the message is in plain text, the prplIMessage
        // should contain a string that's correctly escaped for
        // insertion in an HTML document.
        body = TXTToHTML(b.innerText);
      }
    }

    let subject = aStanza.getElement(["subject"]);
    if (subject) {
      // XEP-0045 (7.2.16): Check for a subject element in the stanza and update
      // the topic if it exists.
      // We are breaking the spec because only a message that contains a
      // <subject/> but no <body/> element shall be considered a subject change
      // for MUC, but we ignore that to be compatible with ejabberd versions
      // before 15.06.
      let muc = this._mucs.get(norm);
      let nick = this._parseJID(from).resource;
      // TODO There can be multiple subject elements with different xml:lang
      // attributes.
      muc.setTopic(subject.innerText, nick);
    }

    if (body) {
      let date;
      let delay = aStanza.getElement(["delay"]);
      if (delay && delay.uri == Stanza.NS.delay) {
        if (delay.attributes["stamp"])
          date = new Date(delay.attributes["stamp"]);
      }
      if (date && isNaN(date))
        date = undefined;
      if (type == "groupchat" ||
          (type == "error" && this._mucs.has(norm) && !this._conv.has(from))) {
        if (!this._mucs.has(norm)) {
          this.WARN("Received a groupchat message for unknown MUC " + norm);
          return;
        }
        let muc = this._mucs.get(norm);
        muc.incomingMessage(body, aStanza, date);
        return;
      }

      let invitation = this.parseInvitation(aStanza);
      if (invitation) {
        if (invitation.reason) {
          body = _("conversation.muc.invitationWithReason",
                   invitation.from, invitation.mucJid, invitation.reason);
        }
        else {
          body = _("conversation.muc.invitationWithoutReason",
                   invitation.from, invitation.mucJid);
        }
        if (Services.prefs.getIntPref("messenger.conversations.autoAcceptChatInvitations") == 1) {
          // Auto-accept the invitation.
          let chatRoomFields = this.getChatRoomDefaultFieldValues(invitation.mucJid);
          if (invitation.password)
            chatRoomFields.setValue("password", invitation.password);
          let muc = this.joinChat(chatRoomFields);
          muc.writeMessage(muc.name, body, {system: true});
          return;
        }
        // Otherwise, just notify the user.
        let conv = this.createConversation(invitation.from);
        if (conv)
          conv.writeMessage(invitation.from, body, {system: true});
        return;
      }

      let conv = this.createConversation(from);
      if (!conv)
        return;
      conv.incomingMessage(body, aStanza, date);
    }
    else if (type == "error") {
      let conv = this.createConversation(from);
      if (conv)
        conv.incomingMessage(null, aStanza);
    }

    // Don't create a conversation to only display the typing notifications.
    if (!this._conv.has(norm) && !this._conv.has(from))
      return;

    // Ignore errors while delivering typing notifications.
    if (type == "error")
      return;

    let typingState = Ci.prplIConvIM.NOT_TYPING;
    let state;
    let s = aStanza.getChildrenByNS(Stanza.NS.chatstates);
    if (s.length > 0)
      state = s[0].localName;
    if (state) {
      this.DEBUG(state);
      if (state == "composing")
        typingState = Ci.prplIConvIM.TYPING;
      else if (state == "paused")
        typingState = Ci.prplIConvIM.TYPED;
    }
    let convName = norm;
    if (this._mucs.has(norm))
      convName = from;
    let conv = this._conv.get(convName);
    if (!conv)
      return;
    conv.updateTyping(typingState, conv.shortName);
    conv.supportChatStateNotifications = !!state;
  },

  /* Called when there is an error in the xmpp session */
  onError: function(aError, aException) {
    if (aError === null || aError === undefined)
      aError = Ci.prplIAccount.ERROR_OTHER_ERROR;
    this._disconnect(aError, aException.toString());
  },

  /* Callbacks for Query stanzas */
  /* When a vCard is received */
  _vCardReceived: false,
  onVCard: function(aStanza) {
    let jid = this.normalize(aStanza.attributes["from"]);
    if (!jid || !this._buddies.has(jid))
      return;
    let buddy = this._buddies.get(jid);

    let vCard = aStanza.getElement(["vCard"]);
    if (!vCard)
      return;

    let foundFormattedName = false;
    for each (let c in vCard.children) {
      if (c.type != "node")
        continue;
      if (c.localName == "FN") {
        buddy.vCardFormattedName = c.innerText;
        foundFormattedName = true;
      }
      if (c.localName == "PHOTO")
        buddy._saveIcon(c);
    }
    if (!foundFormattedName && buddy._vCardFormattedName)
      buddy.vCardFormattedName = "";
    buddy._vCardReceived = true;
  },

  // XEP-0029 (Section 2) and RFC 6122 (Section 2): The node and domain are
  // lowercase, while resources are case sensitive and can contain spaces.
  normalizeFullJid: function(aJID) this._parseJID(aJID.trim()).jid,

  // Standard normalization for XMPP removes the resource part of jids.
  normalize: function(aJID) {
    return aJID.trim()
               .split("/", 1)[0] // up to first slash
               .toLowerCase();
  },

  _parseJID: function(aJid) {
    let match =
      /^(?:([^"&'/:<>@]+)@)?([^@/<>'\"]+)(?:\/(.*))?$/.exec(aJid);
    if (!match)
      return null;

    let result = {
      node: match[1],
      domain: match[2].toLowerCase(),
      resource: match[3]
    };
    let jid = result.domain;
    if (result.node) {
      result.node = result.node.toLowerCase();
      jid = result.node + "@" + jid;
    }
    if (result.resource)
      jid += "/" + result.resource;
    result.jid = jid;
    return result;
  },

  _onRosterItem: function(aItem, aNotifyOfUpdates) {
    let jid = aItem.attributes["jid"];
    if (!jid) {
      this.WARN("Received a roster item without jid: " + aItem.getXML());
      return "";
    }
    jid = this.normalize(jid);

    let subscription =  "";
    if ("subscription" in aItem.attributes)
      subscription = aItem.attributes["subscription"];
    if (subscription == "remove") {
      this._forgetRosterItem(jid);
      return "";
    }

    let buddy;
    if (this._buddies.has(jid)) {
      buddy = this._buddies.get(jid);
      let groups = aItem.getChildren("group");
      if (groups.length) {
        // If the server specified at least one group, ensure the group we use
        // as the account buddy's tag is still a group on the server...
        let tagName = buddy.tag.name;
        if (!groups.some(function (g) g.innerText == tagName)) {
          // ... otherwise we need to move our account buddy to a new group.
          tagName = groups[0].innerText;
          if (tagName) { // Should always be true, but check just in case...
            let oldTag = buddy.tag;
            buddy._tag = Services.tags.createTag(tagName);
            Services.contacts.accountBuddyMoved(buddy, oldTag, buddy._tag);
          }
        }
      }
    }
    else {
      let tag;
      for each (let group in aItem.getChildren("group")) {
        let name = group.innerText;
        if (name) {
          tag = Services.tags.createTag(name);
          break; // TODO we should create an accountBuddy per group,
                 // but this._buddies would probably not like that...
        }
      }
      buddy = new this._accountBuddyConstructor(this, null,
                                                tag || Services.tags.defaultTag,
                                                jid);
    }

    // We request the vCard only if we haven't received it yet and are
    // subscribed to presence for that contact.
    if ((subscription == "both" || subscription == "to") && !buddy._vCardReceived)
      this._requestVCard(jid);

    let alias = "name" in aItem.attributes ? aItem.attributes["name"] : "";
    if (alias) {
      if (aNotifyOfUpdates && this._buddies.has(jid))
        buddy.rosterAlias = alias;
      else
        buddy._rosterAlias = alias;
    }
    else if (buddy._rosterAlias)
      buddy.rosterAlias = "";

    if (subscription)
      buddy.subscription = subscription;
    if (!this._buddies.has(jid)) {
      this._buddies.set(jid, buddy);
      Services.contacts.accountBuddyAdded(buddy);
    }
    else if (aNotifyOfUpdates)
      buddy._notifyObservers("status-detail-changed");

    // Keep the xml nodes of the item so that we don't have to
    // recreate them when changing something (eg. the alias) in it.
    buddy._rosterItem = aItem;

    return jid;
  },
  _forgetRosterItem: function(aJID) {
    Services.contacts.accountBuddyRemoved(this._buddies.get(aJID));
    this._buddies.delete(aJID);
  },
  _requestVCard: function(aJID) {
    let s = Stanza.iq("get", null, aJID,
                      Stanza.node("vCard", Stanza.NS.vcard));
    this.sendStanza(s, this.onVCard, this);
  },

  /* When the roster is received */
  onRoster: function(aStanza) {
    // For the first element that is a roster stanza.
    for each (let qe in aStanza.getChildren("query")) {
      if (qe.uri != Stanza.NS.roster)
        continue;

      // Find all the roster items in the new message.
      let newRoster = new Set();
      for each (let item in qe.getChildren("item")) {
        let jid = this._onRosterItem(item);
        if (jid)
          newRoster.add(jid);
      }
      // If an item was in the old roster, but not in the new, forget it.
      for (let jid of this._buddies.keys()) {
        if (!newRoster.has(jid))
          this._forgetRosterItem(jid);
      }
      break;
    }

    this._sendPresence();
    this._buddies.forEach(b => {
      if (b.subscription == "both" || b.subscription == "to")
        b.setStatus(Ci.imIStatusInfo.STATUS_OFFLINE, "");
    });
    this.reportConnected();
    this._sendVCard();
  },

  /* Public methods */

  sendStanza(aStanza, aCallback, aThis) {
    return this._connection.sendStanza(aStanza, aCallback, aThis);
  },

  // Variations of the XMPP protocol can change these default constructors:
  _conversationConstructor: XMPPConversation,
  _MUCConversationConstructor: XMPPMUCConversation,
  _accountBuddyConstructor: XMPPAccountBuddy,

  /* Create a new conversation */
  createConversation: function(aName) {
    let convName = this.normalize(aName);

    // Checks if conversation is with a participant of a MUC we are in. We do
    // not want to strip the resource as it is of the form room@domain/nick.
    let isMucParticipant = this._mucs.has(convName);
    if (isMucParticipant)
      convName = this.normalizeFullJid(aName);

    // Checking that the aName can be parsed and is not broken.
    let jid = this._parseJID(convName);
    if (!jid || !jid.node || (isMucParticipant && !jid.resource)) {
      this.ERROR("Could not create conversation as jid is broken: " + convName);
      throw "Invalid JID";
    }

    if (!this._conv.has(convName)) {
      this._conv.set(convName,
                     new this._conversationConstructor(this, convName,
                                                       isMucParticipant));
    }

    return this._conv.get(convName);
  },

  /* Remove an existing conversation */
  removeConversation: function(aNormalizedName) {
    if (this._conv.has(aNormalizedName))
      this._conv.delete(aNormalizedName);
    else if (this._mucs.has(aNormalizedName))
      this._mucs.delete(aNormalizedName);
  },

  /* Private methods */

  /* Disconnect from the server */
  /* The aError and aErrorMessage parameters are passed to reportDisconnecting
   * and used by the account manager.
   * The aQuiet parameter is to avoid sending status change notifications
   * during the uninitialization of the account. */
  _disconnect: function(aError = Ci.prplIAccount.NO_ERROR, aErrorMessage = "",
                        aQuiet = false) {
    if (!this._connection)
      return;

    this.reportDisconnecting(aError, aErrorMessage);

    this._buddies.forEach(b => {
      if (!aQuiet)
        b.setStatus(Ci.imIStatusInfo.STATUS_UNKNOWN, "");
      b.onAccountDisconnected();
    });

    this._mucs.forEach(muc => {
      muc.joining = false; // In case we never finished joining.
      muc.left = true;
    });

    this._connection.disconnect();
    delete this._connection;

    // We won't receive "user-icon-changed" notifications while the
    // account isn't connected, so clear the cache to avoid keeping an
    // obsolete icon.
    delete this._cachedUserIcon;
    // Also clear the cached user vCard, as we will want to redownload it
    // after reconnecting.
    delete this._userVCard;

    this.reportDisconnected();
  },

  /* Set the user status on the server */
  _sendPresence: function() {
    delete this._shouldSendPresenceForIdlenessChange;

    if (!this._connection)
      return;

    let si = this.imAccount.statusInfo;
    let statusType = si.statusType;
    let show = "";
    if (statusType == Ci.imIStatusInfo.STATUS_UNAVAILABLE)
      show = "dnd";
    else if (statusType == Ci.imIStatusInfo.STATUS_AWAY ||
             statusType == Ci.imIStatusInfo.STATUS_IDLE)
      show = "away";
    let children = [];
    if (show)
      children.push(Stanza.node("show", null, null, show));
    let statusText = si.statusText;
    if (statusText)
      children.push(Stanza.node("status", null, null, statusText));
    if (this._idleSince) {
      let time = Math.floor(Date.now() / 1000) - this._idleSince;
      children.push(Stanza.node("query", Stanza.NS.last, {seconds: time}));
    }
    if (this.prefs.prefHasUserValue("priority")) {
      let priority = Math.max(-128, Math.min(127, this.getInt("priority")));
      if (priority)
        children.push(Stanza.node("priority", null, null, priority.toString()));
    }
    this.sendStanza(Stanza.presence({"xml:lang": "en"}, children), aStanza => {
      // As we are implicitly subscribed to our own presence (rfc6121#4), we
      // will receive the presence stanza mirrored back to us. We don't need
      // to do anything with this response.
      return true;
    });
  },

  _downloadingUserVCard: false,
  _downloadUserVCard: function() {
    // If a download is already in progress, don't start another one.
    if (this._downloadingUserVCard)
      return;
    this._downloadingUserVCard = true;
    let s = Stanza.iq("get", null, null,
                      Stanza.node("vCard", Stanza.NS.vcard));
    this.sendStanza(s, this.onUserVCard, this);
  },

  onUserVCard: function(aStanza) {
    delete this._downloadingUserVCard;
    this._userVCard = aStanza.getElement(["vCard"]) || null;
    // If a user icon exists in the vCard we received from the server,
    // we need to ensure the line breaks in its binval are exactly the
    // same as those we would include if we sent the icon, and that
    // there isn't any other whitespace.
    if (this._userVCard) {
      let binval = this._userVCard.getElement(["PHOTO", "BINVAL"]);
      if (binval && binval.children.length) {
        binval = binval.children[0];
        binval.text = binval.text.replace(/[^A-Za-z0-9\+\/\=]/g, "")
                                 .replace(/.{74}/g, "$&\n");
      }
    }
    this._sendVCard();
  },

  _cachingUserIcon: false,
  _cacheUserIcon: function() {
    if (this._cachingUserIcon)
      return;

    let userIcon = this.imAccount.statusInfo.getUserIcon();
    if (!userIcon) {
      this._cachedUserIcon = null;
      this._sendVCard();
      return;
    }

    this._cachingUserIcon = true;
    let channel = Services.io.newChannelFromURI2(userIcon,
      null, Services.scriptSecurityManager.getSystemPrincipal(), null,
      Ci.nsILoadInfo.SEC_NORMAL, Ci.nsIContentPolicy.TYPE_IMAGE);
    NetUtil.asyncFetch2(channel, (inputStream, resultCode) => {
      if (!Components.isSuccessCode(resultCode))
        return;
      try {
        let readImage = {value: null};
        let type = channel.contentType;
        imgTools.decodeImageData(inputStream, type, readImage);
        readImage = readImage.value;
        let scaledImage;
        if (readImage.width <= 96 && readImage.height <= 96)
          scaledImage = imgTools.encodeImage(readImage, type);
        else {
          if (type != "image/jpeg")
            type = "image/png";
          scaledImage = imgTools.encodeScaledImage(readImage, type, 64, 64);
        }

        let bstream = Cc["@mozilla.org/binaryinputstream;1"]
                        .createInstance(Ci.nsIBinaryInputStream);
        bstream.setInputStream(scaledImage);

        let data = bstream.readBytes(bstream.available());
        this._cachedUserIcon = {
          type: type,
          binval: btoa(data).replace(/.{74}/g, "$&\n")
        };
      } catch (e) {
        Cu.reportError(e);
        this._cachedUserIcon = null;
      }
      delete this._cachingUserIcon;
      this._sendVCard();
    });
  },
  _sendVCard: function() {
    if (!this._connection)
      return;

    // We have to download the user's existing vCard before updating it.
    // This lets us preserve the fields that we don't change or don't know.
    // Some servers may reject a new vCard if we don't do this first.
    if (!this.hasOwnProperty("_userVCard")) {
      // The download of the vCard is asyncronous and will call _sendVCard back
      // when the user's vCard has been received.
      this._downloadUserVCard();
      return;
    }

    // Read the local user icon asynchronously from the disk.
    // _cacheUserIcon will call _sendVCard back once the icon is ready.
    if (!this.hasOwnProperty("_cachedUserIcon")) {
      this._cacheUserIcon();
      return;
    }

    // If the user currently doesn't have any vCard on the server or
    // the download failed, an empty new one.
    if (!this._userVCard)
      this._userVCard = Stanza.node("vCard", Stanza.NS.vcard);

    // Keep a serialized copy of the existing user vCard so that we
    // can avoid resending identical data to the server.
    let existingVCard = this._userVCard.getXML();

    let fn = this._userVCard.getElement(["FN"]);
    let displayName = this.imAccount.statusInfo.displayName;
    if (displayName) {
      // If a display name is set locally, update or add an FN field to the vCard.
      if (!fn)
        this._userVCard.addChild(Stanza.node("FN", Stanza.NS.vcard, null, displayName));
      else {
        if (fn.children.length)
          fn.children[0].text = displayName;
        else
          fn.addText(displayName);
      }
    }
    else if ("_forceUserDisplayNameUpdate" in this) {
      // We remove a display name stored on the server without replacing
      // it with a new value only if this _sendVCard call is the result of
      // a user action. This is to avoid removing data from the server each
      // time the user connects from a new profile.
      this._userVCard.children =
        this._userVCard.children.filter(function (n) n.qName != "FN");
    }
    delete this._forceUserDisplayNameUpdate;

    if (this._cachedUserIcon) {
      // If we have a local user icon, update or add it in the PHOTO field.
      let photoChildren = [
        Stanza.node("TYPE", Stanza.NS.vcard, null, this._cachedUserIcon.type),
        Stanza.node("BINVAL", Stanza.NS.vcard, null, this._cachedUserIcon.binval)
      ];
      let photo = this._userVCard.getElement(["PHOTO"]);
      if (photo)
        photo.children = photoChildren;
      else
        this._userVCard.addChild(Stanza.node("PHOTO", Stanza.NS.vcard, null,
                                             photoChildren));
    }
    else if ("_forceUserIconUpdate" in this) {
      // Like for the display name, we remove a photo without
      // replacing it only if the call is caused by a user action.
      this._userVCard.children =
        this._userVCard.children.filter(function (n) n.qName != "PHOTO");
    }
    delete this._forceUserIconUpdate;

    // Send the vCard only if it has really changed.
    // We handle the result response from the server (it does not require
    // any further action).
    if (this._userVCard.getXML() != existingVCard) {
      this.sendStanza(Stanza.iq("set", null, null, this._userVCard),
        aStanza => aStanza.attributes.type == "result");
    }
    else
      this.LOG("Not sending the vCard because the server stored vCard is identical.");
  }
};
