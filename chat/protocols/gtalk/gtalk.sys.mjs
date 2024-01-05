/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";
import {
  GenericAccountPrototype,
  GenericProtocolPrototype,
} from "resource:///modules/jsProtoHelper.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

function GTalkAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
GTalkAccount.prototype = {
  __proto__: GenericAccountPrototype,
  connect() {
    this.WARN(
      "As Google deprecated its XMPP gateway, it is currently not " +
        "possible to connect to Google Talk. See bug 1645217."
    );
    this.reportDisconnecting(
      Ci.prplIAccount.ERROR_OTHER_ERROR,
      lazy._("gtalk.disabled")
    );
    this.reportDisconnected();
  },

  // Nothing to do.
  unInit() {},
  remove() {},
};

export function GTalkProtocol() {}
GTalkProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "gtalk";
  },
  get name() {
    return lazy._("gtalk.protocolName");
  },
  get iconBaseURI() {
    return "chrome://prpl-gtalk/skin/";
  },
  getAccount(aImAccount) {
    return new GTalkAccount(this, aImAccount);
  },
  // GTalk accounts which were configured with OAuth2 do not have a password set.
  // Show the above error on connect instead of a "needs password" error.
  get noPassword() {
    return true;
  },
};
