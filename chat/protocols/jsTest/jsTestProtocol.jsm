/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["JSTestProtocol"];

const { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
var {
  GenericAccountPrototype,
  GenericConvIMPrototype,
  GenericProtocolPrototype,
} = ChromeUtils.import("resource:///modules/jsProtoHelper.jsm");

function Conversation(aAccount) {
  this._init(aAccount);
}
Conversation.prototype = {
  __proto__: GenericConvIMPrototype,
  _disconnected: false,
  _setDisconnected() {
    this._disconnected = true;
  },
  close() {
    if (!this._disconnected) {
      this.account.disconnect(true);
    }
  },
  sendMsg(aMsg) {
    if (this._disconnected) {
      this.writeMessage(
        "jstest",
        "This message could not be sent because the conversation is no longer active: " +
          aMsg,
        { system: true, error: true }
      );
      return;
    }

    this.writeMessage("You", aMsg, { outgoing: true });
    this.writeMessage("/dev/null", "Thanks! I appreciate your attention.", {
      incoming: true,
      autoResponse: true,
    });
  },

  get name() {
    return "/dev/null";
  },
};

function Account(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
Account.prototype = {
  __proto__: GenericAccountPrototype,
  connect() {
    this.reportConnecting();
    // do something here
    this.reportConnected();
    setTimeout(
      function() {
        this._conv = new Conversation(this);
        this._conv.writeMessage("jstest", "You are now talking to /dev/null", {
          system: true,
        });
      }.bind(this),
      0
    );
  },
  _conv: null,
  disconnect(aSilent) {
    this.reportDisconnecting(Ci.prplIAccount.NO_ERROR, "");
    if (!aSilent) {
      this._conv.writeMessage("jstest", "You have disconnected.", {
        system: true,
      });
    }
    if (this._conv) {
      this._conv._setDisconnected();
      delete this._conv;
    }
    this.reportDisconnected();
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
  unInit() {},
};

function JSTestProtocol() {}
JSTestProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get id() {
    return "prpl-jstest";
  },
  get normalizedName() {
    return "jstest";
  },
  get name() {
    return "JS Test";
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
    },
  ],
  getAccount(aImAccount) {
    return new Account(this, aImAccount);
  },
};
