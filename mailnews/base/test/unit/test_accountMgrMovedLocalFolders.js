/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function run_test() {
  // Create account prefs with Local Folders in the middle
  Services.prefs.setCharPref("mail.account.account1.identities", "id1");
  Services.prefs.setCharPref("mail.account.account1.server", "server1");
  Services.prefs.setCharPref("mail.account.account4.identities", "id2");
  Services.prefs.setCharPref("mail.account.account4.server", "server4");
  Services.prefs.setCharPref("mail.account.account5.identities", "id3");
  Services.prefs.setCharPref("mail.account.account5.server", "server5");
  Services.prefs.setCharPref("mail.account.account6.identities", "id3");
  Services.prefs.setCharPref("mail.account.account6.server", "server5");
  Services.prefs.setCharPref("mail.server.server1.hostname", "Local Folders");
  Services.prefs.setCharPref("mail.server.server1.type", "none");
  Services.prefs.setCharPref("mail.server.server1.userName", "nobody");
  Services.prefs.setCharPref(
    "mail.server.server1.directory-rel",
    "[ProfD]Mail/Local Folders"
  );
  Services.prefs.setCharPref("mail.server.server4.hostname", "mail.host4.org");
  Services.prefs.setCharPref("mail.server.server4.type", "pop3");
  Services.prefs.setCharPref("mail.server.server5.hostname", "pop3.host.org");
  Services.prefs.setCharPref("mail.server.server5.type", "pop3");

  Services.prefs.setCharPref(
    "mail.accountmanager.accounts",
    "account4,account1,account5"
  );
  Services.prefs.setCharPref("mail.accountmanager.defaultaccount", "account4");

  // This will force the load of the accounts setup above.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.equal(
    Services.prefs.getCharPref("mail.accountmanager.accounts"),
    "account4,account1,account5"
  );
}
