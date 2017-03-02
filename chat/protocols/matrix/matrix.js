/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

XPCOMUtils.defineLazyModuleGetter(this, "MatrixSDK",
                                  "resource:///modules/matrix-sdk.jsm"
);

function MatrixAccount(aProtocol, aImAccount)
{
  this._init(aProtocol, aImAccount);
}
MatrixAccount.prototype = {
  __proto__: GenericAccountPrototype,
}

function MatrixProtocol() {
}
MatrixProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() { return "matrix"; },
  get name() { return "Matrix"; },
  get iconBaseURI() { return "chrome://prpl-matrix/skin/"; },
  getAccount: function(aImAccount) { return new MatrixAccount(this, aImAccount); },

  options: {
    server: {
      get label() { return _("options.connectServer"); },
      default: "https://"
    },
    port: {
      get label() { return _("options.connectPort"); },
      default: 443
    }
  },

  classID: Components.ID("{e9653ac6-a671-11e6-bf84-60a44c717042}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([MatrixProtocol]);
