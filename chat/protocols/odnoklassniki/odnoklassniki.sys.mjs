/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  GenericAccountPrototype,
  GenericProtocolPrototype,
} from "resource:///modules/jsProtoHelper.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/xmpp.ftl"], true)
);

function OdnoklassnikiAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
OdnoklassnikiAccount.prototype = {
  __proto__: GenericAccountPrototype,
  connect() {
    this.WARN("Odnoklassniki no longer supports XMPP. See bug 2044769.");
    this.reportDisconnecting(
      Ci.prplIAccount.ERROR_OTHER_ERROR,
      lazy.l10n.formatValueSync("odnoklassniki-disabled")
    );
    this.reportDisconnected();
  },

  // Nothing to do.
  unInit() {},
  remove() {},
};

export function OdnoklassnikiProtocol() {}
OdnoklassnikiProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "odnoklassniki";
  },
  get name() {
    return lazy.l10n.formatValueSync("odnoklassniki-protocol-name");
  },
  get iconBaseURI() {
    return "chrome://prpl-odnoklassniki/skin/";
  },
  getAccount(aImAccount) {
    return new OdnoklassnikiAccount(this, aImAccount);
  },
};
