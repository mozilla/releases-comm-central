/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper deletion of an account from the Account manager.
 */

var MODULE_NAME = "test-account-deletion";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers",
                       "account-manager-helpers"];

var gPopAccount, gImapAccount, gNntpAccount, gOriginalAccountCount;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server
  let popServer = MailServices.accounts
    .createIncomingServer("nobody", "pop.foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@pop.foo.invalid";

  gPopAccount = MailServices.accounts.createAccount();
  gPopAccount.incomingServer = popServer;
  gPopAccount.addIdentity(identity);

  // Create an IMAP server
  let imapServer = MailServices.accounts
    .createIncomingServer("nobody", "imap.foo.invalid", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);

  identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@imap.foo.invalid";

  gImapAccount = MailServices.accounts.createAccount();
  gImapAccount.incomingServer = imapServer;
  gImapAccount.addIdentity(identity);

  assert_equals(MailServices.accounts.allServers.length, gOriginalAccountCount + 2);
}

function teardownModule(module) {
  // There should be only the original accounts left.
  assert_equals(MailServices.accounts.allServers.length, gOriginalAccountCount);
}

function test_account_data_deletion() {
  open_advanced_settings(function(amc) {
    subtest_account_data_deletion1(amc);
  });

  open_advanced_settings(function(amc) {
    subtest_account_data_deletion2(amc);
  });
}

/**
 * Bug 274452
 * Check if files of an account are preserved.
 *
 * @param amc  The account options controller.
 */
function subtest_account_data_deletion1(amc)
{
  let accountDir = gPopAccount.incomingServer.localPath;
  assert_true(accountDir.isDirectory());

  // Get some existing file in the POP3 account data dir.
  let inboxFile = accountDir.clone();
  inboxFile.append("Inbox.msf");
  assert_true(inboxFile.isFile());

  remove_account(gPopAccount, amc, true, false);
  assert_true(accountDir.exists());
}

/**
 * Bug 274452
 * Check if files of an account can be deleted.
 *
 * @param amc  The account options controller.
 */
function subtest_account_data_deletion2(amc)
{
  let accountDir = gImapAccount.incomingServer.localPath;
  assert_true(accountDir.isDirectory());

  // Get some file in the IMAP account data dir.
  let inboxFile = accountDir.clone();
  inboxFile.append("INBOX.msf");
  assert_true(inboxFile.isFile());

  remove_account(gImapAccount, amc, true, true);
  assert_false(accountDir.exists());
}
