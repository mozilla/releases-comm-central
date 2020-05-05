/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["LDAPProtocolHandler", "LDAPSProtocolHandler"];

const nsIProtocolHandler = Ci.nsIProtocolHandler;

function makeProtocolHandler(aCID, aProtocol, aDefaultPort) {
  return {
    classID: Components.ID(aCID),
    QueryInterface: ChromeUtils.generateQI([nsIProtocolHandler]),

    scheme: aProtocol,
    defaultPort: aDefaultPort,
    protocolFlags:
      nsIProtocolHandler.URI_NORELATIVE |
      nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
      nsIProtocolHandler.ALLOWS_PROXY,

    newChannel(aURI, aLoadInfo) {
      if ("@mozilla.org/network/ldap-channel;1" in Cc) {
        var channel = Cc["@mozilla.org/network/ldap-channel;1"].createInstance(
          Ci.nsIChannel
        );
        channel.init(aURI);
        channel.loadInfo = aLoadInfo;
        return channel;
      }

      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    },

    allowPort(port, scheme) {
      return port == aDefaultPort;
    },
  };
}

function LDAPProtocolHandler() {}

LDAPProtocolHandler.prototype = makeProtocolHandler(
  "{b3de9249-b0e5-4c12-8d91-c9a434fd80f5}",
  "ldap",
  389
);

function LDAPSProtocolHandler() {}

LDAPSProtocolHandler.prototype = makeProtocolHandler(
  "{c85a5ef2-9c56-445f-b029-76889f2dd29b}",
  "ldaps",
  636
);
