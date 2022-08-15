/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["OdnoklassnikiProtocol"];

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
ChromeUtils.defineModuleGetter(
  lazy,
  "XMPPSession",
  "resource:///modules/xmpp-session.jsm"
);

XPCOMUtils.defineLazyGetter(lazy, "OdnoklassnikiAccount", () => {
  function OdnoklassnikiAccount(aProtoInstance, aImAccount) {
    this._init(aProtoInstance, aImAccount);
  }
  OdnoklassnikiAccount.prototype = {
    __proto__: lazy.XMPPAccountPrototype,
    get canJoinChat() {
      return false;
    },
    connect() {
      if (!this.name.includes("@")) {
        // TODO: Do not use the default resource value if the user has not
        // specified it and let the service generate it.
        let jid =
          this.name +
          "@odnoklassniki.ru/" +
          Services.strings
            .createBundle("chrome://branding/locale/brand.properties")
            .GetStringFromName("brandShortName");
        this._jid = this._parseJID(jid);
      } else {
        this._jid = this._parseJID(this.name);
        if (this._jid.domain != "odnoklassniki.ru") {
          // We can't use this.onError because this._connection doesn't exist.
          this.reportDisconnecting(
            Ci.prplIAccount.ERROR_INVALID_USERNAME,
            lazy._("connection.error.invalidUsername")
          );
          this.reportDisconnected();
          return;
        }
      }

      this._connection = new lazy.XMPPSession(
        "xmpp.odnoklassniki.ru",
        5222,
        "require_tls",
        this._jid,
        this.imAccount.password,
        this
      );
    },
  };
  return OdnoklassnikiAccount;
});

function OdnoklassnikiProtocol() {}
OdnoklassnikiProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "odnoklassniki";
  },
  get name() {
    return lazy._("odnoklassniki.protocolName");
  },
  get iconBaseURI() {
    return "chrome://prpl-odnoklassniki/skin/";
  },
  get usernameEmptyText() {
    return lazy._("odnoklassniki.usernameHint");
  },
  getAccount(aImAccount) {
    return new lazy.OdnoklassnikiAccount(this, aImAccount);
  },
};
