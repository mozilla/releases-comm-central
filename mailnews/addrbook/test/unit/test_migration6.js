/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test auto-migration from Mork address books to JS/SQLite address books.
 *
 * This test profile has multiple additional address books to migrate.
 * The address book manager should *not* think one or more of them is still a
 * Mork address book after migration (bug 1590637).
 */
add_task(async function() {
  // Copy address books to be migrated into the profile.

  copyABFile("data/cardForEmail.mab", "abook-1.mab");
  copyABFile("data/collect.mab", "abook-2.mab");
  Services.prefs.setStringPref("ldap_2.servers.Test1.description", "Test 1");
  Services.prefs.setIntPref("ldap_2.servers.Test1.dirType", 2);
  Services.prefs.setStringPref("ldap_2.servers.Test1.filename", "abook-1.mab");
  Services.prefs.setStringPref("ldap_2.servers.Test2.description", "Test 2");
  Services.prefs.setIntPref("ldap_2.servers.Test2.dirType", 2);
  Services.prefs.setStringPref("ldap_2.servers.Test2.filename", "abook-2.mab");

  // Do the migration.

  await MailMigrator._migrateAddressBooks();

  // Check new files have been created, and old ones renamed.

  checkFileExists("abook.sqlite", true);
  checkFileExists("abook.mab", false);
  checkFileExists("abook.mab.bak", false);
  checkFileExists("history.sqlite", true);
  checkFileExists("history.mab", false);
  checkFileExists("history.mab.bak", false);
  checkFileExists("abook-1.sqlite", true);
  checkFileExists("abook-1.mab", false);
  checkFileExists("abook-1.mab.bak", true);
  checkFileExists("abook-2.sqlite", true);
  checkFileExists("abook-2.mab", false);
  checkFileExists("abook-2.mab.bak", true);

  // Check the new address books.

  let directories = MailServices.ab.directories;
  equal(directories.length, 4);
  equal(directories[0].URI, "jsaddrbook://abook-1.sqlite");
  equal(directories[1].URI, "jsaddrbook://abook-2.sqlite");
  equal(directories[2].URI, "jsaddrbook://abook.sqlite");
  equal(directories[3].URI, "jsaddrbook://history.sqlite");

  // This will fail if we try to read an SQLite file with the Mork code.

  directories.map(directory => directory.childCards);
});
