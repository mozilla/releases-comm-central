/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @implements {nsIProtocolHandler}
 */
export class SMTPProtocolHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIProtocolHandler"]);

  scheme = "smtp";

  newChannel(aURI, aLoadInfo) {
    throw Components.Exception(
      `${this.constructor.name}.newChannel not implemented`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  allowPort(port, scheme) {
    return port == Ci.nsISmtpUrl.DEFAULT_SMTP_PORT;
  }
}

SMTPProtocolHandler.prototype.classID = Components.ID(
  "{b14c2b67-8680-4c11-8d63-9403c7d4f757}"
);

export class SMTPSProtocolHandler extends SMTPProtocolHandler {
  scheme = "smtps";

  allowPort(port, scheme) {
    return port == Ci.nsISmtpUrl.DEFAULT_SMTPS_PORT;
  }
}

SMTPSProtocolHandler.prototype.classID = Components.ID(
  "{057d0997-9e3a-411e-b4ee-2602f53fe05f}"
);
