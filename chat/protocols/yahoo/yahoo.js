/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/yahoo.properties")
);

function YahooAccount(aProtoInstance, aImAccount)
{
  this._init(aProtoInstance, aImAccount);
}
YahooAccount.prototype = {
  __proto__: GenericAccountPrototype,

  connect: function() {
    this.WARN("The legacy versions of Yahoo Messenger was disabled on August " +
              "5, 2016. It is currently not possible to connect to Yahoo " +
              "Messenger. See bug 1316000");
    this.reportDisconnecting(Ci.prplIAccount.ERROR_OTHER_ERROR,
                             _("yahoo.disabled"));
    this.reportDisconnected();
  }
};

function YahooProtocol() {}
YahooProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get id() { return "prpl-yahoo"; },
  get name() { return "Yahoo"; },
  get iconBaseURI() { return "chrome://prpl-yahoo/skin/"; },
  getAccount: function(aImAccount) { return new YahooAccount(this, aImAccount); },
  classID: Components.ID("{50ea817e-5d79-4657-91ae-aa0a52bdb98c}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([YahooProtocol]);
