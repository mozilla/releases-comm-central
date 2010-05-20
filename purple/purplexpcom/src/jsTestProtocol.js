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
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

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

const EmptyEnumerator = {
  hasMoreElements: function() false,
  getNext: function() { throw Cr.NS_ERROR_NOT_AVAILABLE; },
  QueryInterface: function(aIID) {
    if (Ci.nsISimpleEnumerator.equals(aIID) ||
        Ci.nsISupports.equals(aIID))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};


XPCOMUtils.defineLazyGetter(this, "AccountBase", function()
  Components.Constructor("@instantbird.org/purple/account;1",
                         "purpleIAccountBase")
);

const GenericAccountPrototype = {
  _init: function _init(aProtoInstance, aKey, aName) {
    this._base = new AccountBase();
    this._base.concreteAccount = this;
    if (aName)
      this._base.create(aName, aProtoInstance, aKey);
    else
      this._base.load(aKey, aProtoInstance, true);
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
  get normalizedName() this._base.normalizedName,
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


function Account(aProtoInstance, aKey, aName)
{
  this._init(aProtoInstance, aKey, aName);
}
Account.prototype = {
  connect: function() {
    dump("connecting " + this.name + "\n");
    this.base.connecting();
    this.base.connected();
  },
  disconnect: function() {
    dump("disconnecting " + this.name + "\n");
    this.base.disconnecting(this._base.NO_ERROR);
    this.base.disconnected();
  },
  get normalizedName() this.name.toLowerCase()
};
Account.prototype.__proto__ = GenericAccountPrototype;

function jsTestProtocol() { }

jsTestProtocol.prototype = {
  get id() "prpl-jstest",
  get name() "JS Test",
  get normalizedName() "jstest",
  get iconBaseURI() "chrome://instantbird/skin/prpl-generic/",

  loadAccount: function(aKey) new Account(this, aKey),
  createAccount: function(aName, aKey) new Account(this, aKey, aName),

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

  classDescription: "JS Test Protocol",
  classID: Components.ID("{a0774c5a-4aea-458b-9fbc-8d3cbf1a4630}"),
  contractID: "@instantbird.org/purple/jstest;1",
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

function NSGetModule(aCompMgr, aFileSpec) {
  return XPCOMUtils.generateModule([jsTestProtocol]);
}
