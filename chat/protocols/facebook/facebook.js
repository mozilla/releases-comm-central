/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/facebook.properties")
);

function FacebookAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
FacebookAccount.prototype = {
  __proto__: GenericAccountPrototype,

  connect: function() {
    this.WARN("As Facebook deprecated its XMPP gateway, it is currently not " +
              "possible to connect to Facebook Chat. See bug 1141674.");
    this.reportDisconnecting(Ci.prplIAccount.ERROR_OTHER_ERROR,
                             _("facebook.disabled"));
    this.reportDisconnected();
  }
};

function FacebookProtocol() {}
FacebookProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() { return "facebook"; },
  get name() { return _("facebook.chat.name"); },
  get iconBaseURI() { return "chrome://prpl-facebook/skin/"; },
  getAccount: function(aImAccount) { return new FacebookAccount(this, aImAccount); },
  classID: Components.ID("{1d1d0bc5-610c-472f-b2cb-4b89857d80dc}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FacebookProtocol]);
