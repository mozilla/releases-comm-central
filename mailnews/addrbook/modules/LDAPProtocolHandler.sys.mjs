/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @implements {nsIProtocolHandler}
 */
export class LDAPProtocolHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIProtocolHandler"]);

  scheme = "ldap";

  newChannel(aURI, aLoadInfo) {
    const channel = Cc["@mozilla.org/network/ldap-channel;1"].createInstance(
      Ci.nsIChannel
    );
    channel.init(aURI);
    channel.loadInfo = aLoadInfo;
    return channel;
  }

  allowPort(port, scheme) {
    return port == 389;
  }
}

LDAPProtocolHandler.prototype.classID = Components.ID(
  "{b3de9249-b0e5-4c12-8d91-c9a434fd80f5}"
);

export class LDAPSProtocolHandler extends LDAPProtocolHandler {
  scheme = "ldaps";

  allowPort(port, scheme) {
    return port == 636;
  }
}

LDAPSProtocolHandler.prototype.classID = Components.ID(
  "{c85a5ef2-9c56-445f-b029-76889f2dd29b}"
);
