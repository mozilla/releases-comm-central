/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks proper deletion of an account from the Account manager.
 */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-account-deletion";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "content-tab-helpers",
  "pref-window-helpers",
];

var gPopAccount, gImapAccount, gOriginalAccountCount;

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

/**
 * Bug 274452
 * Check if files of an account are preserved.
 *
 * @param amc  The account options controller.
 */
function test_account_data_deletion1() {
  let tab = open_advanced_settings();
  let accountDir = gPopAccount.incomingServer.localPath;
  assert_true(accountDir.isDirectory());

  // Get some existing file in the POP3 account data dir.
  let inboxFile = accountDir.clone();
  inboxFile.append("Inbox.msf");
  assert_true(inboxFile.isFile());

  remove_account(gPopAccount, tab, true, false);
  gPopAccount = null;
  assert_true(accountDir.exists());

  close_advanced_settings(tab);
}

/**
 * Bug 274452
 * Check if files of an account can be deleted.
 *
 * @param amc  The account options controller.
 */
function test_account_data_deletion2() {
  let tab = open_advanced_settings();
  let accountDir = gImapAccount.incomingServer.localPath;
  assert_true(accountDir.isDirectory());

  // Get some file in the IMAP account data dir.
  let inboxFile = accountDir.clone();
  inboxFile.append("INBOX.msf");
  assert_true(inboxFile.isFile());

  remove_account(gImapAccount, tab, true, true);
  gImapAccount = null;
  assert_false(accountDir.exists());

  close_advanced_settings(tab);
}
