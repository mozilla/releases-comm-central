/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");
Cu.import("resource:///modules/xmpp.jsm");
Cu.import("resource:///modules/xmpp-session.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/facebook.properties")
);

function FacebookAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
FacebookAccount.prototype = {
  __proto__: XMPPAccountPrototype,
  get canJoinChat() { return false; },
  connect: function() {
    if (!this.name.includes("@")) {
      let jid = this.name + "@chat.facebook.com/" + XMPPDefaultResource;
      this._jid = this._parseJID(jid);
    }
    else {
      this._jid = this._parseJID(this.name);
      if (this._jid.domain != "chat.facebook.com") {
        // We can't use this.onError because this._connection doesn't exist.
        this.reportDisconnecting(Ci.prplIAccount.ERROR_INVALID_USERNAME,
                                 _("connection.error.useUsernameNotEmailAddress"));
        this.reportDisconnected();
        return;
      }
    }

    let server = "chat.facebook.com";
    if (this.prefs.prefHasUserValue("server"))
      server = this.getString("server");
    this._connection = new XMPPSession(server, 5222, "require_tls",
                                       this._jid, this.imAccount.password,
                                       this);
  }
};

function FacebookProtocol() {
}
FacebookProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() { return "facebook"; },
  get name() { return _("facebook.chat.name"); },
  get iconBaseURI() { return "chrome://prpl-facebook/skin/"; },
  getAccount: function(aImAccount) { return new FacebookAccount(this, aImAccount); },
  classID: Components.ID("{1d1d0bc5-610c-472f-b2cb-4b89857d80dc}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FacebookProtocol]);
