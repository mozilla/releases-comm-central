/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  default: "resource:///modules/qrcode.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "QRExport",
    maxLogLevel: "Warn",
  })
);

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

// QR Code data content constants
// These should match with https://github.com/thunderbird/thunderbird-android/blob/4ebcca8d893bc57df9ef293fdf7d6d8fe46becad/feature/migration/qrcode/src/main/kotlin/app/k9mail/feature/migration/qrcode/AccountData.kt#L48-L105

const QR_DATA_FORMAT_VERSION = 1;

const INCOMING_PROTOCOL = new Map([
  ["imap", 0],
  ["pop3", 1],
]);
const SOCKET_TYPES = new Map([
  [Ci.nsMsgSocketType.plain, 0],
  [Ci.nsMsgSocketType.alwaysSTARTTLS, 2],
  [Ci.nsMsgSocketType.SSL, 3],
]);
const AUTH_METHODS = new Map([
  [Ci.nsMsgAuthMethod.none, 0],
  //      [Ci.nsMsgAuthMethod.old, "old"],
  [Ci.nsMsgAuthMethod.passwordCleartext, 1],
  [Ci.nsMsgAuthMethod.passwordEncrypted, 2],
  [Ci.nsMsgAuthMethod.GSSAPI, 3],
  [Ci.nsMsgAuthMethod.NTLM, 4],
  [Ci.nsMsgAuthMethod.External, 5],
  //      [Ci.nsMsgAuthMethod.secure, "secure"],
  //      [Ci.nsMsgAuthMethod.anything, "anything"],
  [Ci.nsMsgAuthMethod.OAuth2, 6],
]);
const OUTGOING_PROTOCOL_SMTP = 0;

const ACCOUNTS_PER_QR_CODE = 3;
const MAX_CHUNK_LENGTH = 800;

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
      const outgoingServer = MailServices.outgoingServer.getServerByKey(
        identity.smtpServerKey
      );
      return (
        outgoingServer instanceof Ci.nsISmtpServer &&
        !UNSUPPORTED_AUTH_METHODS.has(outgoingServer.authMethod)
      );
    });
  },

  /**
   * Generate the QR codes to export the selected accounts. Splits the accounts
   * into chunks of 3 accounts per QR code.
   *
   * @param {string[]} accountKeys - Accounts that should be exported.
   * @param {boolean} includePasswords - If passwords should be included in the export data.
   * @returns {string[]} Returns an array of SVG URLs, each representing a QR code.
   */
  getQRCodes(accountKeys, includePasswords) {
    const accounts = accountKeys.map(key =>
      this.getAccountData(key, includePasswords)
    );
    // For practical purposes each QR code should hold no more than 1000
    // characters, optimally 800 characters maximum.
    const chunkCount = Math.ceil(accounts.length / ACCOUNTS_PER_QR_CODE);
    const qrCodes = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkOffset = i * ACCOUNTS_PER_QR_CODE;
      const chunk = accounts
        .slice(chunkOffset, chunkOffset + ACCOUNTS_PER_QR_CODE)
        .flat();
      const chunkPart = i + 1; // 1-indexed
      const chunkData = this.getQRData(chunk, chunkPart, chunkCount);
      const serializedChunk = JSON.stringify(chunkData);
      if (serializedChunk.length > MAX_CHUNK_LENGTH) {
        lazy.console.warn(
          "Data for QR code",
          chunkPart,
          "is longer than expected, result might be hard to read"
        );
      }
      qrCodes.push(this.renderQR(serializedChunk));
    }
    return qrCodes;
  },

  /**
   * Generate the data for a QR code with a chunk of account data.
   *
   * @param {Array} data - Account data contained in this chunk.
   * @param {number} part - 1-based index of this chunk.
   * @param {number} count - Total number of QR codes.
   * @returns {Array}
   */
  getQRData(data, part, count) {
    return [QR_DATA_FORMAT_VERSION, [part, count], ...data];
  },

  /**
   * Generate a minimal account description for serialization to JSON.
   *
   * @param {string} accountKey - Key of the account to get the data for.
   * @param {boolean} includePasswords - If the result should include passwords.
   * @returns {Array} Array structure with account data to serialize to JSON.
   * @see https://docs.google.com/document/d/1siSwPzNPkwq4BL5G3z2K4zzRJuL9N9zbPodMOggXbdA/edit for format
   */
  getAccountData(accountKey, includePasswords) {
    const account = MailServices.accounts.getAccount(accountKey);
    const incomingServer = account.incomingServer;
    const defaultSmtpServerKey = account.defaultIdentity.smtpServerKey;
    const outgoingServer =
      MailServices.outgoingServer.getServerByKey(defaultSmtpServerKey);
    outgoingServer.QueryInterface(Ci.nsISmtpServer);
    const identites = account.identities.filter(
      identity =>
        (!identity.smtpServerKey ||
          identity.smtpServerKey == defaultSmtpServerKey) &&
        /^[\x00-\x7F]+$/.test(identity.email) // eslint-disable-line no-control-regex
    );
    return [
      [
        INCOMING_PROTOCOL.get(incomingServer.type),
        incomingServer.hostName,
        incomingServer.port,
        SOCKET_TYPES.get(incomingServer.socketType),
        AUTH_METHODS.get(incomingServer.authMethod),
        incomingServer.username,
        incomingServer.prettyName,
        (includePasswords &&
          !incomingServer.passwordPromptRequired &&
          incomingServer.password) ||
          "",
      ],
      [
        [
          [
            OUTGOING_PROTOCOL_SMTP,
            outgoingServer.hostname,
            outgoingServer.port,
            SOCKET_TYPES.get(outgoingServer.socketType),
            AUTH_METHODS.get(outgoingServer.authMethod),
            outgoingServer.username,
            (includePasswords &&
              (outgoingServer.password ||
                outgoingServer.wrappedJSObject._getPasswordWithoutUI())) ||
              "",
          ],
          ...identites.map(identity => [identity.email, identity.fullName]),
        ],
      ],
    ];
  },

  /**
   * Renders the given data into a QR code with L error correction.
   *
   * @param {string} data - Data to encode in the QR code.
   * @returns {string} QR code rendered as SVG URI.
   */
  renderQR(data) {
    const qrOptions = {
      errorCorrectionLevel: lazy.default.ErrorCorrectionLevel.L,
    };
    const matrix = lazy.default.generate(data, qrOptions);
    return lazy.default.render("svg-uri", matrix);
  },

  /**
   * Check if an account's exported servers would authenticate with OAuth.
   *
   * @param {nsIMsgAccount} account
   * @returns {{incoming: boolean, outgoing: boolean}} If the incoming or
   *   outgoing servers use OAuth as authentication method.
   */
  getAccountOAuthUsage(account) {
    return {
      incoming: account.incomingServer.authMethod === Ci.nsMsgAuthMethod.OAuth2,
      outgoing:
        MailServices.outgoingServer.getServerByKey(
          account.defaultIdentity.smtpServerKey
        ).authMethod === Ci.nsMsgAuthMethod.OAuth2,
    };
  },
};
