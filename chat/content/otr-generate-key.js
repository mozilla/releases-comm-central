/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  XPCOMUtils,
  l10nHelper,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
const {Services} = ChromeUtils.import("resource:///modules/imServices.jsm");
const {OTR} = ChromeUtils.import("resource:///modules/OTR.jsm");

var otrPriv = {

  async onload() {
    let args = window.arguments[0].wrappedJSObject;
    let priv = document.getElementById("priv");

    let protocolNameToShow;

    // args.protocol is the normalized protocol name.
    // However, we don't want to show normalized names like "jabber",
    // but want to show the terms used in the UI like "XMPP".

    let protocols = Services.core.getProtocols();
    while (protocols.hasMoreElements()) {
      let protocol = protocols.getNext();
      if (protocol.normalizedName === args.protocol) {
        protocolNameToShow = protocol.name;
        break;
      }
    }

    if (!protocolNameToShow) {
      protocolNameToShow = args.protocol;
    }

    let text = await document.l10n.formatValue(
      "otr-genkey-account", {name: args.account, protocol: protocolNameToShow});
    priv.textContent = text;

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
