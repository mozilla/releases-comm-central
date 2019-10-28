/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["SmileProtocolHandler"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { getSmileRealURI } = ChromeUtils.import(
  "resource:///modules/imSmileys.jsm"
);

var kSmileRegexp = /^smile:\/\//;

function smileProtocolHandler() {}

smileProtocolHandler.prototype = {
  scheme: "smile",
  defaultPort: -1,
  protocolFlags:
    Ci.nsIProtocolHandler.URI_NORELATIVE |
    Ci.nsIProtocolHandler.URI_NOAUTH |
    Ci.nsIProtocolHandler.URI_IS_UI_RESOURCE |
    Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE,
  newChannel(aURI, aLoadInfo) {
    let smile = aURI.spec.replace(kSmileRegexp, "");
    let uri = Services.io.newURI(getSmileRealURI(smile));
    let channel = Services.io.newChannelFromURIWithLoadInfo(uri, aLoadInfo);
    channel.originalURI = aURI;
    return channel;
  },
  allowPort(aPort, aScheme) {
    return false;
  },

  QueryInterface: ChromeUtils.generateQI([Ci.nsIProtocolHandler]),
};
