/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * Incoming server types supported by the Android app.
 */
const INCOMING_SERVER_TYPES = new Set(["imap", "pop3"]);

/**
 * Auth methods not supported by the Android app.
 */
const UNSUPPORTED_AUTH_METHODS = new Set([
  Ci.nsMsgAuthMethod.GSSAPI,
  Ci.nsMsgAuthMethod.NTLM,
  Ci.nsMsgAuthMethod.External,
]);

export const QRExport = {
  /**
   * Eligible accounts fulfill:
   * - Incoming must be IAMP or POP3.
   * - Outboing must be SMTP.
   * - authMethod can't be "GSSAPI", "NTLM", "external".
   * - email address must be ASCII only.
   *
   * @returns {nsIMsgAccount[]} Eligible accounts.
   */
  getEligibleAccounts() {
    return MailServices.accounts.accounts.filter(account => {
      if (!account.defaultIdentity) {
        return false;
      }
      // For each account we want ingoing and outgoing and the default identiy.
      const incomingServer = account.incomingServer;
      if (
        !INCOMING_SERVER_TYPES.has(incomingServer.type) ||
        UNSUPPORTED_AUTH_METHODS.has(incomingServer.authMethod)
      ) {
        return false;
      }
      const identity = account.defaultIdentity;
      // eslint-disable-next-line no-control-regex
      if (!/^[\x00-\x7F]+$/.test(identity.email)) {
        return false;
      }
      const outgoingServer = MailServices.outgoingServer.servers.find(
        s => s.key == identity.smtpServerKey
      );
      return (
        outgoingServer instanceof Ci.nsISmtpServer &&
        !UNSUPPORTED_AUTH_METHODS.has(outgoingServer.authMethod)
      );
    });
  },
};
