/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2010.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = [
  "setTimeout",
  "clearTimeout",
  "nsSimpleEnumerator",
  "EmptyEnumerator",
  "GenericAccountPrototype",
  "GenericConversationPrototype",
  "GenericProtocolPrototype",
  "Message",
  "doXHRequest"
];

/*
 TODO
  replace doXHRequest with a more generic 'HTTP' object
*/

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

XPCOMUtils.defineLazyServiceGetter(this, "obs",
                                   "@mozilla.org/observer-service;1",
                                   "nsIObserverService");
XPCOMUtils.defineLazyServiceGetter(this, "cs",
                                   "@mozilla.org/consoleservice;1",
                                   "nsIConsoleService");
function LOG(aString)
{
  cs.logStringMessage(aString);
}

function setTimeout(aFunction, aDelay)
{
  var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  var args = Array.prototype.slice.call(arguments, 2);
  timer.initWithCallback(function (aTimer) { aFunction.call(null, args); } ,
                         aDelay, Ci.nsITimer.TYPE_ONE_SHOT);
  return timer;
}
function clearTimeout(aTimer)
{
  aTimer.cancel();
}

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
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};

const EmptyEnumerator = {
  hasMoreElements: function() false,
  getNext: function() { throw Cr.NS_ERROR_NOT_AVAILABLE; },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};

XPCOMUtils.defineLazyGetter(this, "AccountBase", function()
  Components.Constructor("@instantbird.org/purple/account;1",
                         "purpleIAccountBase")
);

const GenericAccountPrototype = {
  _init: function _init(aProtoInstance, aKey, aName) {
    this._base = new AccountBase();
    this._base.concreteAccount = this;
    this._base.init(aKey, aName, aProtoInstance);
  },
  get base() this._base.purpleIAccountBase,

  checkAutoLogin: function() this._base.checkAutoLogin(),
  remove: function() this._base.remove(),
  UnInit: function() this._base.UnInit(),
  connect: function() this._base.connect(),
  disconnect: function() this._base.disconnect(),
  cancelReconnection: function() this._base.cancelReconnection(),
  createConversation: function(aName) this._base.createConversation(aName),
  addBuddy: function(aTag, aName) this._base.addBuddy(aTag, aName),
  loadBuddy: function(aBuddy, aName, aAlias, aServerAlias, aTag)
    this._base.loadBuddy(aBuddy, aName, aAlias, aServerAlias, aTag),
  getChatRoomFields: function() this._base.getChatRoomFields(),
  getChatRoomDefaultFieldValues: function(aDefaultChatName)
    this._base.getChatRoomDefaultFieldValues(aDefaultChatName),
  joinChat: function(aComponents) this._base.joinChat(aComponents),
  setBool: function(aName, aVal) this._base.setBool(aName, aVal),
  setInt: function(aName, aVal) this._base.setInt(aName, aVal),
  setString: function(aName, aVal) this._base.setString(aName, aVal),
  save: function() this._base.save(),

  // grep attribute purpleIAccount.idl |sed 's/.* //;s/;//;s/\(.*\)/  get \1() this._base.\1,/'
  get canJoinChat() this._base.canJoinChat,
  get name() this._base.name,
  get normalizedName() this.name.toLowerCase(),
  get id() this._base.id,
  get numericId() this._base.id,
  get protocol() this._base.protocol,
  get autoLogin() this._base.autoLogin,
  get firstConnectionState() this._base.firstConnectionState,
  get password() this._base.password,
  get rememberPassword() this._base.rememberPassword,
  get alias() this._base.alias,
  get proxyInfo() this._base.proxyInfo,
  get connectionStateMsg() this._base.connectionStateMsg,
  get connectionErrorReason() this._base.connectionErrorReason,
  get reconnectAttempt() this._base.reconnectAttempt,
  get timeOfNextReconnect() this._base.timeOfNextReconnect,
  get timeOfLastConnect() this._base.timeOfLastConnect,
  get connectionErrorMessage() this._base.connectionErrorMessage,
  get connectionState() this._base.connectionState,
  get disconnected() this._base.disconnected,
  get connected() this._base.connected,
  get connecting() this._base.connecting,
  get disconnecting() this._base.disconnecting,
  get HTMLEnabled() this._base.HTMLEnabled,
  get noBackgroundColors() this._base.noBackgroundColors,
  get autoResponses() this._base.autoResponses,
  get singleFormatting() this._base.singleFormatting,
  get noNewlines() this._base.noNewlines,
  get noFontSizes() this._base.noFontSizes,
  get noUrlDesc() this._base.noUrlDesc,
  get noImages() this._base.noImages,

  // grep attribute purpleIAccount.idl |grep -v readonly |sed 's/.* //;s/;//;s/\(.*\)/  set \1(val) { this._base.\1 = val; },/'
  set autoLogin(val) { this._base.autoLogin = val; },
  set firstConnectionState(val) { this._base.firstConnectionState = val; },
  set password(val) { this._base.password = val; },
  set rememberPassword(val) { this._base.rememberPassword = val; },
  set alias(val) { this._base.alias = val; },
  set proxyInfo(val) { this._base.proxyInfo = val; },

  getInterfaces: function(countRef) {
    var interfaces = [Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIAccount];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: 0,
  QueryInterface: XPCOMUtils.generateQI([Ci.purpleIAccount, Ci.nsIClassInfo])
};

function Message(aWho, aMessage, aObject)
{
  this.id = ++Message.prototype._lastId;
  this.time = Math.round(new Date() / 1000);
  this.who = aWho;
  this.message = aMessage;
  this.originalMessage = aMessage;

  if (aObject)
    for (let i in aObject)
      this[i] = aObject[i];
}
Message.prototype = {
  _lastId: 0,

  QueryInterface: XPCOMUtils.generateQI([Ci.purpleIMessage, Ci.nsIClassInfo]),
  getInterfaces: function(countRef) {
    var interfaces = [
      Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIMessage
    ];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  contractID: null,
  classDescription: "Message object",
  classID: null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  get alias() this.who,
  _conversation: null,
  get conversation() this._conversation,
  set conversation(aConv) {
    this._conversation = aConv;
    aConv.notifyObservers(this, "new-text", null);
    obs.notifyObservers(this, "new-text", null);
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


const GenericConversationPrototype = {
  _lastId: 0,
  _init: function(aAccount) {
    this.account = aAccount;
    this.id = ++GenericConversationPrototype._lastId;

    this._observers = [];
    obs.notifyObservers(this, "new-conversation", null);
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.purpleIConversation, Ci.purpleIConvIM, Ci.nsIClassInfo]),
  getInterfaces: function(countRef) {
    var interfaces = [
      Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIConversation, Ci.purpleIConvIM
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
    if (this._observers.indexOf(aObserver) == -1)
      this._observers.push(aObserver);
  },
  removeObserver: function(aObserver) {
    let index = this._observers.indexOf(aObserver);
    if (index != -1)
      this._observers.splice(index, 1);
  },
  notifyObservers: function(aSubject, aTopic, aData) {
    for each (let observer in this._observers)
      observer.observe(aSubject, aTopic, aData);
  },

  doCommand: function(aMsg) false,
  sendMsg: function (aMsg) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  close: function() { },
  sendTyping: function(aLength) { },

  setBaseURI: function(aDocument, aURI) {
    Components.classes["@instantbird.org/purple/convim;1"]
              .createInstance(Ci.purpleIConvIM)
              .setBaseURI(aDocument, aURI);
  },

  updateTyping: function(aState) {
    if (aState == this.typingState)
      return;

    if (aState == Ci.purpleIConvIM.NOT_TYPING)
      delete this.typingState;
    else
      this.typingState = aState;
    this.notifyObservers(null, "update-typing", null);
  },
  writeMessage: function(aWho, aText, aProperties) {
    (new Message(aWho, aText, aProperties)).conversation = this;
  },

  get name() "Conversation",
  get normalizedName() this.name.toLowerCase(),
  get title() this.name,
  get isChat() false,
  account: null,
  buddy: null,
  typingState: Ci.purpleIConvIM.NOT_TYPING,
  getParticipants: function() null
};

// the name getter needs to be implemented
const GenericProtocolPrototype = {
  get id() "prpl-" + this.normalizedName,
  get normalizedName() this.name.replace(/[^a-z0-0]/gi, "").toLowerCase(),
  get iconBaseURI() "chrome://instantbird/skin/prpl-generic/",

  getAccount: function(aKey, aName) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },

  // NS_ERROR_XPC_JSOBJECT_HAS_NO_FUNCTION_NAMED errors are too noisy
  getOptions: function() EmptyEnumerator,
  getUsernameSplit: function() EmptyEnumerator,
  accountExists: function() false, //FIXME

  get uniqueChatName() false,
  get chatHasTopic() false,
  get noPassword() false,
  get newMailNotification() false,
  get imagesInIM() false,
  get passwordOptional() true,
  get usePointSize() true,
  get registerNoScreenName() false,
  get slashCommandsNative() false,

  classDescription: this.name + " Protocol",
  classID: Components.ID("{a0774c5a-4aea-458b-9fbc-8d3cbf1a4630}"),
  contractID: "@instantbird.org/purple/" + this.normalizedName + ";1",
  getInterfaces: function(countRef) {
    var interfaces = [Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIProtocol];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: 0,
  QueryInterface: XPCOMUtils.generateQI([Ci.purpleIProtocol, Ci.nsIClassInfo]),
  _xpcom_categories: [{category: "js-protocol-plugin"}],
};

function doXHRequest(aUrl, aHeaders, aPOSTData, aOnLoad, aOnError, aThis) {
  var xhr = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                      .createInstance(Ci.nsIXMLHttpRequest);
  xhr.mozBackgroundRequest = true; // no error dialogs
  xhr.open("POST", aUrl);
  xhr.channel.loadFlags = Ci.nsIChannel.LOAD_ANONYMOUS; // don't send cookies
  xhr.onerror = function(aProgressEvent) {
    if (aOnError) {
      // adapted from toolkit/mozapps/extensions/nsBlocklistService.js
      let request = aProgressEvent.target;
      let status;
      try {
        // may throw (local file or timeout)
        status = request.status;
      }
      catch (e) {
        request = request.channel.QueryInterface(Ci.nsIRequest);
        status = request.status;
      }
      // When status is 0 we don't have a valid channel.
      let statusText = status ? request.statusText
                              : "nsIXMLHttpRequest channel unavailable";
      aOnError.call(aThis, statusText);
    }
  };
  xhr.onload = function (aRequest) {
    try {
      let target = aRequest.target;
      LOG("Received response: " + target.responseText);
      if (target.status != 200)
        throw target.status + " - " + target.statusText;
      if (aOnLoad)
        aOnLoad.call(aThis, aRequest.target.responseText);
    } catch (e) {
      Components.utils.reportError(e);
      if (aOnError)
        aOnError.call(aThis, e);
    }
  };

  if (aHeaders) {
    aHeaders.forEach(function(header) {
      xhr.setRequestHeader(header[0], header[1]);
    });
  }
  let POSTData =
    (aPOSTData || []).map(function(aParam) aParam[0] + "=" + encodeURI(aParam[1]))
                     .join("&");

  LOG("sending request to " + aUrl + " (POSTData = " + POSTData + ")");
  xhr.send(POSTData);
  return xhr;
}
