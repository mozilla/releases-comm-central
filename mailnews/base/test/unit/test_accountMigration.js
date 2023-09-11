/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests that we don't try to reset the mail.server.server<n>.authMethod
 * preference every time we run the migration code, and other migration stuff
 */

var { migrateMailnews } = ChromeUtils.import(
  "resource:///modules/MailnewsMigrator.jsm"
);

/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

function testPermission(aURI) {
  let principal = Services.scriptSecurityManager.createContentPrincipal(
    aURI,
    {}
  );
  return Services.perms.testPermissionFromPrincipal(principal, "image");
}

function run_test() {
  // Set up some basic accounts with limited prefs - enough to satisfy the
  // migrator.
  Services.prefs.setCharPref("mail.account.account1.server", "server1");
  Services.prefs.setCharPref("mail.account.account2.server", "server2");
  Services.prefs.setCharPref("mail.account.account3.server", "server3");

  // Server1 has nothing set.

  // Server2 has useSecAuth set to true, auth_login unset
  Services.prefs.setBoolPref("mail.server.server2.useSecAuth", true);

  Services.prefs.setCharPref(
    "mail.accountmanager.accounts",
    "account1,account2,account3"
  );

  // Set server1 and server2 username and hostname to test clientid population.
  Services.prefs.setCharPref("mail.server.server1.userName", "testuser1");
  Services.prefs.setCharPref("mail.server.server2.userName", "testuser2");
  Services.prefs.setCharPref("mail.server.server1.type", "imap");
  Services.prefs.setCharPref("mail.server.server2.type", "imap");
  Services.prefs.setCharPref(
    "mail.server.server1.hostname",
    "mail.sampledomain1.com"
  );
  Services.prefs.setCharPref(
    "mail.server.server2.hostname",
    "mail.sampledomain2.com"
  );

  loadABFile("data/remoteContent", kPABData.fileName);

  let uriAllowed = Services.io.newURI(
    "chrome://messenger/content/email=yes@test.invalid"
  );
  let uriAllowed2 = Services.io.newURI(
    "chrome://messenger/content/email=yes2@test.invalid"
  );
  let uriDisallowed = Services.io.newURI(
    "chrome://messenger/content/email=no@test.invalid"
  );

  // Check that this email that according to the ab data has (had!)
  // remote content premissions, has no premissions pre migration.
  Assert.equal(testPermission(uriAllowed), Services.perms.UNKNOWN_ACTION);
  Assert.equal(testPermission(uriAllowed2), Services.perms.UNKNOWN_ACTION);
  Assert.equal(testPermission(uriDisallowed), Services.perms.UNKNOWN_ACTION);

  // Now migrate the prefs.
  migrateMailnews();

  // Check that server1 and server2 have the same clientid.
  Assert.ok(Services.prefs.prefHasUserValue("mail.server.server1.clientid"));
  Assert.ok(Services.prefs.prefHasUserValue("mail.server.server2.clientid"));

  // Check that server3 didn't get a clientid, since it has no userName.
  // This is the case for nntp.
  Assert.ok(!Services.prefs.prefHasUserValue("mail.server.server3.clientid"));

  // Check what has been set.
  Assert.ok(!Services.prefs.prefHasUserValue("mail.server.server1.authMethod"));
  Assert.ok(Services.prefs.prefHasUserValue("mail.server.server2.authMethod"));
  Assert.equal(
    Services.prefs.getIntPref("mail.server.server2.authMethod"),
    Ci.nsMsgAuthMethod.secure
  );

  // Now clear the authMethod for set for server2. This simulates the user
  // setting the value back to "3", i.e. Ci.nsMsgAuthMethod.passwordCleartext.
  Services.prefs.clearUserPref("mail.server.server2.authMethod");

  // Now attempt migration again, e.g. a second load of TB
  migrateMailnews();

  // This time around, both of these should not be set.
  Assert.ok(!Services.prefs.prefHasUserValue("mail.server.server1.authMethod"));
  Assert.ok(!Services.prefs.prefHasUserValue("mail.server.server2.authMethod"));

  //
  // Now check SMTP
  //

  Services.prefs.setCharPref("mail.smtpservers", "smtp1,smtp2,smtp3");

  // smtp1 has nothing set.

  // smtp2 has useSecAuth set to true, auth_method unset
  Services.prefs.setBoolPref("mail.smtpserver.smtp2.useSecAuth", true);

  // Set server1 and server2 username and hostname to test clientid population.
  Services.prefs.setCharPref("mail.smtpserver.smtp1.username", "testuser1");
  Services.prefs.setCharPref("mail.smtpserver.smtp2.username", "testuser2");
  Services.prefs.setCharPref(
    "mail.smtpserver.smtp1.hostname",
    "mail.sampledomain1.com"
  );
  Services.prefs.setCharPref(
    "mail.smtpserver.smtp2.hostname",
    "mail.sampledomain2.com"
  );
  Services.prefs.setCharPref(
    "mail.smtpserver.smtp3.hostname",
    "mail.nousername.example.com"
  );

  // Migration should now have added permissions for the address that had them
  // and not for the one that didn't have them.
  Assert.ok(Services.prefs.getIntPref("mail.ab_remote_content.migrated") > 0);
  Assert.equal(testPermission(uriAllowed), Services.perms.ALLOW_ACTION);
  Assert.equal(testPermission(uriAllowed2), Services.perms.ALLOW_ACTION);
  Assert.equal(testPermission(uriDisallowed), Services.perms.UNKNOWN_ACTION);

  // Now migrate the prefs
  migrateMailnews();

  // Check that smtpserver 1 and smtpserver 2 now have a clientid.
  Assert.ok(Services.prefs.prefHasUserValue("mail.smtpserver.smtp1.clientid"));
  Assert.ok(Services.prefs.prefHasUserValue("mail.smtpserver.smtp2.clientid"));

  // Check that the smtp3server 2 got a clientid, even if it has no
  // username. All SMTP servers don't require a username.
  Assert.ok(Services.prefs.prefHasUserValue("mail.smtpserver.smtp3.clientid"));

  Assert.ok(
    !Services.prefs.prefHasUserValue("mail.smtpserver.smtp1.authMethod")
  );
  Assert.ok(
    Services.prefs.prefHasUserValue("mail.smtpserver.smtp2.authMethod")
  );
  Assert.equal(
    Services.prefs.getIntPref("mail.smtpserver.smtp2.authMethod"),
    Ci.nsMsgAuthMethod.secure
  );

  // Now clear the authMethod for set for smtp2. This simulates the user
  // setting the value back to "3", i.e. Ci.nsMsgAuthMethod.passwordCleartext.
  Services.prefs.clearUserPref("mail.smtpserver.smtp2.authMethod");

  // Now clear the mail.server.server1.clientid to test re-population.
  Services.prefs.clearUserPref("mail.server.server2.clientid");

  // Now attempt migration again, e.g. a second load of TB
  migrateMailnews();

  // This time around, both of these should not be set.
  Assert.ok(
    !Services.prefs.prefHasUserValue("mail.smtpserver.smtp1.authMethod")
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("mail.smtpserver.smtp2.authMethod")
  );

  // The server2 clientid should be the same as the smtpserver2 now since
  // they are for the same mail.sampledomain2.com domain.
  Assert.equal(
    Services.prefs.getCharPref("mail.smtpserver.smtp2.clientid"),
    Services.prefs.getCharPref("mail.server.server2.clientid")
  );
}
