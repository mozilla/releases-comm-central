/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

var fake = {
  accounts: [],
  groups: [],
  buddies: [],

  load: function f_load() {
    if (!Components.classes["@mozilla.org/process/environment;1"]
                   .getService(Components.interfaces.nsIEnvironment)
                   .get("FAKE"))
      return;

    dump("Fake load\n");
    fake.pcs = Components.classes["@instantbird.org/purple/core;1"]
                         .getService(Ci.purpleICoreService);

    setTimeout(function() {
      fake.fakeIt();
    }, 1000);
  },

  fakeIt: function f_fakeIt() {
    // First delete all existing accounts
    // this will prompt the user for a confirmation before deleting
    this.deleteAccounts();

    // ensure the account manager is opened as our fake accounts will
    // be visible only in already opened account manager windows
    menus.accounts();

    this.accounts = [new Account("Instantbird", "prpl-aim"),
                     new Account("msn@instantbird.org", "prpl-msn"),
                     new Account("instantbird@gmail.com/instantbird",
                                 "prpl-jabber"),
                     new Account("8493208", "prpl-icq")];
    this.createFakeAccounts();

    var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator)
                       .getMostRecentWindow("Messenger:accountWizard");
    if (win)
      win.close();

    this.groups = [new Tag("Contacts"),
                   new Tag("Friends"),
                   new Tag("Collegues")];

    this.buddies = [new Buddy("Florian", this.accounts[2], this.groups[0]),
                    new Buddy("Quentin", this.accounts[0], this.groups[1]),
                    new Buddy("Julien", this.accounts[1], this.groups[2]),
                    new Buddy("Alexandre", this.accounts[2], this.groups[2])];
    this.createFakeBuddies();

    var chat = new Conversation("#fake", true);
    chat.topic = "This is a fake conversation";

    this.convs = [new Conversation("Florian", false, this.buddies[0]),
                  chat,
                  new Conversation("Tata")];
    this.createFakeConversations();

    var chatBuddy;
    chatBuddy = new ChatBuddy("Toto");
    chatBuddy.op = true;
    chat.addChatBuddy(chatBuddy);
    chat.addChatBuddy(new ChatBuddy("tata"));
    dump("Adding chat buddies\n");

    let makeDate = function(aDateString) {
      let array = aDateString.split(":");
      return (new Date(2009, 11, 8, array[0], array[1], array[2])) / 1000;
    };

    setTimeout(function(aConvs) {
    dump("sending incoming message now \n");
    var message;
    message = new Message(makeDate("10:42:22"), "FLo", "Hey! :)");
    message.outgoing = true;
    message.conversation = aConvs[0];
    message = new Message(makeDate("10:42:25"), "FLo", "What's up?");
    message.outgoing = true;
    message.conversation = aConvs[0];
    message = new Message(makeDate("10:43:01"), "Quentin", "Fixing the website...");
    message.incoming = true;
    message.conversation = aConvs[0];
    message = new Message(makeDate("10:43:01"), "Tata", "hi");
    message.incoming = true;
    message.conversation = aConvs[2];

    message = new Message(makeDate("10:43:01"), "system", "The topic for " + chat.name + " is: " + chat.topic);
    message.system = true;
    message.conversation = chat;

    message = new Message(makeDate("10:43:32"), "tata", "hi");
    message.incoming = true;
    message.conversation = chat;

    message = new Message(makeDate("10:43:52"), "Titi", "hey :)");
    message.outgoing = true;
    message.conversation = chat;

    }, 3000, this.convs);
  },
  deleteAccounts: function f_deleteAccounts() {
    var nbaccounts = 0;
    for (let acc in buddyList.getAccounts())
      ++nbaccounts;
    if (!nbaccounts)
      return;

    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    if (!prompts.confirm(window, "Are you sure you want to delete all accounts?",
                         "You are about to delete " + nbaccounts + " accounts. Are you sure?"))
      throw "user aborted the operation";

    for (let acc in buddyList.getAccounts())
      this.pcs.deleteAccount(acc.id);
  },

  createFakeBuddies: function f_createFakeBuddies() {
    for each (let buddy in this.buddies)
      this.notify(buddy, "buddy-signed-on");
  },

  createFakeAccounts: function f_createFakeAccounts() {
    for each (let account in this.accounts)
      this.notify(account, "account-added");
  },

  createFakeConversations: function f_createFakeConversations() {
    for each (let conv in this.convs)
      this.notify(conv, "new-conversation");
  },

  notify: function f_notify(aObject, aTopic) {
    Components.classes["@mozilla.org/observer-service;1"]
              .getService(Components.interfaces.nsIObserverService)
              .notifyObservers(aObject, aTopic, null);
  },
  getProtocols: function aw_getProtocols() {
    return getIter(this.pcs.getProtocols());
  }
};

this.addEventListener("load", fake.load, false);

var gLastAccountId = 0;
function Account(aName, aProto)
{
  this.name = aName;
  for (let proto in fake.getProtocols())
    if (proto.id == aProto)
      this.protocol = proto;
  this.id = "account" + (++gLastAccountId);

  dump("account " + aName + " created\n");
}
Account.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIAccount))
      return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  protocol: null,
  password: "",
  autoLogin: true,
  rememberPassword: true,
  alias: "",
  proxyInfo: null,
  connectionStageMsg: "",
  connectionErrorReason: -1,
  timeOfNextReconnect: 0,
  connectionErrorMessage: "",
  disconnecting: false,
  disconnected: false,
  connected: true,
  connecting: false

  //FIXME: PurpleConnectionFlags
};

var gLastTagId = 0;
function Tag(aName)
{
  this.name = aName;
  this.id = ++gLastTagId;
  this._buddies = [];

  dump("tag " + aName + " created\n");
}
Tag.prototype = {
  _addBuddy: function(aBuddy) { this._buddies.push(aBuddy); },
  getBuddies: function(aLength) {
    if (aLength)
      aLength.value = this._buddies.length;
    return this._buddies
  },
  addObserver: function() null,
  removeObserver: function() null,
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleITag))
      return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  visible: true
};

var gLastBuddyId = 0;
function Buddy(aName, aAccount, aTag)
{
  this.name = aName;
  this.account = aAccount;
  this.tag = aTag;
  aTag._addBuddy(this);

  this.id = ++gLastBuddyId;

  dump("buddy " + aName + " created\n");
}
Buddy.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIBuddy) ||
        aIid.equals(Components.interfaces.purpleIAccountBuddy))
      return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  getAccount: function(aId) this.account,
  getAccountBuddies: function(aLength) {
    if (aLength)
      aLength.value = 1;
    return [this];
  },
  get buddy() this,
  getTooltipInfo: function() null,

  alias: "",
  available: true,
  online: true,
  status: "",
  idle: false
};


/**
 * Constructs an nsISimpleEnumerator for the given array of items.
 * Copied from netwerk/test/httpserver/httpd.js
 *
 * @param items : Array
 *   the items, which must all implement nsISupports
 */
function nsSimpleEnumerator(items)
{
  this._items = items;
  this._nextIndex = 0;
}
nsSimpleEnumerator.prototype = {
  hasMoreElements: function() this._nextIndex < this._items.length,
  getNext: function() {
    if (!this.hasMoreElements())
      throw Cr.NS_ERROR_NOT_AVAILABLE;

    return this._items[this._nextIndex++];
  },
  QueryInterface: function(aIID) {
    if (Ci.nsISimpleEnumerator.equals(aIID) ||
        Ci.nsISupports.equals(aIID))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};

var gLastConversationId = 0;
function Conversation(aName, aIsChat, aBuddy)
{
  this.name = aName;
  this.isChat = aIsChat;
  if (aIsChat)
    this._chatBuddies = [];
  this.id = ++gLastConversationId;
  this.buddy = aBuddy;

  this._observers = [];
  this._pendingNotifications = [];

  dump("conversation " + aName + " created\n");
}
Conversation.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.nsIClassInfo) ||
        aIid.equals(Components.interfaces.purpleIConversation) ||
        aIid.equals(this.isChat ? Ci.purpleIConvChat : Ci.purpleIConvIM))
      return this;

		throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  getInterfaces: function(countRef) {
    var interfaces = [
      Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIConversation,
      this.isChat ? Ci.purpleIConvChat : Ci.purpleIConvIM
    ];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  contractID: null,
  classDescription: "Conversation object",
  classID: null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  addObserver: function(aObserver) {
    this._observers.push(aObserver);
    setTimeout(function(aThis) {
      for each (notification in aThis._pendingNotifications)
        aObserver.observe(notification.subject, notification.topic, null);
    }, 500, this);
  },
  removeObserver: function() { /* do nothing, let's leak happily */ },
  notifyObservers: function(aSubject, aTopic, aData) {
    if (!this._observers.length)
      this._pendingNotifications.push({subject: aSubject, topic: aTopic});
    else {
      for each (observer in this._observers)
        observer.observe(aSubject, aTopic, aData);
    }
  },
  close: function() null,
  sendTyping: function() null,

  _nativeConv:
    Components.classes["@instantbird.org/purple/convim;1"]
              .createInstance(Ci.purpleIConvIM),
  setBaseURI: function(aDocument, aURI) {
    this._nativeConv.setBaseURI(aDocument, aURI);
  },

  get title() this.name,
  account: null,
  buddy: null,
  typingStage: Ci.purpleIConvIM.NO_TYPING,
  topic: "Fake Conversation",
  addChatBuddy: function(aBuddy) {
    this._chatBuddies.push(aBuddy);
    // Don't use notifyObservers as these notifications should not be
    // kept for asynchronous delivery.
    let enumerator = new nsSimpleEnumerator([aBuddy]);
    for each (observer in this._observers)
      observer.observe(enumerator, "chat-buddy-add", null);
  },
  getParticipants: function() (new nsSimpleEnumerator(this._chatBuddies))
};

function Message(aTime, aWho, aMessage)
{
  this.time = aTime;
  this.who = aWho;
  this.message = aMessage;
}
Message.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIMessage))
      return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  get alias() this.who,
  _conversation: null,
  get conversation() this._conversation,
  set conversation(aConv) {
    this._conversation = aConv;
    aConv.notifyObservers(this, "new-text", null);
    fake.notify(this, "new-text");
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
  noLinkification: false
};

function ChatBuddy(aName)
{
  this.name = aName;
}
ChatBuddy.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.nsIClassInfo) ||
        aIid.equals(Components.interfaces.purpleIConvChatBuddy))
      return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  getInterfaces: function(countRef) {
    var interfaces = [Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIConvChatBuddy];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  contractID: null,
  classDescription: "Chat Buddy object",
  classID: null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  get alias() this.name,
  buddy: null,

  get noFlags() !this.voiced && !this.halfOp && !this.op && !this.founder && !this.typing,
  voiced: false,
  halfOp: false,
  op: false,
  founder: false,
  typing: false
};

function dumpStack(offset, max_depth)
{
  if (!offset || offset<0) offset = 0;
  if (!max_depth) max_depth = 10;
  var frame = Components.stack;
  while(--max_depth && (frame=frame.caller)) {
    if (!offset)
      dump(frame+"\n");
    else
      --offset;
  }
  dump("\n");
}
