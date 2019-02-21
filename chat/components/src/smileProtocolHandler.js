/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {
  smileImMarkup,
  smileTextNode,
  smileString,
  getSmileRealURI,
  getSmileyList,
} = ChromeUtils.import("resource:///modules/imSmileys.jsm");

var kSmileRegexp = /^smile:\/\//;

function smileProtocolHandler() { }

smileProtocolHandler.prototype = {
  scheme: "smile",
  defaultPort: -1,
  protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE |
                 Ci.nsIProtocolHandler.URI_NOAUTH |
                 Ci.nsIProtocolHandler.URI_IS_UI_RESOURCE |
                 Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE,
  newURI: function SPH_newURI(aSpec, aOriginCharset, aBaseURI) {
    let mutator = Cc["@mozilla.org/network/simple-uri-mutator;1"]
                    .createInstance(Ci.nsIURIMutator);
    return mutator.setSpec(aSpec).finalize();
  },
  newChannel: function SPH_newChannel2(aURI, aLoadInfo) {
    let smile = aURI.spec.replace(kSmileRegexp, "");
    let uri = Services.io.newURI(getSmileRealURI(smile));
    let channel = Services.io.newChannelFromURIWithLoadInfo(uri, aLoadInfo);
    channel.originalURI = aURI;
    return channel;
  },
  allowPort: function SPH_allowPort(aPort, aScheme) { return false; },

  classDescription: "Smile Protocol Handler",
  classID: Components.ID("{04e58eae-dfbc-4c9e-8130-6d9ef19cbff4}"),
  contractID: "@mozilla.org/network/protocol;1?name=smile",
  QueryInterface: ChromeUtils.generateQI([Ci.nsIProtocolHandler])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([smileProtocolHandler]);
