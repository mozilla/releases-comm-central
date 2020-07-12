/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["SMTPProtocolHandler", "SMTPSProtocolHandler"];

var nsIProtocolHandler = Ci.nsIProtocolHandler;

function makeProtocolHandler(aProtocol, aDefaultPort, aClassID) {
  return {
    QueryInterface: ChromeUtils.generateQI(["nsIProtocolHandler"]),

    scheme: aProtocol,
    defaultPort: aDefaultPort,
    protocolFlags:
      nsIProtocolHandler.URI_NORELATIVE |
      nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
      nsIProtocolHandler.URI_NON_PERSISTABLE |
      nsIProtocolHandler.ALLOWS_PROXY |
      nsIProtocolHandler.URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT,

    newChannel(aURI, aLoadInfo) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    },

    allowPort(port, scheme) {
      return port == aDefaultPort;
    },
  };
}

function SMTPProtocolHandler() {}

SMTPProtocolHandler.prototype = makeProtocolHandler(
  "smtp",
  Ci.nsISmtpUrl.DEFAULT_SMTP_PORT,
  "b14c2b67-8680-4c11-8d63-9403c7d4f757"
);

function SMTPSProtocolHandler() {}

SMTPSProtocolHandler.prototype = makeProtocolHandler(
  "smtps",
  Ci.nsISmtpUrl.DEFAULT_SMTPS_PORT,
  "057d0997-9e3a-411e-b4ee-2602f53fe05f"
);
