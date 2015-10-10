/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cu = Components.utils;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");
Cu.import("resource:///modules/xmpp.jsm");
Cu.import("resource:///modules/xmpp-session.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

function XMPPAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
XMPPAccount.prototype = XMPPAccountPrototype;

function XMPPProtocol() {
  Cu.import("resource:///modules/xmpp-commands.jsm", this);
  this.registerCommands();
}
XMPPProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() { return "jabber"; },
  get name() { return "XMPP"; },
  get iconBaseURI() { return "chrome://prpl-jabber/skin/"; },
  getAccount: function(aImAccount) { return new XMPPAccount(this, aImAccount); },

  usernameSplits: [
    {get label() { return _("options.domain"); }, separator: "@",
     defaultValue: "jabber.org", reverse: true}
  ],

  options: {
    resource: {get label() { return _("options.resource"); },
               get default() { return XMPPDefaultResource; }},
    priority: {get label() { return _("options.priority"); }, default: 0},
    connection_security: {
      get label() { return _("options.connectionSecurity"); },
      listValues: {
        get require_tls() { return _("options.connectionSecurity.requireEncryption"); },
        get opportunistic_tls() { return _("options.connectionSecurity.opportunisticTLS"); },
        get allow_unencrypted_plain_auth() { return _("options.connectionSecurity.allowUnencryptedAuth"); },
        // "old_ssl" and "none" are also supported, but not exposed in the UI.
        // Any unknown value will fallback to the opportunistic_tls behavior.
      },
      default: "require_tls"
    },
    server: {get label() { return _("options.connectServer"); }, default: ""},
    port: {get label() { return _("options.connectPort"); }, default: 5222}
  },
  get chatHasTopic() { return true; },

  classID: Components.ID("{dde786d1-6f59-43d0-9bc8-b505a757fb30}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([XMPPProtocol]);
