/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["YahooProtocol"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { GenericAccountPrototype, GenericProtocolPrototype } = ChromeUtils.import(
  "resource:///modules/jsProtoHelper.jsm"
);

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/yahoo.properties")
);

function YahooAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
YahooAccount.prototype = {
  __proto__: GenericAccountPrototype,

  connect() {
    this.WARN(
      "The legacy versions of Yahoo Messenger was disabled on August " +
        "5, 2016. It is currently not possible to connect to Yahoo " +
        "Messenger. See bug 1316000."
    );
    this.reportDisconnecting(
      Ci.prplIAccount.ERROR_OTHER_ERROR,
      _("yahoo.disabled")
    );
    this.reportDisconnected();
  },

  // Nothing to do.
  unInit() {},
};

function YahooProtocol() {}
YahooProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get id() {
    return "prpl-yahoo";
  },
  get normalizedName() {
    return "yahoo";
  },
  get name() {
    return "Yahoo";
  },
  get iconBaseURI() {
    return "chrome://prpl-yahoo/skin/";
  },
  getAccount(aImAccount) {
    return new YahooAccount(this, aImAccount);
  },
};
