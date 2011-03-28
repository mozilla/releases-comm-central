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

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

var gLastUIConvId = 0;
var gLastPurpleConvId = 0;

XPCOMUtils.defineLazyGetter(this, "bundle", function()
  Services.strings.createBundle("chrome://purple/locale/conversations.properties")
);

function UIConversation(aPurpleConversation, aContactId)
{
  this._purpleConv = {};
  this.id = ++gLastUIConvId;
  this._observers = [];
  this._pendingMessages = [];
  this.changeTargetTo(aPurpleConversation);
  if (aContactId)
    this.contactId = aContactId;
  let iface = Ci["purpleIConv" + (aPurpleConversation.isChat ? "Chat" : "IM")];
  this._interfaces = this._interfaces.concat(iface);
  Services.obs.notifyObservers(this, "new-ui-conversation", null);
}

UIConversation.prototype = {
  __proto__: ClassInfo(["imIConversation", "purpleIConversation", "nsIObserver"],
                       "UI conversation"),
  contactId: null,
  get contact() {
    let target = this.target;
    if (!target.isChat && target.buddy)
      return target.buddy.contact;
    return null;
  },
  get target() this._purpleConv[this._currentTargetId],
  set target(aPurpleConversation) {
    this.changeTargetTo(aPurpleConversation);
  },
  _currentTargetId: 0,
  changeTargetTo: function(aPurpleConversation) {
    let id = aPurpleConversation.id;
    if (this._currentTargetId == id)
      return;

    if (!(id in this._purpleConv)) {
      this._purpleConv[id] = aPurpleConversation;
      aPurpleConversation.addObserver(this.observeConv.bind(this, id));
    }

    let shouldNotify = this._currentTargetId;
    this._currentTargetId = id;
    if (shouldNotify) {
      this.notifyObservers(this, "target-purple-conversation-changed");
      let target = this.target;
      let params = [target.title, target.account.protocol.name];
      this.systemMessage(bundle.formatStringFromName("targetChanged",
                                                     params, params.length));
    }
  },
  // Returns a boolean indicating if the ui-conversation was closed.
  removeTarget: function(aPurpleConversation) {
    let id = aPurpleConversation.id;
    if (!(id in this._purpleConv))
      throw "unknown purple conversation";

    delete this._purpleConv[id];
    if (this._currentTargetId == id) {
      for (let newId in this._purpleConv) {
        this.changeTargetTo(this._purpleConv[newId]);
        return false;
      }
      this.notifyObservers(this, "ui-conversation-closed");
      Services.obs.notifyObservers(this, "ui-conversation-closed", null);
      return true;
    }
  },

  observeConv: function(aTargetId, aSubject, aTopic, aData) {
    if (aTargetId != this._currentTargetId &&
        (aTopic == "new-text" ||
         (aTopic == "update-typing" &&
          this._purpleConv[aTargetId].typingState == Ci.purpleIConvIM.TYPING)))
      this.target = this._purpleConv[aTargetId];
    this.notifyObservers(aSubject, aTopic, aData);
  },

  systemMessage: function(aText) {
    (new Message("system", aText, {system: true})).conversation = this;
  },

  // purpleIConversation
  get isChat() this.target.isChat,
  get account() this.target.account,
  get name() this.target.name,
  get normalizedName() this.target.normalizedName,
  get title() this.target.title,
  sendMsg: function (aMsg) { this.target.sendMsg(aMsg); },
  unInit: function() {
    for each (let conv in this._purpleConv)
      conv.unInit();
  },
  close: function() {
    for each (let conv in this._purpleConv)
      conv.close();
  },
  addObserver: function(aObserver) {
    if (this._observers.indexOf(aObserver) == -1) {
      this._observers.push(aObserver);
      if (this._observers.length == 1)
        while (this._pendingMessages.length)
          this.notifyObservers(this._pendingMessages.shift(), "new-text");
    }
  },
  removeObserver: function(aObserver) {
    let index = this._observers.indexOf(aObserver);
    if (index != -1)
      this._observers.splice(index, 1);
  },
  notifyObservers: function(aSubject, aTopic, aData) {
    for each (let observer in this._observers)
      observer.observe(aSubject, aTopic, aData);
    if (!this._observers.length && aTopic == "new-text")
      this._pendingMessages.push(aSubject);
  },

  // purpleIConvIM
  get buddy() this.target.buddy,
  get typingState() this.target.typingState,
  sendTyping: function(aLength) { this.target.sendTyping(aLength); },

  // Chat only
  getParticipants: function() this.target.getParticipants(),
  get topic() this.target.topic,
  get topicSetter() this.target.topicSetter,
  get nick() this.target.nick,
  get left() this.target.left
};

function ConversationsService() { }
ConversationsService.prototype = {
  initConversations: function() {
    this._uiConv = {};
    this._uiConvByContactId = {};
    this._purpleConversations = [];
  },

  unInitConversations: function() {
    for each (let UIConv in this._uiConv)
      UIConv.unInit();
    delete this._uiConv;
    delete this._uiConvByContactId;
    // This should already be empty, but just to be sure...
    for each (let purpleConv in this._purpleConversations)
      purpleConv.unInit();
    delete this._purpleConversations;
  },

  addConversation: function(aPurpleConversation) {
    // Give an id to the new conversation.
    aPurpleConversation.id = ++gLastPurpleConvId;
    this._purpleConversations.push(aPurpleConversation);

    // Notify observers.
    Services.obs.notifyObservers(aPurpleConversation, "new-conversation", null);

    // Update or create the corresponding UI conversation.
    let contactId;
    if (!aPurpleConversation.isChat) {
      let accountBuddy = aPurpleConversation.buddy;
      if (accountBuddy)
        contactId = accountBuddy.buddy.contact.id;
    }

    if (contactId) {
      if (contactId in this._uiConvByContactId) {
        let uiConv = this._uiConvByContactId[contactId];
        uiConv.target = aPurpleConversation;
        this._uiConv[aPurpleConversation.id] = uiConv;
        return;
      }
    }

    // We store the contactId in the UIConversation because we can't reliably
    // get it from purpleIConvIM objects during removeConversation calls.
    let newUIConv = new UIConversation(aPurpleConversation, contactId);
    this._uiConv[aPurpleConversation.id] = newUIConv;
    if (contactId)
      this._uiConvByContactId[contactId] = newUIConv;
  },
  removeConversation: function(aPurpleConversation) {
    Services.obs.notifyObservers(aPurpleConversation, "conversation-closed", null);

    let uiConv = this.getUIConversation(aPurpleConversation);
    if (uiConv.removeTarget(aPurpleConversation)) {
      delete this._uiConv[aPurpleConversation.id];
      if (uiConv.contactId)
        delete this._uiConvByContactId[uiConv.contactId];
    }
    aPurpleConversation.unInit();

    let index = this._purpleConversations.indexOf(aPurpleConversation);
    if (index != -1)
      this._purpleConversations.splice(index, 1);
  },

  getUIConversation: function(aPurpleConversation) {
    let id = aPurpleConversation.id;
    if (id in this._uiConv)
      return this._uiConv[id];
    throw "Unknown conversation";
  },
  getUIConversationByContactId: function(aId)
    (aId in this._uiConvByContactId) ? this._uiConvByContactId[aId] : null,

  getConversations: function() nsSimpleEnumerator(this._purpleConversations),
  getConversationById: function(aId) {
    for (let i = 0; i < this._purpleConversations.length; ++i)
      if (this._purpleConversations[i].id == aId)
        return this._purpleConversations[i];
    return null;
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.imIConversationsService]),
  classDescription: "Conversations",
  classID: Components.ID("{b2397cd5-c76d-4618-8410-f344c7c6443a}"),
  contractID: "@instantbird.org/purple/conversations-service;1"
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([ConversationsService]);
