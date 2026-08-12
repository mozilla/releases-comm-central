/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Custom OAuth2 connection parameters.
 *
 * This is the implementation of `IOAuth2CustomDetails` for IMAP, SMTP, and
 * likely other standard protocols in the future. The implementation for
 * Exchange (EWS and Graph) is in:
 * mailnews/protocols/exchange/src/ExchangeOAuth2CustomDetails.cpp
 *
 * @implements {IOAuth2CustomDetails}
 */
export class OAuth2CustomDetails {
  QueryInterface = ChromeUtils.generateQI(["IOAuth2CustomDetails"]);

  /**
   * Return the internal issuer for a preference branch, generating and
   * persisting a new one as needed.
   *
   * @param {nsIPrefBranch} prefBranch
   * @param {boolean} useCustomDetails
   * @returns {string}
   */
  static getIssuer(prefBranch, useCustomDetails) {
    let issuer = prefBranch.getStringPref("oauth2.issuer", "");
    if (useCustomDetails && !issuer) {
      issuer = Services.uuid.generateUUID().toString().substring(1, 37);
      prefBranch.setStringPref("oauth2.issuer", issuer);
    }
    return issuer;
  }

  /**
   * Create custom OAuth2 details for an incoming server.
   *
   * @param {nsIMsgIncomingServer} server
   * @returns {OAuth2CustomDetails}
   */
  static fromIncomingServer(server) {
    const prefBranch = Services.prefs.getBranch(`mail.server.${server.key}.`);
    return new OAuth2CustomDetails(prefBranch);
  }

  /**
   * Create custom OAuth2 details for an outgoing server.
   *
   * @param {nsIMsgOutgoingServer} server
   * @returns {OAuth2CustomDetails}
   */
  static fromOutgoingServer(server) {
    const prefBranch = Services.prefs.getBranch(
      `mail.smtpserver.${server.key}.`
    );
    return new OAuth2CustomDetails(prefBranch);
  }

  /**
   * @param {nsIPrefBranch} prefBranch - The preference branch for an incoming
   *   or outgoing server. It should be rooted at `mail.<server type>.<key>.`.
   */
  constructor(prefBranch) {
    this.useCustomDetails = prefBranch.getBoolPref(
      "oauth2.useCustomDetails",
      false
    );
    this.clientId = prefBranch.getStringPref("oauth2.clientId", "");
    this.authorizationEndpoint = prefBranch.getStringPref(
      "oauth2.authorizationEndpoint",
      ""
    );
    this.tokenEndpoint = prefBranch.getStringPref("oauth2.tokenEndpoint", "");
    this.scopes = prefBranch.getStringPref("oauth2.scopes", "");
    this.redirectionEndpoint = prefBranch.getStringPref(
      "oauth2.redirectionEndpoint",
      ""
    );
    this.issuer = OAuth2CustomDetails.getIssuer(
      prefBranch,
      this.useCustomDetails
    );
    this.usePKCE = prefBranch.getBoolPref("oauth2.usePKCE", false);
    this.useExternalBrowser = prefBranch.getBoolPref(
      "oauth2.useExternalBrowser",
      true
    );
  }
}
