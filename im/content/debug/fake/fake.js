/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


Components.utils.import("resource:///modules/imXPCOMUtils.jsm");
Components.utils.import("resource:///modules/jsProtoHelper.jsm");

var away = Ci.imIStatusInfo.STATUS_AWAY;
var idle = Ci.imIStatusInfo.STATUS_IDLE;
var mobile = Ci.imIStatusInfo.STATUS_MOBILE;

var flo_img_url = 'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQAAAQABAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBF' +
  'RyB2NjIpLCBxdWFsaXR5ID0gOTUK/9sAQwACAQEBAQECAQEBAgICAgIEAwICAgIFBAQDBAYFBgYGBQYG' +
  'BgcJCAYHCQcGBggLCAkKCgoKCgYICwwLCgwJCgoK/9sAQwECAgICAgIFAwMFCgcGBwoKCgoKCgoKCgoK' +
  'CgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK/8AAEQgAMgAyAwEiAAIRAQMRAf/E' +
  'AB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUS' +
  'ITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RV' +
  'VldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TF' +
  'xsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgME' +
  'BQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1Lw' +
  'FWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKD' +
  'hIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp' +
  '6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A/PL4p3OpWF5/Y+uuElnAYiEjGM5IrNl8ZaP8GvC1v4s8I6Qk' +
  '2uajDILSZoyTbRAlMrj+NmXGcggZx1rJm0rxn4yvLnxNrUwMEbsFkUHtxX3X/wAEh/gH8O/GepeIvjB4' +
  'z+Hdprc/hiwsrPw1p10PMjjnl3yPdMjcbhjjtliR0FfN8OYaDrpSa5oq7ttfufP4WlGc0pLVdOlz889O' +
  '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' +
  'dT//2Q==';

var ib_icon_url = 'data:image/png;base64,' +
  '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';

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

    this.accounts = [new Account("Tom", "prpl-aim"),
                     new Account("tom.smith@hotmail.com", "prpl-msn"),
                     new Account("tom.smith@gmail.com/instantbird",
                                 "prpl-jabber"),
                     new Account("tom.smith@yahoo.com", "prpl-yahoo"),
                     new Account("tom@irc.mozilla.org", "prpl-irc")];
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
      "Colleagues"
    ].map(name => Services.tags.createTag(name));

    this.buddies = [
      new AccountBuddy("Michael", this.accounts[2], this.groups[0], {_statusType: idle, _statusText: "I'm currently away from the computer."}),
      new AccountBuddy("Ethan", this.accounts[2], this.groups[0]),
      new AccountBuddy("Daniel", this.accounts[1], this.groups[0]),
      new AccountBuddy("Emily", this.accounts[0], this.groups[1], {_statusType: away, _statusText: "out for lunch"}),
      new AccountBuddy("Christopher", this.accounts[0], this.groups[1]),
      new AccountBuddy("Anthony", this.accounts[0], this.groups[1], {_statusType: mobile}),
      new AccountBuddy("Florian", this.accounts[2], this.groups[1], {_buddyIconFileName: flo_img_url}),
      new AccountBuddy("Emma", this.accounts[1], this.groups[1]),
      new AccountBuddy("Tony", this.accounts[1], this.groups[1], {_statusText: "Try Instantbird!"}),
      new AccountBuddy("Andrew", this.accounts[3], this.groups[1]),
      new AccountBuddy("Olivia", this.accounts[3], this.groups[1]),
      new AccountBuddy("Elizabeth", this.accounts[1], this.groups[2]),
      new AccountBuddy("William", this.accounts[2], this.groups[2])
    ];
    for each (let buddy in this.buddies)
      Services.contacts.accountBuddyAdded(buddy);

    this.convs = [
      new Conversation("Florian", this.accounts[2], this.buddies[6]),
      new Chat("#instantbird", this.accounts[4], "Tom"),
      new Conversation("William", this.accounts[2], this.buddies[13]),
      new Conversation("Emma", this.accounts[2], this.buddies[7])
    ];

    let makeDate = function(aDateString) {
      let array = aDateString.split(":");
      let now = new Date();
      // Use a date on day in the future so that time bubbles doesn't
      // show the latest message as several hours old.
      // FIXME: this will break when run the last day of the month.
      return (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1,
                       array[0], array[1], array[2])) / 1000;
    };

    let chat = this.convs[1];
    chat._topic = "Ask questions about Instantbird here.";
    chat._participants["Andrew"] = new ChatBuddy("Andrew");
    chat._participants["Daniel"] = new ChatBuddy("Daniel");
    chat._participants["Emma"] = new ChatBuddy("Emma");
    chat._participants["Florian"] = new ChatBuddy("Florian", {op: true});
    chat._participants["Tom"] = new ChatBuddy("Tom");
    chat._participants["Tony"] = new ChatBuddy("Tony");

    new Message("Florian", "Hey! :)",
                {time: makeDate("10:42:22"), incoming: true, conversation: this.convs[0]});
    new Message("Florian", "What's up?",
                {time: makeDate("10:42:25"), incoming: true, conversation: this.convs[0]});
    new Message("Tom", "I'm trying Instantbird! :D",
                {time: makeDate("10:43:01"), outgoing: true, conversation: this.convs[0]});
    new Message("system", "Flo has gone away.",
                {time: makeDate("10:43:06"), system: true, conversation: this.convs[0]});
    new Message("system", "Flo has become idle.",
                {time: makeDate("10:48:10"), system: true, conversation: this.convs[0]});
    new Message("system", "Flo is no longer idle.",
                {time: makeDate("10:55:26"), system: true, conversation: this.convs[0]});
    new Message("system", "Flo is no longer away.",
                {time: makeDate("10:56:02"), system: true, conversation: this.convs[0]});
    new Message("Florian", "So, what do you think?",
                {time: makeDate("10:42:25"), incoming: true, conversation: this.convs[0]});
    new Message("Tom", "Instantbird is great!",
                {time: makeDate("10:43:52"), outgoing: true, conversation: this.convs[0]});
    new Message("Tom", "I love it! <3",
                {time: makeDate("10:44:01"), outgoing: true, conversation: this.convs[0]});
    new Message("Florian", "Thanks :)",
                {time: makeDate("10:44:12"), incoming: true, conversation: this.convs[0]});

    new Message("William", "Hi!",
                {time: makeDate("10:43:05"), incoming: true, conversation: this.convs[2]});

    new Message("system", "The topic for " + chat.name + " is: " + chat.topic,
                {time: makeDate("10:43:06"), system: true, conversation: chat});
    new Message("Tom", "Hi! ^^",
                {time: makeDate("10:43:32"), outgoing: true, conversation: chat});
    new Message("Andrew", "Instantbird is great!",
                {time: makeDate("10:43:52"), incoming: true, conversation: chat});
    new Message("Daniel", "Sure! I love it! <3",
                {time: makeDate("10:44:01"), incoming: true, conversation: chat});
    new Message("Florian", "Thanks :)",
                {time: makeDate("10:44:12"), incoming: true, conversation: chat});

    Services.core.globalUserStatus.displayName = "Tom Smith";
    // Ugly :-(
    document.getElementById("userIcon").src = ib_icon_url;
  },
  deleteAccounts: function f_deleteAccounts() {
    if (!Services.accounts.getAccounts().hasMoreElements())
      return;

    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    if (!prompts.confirm(window, "Are you sure you want to delete all accounts?",
                         "You are about to delete your accounts. Are you sure?"))
      throw "user aborted the operation";

    for (let acc in getIter(Services.accounts.getAccounts()))
      Services.accounts.deleteAccount(acc.id);
  }
};

this.addEventListener("load", fake.load);

var gLastAccountId = 0;
function Account(aName, aProto)
{
  this.name = aName;
  this.protocol = Services.core.getProtocolById(aProto);
  this.id = "account" + (++gLastAccountId);
  this.numericId = gLastAccountId;

  dump("account " + aName + " created\n");
}
Account.prototype = {
  __proto__: ClassInfo("imIAccount", "generic account object"),
  get imAccount() { return this; },
  protocol: null,
  password: "",
  autoLogin: true,
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
  connecting: false,
  normalize: aStr => aStr

  //FIXME: PurpleConnectionFlags
};

function AccountBuddy(aName, aAccount, aTag, aObject)
{
  this._init(aAccount, null, aTag, aName);
  if (aObject)
    for (let i in aObject)
      this[i] = aObject[i];
}
AccountBuddy.prototype = {
  __proto__: GenericAccountBuddyPrototype,
  _statusType: Ci.imIStatusInfo.STATUS_AVAILABLE
};

function Conversation(aName, aAccount, aBuddy)
{
  this.buddy = aBuddy;
  this._init(aAccount, aName);
  dump("private conversation " + aName + " created\n");
}
Conversation.prototype = GenericConvIMPrototype;

function Chat(aName, aAccount, aChatNick)
{
  this._init(aAccount, aName, aChatNick);
  dump("chat conversation " + aName + " created\n");
}
Chat.prototype = GenericConvChatPrototype;

function ChatBuddy(aName, aObject)
{
  this._name = aName;
  if (aObject)
    for (let i in aObject)
      this[i] = aObject[i];
}
ChatBuddy.prototype = GenericConvChatBuddyPrototype;
