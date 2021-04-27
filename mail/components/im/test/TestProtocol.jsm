/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["registerTestProtocol", "unregisterTestProtocol"];

var {
  GenericAccountPrototype,
  GenericConvIMPrototype,
  GenericProtocolPrototype,
} = ChromeUtils.import("resource:///modules/jsProtoHelper.jsm");
var { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(
  this,
  "UUIDGen",
  "@mozilla.org/uuid-generator;1",
  "nsIUUIDGenerator"
);

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
    this._disconnected = true;
    GenericConvIMPrototype.close.call(this);
  },
  sendMsg(aMsg) {
    if (this._disconnected) {
      return;
    }
    this.writeMessage("You", aMsg, { outgoing: true });
  },

  addNotice() {
    this.writeMessage("system", "test notice", { system: true });
  },

  get name() {
    return "/dev/null/" + this._account.name;
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
    this._conv = new Conversation(this);
  },
  _conv: null,
  disconnect() {
    this.reportDisconnecting(Ci.prplIAccount.NO_ERROR, "");
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
  unInit() {
    if (this._conv) {
      this._conv.close();
      delete this._conv;
    }
  },
  remove() {
    if (this._conv) {
      this._conv.close();
      delete this._conv;
    }
  },
};

function TestProtocol() {}
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
  classID: UUIDGen.generateUUID(),
  classDescription: "",
  contractID: "@mozilla.org/chat/mochitest;1",
};

const NSGetFactory = ComponentUtils.generateNSGetFactory([TestProtocol]);
const factory = {
  createInstance(outer, iid) {
    return NSGetFactory(TestProtocol.prototype.classID).createInstance(
      outer,
      iid
    );
  },
};
const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

function registerTestProtocol() {
  registrar.registerFactory(
    TestProtocol.prototype.classID,
    "",
    TestProtocol.prototype.contractID,
    factory
  );
  Services.catMan.addCategoryEntry(
    "im-protocol-plugin",
    TestProtocol.prototype.id,
    TestProtocol.prototype.contractID,
    false,
    true
  );
}

function unregisterTestProtocol() {
  Services.catMan.deleteCategoryEntry(
    "im-protocol-plugin",
    TestProtocol.prototype.id,
    true
  );
  registrar.unregisterFactory(TestProtocol.prototype.classID, factory);
}
