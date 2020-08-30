/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has an LDAP address book with offline replication.
 */
add_task(async function() {
  // Copy address books to be migrated into the profile.

  copyABFile("data/cardForEmail.mab", "ldap.mab");
  Services.prefs.setStringPref("ldap_2.servers.ldap_test.auth.dn", "");
  Services.prefs.setStringPref("ldap_2.servers.ldap_test.auth.saslmech", "");
  Services.prefs.setStringPref(
    "ldap_2.servers.ldap_test.description",
    "Test Book"
  );
  Services.prefs.setStringPref("ldap_2.servers.ldap_test.filename", "ldap.mab");
  Services.prefs.setStringPref(
    "ldap_2.servers.ldap_test.uri",
    "ldap://test.invalid/"
  );

  // Do the migration.

  await MailMigrator._migrateAddressBooks();
  await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));

  // Check new files have been created, and old ones renamed.

  checkFileExists("ldap.sqlite", true);
  checkFileExists("ldap.mab", false);
  checkFileExists("ldap.mab.bak", true);

  // Check that the preferences are updated.

  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.ldap_test.dirType"));
  equal(
    Services.prefs.getStringPref("ldap_2.servers.ldap_test.filename"),
    "ldap.sqlite"
  );

  // Check the new address books.

  let directories = MailServices.ab.directories;
  equal(directories.length, 3);
  equal(directories[0].URI, "moz-abldapdirectory://ldap_2.servers.ldap_test");
  equal(directories[1].URI, "jsaddrbook://abook.sqlite");
  equal(directories[2].URI, "jsaddrbook://history.sqlite");

  let ldapDirectory = directories[0];
  ldapDirectory.QueryInterface(Ci.nsIAbLDAPDirectory);
  equal(ldapDirectory.replicationFileName, "ldap.sqlite");

  Services.io.offline = true;
  let offlineCards = [...ldapDirectory.childCards];
  equal(offlineCards.length, 4);
  Assert.deepEqual(offlineCards.map(card => card.displayName).sort(), [
    "DisplayName1",
    "Empty Email",
    "Jane Doe",
    "John Doe",
  ]);
});
