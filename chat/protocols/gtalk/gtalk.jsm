/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["GTalkProtocol"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { GenericProtocolPrototype } = ChromeUtils.import(
  "resource:///modules/jsProtoHelper.jsm"
);
var { XMPPAccountPrototype } = ChromeUtils.import(
  "resource:///modules/xmpp-base.jsm"
);
var { XMPPSession } = ChromeUtils.import(
  "resource:///modules/xmpp-session.jsm"
);
var { Stanza } = ChromeUtils.import("resource:///modules/xmpp-xml.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

// PlainFullBindAuth is an authentication mechanism that works like
// the standard PLAIN mechanism but adds a client-uses-full-bind-result
// attribute to the auth stanza to tell the Google Talk servers that we
// support their JID Domain Discovery extension.
// See https://developers.google.com/talk/jep_extensions/jid_domain_change
function* PlainFullBindAuth(aUsername, aPassword, aDomain) {
  let key = btoa("\0" + aUsername + "\0" + aPassword);
  let attrs = {
    mechanism: "PLAIN",
    "xmlns:ga": "http://www.google.com/talk/protocol/auth",
    "ga:client-uses-full-bind-result": "true",
  };
  let stanza = yield {
    send: Stanza.node("auth", Stanza.NS.sasl, attrs, key),
    log:
      "<auth.../> (PlainFullBindAuth base64 encoded username and password not logged)",
  };

  if (stanza.localName != "success") {
    throw new Error("Didn't receive the expected auth success stanza.");
  }
}

function GTalkAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
GTalkAccount.prototype = {
  __proto__: XMPPAccountPrototype,
  connect() {
    this._jid = this._parseJID(this.name);
    // The XMPP spec says that the node part of a JID is optional, but
    // in the case of Google Talk if the username typed by the user
    // doesn't contain an @, we prefer assuming that it's the domain
    // part that's been omitted.
    if (!this._jid.node) {
      // If the domain part was omitted, swap the node and domain parts,
      // use 'gmail.com' as the default domain, and tell the Google
      // Talk server that we will use the full bind result.
      this._jid.node = this._jid.domain;
      this._jid.domain = "gmail.com";
      this.authMechanisms = { PLAIN: PlainFullBindAuth };
    }

    // For the resource, if the user has edited the option, always use that.
    if (this.prefs.prefHasUserValue("resource")) {
      let resource = this.getString("resource");
      this._jid = this._setJID(this._jid.domain, this._jid.node, resource);
    }

    this._connection = new XMPPSession(
      "talk.google.com",
      443,
      "require_tls",
      this._jid,
      this.imAccount.password,
      this
    );
  },
};

function GTalkProtocol() {
  this.commands = ChromeUtils.import(
    "resource:///modules/xmpp-commands.jsm"
  ).commands;
  this.registerCommands();
}
GTalkProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "gtalk";
  },
  get name() {
    return _("gtalk.protocolName");
  },
  get iconBaseURI() {
    return "chrome://prpl-gtalk/skin/";
  },
  get usernameEmptyText() {
    return _("gtalk.usernameHint");
  },
  getAccount(aImAccount) {
    return new GTalkAccount(this, aImAccount);
  },
  options: {
    resource: {
      get label() {
        return _("options.resource");
      },
      default: "",
    },
  },
  get chatHasTopic() {
    return true;
  },
};
