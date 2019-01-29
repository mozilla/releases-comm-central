/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

const kNetworkProtocolCIDPrefix = "@mozilla.org/network/protocol;1?name=";
const nsIProtocolHandler = Ci.nsIProtocolHandler;

function makeProtocolHandler(aCID, aProtocol, aDefaultPort) {
  return {
    classID: Components.ID(aCID),
    QueryInterface: ChromeUtils.generateQI([nsIProtocolHandler]),

    scheme: aProtocol,
    defaultPort: aDefaultPort,
    protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                   nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
                   nsIProtocolHandler.ALLOWS_PROXY,

    newURI: function (aSpec, aOriginCharset, aBaseURI) {
      var url = Cc["@mozilla.org/network/ldap-url;1"]
                  .createInstance(Ci.nsIURI);

      if (url instanceof Ci.nsILDAPURL)
        url.init(Ci.nsIStandardURL.URLTYPE_STANDARD,
          aDefaultPort, aSpec, aOriginCharset, aBaseURI);

      return url;
    },

    newChannel: function (aURI) {
      return this.newChannel2(aURI, null);
    },

    newChannel2: function (aURI, aLoadInfo) {
      if ("@mozilla.org/network/ldap-channel;1" in Cc) {
        var channel = Cc["@mozilla.org/network/ldap-channel;1"]
                        .createInstance(Ci.nsIChannel);
        channel.init(aURI);
        return channel;
      }

      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    allowPort: function (port, scheme) {
      return port == aDefaultPort;
    }
  };
}

function nsLDAPProtocolHandler() {}

nsLDAPProtocolHandler.prototype = makeProtocolHandler("{b3de9249-b0e5-4c12-8d91-c9a434fd80f5}", "ldap", 389);

function nsLDAPSProtocolHandler() {}

nsLDAPSProtocolHandler.prototype = makeProtocolHandler("{c85a5ef2-9c56-445f-b029-76889f2dd29b}", "ldaps", 636);

const NSGetFactory = XPCOMUtils.generateNSGetFactory([nsLDAPProtocolHandler,
                                                      nsLDAPSProtocolHandler]);
