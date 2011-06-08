/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

Components.utils.import("resource:///modules/jsProtoHelper.jsm");

var fake = {
  load: function f_load() {
    if (!Components.classes["@mozilla.org/process/environment;1"]
                   .getService(Components.interfaces.nsIEnvironment)
                   .get("FAKE"))
      return;

    dump("Fake load\n");
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
                     new Account("8493208", "prpl-icq"),
                     new Account("ibuser@irc.mozilla.org", "prpl-irc")];
    for each (let account in this.accounts)
      Services.obs.notifyObservers(account, "account-added", null);

    var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator)
                       .getMostRecentWindow("Messenger:accountWizard");
    if (win)
      win.close();

    this.groups = [
      "Contacts",
      "Friends",
      "Collegues"
    ].map(function(name) Services.tags.createTag(name));

    this.buddies = [
      new AccountBuddy("Florian", this.accounts[2], this.groups[0]),
      new AccountBuddy("Quentin", this.accounts[0], this.groups[1]),
      new AccountBuddy("Julien", this.accounts[1], this.groups[2]),
      new AccountBuddy("Alexandre", this.accounts[2], this.groups[2])
    ];
    for each (let buddy in this.buddies)
      Services.contacts.accountBuddyAdded(buddy);

    this.convs = [
      new Conversation("Florian", this.accounts[2], false, this.buddies[0]),
      new Conversation("#fake", this.accounts[4], true),
      new Conversation("Tata", this.accounts[0])
    ];

    let makeDate = function(aDateString) {
      let array = aDateString.split(":");
      let now = new Date();
      return (new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                       array[0], array[1], array[2])) / 1000;
    };

    new Message("FLo", "Hey! :)", {time: makeDate("10:42:22"), outgoing: true, conversation: this.convs[0]});
    new Message("FLo", "What's up?", {time: makeDate("10:42:25"), outgoing: true, conversation: this.convs[0]});
    new Message("Quentin", "Fixing the website...", {time: makeDate("10:43:01"), incoming: true, conversation: this.convs[0]});

    let chat = this.convs[1];
    chat._topic = "This is a fake conversation";
    chat._participants["Toto"] = new ChatBuddy("Toto", {op: true});
    chat._participants["tata"] = new ChatBuddy("tata");
    new Message("system", "The topic for " + chat.name + " is: " + chat.topic, {time: makeDate("10:43:01"), system: true, conversation: chat});
    new Message("tata", "hi", {time: makeDate("10:43:32"), incoming: true, conversation: chat});
    new Message("Titi", "hey :)", {time: makeDate("10:43:52"), outgoing: true, conversation: chat});

    new Message("Tata", "hi", {time: makeDate("10:43:01"), incoming: true, conversation: this.convs[2]});
  },
  deleteAccounts: function f_deleteAccounts() {
    if (!Services.core.getAccounts().hasMoreElements())
      return;

    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    if (!prompts.confirm(window, "Are you sure you want to delete all accounts?",
                         "You are about to delete " + nbaccounts + " accounts. Are you sure?"))
      throw "user aborted the operation";

    for (let acc in getIter(Services.core.getAccounts()))
      Services.core.deleteAccount(acc.id);
  }
};

this.addEventListener("load", fake.load, false);

var gLastAccountId = 0;
function Account(aName, aProto)
{
  this.name = aName;
  this.protocol = Services.core.getProtocolById(aProto);
  this.id = "account" + (++gLastAccountId);

  dump("account " + aName + " created\n");
}
Account.prototype = {
  __proto__: ClassInfo("purpleIAccount", "generic account object"),
  protocol: null,
  password: "",
  autoLogin: true,
  rememberPassword: true,
  alias: "",
  proxyInfo: null,
  connectionStageMsg: "",
  connectionErrorReason: -1,
  timeOfNextReconnect: 0,
  timeOfLastConnect: new Date(),
  connectionErrorMessage: "",
  disconnecting: false,
  disconnected: false,
  connected: true,
  connecting: false

  //FIXME: PurpleConnectionFlags
};

function AccountBuddy(aName, aAccount, aTag)
{
  this._init(aAccount, null, aTag, aName);
}
AccountBuddy.prototype = {
  __proto__: GenericAccountBuddyPrototype,
  _statusType: Ci.imIStatusInfo.STATUS_AVAILABLE
};

function Conversation(aName, aAccount, aIsChat, aBuddy)
{
  this.__proto__ = aIsChat ? GenericConvChatPrototype : GenericConvIMPrototype;
  this.buddy = aBuddy;
  this._init(aAccount, aName);
  dump("conversation " + aName + " created\n");
}

function ChatBuddy(aName, aObject)
{
  this._name = aName;
  if (aObject)
    for (let i in aObject)
      this[i] = aObject[i];
}
ChatBuddy.prototype = GenericConvChatBuddyPrototype;
