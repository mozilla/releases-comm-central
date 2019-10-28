/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["FacebookProtocol"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { GenericAccountPrototype, GenericProtocolPrototype } = ChromeUtils.import(
  "resource:///modules/jsProtoHelper.jsm"
);

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/facebook.properties")
);

function FacebookAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
FacebookAccount.prototype = {
  __proto__: GenericAccountPrototype,

  connect() {
    this.WARN(
      "As Facebook deprecated its XMPP gateway, it is currently not " +
        "possible to connect to Facebook Chat. See bug 1141674."
    );
    this.reportDisconnecting(
      Ci.prplIAccount.ERROR_OTHER_ERROR,
      _("facebook.disabled")
    );
    this.reportDisconnected();
  },

  // Nothing to do.
  unInit() {},
};

function FacebookProtocol() {}
FacebookProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "facebook";
  },
  get name() {
    return _("facebook.chat.name");
  },
  get iconBaseURI() {
    return "chrome://prpl-facebook/skin/";
  },
  getAccount(aImAccount) {
    return new FacebookAccount(this, aImAccount);
  },
};
