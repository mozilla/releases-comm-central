/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["XMPPProtocol"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { GenericProtocolPrototype } = ChromeUtils.import(
  "resource:///modules/jsProtoHelper.jsm"
);
var { XMPPAccountPrototype } = ChromeUtils.import(
  "resource:///modules/xmpp-base.jsm"
);

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

function XMPPAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
XMPPAccount.prototype = XMPPAccountPrototype;

function XMPPProtocol() {
  this.commands = ChromeUtils.import(
    "resource:///modules/xmpp-commands.jsm"
  ).commands;
  this.registerCommands();
}
XMPPProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "jabber";
  },
  get name() {
    return "XMPP";
  },
  get iconBaseURI() {
    return "chrome://prpl-jabber/skin/";
  },
  getAccount(aImAccount) {
    return new XMPPAccount(this, aImAccount);
  },

  usernameSplits: [
    {
      get label() {
        return _("options.domain");
      },
      separator: "@",
      defaultValue: "jabber.org",
    },
  ],

  options: {
    resource: {
      get label() {
        return _("options.resource");
      },
      default: "",
    },
    priority: {
      get label() {
        return _("options.priority");
      },
      default: 0,
    },
    connection_security: {
      get label() {
        return _("options.connectionSecurity");
      },
      listValues: {
        get require_tls() {
          return _("options.connectionSecurity.requireEncryption");
        },
        get opportunistic_tls() {
          return _("options.connectionSecurity.opportunisticTLS");
        },
        get allow_unencrypted_plain_auth() {
          return _("options.connectionSecurity.allowUnencryptedAuth");
        },
        // "old_ssl" and "none" are also supported, but not exposed in the UI.
        // Any unknown value will fallback to the opportunistic_tls behavior.
      },
      default: "require_tls",
    },
    server: {
      get label() {
        return _("options.connectServer");
      },
      default: "",
    },
    port: {
      get label() {
        return _("options.connectPort");
      },
      default: 5222,
    },
  },
  get chatHasTopic() {
    return true;
  },
};
