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
      lazy._("facebook.disabled")
    );
    this.reportDisconnected();
  },

  // Nothing to do.
  unInit() {},
  remove() {},
};

export function FacebookProtocol() {}
FacebookProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "facebook";
  },
  get name() {
    return lazy._("facebook.chat.name");
  },
  get iconBaseURI() {
    return "chrome://prpl-facebook/skin/";
  },
  getAccount(aImAccount) {
    return new FacebookAccount(this, aImAccount);
  },
};
