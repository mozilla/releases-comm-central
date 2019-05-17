/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  XPCOMUtils,
  l10nHelper,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
const {OTR} = ChromeUtils.import("resource:///modules/OTR.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/content/otr-generate-key.properties")
);

var otrPriv = {

  onload() {
    let args = window.arguments[0].wrappedJSObject;
    let priv = document.getElementById("priv");
    priv.textContent = _("priv.account", args.account, OTR.protocolName(args.protocol));
    OTR.generatePrivateKey(args.account, args.protocol).then(function() {
      document.documentElement.getButton("accept").disabled = false;
      document.documentElement.acceptDialog();
    }).catch(function(err) {
      document.documentElement.getButton("accept").disabled = false;
      priv.textContent = _("priv.failed", String(err));
    });
  },
};
