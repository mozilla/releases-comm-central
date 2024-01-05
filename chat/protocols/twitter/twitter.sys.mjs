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
  l10nHelper("chrome://chat/locale/twitter.properties")
);

function Account(aProtocol, aImAccount) {
  this._init(aProtocol, aImAccount);
}
Account.prototype = {
  __proto__: GenericAccountPrototype,

  connect() {
    this.WARN(
      "Twitter is no longer supported due to Twitter disabling the streaming " +
        "support in their API. See bug 1445778."
    );
    this.reportDisconnecting(
      Ci.prplIAccount.ERROR_OTHER_ERROR,
      lazy._("twitter.disabled")
    );
    this.reportDisconnected();
  },

  // Nothing to do.
  unInit() {},
  remove() {},
};

export function TwitterProtocol() {
  this.registerCommands();
}

TwitterProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "twitter";
  },
  get name() {
    return lazy._("twitter.protocolName");
  },
  get iconBaseURI() {
    return "chrome://prpl-twitter/skin/";
  },
  get noPassword() {
    return true;
  },
  getAccount(aImAccount) {
    return new Account(this, aImAccount);
  },
};
