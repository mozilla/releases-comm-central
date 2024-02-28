/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  GenericAccountPrototype,
  GenericConvChatPrototype,
  GenericConvIMPrototype,
  GenericConversationPrototype,
  GenericProtocolPrototype,
  GenericConvChatBuddyPrototype,
  GenericMessagePrototype,
  TooltipInfo,
} from "resource:///modules/jsProtoHelper.sys.mjs";
import {
  registerProtocol,
  unregisterProtocol,
} from "resource:///modules/imCore.sys.mjs";

import { nsSimpleEnumerator } from "resource:///modules/imXPCOMUtils.sys.mjs";

function Message(who, text, properties, conversation) {
  this._init(who, text, properties, conversation);
  this.displayed = new Promise(resolve => {
    this._onDisplayed = resolve;
  });
  this.read = new Promise(resolve => {
    this._onRead = resolve;
  });
  this.actionRan = new Promise(resolve => {
    this._onAction = resolve;
  });
}

Message.prototype = {
  __proto__: GenericMessagePrototype,

  whenDisplayed() {
    this._onDisplayed();
  },

  whenRead() {
    this._onRead();
  },

  getActions() {
    return [
      {
        QueryInterface: ChromeUtils.generateQI(["prplIMessageAction"]),
        label: "Test",
        run: () => {
          this._onAction();
        },
      },
    ];
  },
};

/**
 *
 * @param {string} who - Nick of the participant.
 * @param {string} [alias] - Display name of the participant.
 */
function Participant(who, alias) {
  this._name = who;
  if (alias) {
    this.alias = alias;
  }
}
Participant.prototype = {
  __proto__: GenericConvChatBuddyPrototype,
};

const SharedConversationPrototype = {
  _disconnected: false,
  /**
   * Disconnect the conversation.
   */
  _setDisconnected() {
    this._disconnected = true;
  },
  /**
   * Close the conversation, including in the UI.
   */
  close() {
    if (!this._account) {
      // This conversation is already cleaned up.
      return;
    }
    this._disconnected = true;
    this._account._conversations.delete(this);
    GenericConversationPrototype.close.call(this);
  },
  /**
   * Send an outgoing message.
   *
   * @param {string} aMsg - Message to send.
   * @returns
   */
  dispatchMessage(aMsg, aAction = false, aNotice = false) {
    if (this._disconnected) {
      return;
    }
    this.writeMessage("You", aMsg, { outgoing: true, notification: aNotice });
  },

  /**
   *
   * @param {Array<object>} messages - Array of messages to add to the
   * conversation. Expects an object with a |who|, |content| and |options|
   * properties, corresponding to the three params of |writeMessage|.
   */
  addMessages(messages) {
    for (const message of messages) {
      this.writeMessage(message.who, message.content, message.options);
    }
  },

  /**
   * Add a notice to the conversation.
   */
  addNotice() {
    this.writeMessage("system", "test notice", { system: true });
  },

  createMessage(who, text, options) {
    const message = new Message(who, text, options, this);
    return message;
  },
};

/**
 *
 * @param {prplIAccount} account
 * @param {string} name - Name of the conversation.
 */
function MUC(account, name) {
  this._init(account, name, "You");
}
MUC.prototype = {
  __proto__: GenericConvChatPrototype,

  /**
   *
   * @param {string} who - Nick of the user to add.
   * @param {string} alias - Display name of the participant.
   * @returns
   */
  addParticipant(who, alias) {
    if (this._participants.has(who)) {
      return;
    }
    const participant = new Participant(who, alias);
    this._participants.set(who, participant);
  },
  ...SharedConversationPrototype,
};

/**
 *
 * @param {prplIAccount} account
 * @param {string} name - Name of the conversation.
 */
function DM(account, name) {
  this._init(account, name);
}
DM.prototype = {
  __proto__: GenericConvIMPrototype,
  ...SharedConversationPrototype,
};

function Account(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
  this._conversations = new Set();
}
Account.prototype = {
  __proto__: GenericAccountPrototype,

  /**
   * @type {Set<GenericConversationPrototype>}
   */
  _conversations: null,

  /**
   *
   * @param {string} name - Name of the conversation.
   * @returns {MUC}
   */
  makeMUC(name) {
    const conversation = new MUC(this, name);
    this._conversations.add(conversation);
    return conversation;
  },

  /**
   *
   * @param {string} name - Name of the conversation.
   * @returns {DM}
   */
  makeDM(name) {
    const conversation = new DM(this, name);
    this._conversations.add(conversation);
    return conversation;
  },

  connect() {
    this.reportConnecting();
    // do something here
    this.reportConnected();
  },
  disconnect() {
    this.reportDisconnecting(Ci.prplIAccount.NO_ERROR, "");
    this.reportDisconnected();
  },

  requestBuddyInfo(who) {
    const participant = Array.from(this._conversations)
      .find(conv => conv.isChat && conv._participants.has(who))
      ?._participants.get(who);
    if (participant) {
      const tooltipInfo = [new TooltipInfo("Display Name", participant.alias)];
      Services.obs.notifyObservers(
        new nsSimpleEnumerator(tooltipInfo),
        "user-info-received",
        who
      );
    }
  },

  get canJoinChat() {
    return true;
  },
  chatRoomFields: {
    channel: { label: "_Channel Field", required: true },
    channelDefault: { label: "_Field with default", default: "Default Value" },
    password: {
      label: "_Password Field",
      default: "",
      isPassword: true,
      required: false,
    },
    sampleIntField: {
      label: "_Int Field",
      default: 4,
      min: 0,
      max: 10,
      required: true,
    },
  },

  // Nothing to do.
  unInit() {
    for (const conversation of this._conversations) {
      conversation.close();
    }
    this._conversations = new Set();
  },
  remove() {},
};

export function TestProtocol() {}
TestProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get id() {
    return "prpl-mochitest";
  },
  get normalizedName() {
    return "mochitest";
  },
  get name() {
    return "Mochitest";
  },
  options: {
    text: { label: "Text option", default: "foo" },
    bool: { label: "Boolean option", default: true },
    int: { label: "Integer option", default: 42 },
    list: {
      label: "Select option",
      default: "option2",
      listValues: {
        option1: "First option",
        option2: "Default option",
        option3: "Other option",
      },
    },
  },
  usernameSplits: [
    {
      label: "Server",
      separator: "@",
      defaultValue: "default.server",
      reverse: true,
    },
  ],
  getAccount(aImAccount) {
    return new Account(this, aImAccount);
  },
  classID: Components.ID("{a4617631-b8b8-4053-8afa-5c4c43498280}"),
};

export function registerTestProtocol() {
  registerProtocol(TestProtocol.prototype.id, "@mozilla.org/chat/mochitest;1");
}

export function unregisterTestProtocol() {
  unregisterProtocol(TestProtocol.prototype.id);
}
