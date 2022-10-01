/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { l10nHelper } = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var { GenericProtocolPrototype } = ChromeUtils.import(
  "resource:///modules/jsProtoHelper.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);
ChromeUtils.defineModuleGetter(
  lazy,
  "XMPPAccountPrototype",
  "resource:///modules/xmpp-base.jsm"
);

XPCOMUtils.defineLazyGetter(lazy, "XMPPAccount", () => {
  function XMPPAccount(aProtoInstance, aImAccount) {
    this._init(aProtoInstance, aImAccount);
  }
  XMPPAccount.prototype = lazy.XMPPAccountPrototype;
  return XMPPAccount;
});

export function XMPPProtocol() {
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
    return new lazy.XMPPAccount(this, aImAccount);
  },

  usernameSplits: [
    {
      get label() {
        return lazy._("options.domain");
      },
      separator: "@",
      defaultValue: "jabber.org",
    },
  ],

  options: {
    resource: {
      get label() {
        return lazy._("options.resource");
      },
      default: "",
    },
    priority: {
      get label() {
        return lazy._("options.priority");
      },
      default: 0,
    },
    connection_security: {
      get label() {
        return lazy._("options.connectionSecurity");
      },
      listValues: {
        get require_tls() {
          return lazy._("options.connectionSecurity.requireEncryption");
        },
        get opportunistic_tls() {
          return lazy._("options.connectionSecurity.opportunisticTLS");
        },
        get allow_unencrypted_plain_auth() {
          return lazy._("options.connectionSecurity.allowUnencryptedAuth");
        },
        // "old_ssl" and "none" are also supported, but not exposed in the UI.
        // Any unknown value will fallback to the opportunistic_tls behavior.
      },
      default: "require_tls",
    },
    server: {
      get label() {
        return lazy._("options.connectServer");
      },
      default: "",
    },
    port: {
      get label() {
        return lazy._("options.connectPort");
      },
      default: 5222,
    },
  },
  get chatHasTopic() {
    return true;
  },
};
