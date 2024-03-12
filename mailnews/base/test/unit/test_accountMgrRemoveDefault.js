/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests that if the default account is removed, the default becomes
 * another account or null. The removed account must not remain the default.
 */
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function run_test() {
  // Create account prefs.

  Services.prefs.setCharPref("mail.account.account1.identities", "id1");
  Services.prefs.setCharPref("mail.account.account1.server", "server1");
  Services.prefs.setCharPref("mail.account.account2.identities", "id2");
  Services.prefs.setCharPref("mail.account.account2.server", "server2");
  Services.prefs.setCharPref("mail.account.account3.identities", "id3");
  Services.prefs.setCharPref("mail.account.account3.server", "server3");

  Services.prefs.setCharPref("mail.server.server1.hostname", "Local Folders");
  Services.prefs.setCharPref("mail.server.server1.type", "none");
  Services.prefs.setCharPref("mail.server.server2.hostname", "host2.invalid");
  Services.prefs.setCharPref("mail.server.server2.type", "pop3");
  Services.prefs.setCharPref("mail.server.server3.hostname", "host3.invalid");
  Services.prefs.setCharPref("mail.server.server3.type", "pop3");

  Services.prefs.setCharPref(
    "mail.accountmanager.accounts",
    "account2,account3,account1"
  );
  Services.prefs.setCharPref("mail.accountmanager.defaultaccount", "account3");

  // Load of the accounts setup above.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.equal(
    Services.prefs.getCharPref("mail.accountmanager.accounts"),
    "account2,account3,account1"
  );
  Assert.equal(MailServices.accounts.defaultAccount?.key, "account3");

  // Remove the default account, account3. The default should be set to a
  // sensible replacement, account2.

  MailServices.accounts.removeAccount(MailServices.accounts.defaultAccount);
  Assert.equal(MailServices.accounts.defaultAccount?.key, "account2");

  // Remove the default account, account2. No remaining accounts can be the
  // default, so it should become null.

  MailServices.accounts.removeAccount(MailServices.accounts.defaultAccount);
  Assert.equal(MailServices.accounts.defaultAccount, null);
}
