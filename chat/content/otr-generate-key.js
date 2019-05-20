/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  XPCOMUtils,
  l10nHelper,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
const {OTR} = ChromeUtils.import("resource:///modules/OTR.jsm");

var otrPriv = {

  async onload() {
    let args = window.arguments[0].wrappedJSObject;
    let priv = document.getElementById("priv");

    let text = await document.l10n.formatValue(
      "otr-genkey-account", {name: args.account, protocol: OTR.protocolName(args.protocol)});
    priv.textContent = text;
console.log("genkey: " + text);

    OTR.generatePrivateKey(args.account, args.protocol).then(function() {
      document.documentElement.getButton("accept").disabled = false;
      document.documentElement.acceptDialog();
    }).catch(async function(err) {
      priv.textContent = await document.l10n.formatValue(
          "otr-genkey-failed", {error: String(err)});
      document.documentElement.getButton("accept").disabled = false;
    });
  },
};
