/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { QRExport } = ChromeUtils.importESModule(
  "resource:///modules/QRExport.sys.mjs"
);
const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

/**
 * Create a mail account with an incoming server, an outgoing server, and an
 * identity.
 *
 * @param {string} name - Username on the incoming server
 * @param {string} emailLocalPart - Local part of the email of the default
 *   identity.
 * @param {"pop3"|"imap"} protocol - Protocol of the incoming server.
 * @returns {nsIMsgAccount} Created account with associated default identity and
 *   servers.
 */
function createMailAccount(name, emailLocalPart, protocol) {
  const server = MailServices.accounts.createIncomingServer(
    name,
    "foo.invalid",
    protocol
  );
  server.password = "password";
  const identity = MailServices.accounts.createIdentity();
  identity.email = `${emailLocalPart}@foo.invalid`;
  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity);
  const outgoing = MailServices.outgoingServer.createServer("smtp");
  identity.smtpServerKey = outgoing.key;
  return account;
}

add_task(function test_getEligibleAccounts() {
  const emptyEligibleAccounts = QRExport.getEligibleAccounts();

  Assert.deepEqual(
    emptyEligibleAccounts,
    [],
    "Should return no results without any accounts configured"
  );

  // Eligible accounts
  const imapAccount = createMailAccount("imap@foo.invalid", "imap", "imap");
  const popAccount = createMailAccount("pop", "tinderbox", "pop3");

  // Ineligible accounts
  const unsupportedIncomingAuthAccount = createMailAccount(
    "incomingauth",
    "incomingauth",
    "imap"
  );
  unsupportedIncomingAuthAccount.incomingServer.authMethod =
    Ci.nsMsgAuthMethod.GSSAPI;

  const unsupportedOutgoingAuthAccount = createMailAccount(
    "outgoingauth",
    "outgoingauth",
    "imap"
  );
  const unspoortedAuthOutgoingServer = MailServices.outgoingServer.servers.find(
    s => s.key == unsupportedOutgoingAuthAccount.defaultIdentity.smtpServerKey
  );
  unspoortedAuthOutgoingServer.authMethod = Ci.nsMsgAuthMethod.GSSAPI;

  const noOutgoingServerAccount = createMailAccount(
    "nooutgoing",
    "nooutgoing",
    "imap"
  );
  noOutgoingServerAccount.defaultIdentity.smtpServerKey = null;

  const otherAccounts = [
    unsupportedIncomingAuthAccount,
    unsupportedOutgoingAuthAccount,
    noOutgoingServerAccount,
    // Non-ASCII email
    createMailAccount("nonascii", "unüblich", "imap"),
    // Different account types
    MailServices.accounts.createLocalMailAccount(),
    FeedUtils.createRssAccount("qrExport"),
  ];

  const eligibleAccounts = QRExport.getEligibleAccounts();

  Assert.equal(eligibleAccounts.length, 2, "Should find an eligible account");
  Assert.ok(
    eligibleAccounts.includes(imapAccount),
    "Should return eligible IMAP account"
  );
  Assert.ok(
    eligibleAccounts.includes(popAccount),
    "Should return eligible POP account"
  );

  MailServices.accounts.removeAccount(popAccount, false);
  MailServices.accounts.removeAccount(imapAccount, false);
  for (const account of otherAccounts) {
    MailServices.accounts.removeAccount(account, false);
  }
});
