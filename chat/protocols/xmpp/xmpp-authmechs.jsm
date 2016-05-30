/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This module exports XMPPAuthMechanisms, an object containing all
// the supported SASL authentication mechanisms.
// By default we currently support the PLAIN and the DIGEST-MD5 mechanisms.
// As this is only used by XMPPSession, it may seem like an internal
// detail of the XMPP implementation, but exporting it is valuable so that
// add-ons can add support for more auth mechanisms easily by adding them
// in XMPPAuthMechanisms without having to modify XMPPSession.

this.EXPORTED_SYMBOLS = ["XMPPAuthMechanisms"];

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/xmpp-xml.jsm");

/* Handle PLAIN authorization mechanism */
function PlainAuth(username, password, domain) {
  let data = "\0"+ username + "\0" + password;
  // btoa for Unicode, see https://developer.mozilla.org/en-US/docs/DOM/window.btoa
  this._base64Data = btoa(unescape(encodeURIComponent(data)));
}
PlainAuth.prototype = {
  next: function(aStanza) {
    return {
      done: true,
      send: Stanza.node("auth", Stanza.NS.sasl, {mechanism: "PLAIN"},
                        this._base64Data),
      log: '<auth mechanism:="PLAIN"/> (base64 encoded username and password not logged)'
    };
  }
};

var XMPPAuthMechanisms = {"PLAIN": PlainAuth};
