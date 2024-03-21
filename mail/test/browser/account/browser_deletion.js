/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper deletion of an account from the Account manager.
 */

"use strict";

var { open_advanced_settings, remove_account } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/AccountManagerHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gPopAccount, gImapAccount, gOriginalAccountCount;

add_setup(function () {
  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  const popServer = MailServices.accounts
    .createIncomingServer("nobody", "pop.foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@pop.foo.invalid";

  gPopAccount = MailServices.accounts.createAccount();
  gPopAccount.incomingServer = popServer;
  gPopAccount.addIdentity(identity);

  // Create an IMAP server
  const imapServer = MailServices.accounts
    .createIncomingServer("nobody", "imap.foo.invalid", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);

  identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@imap.foo.invalid";

  gImapAccount = MailServices.accounts.createAccount();
  gImapAccount.incomingServer = imapServer;
  gImapAccount.addIdentity(identity);

  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount + 2
  );
});

registerCleanupFunction(function () {
  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, gOriginalAccountCount);
});

add_task(async function test_account_data_deletion() {
  await open_advanced_settings(subtest_account_data_deletion1);
  await open_advanced_settings(subtest_account_data_deletion2);
});

/**
 * Bug 274452
 * Check if files of an account are preserved.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_account_data_deletion1(tab) {
  const accountDir = gPopAccount.incomingServer.localPath;
  Assert.ok(accountDir.isDirectory());

  // Get some existing file in the POP3 account data dir.
  const inboxFile = accountDir.clone();
  inboxFile.append("Inbox.msf");
  Assert.ok(inboxFile.isFile());

  await remove_account(gPopAccount, tab, true, false);
  gPopAccount = null;
  Assert.ok(accountDir.exists());
}

/**
 * Bug 274452
 * Check if files of an account can be deleted.
 *
 * @param {object} tab - The account manager tab.
 */
async function subtest_account_data_deletion2(tab) {
  const accountDir = gImapAccount.incomingServer.localPath;
  Assert.ok(accountDir.isDirectory());

  // Get some file in the IMAP account data dir.
  const inboxFile = accountDir.clone();
  inboxFile.append("INBOX.msf");
  Assert.ok(inboxFile.isFile());

  await remove_account(gImapAccount, tab, true, true);
  gImapAccount = null;
  Assert.ok(!accountDir.exists());
}
