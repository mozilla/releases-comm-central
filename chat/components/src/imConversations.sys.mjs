/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Status } from "resource:///modules/imStatusUtils.sys.mjs";
import { ClassInfo } from "resource:///modules/imXPCOMUtils.sys.mjs";
import { Message } from "resource:///modules/jsProtoHelper.sys.mjs";

var gLastUIConvId = 0;
var gLastPrplConvId = 0;

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "bundle", () =>
  Services.strings.createBundle("chrome://chat/locale/conversations.properties")
);

export function imMessage(aPrplMessage) {
  this.prplMessage = aPrplMessage;
}

imMessage.prototype = {
  __proto__: ClassInfo(["imIMessage", "prplIMessage"], "IM Message"),
  cancelled: false,
  color: "",
  _displayMessage: null,
  otrEncrypted: false,

  get displayMessage() {
    // Explicitly test for null so that blank messages don't fall back to
    // the original. Especially problematic in encryption extensions like OTR.
    return this._displayMessage !== null
      ? this._displayMessage
      : this.prplMessage.originalMessage;
  },
  set displayMessage(aMsg) {
    this._displayMessage = aMsg;
  },

  get message() {
    return this.prplMessage.message;
  },
  set message(aMsg) {
    this.prplMessage.message = aMsg;
  },

  // from prplIMessage
  get who() {
    return this.prplMessage.who;
  },
  get time() {
    return this.prplMessage.time;
  },
  get id() {
    return this.prplMessage.id;
  },
  get remoteId() {
    return this.prplMessage.remoteId;
  },
  get alias() {
    return this.prplMessage.alias;
  },
  get iconURL() {
    return this.prplMessage.iconURL;
  },
  get conversation() {
    return this.prplMessage.conversation;
  },
  set conversation(aConv) {
    this.prplMessage.conversation = aConv;
  },
  get outgoing() {
    return this.prplMessage.outgoing;
  },
  get incoming() {
    return this.prplMessage.incoming;
  },
  get system() {
    return this.prplMessage.system;
  },
  get autoResponse() {
    return this.prplMessage.autoResponse;
  },
  get containsNick() {
    return this.prplMessage.containsNick;
  },
  get noLog() {
    return this.prplMessage.noLog;
  },
  get error() {
    return this.prplMessage.error;
  },
  get delayed() {
    return this.prplMessage.delayed;
  },
  get noFormat() {
    return this.prplMessage.noFormat;
  },
  get containsImages() {
    return this.prplMessage.containsImages;
  },
  get notification() {
    return this.prplMessage.notification;
  },
  get noLinkification() {
    return this.prplMessage.noLinkification;
  },
  get noCollapse() {
    return this.prplMessage.noCollapse;
  },
  get isEncrypted() {
    return this.prplMessage.isEncrypted || this.otrEncrypted;
  },
  get action() {
    return this.prplMessage.action;
  },
  get deleted() {
    return this.prplMessage.deleted;
  },
  get originalMessage() {
    return this.prplMessage.originalMessage;
  },
  getActions() {
    return this.prplMessage.getActions();
  },
  whenDisplayed() {
    return this.prplMessage.whenDisplayed();
  },
  whenRead() {
    return this.prplMessage.whenRead();
  },
};

/**
 * @implements {prplIMessage}
 * @implements {nsIObserver}
 */
export class UIConversation {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);
  get wrappedJSObject() {
    return this;
  }

  /**
   * @param {prplIConversation} aPrplConversation
   * @param {number} [idToReuse] - ID to use for this UI conversation if it replaces another UI conversation.
   */
  constructor(aPrplConversation, idToReuse) {
    this._prplConv = {};
    if (idToReuse) {
      this.id = idToReuse;
    } else {
      this.id = ++gLastUIConvId;
    }
    // Observers listening to this instance's notifications.
    this._observers = [];
    // Observers this instance has attached to prplIConversations.
    this._convObservers = new WeakMap();
    this._messages = [];
    this.changeTargetTo(aPrplConversation);
    this.updateContactObserver();
    if (!idToReuse) {
      Services.obs.notifyObservers(this, "new-ui-conversation");
    }
  }

  _observedContact = null;
  /**
   * Will be null for MUCs and IMs from people not in the contacts list.
   *
   * @type {imIContact}
   */
  get contact() {
    const target = this.target;
    if (!target.isChat && target.buddy) {
      return target.buddy.buddy.contact;
    }
    return null;
  }
  updateContactObserver() {
    const contact = this.contact;
    if (contact && !this._observedContact) {
      contact.addObserver(this);
      this._observedContact = contact;
    } else if (!contact && this.observedContact) {
      this._observedContact.removeObserver(this);
      delete this._observedContact;
    }
  }
  /**
   * @type {prplIConversation}
   */
  get target() {
    return this._prplConv[this._currentTargetId];
  }
  set target(aPrplConversation) {
    this.changeTargetTo(aPrplConversation);
  }
  get hasMultipleTargets() {
    return Object.keys(this._prplConv).length > 1;
  }
  getTargetByAccount(aAccount) {
    const accountId = aAccount.id;
    for (const id in this._prplConv) {
      const prplConv = this._prplConv[id];
      if (prplConv.account.id == accountId) {
        return prplConv;
      }
    }
    return null;
  }
  _currentTargetId = 0;
  changeTargetTo(aPrplConversation) {
    const id = aPrplConversation.id;
    if (this._currentTargetId == id) {
      return;
    }

    if (!(id in this._prplConv)) {
      this._prplConv[id] = aPrplConversation;
      const observeConv = {
        observe: (...args) => this.observeConv(id, ...args),
      };
      this._convObservers.set(aPrplConversation, observeConv);
      aPrplConversation.addObserver(observeConv);
    }

    const shouldNotify = this._currentTargetId;
    this._currentTargetId = id;
    if (!this.isChat) {
      const buddy = this.buddy;
      if (buddy) {
        ({ statusType: this.statusType, statusText: this.statusText } = buddy);
      }
    }
    if (shouldNotify) {
      this.notifyObservers(this, "target-prpl-conversation-changed");
      const target = this.target;
      const params = [target.title, target.account.protocol.name];
      this.systemMessage(
        lazy.bundle.formatStringFromName("targetChanged", params)
      );
    }
  }
  // Returns a boolean indicating if the ui-conversation was closed.
  // If the conversation was closed, aContactId.value is set to the contact id
  // or 0 if no contact was associated with the conversation.
  removeTarget(aPrplConversation, aContactId) {
    const id = aPrplConversation.id;
    if (!(id in this._prplConv)) {
      throw new Error("unknown prpl conversation");
    }

    delete this._prplConv[id];
    if (this._currentTargetId != id) {
      return false;
    }

    for (const newId in this._prplConv) {
      this.changeTargetTo(this._prplConv[newId]);
      return false;
    }

    if (this._observedContact) {
      this._observedContact.removeObserver(this);
      aContactId.value = this._observedContact.id;
      delete this._observedContact;
    } else {
      aContactId.value = 0;
    }

    delete this._currentTargetId;
    this.notifyObservers(this, "ui-conversation-closed");
    return true;
  }

  _unreadMessageCount = 0;
  /**
   * Number of unread messages (all messages, including system
   * messages are counted).
   *
   * @type {number}
   */
  get unreadMessageCount() {
    return this._unreadMessageCount;
  }
  _unreadTargetedMessageCount = 0;
  /**
   * Number of unread incoming messages targeted at the user (= IMs or
   * message containing the user's nick in MUCs).
   *
   * @type {number}
   */
  get unreadTargetedMessageCount() {
    return this._unreadTargetedMessageCount;
  }
  _unreadIncomingMessageCount = 0;
  /**
   * Number of unread incoming messages (both targeted and untargeted
   * messages are counted).
   *
   * @type {number}
   */
  get unreadIncomingMessageCount() {
    return this._unreadIncomingMessageCount;
  }
  _unreadOTRNotificationCount = 0;
  /**
   * Number of unread off-the-record authentication requests.
   *
   * @type {number}
   */
  get unreadOTRNotificationCount() {
    return this._unreadOTRNotificationCount;
  }
  /**
   * Reset all unread message counts.
   */
  markAsRead() {
    this._unreadMessageCount = 0;
    this._unreadTargetedMessageCount = 0;
    this._unreadIncomingMessageCount = 0;
    this._unreadOTRNotificationCount = 0;
    if (this._messages.length) {
      this._messages[this._messages.length - 1].whenDisplayed();
    }
    this._notifyUnreadCountChanged();
  }
  _lastNotifiedUnreadCount = 0;
  _notifyUnreadCountChanged() {
    if (this._unreadIncomingMessageCount == this._lastNotifiedUnreadCount) {
      return;
    }

    this._lastNotifiedUnreadCount = this._unreadIncomingMessageCount;
    for (const observer of this._observers) {
      observer.observe(
        this,
        "unread-message-count-changed",
        this._unreadIncomingMessageCount.toString()
      );
    }
  }
  /**
   * Get an array of all messages of the conversation.
   *
   * @returns {imIMessage[]}
   */
  getMessages() {
    return this._messages;
  }
  /**
   * Call this to give the core an opportunity to close an inactive
   * conversation.  If the conversation is a left MUC or an IM
   * conversation without unread message, the implementation will call
   * close().
   * The returned value indicates if the conversation was closed.
   *
   * @returns {boolean}
   */
  checkClose() {
    if (!this._currentTargetId) {
      // Already closed.
      return true;
    }

    if (
      !Services.prefs.getBoolPref("messenger.conversations.alwaysClose") &&
      ((this.isChat && !this.left) ||
        (!this.isChat &&
          (this.unreadIncomingMessageCount != 0 ||
            Services.prefs.getBoolPref(
              "messenger.conversations.holdByDefault"
            ))))
    ) {
      return false;
    }

    this.close();
    return true;
  }

  observe(aSubject, aTopic, aData) {
    if (aTopic == "contact-no-longer-dummy") {
      const oldId = parseInt(aData);
      // gConversationsService is ugly... :(
      delete gConversationsService._uiConvByContactId[oldId];
      gConversationsService._uiConvByContactId[aSubject.id] = this;
    } else if (aTopic == "account-buddy-status-changed") {
      if (
        !this._statusUpdatePending &&
        aSubject.account.id == this.account.id &&
        aSubject.buddy.id == this.buddy.buddy.id
      ) {
        this._statusUpdatePending = true;
        Services.tm.mainThread.dispatch(
          this.updateBuddyStatus.bind(this),
          Ci.nsIEventTarget.DISPATCH_NORMAL
        );
      }
    } else if (aTopic == "account-buddy-icon-changed") {
      if (
        !this._statusUpdatePending &&
        aSubject.account.id == this.account.id &&
        aSubject.buddy.id == this.buddy.buddy.id
      ) {
        this._iconUpdatePending = true;
        Services.tm.mainThread.dispatch(
          this.updateIcon.bind(this),
          Ci.nsIEventTarget.DISPATCH_NORMAL
        );
      }
    } else if (
      aTopic == "account-buddy-display-name-changed" &&
      aSubject.account.id == this.account.id &&
      aSubject.buddy.id == this.buddy.buddy.id
    ) {
      this.notifyObservers(this, "update-buddy-display-name");
    }
  }

  _iconUpdatePending = false;
  updateIcon() {
    delete this._iconUpdatePending;
    this.notifyObservers(this, "update-buddy-icon");
  }

  _statusUpdatePending = false;
  updateBuddyStatus() {
    delete this._statusUpdatePending;
    const { statusType: statusType, statusText: statusText } = this.buddy;

    if (
      "statusType" in this &&
      this.statusType == statusType &&
      this.statusText == statusText
    ) {
      return;
    }

    const wasUnknown = this.statusType == Ci.imIStatusInfo.STATUS_UNKNOWN;
    this.statusType = statusType;
    this.statusText = statusText;

    this.notifyObservers(this, "update-buddy-status");

    let msg;
    if (statusType == Ci.imIStatusInfo.STATUS_UNKNOWN) {
      msg = lazy.bundle.formatStringFromName("statusUnknown", [this.title]);
    } else {
      const status = Status.toLabel(statusType);
      let stringId = wasUnknown ? "statusChangedFromUnknown" : "statusChanged";
      if (this._justReconnected) {
        stringId = "statusKnown";
        delete this._justReconnected;
      }
      if (statusText) {
        msg = lazy.bundle.formatStringFromName(stringId + "WithStatusText", [
          this.title,
          status,
          statusText,
        ]);
      } else {
        msg = lazy.bundle.formatStringFromName(stringId, [this.title, status]);
      }
    }
    this.systemMessage(msg);
  }

  _disconnected = false;
  disconnecting() {
    if (this._disconnected) {
      return;
    }

    this._disconnected = true;
    if (this.contact) {
      // Handled by the contact observer.
      return;
    }

    if (this.isChat && this.left) {
      this._wasLeft = true;
    } else {
      this.systemMessage(lazy.bundle.GetStringFromName("accountDisconnected"));
    }
    this.notifyObservers(this, "update-buddy-status");
  }
  connected() {
    if (this._disconnected) {
      delete this._disconnected;
      const msg = lazy.bundle.GetStringFromName("accountReconnected");
      if (this.isChat) {
        if (!this._wasLeft) {
          this.systemMessage(msg);
          // Reconnect chat if possible.
          const chatRoomFields = this.target.chatRoomFields;
          if (chatRoomFields) {
            this.account.joinChat(chatRoomFields);
          }
        }
        delete this._wasLeft;
      } else {
        this._justReconnected = true;
        // Exclude convs with contacts, these receive presence info updates
        // (and therefore a reconnected message).
        if (!this.contact) {
          this.systemMessage(msg);
        }
      }
    }
    this.notifyObservers(this, "update-buddy-status");
  }

  observeConv(aTargetId, aSubject, aTopic, aData) {
    if (
      aTargetId != this._currentTargetId &&
      (aTopic == "new-text" ||
        aTopic == "update-text" ||
        aTopic == "remove-text" ||
        (aTopic == "update-typing" &&
          this._prplConv[aTargetId].typingState == Ci.prplIConvIM.TYPING))
    ) {
      this.target = this._prplConv[aTargetId];
    }

    this.notifyObservers(aSubject, aTopic, aData);
  }

  /**
   * Write a system message into the conversation.
   * Note: this will not be logged.
   *
   * @param {string} aText
   * @param {boolean} [aIsError=false]
   * @param {boolean} [aNoCollapse=false]
   */
  systemMessage(aText, aIsError, aNoCollapse) {
    const flags = {
      system: true,
      noLog: true,
      error: !!aIsError,
      noCollapse: !!aNoCollapse,
    };
    const message = new Message("system", aText, flags, this);
    this.notifyObservers(message, "new-text");
  }

  /**
   * Emit a notification sound for a new chat message and trigger the
   * global notificationbox to prompt the user with the verifiation request.
   *
   * Write a system message into the conversation and trigger the update of the
   * notification counter during an off-the-record authentication request.
   * Note: this will not be logged.
   *
   * @param {string} aText - The system message.
   */
  notifyVerifyOTR(aText) {
    this._unreadOTRNotificationCount++;
    this.systemMessage(aText, false, true);
    for (const observer of this._observers) {
      observer.observe(
        this,
        "unread-message-count-changed",
        this._unreadOTRNotificationCount.toString()
      );
    }
  }

  // prplIConversation
  get isChat() {
    return this.target.isChat;
  }
  get account() {
    return this.target.account;
  }
  get name() {
    return this.target.name;
  }
  get normalizedName() {
    return this.target.normalizedName;
  }
  get title() {
    return this.target.title;
  }
  get startDate() {
    return this.target.startDate;
  }
  get convIconFilename() {
    return this.target.convIconFilename;
  }
  get encryptionState() {
    return this.target.encryptionState;
  }
  initializeEncryption() {
    this.target.initializeEncryption();
  }
  sendMsg(aMsg, aAction = false, aNotice = false) {
    this.target.sendMsg(aMsg, aAction, aNotice);
  }
  unInit() {
    for (const id in this._prplConv) {
      const conv = this._prplConv[id];
      gConversationsService.forgetConversation(conv);
    }
    if (this._observedContact) {
      this._observedContact.removeObserver(this);
      delete this._observedContact;
    }
    this._prplConv = {}; // Prevent .close from failing.
    delete this._currentTargetId;
    this.notifyObservers(this, "ui-conversation-destroyed");
  }
  close() {
    for (const id in this._prplConv) {
      const conv = this._prplConv[id];
      conv.close();
    }
    if (!this.hasOwnProperty("_currentTargetId")) {
      return;
    }
    delete this._currentTargetId;
    this.notifyObservers(this, "ui-conversation-closed");
    Services.obs.notifyObservers(this, "ui-conversation-closed");
  }
  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  }
  removeObserver(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  }
  notifyObservers(aSubject, aTopic, aData) {
    if (aTopic == "new-text" || aTopic == "update-text") {
      aSubject = new imMessage(aSubject);
      this.notifyObservers(aSubject, "received-message");
      if (aSubject.cancelled) {
        return;
      }
      if (!aSubject.system) {
        aSubject.conversation.prepareForDisplaying(aSubject);
      }
    }
    if (aTopic == "new-text") {
      this._messages.push(aSubject);
      ++this._unreadMessageCount;
      if (aSubject.incoming && !aSubject.system) {
        ++this._unreadIncomingMessageCount;
        if (!this.isChat || aSubject.containsNick) {
          ++this._unreadTargetedMessageCount;
        }
      }
    } else if (aTopic == "update-text") {
      const index = this._messages.findIndex(
        msg => msg.remoteId == aSubject.remoteId
      );
      if (index != -1) {
        this._messages.splice(index, 1, aSubject);
      }
    } else if (aTopic == "remove-text") {
      const index = this._messages.findIndex(msg => msg.remoteId == aData);
      if (index != -1) {
        this._messages.splice(index, 1);
      }
    }

    if (aTopic == "chat-update-type") {
      // bail if there is no change of the conversation type
      if (
        (this.target.isChat && this._interfaces.includes(Ci.prplIConvChat)) ||
        (!this.target.isChat && this._interfaces.includes(Ci.prplIConvIM))
      ) {
        return;
      }
      if (this._observedContact) {
        this._observedContact.removeObserver(this);
      }
      this.target.removeObserver(this._convObservers.get(this.target));
      gConversationsService.updateConversation(this.target);
      return;
    }

    for (const observer of this._observers) {
      if (!observer.observe && !this._observers.includes(observer)) {
        // Observer removed by a previous call to another observer.
        continue;
      }
      observer.observe(aSubject, aTopic, aData);
    }
    this._notifyUnreadCountChanged();

    if (aTopic == "new-text" || aTopic == "update-text") {
      // Even updated messages should be treated as new message for logs.
      // TODO proper handling in logs is bug 1735353
      Services.obs.notifyObservers(aSubject, "new-text", aData);
      if (
        aTopic == "new-text" &&
        aSubject.incoming &&
        !aSubject.system &&
        (!this.isChat || aSubject.containsNick)
      ) {
        this.notifyObservers(aSubject, "new-directed-incoming-message", aData);
        Services.obs.notifyObservers(
          aSubject,
          "new-directed-incoming-message",
          aData
        );
      }
    }
  }

  // Used above when notifying of new-texts originating in the
  // UIConversation. This happens when this.systemMessage() is called. The
  // conversation for the message is set as the UIConversation.
  prepareForDisplaying() {}

  // prplIConvIM
  get buddy() {
    return this.target.buddy;
  }
  get typingState() {
    return this.target.typingState;
  }
  sendTyping(aString) {
    return this.target.sendTyping(aString);
  }

  // Chat only
  getParticipants() {
    return this.target.getParticipants();
  }
  get topic() {
    return this.target.topic;
  }
  set topic(aTopic) {
    this.target.topic = aTopic;
  }
  get topicSetter() {
    return this.target.topicSetter;
  }
  get topicSettable() {
    return this.target.topicSettable;
  }
  /**
   *  Can be used instead of the topic when no topic is set.
   *
   * @type {string}
   */
  get noTopicString() {
    return lazy.bundle.GetStringFromName("noTopic");
  }
  get nick() {
    return this.target.nick;
  }
  get left() {
    return this.target.left;
  }
  get joining() {
    return this.target.joining;
  }
}

var gConversationsService;

/**
 * @implements {nsIObserver}
 */
class ConversationsService {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  constructor() {
    gConversationsService = this;
  }

  initConversations() {
    this._uiConv = {};
    this._uiConvByContactId = {};
    this._prplConversations = [];
    Services.obs.addObserver(this, "account-disconnecting");
    Services.obs.addObserver(this, "account-connected");
    Services.obs.addObserver(this, "account-buddy-added");
    Services.obs.addObserver(this, "account-buddy-removed");
  }

  unInitConversations() {
    const UIConvs = this.getUIConversations();
    for (const UIConv of UIConvs) {
      UIConv.unInit();
    }
    delete this._uiConv;
    delete this._uiConvByContactId;
    // This should already be empty, but just to be sure...
    for (const prplConv of this._prplConversations) {
      prplConv.unInit();
    }
    delete this._prplConversations;
    Services.obs.removeObserver(this, "account-disconnecting");
    Services.obs.removeObserver(this, "account-connected");
    Services.obs.removeObserver(this, "account-buddy-added");
    Services.obs.removeObserver(this, "account-buddy-removed");
  }

  observe(aSubject, aTopic) {
    if (aTopic == "account-connected") {
      for (const id in this._uiConv) {
        const conv = this._uiConv[id];
        if (conv.account.id == aSubject.id) {
          conv.connected();
        }
      }
    } else if (aTopic == "account-disconnecting") {
      for (const id in this._uiConv) {
        const conv = this._uiConv[id];
        if (conv.account.id == aSubject.id) {
          conv.disconnecting();
        }
      }
    } else if (aTopic == "account-buddy-added") {
      const accountBuddy = aSubject;
      const prplConversation = this.getConversationByNameAndAccount(
        accountBuddy.normalizedName,
        accountBuddy.account,
        false
      );
      if (!prplConversation) {
        return;
      }

      const uiConv = this.getUIConversation(prplConversation);
      const contactId = accountBuddy.buddy.contact.id;
      if (contactId in this._uiConvByContactId) {
        // Trouble! There is an existing uiConv for this contact.
        // We should avoid having two uiConvs with the same contact.
        // This is ugly UX, but at least can only happen if there is
        // already an accountBuddy with the same name for the same
        // protocol on a different account, which should be rare.
        this.removeConversation(prplConversation);
        return;
      }
      // Link the existing uiConv to the contact.
      this._uiConvByContactId[contactId] = uiConv;
      uiConv.updateContactObserver();
      uiConv.notifyObservers(uiConv, "update-conv-buddy");
    } else if (aTopic == "account-buddy-removed") {
      const accountBuddy = aSubject;
      const contactId = accountBuddy.buddy.contact.id;
      if (!(contactId in this._uiConvByContactId)) {
        return;
      }
      const uiConv = this._uiConvByContactId[contactId];

      // If there is more than one target on the uiConv, close the
      // prplConv as we can't dissociate the uiConv from the contact.
      // The conversation with the contact will continue with a different
      // target.
      if (uiConv.hasMultipleTargets) {
        const prplConversation = uiConv.getTargetByAccount(
          accountBuddy.account
        );
        if (prplConversation) {
          this.removeConversation(prplConversation);
        }
        return;
      }

      delete this._uiConvByContactId[contactId];
      uiConv.updateContactObserver();
      uiConv.notifyObservers(uiConv, "update-conv-buddy");
    }
  }

  /**
   * Register a conversation. This will create a unique id for the
   * conversation and set it.
   *
   * @param {prplIConversation} aPrplConversation
   */
  addConversation(aPrplConversation) {
    // Give an id to the new conversation.
    aPrplConversation.id = ++gLastPrplConvId;
    this._prplConversations.push(aPrplConversation);

    // Notify observers.
    Services.obs.notifyObservers(aPrplConversation, "new-conversation");

    // Update or create the corresponding UI conversation.
    let contactId;
    if (!aPrplConversation.isChat) {
      const accountBuddy = aPrplConversation.buddy;
      if (accountBuddy) {
        contactId = accountBuddy.buddy.contact.id;
      }
    }

    if (contactId) {
      if (contactId in this._uiConvByContactId) {
        const uiConv = this._uiConvByContactId[contactId];
        uiConv.target = aPrplConversation;
        this._uiConv[aPrplConversation.id] = uiConv;
        return;
      }
    }

    const newUIConv = new UIConversation(aPrplConversation);
    this._uiConv[aPrplConversation.id] = newUIConv;
    if (contactId) {
      this._uiConvByContactId[contactId] = newUIConv;
    }
  }
  /**
   * Informs the conversation service that the type of the conversation changed, which then lets the
   * UI components know to use a new UI conversation instance.
   *
   * @param {prplIConversation} aPrplConversation - The prpl conversation to update the UI conv for.
   */
  updateConversation(aPrplConversation) {
    let contactId;
    let uiConv = this.getUIConversation(aPrplConversation);

    if (!aPrplConversation.isChat) {
      const accountBuddy = aPrplConversation.buddy;
      if (accountBuddy) {
        contactId = accountBuddy.buddy.contact.id;
      }
    }
    // Ensure conv is not in the by contact ID map
    for (const [contactId, uiConversation] of Object.entries(
      this._uiConvByContactId
    )) {
      if (uiConversation === uiConv) {
        delete this._uiConvByContactId[contactId];
        break;
      }
    }
    Services.obs.notifyObservers(uiConv, "ui-conversation-replaced");
    const uiConvId = uiConv.id;
    // create new UI conv with correct interfaces.
    uiConv = new UIConversation(aPrplConversation, uiConvId);
    this._uiConv[aPrplConversation.id] = uiConv;

    // Ensure conv is in the by contact ID map if it has a contact
    if (contactId) {
      this._uiConvByContactId[contactId] = uiConv;
    }
    Services.obs.notifyObservers(uiConv, "conversation-update-type");
  }
  /**
   * @param {prplIConversation} aPrplConversation
   */
  removeConversation(aPrplConversation) {
    Services.obs.notifyObservers(aPrplConversation, "conversation-closed");

    const uiConv = this.getUIConversation(aPrplConversation);
    delete this._uiConv[aPrplConversation.id];
    const contactId = {};
    if (uiConv.removeTarget(aPrplConversation, contactId)) {
      if (contactId.value) {
        delete this._uiConvByContactId[contactId.value];
      }
      Services.obs.notifyObservers(uiConv, "ui-conversation-closed");
    }
    this.forgetConversation(aPrplConversation);
  }
  forgetConversation(aPrplConversation) {
    aPrplConversation.unInit();

    this._prplConversations = this._prplConversations.filter(
      c => c !== aPrplConversation
    );
  }

  /**
   * @returns {IMConversation[]}
   */
  getUIConversations() {
    const rv = [];
    if (this._uiConv) {
      for (const prplConvId in this._uiConv) {
        // Since an UIConversation may be linked to multiple prplConversations,
        // we must ensure we don't return the same UIConversation twice,
        // by checking the id matches that of the active prplConversation.
        const uiConv = this._uiConv[prplConvId];
        if (prplConvId == uiConv.target.id) {
          rv.push(uiConv);
        }
      }
    }
    return rv;
  }
  /**
   * @param {prplIConversation} aPrplConversation
   * @returns {IMConversation}
   */
  getUIConversation(aPrplConversation) {
    const id = aPrplConversation.id;
    if (this._uiConv && id in this._uiConv) {
      return this._uiConv[id];
    }
    throw new Error("Unknown conversation");
  }
  /**
   * @param {number} aId
   * @returns {IMConversation}
   */
  getUIConversationByContactId(aId) {
    return aId in this._uiConvByContactId ? this._uiConvByContactId[aId] : null;
  }

  /**
   * @returns {prplIConversation[]}
   */
  getConversations() {
    return this._prplConversations;
  }
  /**
   * @param {number} aId
   * @returns {prplIConversation}
   */
  getConversationById(aId) {
    for (const conv of this._prplConversations) {
      if (conv.id == aId) {
        return conv;
      }
    }
    return null;
  }
  /**
   *
   * @param {string} aName
   * @param {imIAccount} aAccount
   * @param {boolean} aIsChat
   * @returns {prplIConversation}
   */
  getConversationByNameAndAccount(aName, aAccount, aIsChat) {
    const normalizedName = aAccount.normalize(aName);
    for (const conv of this._prplConversations) {
      if (
        aAccount.normalize(conv.name) == normalizedName &&
        aAccount.numericId == conv.account.numericId &&
        conv.isChat == aIsChat
      ) {
        return conv;
      }
    }
    return null;
  }
}

export const conversations = new ConversationsService();
